import express from 'express'
import { authenticateUser, requireRole } from '../middleware/auth.js'
import { getAdminClient } from '../supabase.js'
import { createStudentNotification } from '../utils/studentNotifications.js'

const router = express.Router()

const reservationStatusLabels = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No Show',
}
const reservationTimeZone = 'Asia/Manila'

function formatReservationDateTime(value) {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: reservationTimeZone,
  }).format(new Date(value))
}

function formatReservationForClient(reservation) {
  const statusKey = String(reservation.status || '').toLowerCase()
  return {
    ...reservation,
    status: reservationStatusLabels[statusKey] || reservation.status,
  }
}

function getLocalDateTime(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    weekday: new Intl.DateTimeFormat('en', { timeZone, weekday: 'long' })
      .format(date)
      .toLowerCase(),
  }
}

function parseReservationWindow(startAt, endAt, timeZone) {
  const startDate = new Date(startAt)
  const endDate = new Date(endAt)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { error: 'Invalid date/time format.' }
  }
  if (startDate >= endDate) {
    return { error: 'End time must be after start time.' }
  }
  if (startDate < new Date()) {
    return { error: 'Reservation time cannot be in the past.' }
  }
  if (typeof timeZone !== 'string' || !timeZone.trim()) {
    return { error: 'A valid reservation time zone is required.' }
  }

  try {
    const start = getLocalDateTime(startDate, timeZone)
    const end = getLocalDateTime(endDate, timeZone)
    if (start.date !== end.date) {
      return { error: 'Room reservations must start and end on the same local date.' }
    }
    return { startDate, endDate, localStart: start, localEnd: end }
  } catch {
    return { error: 'A valid reservation time zone is required.' }
  }
}

function scheduleWeekdayMatches(value, weekday) {
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const numeric = Number(value)
  if (Number.isInteger(numeric) && String(value).trim() !== '') {
    return numeric >= 1 && numeric <= 7 && weekdays[numeric - 1] === weekday
  }
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === weekday || normalized === weekday.slice(0, 3)
}

export function parseTimeTo24h(timeStr) {
  if (!timeStr) return null
  const trimmed = String(timeStr).trim()
  const match12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
  if (match12) {
    let hours = parseInt(match12[1], 10)
    const minutes = match12[2] ? parseInt(match12[2], 10) : 0
    const meridian = match12[3].toLowerCase()
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null
    if (meridian === 'pm' && hours !== 12) hours += 12
    if (meridian === 'am' && hours === 12) hours = 0
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
  }
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (match24) {
    const hours = parseInt(match24[1], 10)
    const minutes = parseInt(match24[2], 10)
    const seconds = match24[3] ? parseInt(match24[3], 10) : 0
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return null
}

export function parseTimeSlot(timeSlot) {
  if (!timeSlot || typeof timeSlot !== 'string') {
    return { is_all_day: true, start_time: null, end_time: null, time_slot: timeSlot || 'All Day' }
  }
  const trimmed = timeSlot.trim()
  if (/^(all[\s_-]?day|full[\s_-]?day|whole[\s_-]?day)$/i.test(trimmed)) {
    return { is_all_day: true, start_time: null, end_time: null, time_slot: trimmed }
  }

  const parts = trimmed.split(/\s*(?:-|–|—|\bto\b)\s*/i)
  if (parts.length === 2) {
    const start = parseTimeTo24h(parts[0])
    const end = parseTimeTo24h(parts[1])
    if (start && end) {
      return { is_all_day: false, start_time: start, end_time: end, time_slot: trimmed }
    }
  }

  return { is_all_day: false, start_time: null, end_time: null, time_slot: trimmed }
}

export function mapDepartmentToOffice(department, offices = []) {
  if (!department || typeof department !== 'string') return null
  const normalized = department.trim().toLowerCase()

  const exact = offices.find((o) => o.name?.trim().toLowerCase() === normalized)
  if (exact) return exact

  if (normalized.includes('registrar')) {
    return offices.find((o) => /registrar/i.test(o.name)) || null
  }
  if (normalized.includes('cashier')) {
    return offices.find((o) => /cashier/i.test(o.name)) || null
  }
  if (normalized.includes('library')) {
    return offices.find((o) => /library/i.test(o.name)) || null
  }
  if (normalized.includes('guidance')) {
    return offices.find((o) => /guidance/i.test(o.name)) || null
  }
  if (
    normalized === 'osa' ||
    normalized.includes('student affairs') ||
    normalized.includes('office of student affairs') ||
    /\bosa\b/i.test(normalized)
  ) {
    return offices.find((o) => /student\s*affairs|osa/i.test(o.name)) || null
  }

  const fuzzy = offices.find((o) =>
    o.name && (o.name.toLowerCase().includes(normalized) || normalized.includes(o.name.toLowerCase())),
  )
  return fuzzy || null
}

export function fallbackOfficeName(department) {
  if (!department || typeof department !== 'string') return 'Campus Office'
  const trimmed = department.trim()
  if (trimmed.toLowerCase() === 'osa') return 'Office of Student Affairs (OSA)'
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function timeValue(value) {
  return typeof value === 'string' ? value.slice(0, 5) : ''
}

async function unavailableRoomIds(adminClient, rooms, reservationWindow) {
  if (!rooms.length) return new Set()
  const roomIds = rooms.map((room) => room.id)
  const { data: libraryOffice, error: officeError } = await adminClient
    .from('offices')
    .select('id')
    .eq('name', 'Library')
    .maybeSingle()
  if (officeError) throw officeError
  if (!libraryOffice) throw new Error('The Library office is not configured.')

  const { startDate, endDate, localStart, localEnd } = reservationWindow
  const [
    { data: overlapping, error: overlapError },
    { data: schedules, error: scheduleError },
    { data: blockedDates, error: blockedDateError },
    { data: events, error: eventError },
  ] = await Promise.all([
    adminClient
      .from('reservations')
      .select('room_id')
      .in('room_id', roomIds)
      .in('status', ['pending', 'confirmed'])
      .lt('start_at', endDate.toISOString())
      .gt('end_at', startDate.toISOString()),
    adminClient
      .from('office_schedules')
      .select('day_of_week, opens_at, closes_at, is_closed, effective_date')
      .eq('office_id', libraryOffice.id),
    adminClient
      .from('blocked_schedules')
      .select('id, department, blocked_date, time_slot, reason')
      .eq('blocked_date', localStart.date),
    adminClient
      .from('school_events')
      .select('location, starts_at, ends_at')
      .eq('is_published', true)
      .lt('starts_at', endDate.toISOString())
      .gt('ends_at', startDate.toISOString()),
  ])
  if (overlapError) throw overlapError
  if (scheduleError) throw scheduleError
  if (blockedDateError) throw blockedDateError
  if (eventError) throw eventError

  const dateSchedules = (schedules || []).filter(
    (schedule) => schedule.effective_date === localStart.date,
  )
  const applicableSchedules = dateSchedules.length
    ? dateSchedules
    : (schedules || []).filter((schedule) =>
      scheduleWeekdayMatches(schedule.day_of_week, localStart.weekday),
    )
  const officeClosed = applicableSchedules.some((schedule) => schedule.is_closed)
  const officeHours = applicableSchedules.filter(
    (schedule) => !schedule.is_closed && schedule.opens_at && schedule.closes_at,
  )
  const outsideOfficeHours = officeHours.length > 0 && !officeHours.some((schedule) => (
    localStart.time >= timeValue(schedule.opens_at) &&
    localEnd.time <= timeValue(schedule.closes_at)
  ))
  const libraryBlockedDates = (blockedDates || [])
    .filter((schedule) => {
      const mapped = mapDepartmentToOffice(schedule.department, [libraryOffice])
      return mapped?.id === libraryOffice.id || /library/i.test(schedule.department || '')
    })
    .map((schedule) => {
      const parsed = parseTimeSlot(schedule.time_slot)
      return {
        ...schedule,
        start_time: parsed.start_time,
        end_time: parsed.end_time,
        is_all_day: parsed.is_all_day,
      }
    })
  const blockedForOffice = libraryBlockedDates.some((schedule) => {
    if (schedule.is_all_day || !schedule.start_time || !schedule.end_time) return true
    return localStart.time < timeValue(schedule.end_time) &&
      localEnd.time > timeValue(schedule.start_time)
  })
  const overlappingRoomIds = new Set((overlapping || []).map((item) => item.room_id))

  return new Set(rooms
    .filter((room) => {
      const roomName = String(room.name || '').trim().toLowerCase()
      const reservedForEvent = roomName && (events || []).some((event) =>
        String(event.location || '')
          .toLowerCase()
          .split(/[,;|/·—-]/)
          .some((location) => location.trim() === roomName),
      )
      return overlappingRoomIds.has(room.id) ||
        officeClosed ||
        outsideOfficeHours ||
        blockedForOffice ||
        reservedForEvent
    })
    .map((room) => room.id))
}

async function requireLibraryOffice(req, res, next) {
  if (req.profile.role === 'admin') return next()

  try {
    const { data: libraryOffice, error } = await getAdminClient()
      .from('offices')
      .select('id')
      .eq('name', 'Library')
      .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })
    if (!libraryOffice || req.profile.office_id !== libraryOffice.id) {
      return res.status(403).json({ error: 'Only Library staff may manage room reservations.' })
    }
    return next()
  } catch (err) {
    console.error('Error verifying Library staff office:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
}

router.get('/rooms', async (req, res) => {
  try {
    const adminClient = getAdminClient()
    const { data: rooms, error } = await adminClient
      .from('rooms')
      .select('id, name, location, capacity, room_type, is_available, notes')
      .eq('is_available', true)
      .order('name', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })

    const { startAt, endAt, timeZone } = req.query
    if (startAt || endAt || timeZone) {
      const reservationWindow = parseReservationWindow(startAt, endAt, timeZone)
      if (reservationWindow.error) {
        return res.status(400).json({ error: reservationWindow.error })
      }
      const unavailable = await unavailableRoomIds(adminClient, rooms || [], reservationWindow)
      return res.json({
        rooms: (rooms || []).filter((room) => !unavailable.has(room.id)),
      })
    }

    res.json({ rooms })
  } catch (err) {
    console.error('Error fetching rooms:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.get('/blocked-schedules', authenticateUser, async (_req, res) => {
  try {
    const adminClient = getAdminClient()
    const { data: blockedSchedules, error } = await adminClient
      .from('blocked_schedules')
      .select('id, department, blocked_date, time_slot, reason, created_by, created_at')
      .order('blocked_date', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })

    const { data: offices, error: officesError } = await adminClient
      .from('offices')
      .select('id, name, is_active')
      .eq('is_active', true)
    if (officesError) return res.status(500).json({ error: officesError.message })

    const activeOffices = offices || []

    const formattedSchedules = (blockedSchedules || []).map((item) => {
      const mappedOffice = mapDepartmentToOffice(item.department, activeOffices)
      const officeName = mappedOffice?.name || fallbackOfficeName(item.department)
      const officeId = mappedOffice?.id || null
      const parsedTime = parseTimeSlot(item.time_slot)

      return {
        id: item.id,
        office_id: officeId,
        office_name: officeName,
        department: item.department,
        blocked_date: item.blocked_date,
        start_time: parsedTime.start_time,
        end_time: parsedTime.end_time,
        is_all_day: parsedTime.is_all_day,
        time_slot: parsedTime.time_slot,
        reason: item.reason,
        created_at: item.created_at,
      }
    })

    return res.json({ blockedSchedules: formattedSchedules })
  } catch (err) {
    console.error('Error fetching office blocked schedules:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

router.get('/my', authenticateUser, async (req, res) => {
  try {
    const adminClient = getAdminClient()
    const { data: reservations, error } = await adminClient
      .from('reservations')
      .select('id, resource_name, status, purpose, start_at, end_at, created_at, rooms(id, name, capacity, room_type), office_services(name)')
      .eq('student_id', req.user.id)
      .order('start_at', { ascending: false })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({ reservations: (reservations || []).map(formatReservationForClient) })
  } catch (err) {
    console.error('Error fetching reservations:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.get('/staff', authenticateUser, requireRole(['staff', 'admin']), requireLibraryOffice, async (_req, res) => {
  try {
    const { data: reservations, error } = await getAdminClient()
      .from('reservations')
      .select('id, student_id, resource_name, status, purpose, start_at, end_at, created_at, profiles(full_name, student_id), rooms(name, room_type), office_services(name)')
      .in('status', ['pending', 'confirmed', 'no_show'])
      .not('room_id', 'is', null)
      .order('start_at', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ reservations: (reservations || []).map(formatReservationForClient) })
  } catch (err) {
    console.error('Error fetching Library staff reservations:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/book', authenticateUser, async (req, res) => {
  const { roomId, serviceId, startAt, endAt, purpose, timeZone } = req.body

  if (!roomId || !startAt || !endAt || typeof purpose !== 'string' || !purpose.trim()) {
    return res.status(400).json({
      error: 'Please complete all required fields: roomId, startAt, endAt, purpose.',
    })
  }

  const reservationWindow = parseReservationWindow(startAt, endAt, timeZone)
  if (reservationWindow.error) {
    return res.status(400).json({ error: reservationWindow.error })
  }
  const { startDate, endDate } = reservationWindow

  try {
    const adminClient = getAdminClient()

    const { data: room, error: roomError } = await adminClient
      .from('rooms')
      .select('id, name, is_available')
      .eq('id', roomId)
      .single()

    if (roomError || !room || !room.is_available) {
      return res.status(404).json({ error: 'The selected room is not available for reservations.' })
    }

    if (serviceId) {
      const { data: service, error: serviceError } = await adminClient
        .from('office_services')
        .select('id, name, is_active, offices!inner(name, is_active)')
        .eq('id', serviceId)
        .maybeSingle()
      if (serviceError) return res.status(500).json({ error: serviceError.message })
      if (
        !service ||
        !service.is_active ||
        !service.offices?.is_active ||
        String(service.offices?.name || '').trim().toLowerCase() !== 'library'
      ) {
        return res.status(400).json({ error: 'Select an active Library room reservation service.' })
      }
    }

    const unavailable = await unavailableRoomIds(adminClient, [room], reservationWindow)
    if (unavailable.has(room.id)) {
      return res.status(409).json({
        error: `Room "${room.name}" is reserved, blocked, or unavailable during this time slot. Please choose another time or room.`,
      })
    }

    const { data: newReservation, error: insertError } = await adminClient
      .from('reservations')
      .insert({
        student_id: req.user.id,
        room_id: roomId,
        resource_name: room.name,
        service_id: serviceId || null,
        purpose: purpose.trim(),
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        status: 'pending',
      })
      .select('id, room_id, resource_name, status, purpose, start_at, end_at, created_at')
      .single()

    if (insertError) {
      if (insertError.code === '23P01' || insertError.message?.includes('conflict') || insertError.message?.includes('overlap') || insertError.message?.includes('exclude')) {
        return res.status(409).json({
          error: `Room "${room.name}" was just reserved by another student for this time slot. Please choose another slot.`,
        })
      }
      return res.status(500).json({ error: insertError.message })
    }

    res.status(201).json({
      message: 'Room reservation submitted successfully and is pending confirmation.',
      reservation: formatReservationForClient(newReservation),
    })
  } catch (err) {
    console.error('Error booking room reservation:', err)
    res.status(500).json({ error: 'Internal server error while booking reservation.' })
  }
})

router.post('/cancel', authenticateUser, async (req, res) => {
  const { reservationId } = req.body
  if (!reservationId) {
    return res.status(400).json({ error: 'Reservation ID is required.' })
  }

  try {
    const adminClient = getAdminClient()

    const { data: reservation, error: fetchError } = await adminClient
      .from('reservations')
      .select('id, student_id, status, room_id, start_at, updated_at, rooms(name), office_services(name)')
      .eq('id', reservationId)
      .single()

    if (fetchError || !reservation) {
      return res.status(404).json({ error: 'Reservation not found.' })
    }

    if (reservation.student_id !== req.user.id && req.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You can only cancel your own reservations.' })
    }

    const cancelledByOffice = reservation.student_id !== req.user.id
    const currentStatus = String(reservation.status || '').toLowerCase()
    if (['cancelled', 'completed'].includes(currentStatus)) {
      if (currentStatus !== 'cancelled' || !cancelledByOffice) {
        const statusLabel = reservationStatusLabels[currentStatus] || reservation.status
        return res.status(400).json({ error: `Cannot cancel a reservation that is already ${statusLabel}.` })
      }

      const roomName = reservation.rooms?.name || 'Discussion Room'
      await createStudentNotification({
        adminClient,
        recipientId: reservation.student_id,
        title: 'Room Reservation Cancelled',
        category: 'reservation',
        message: `Your reservation for ${roomName} on ${formatReservationDateTime(reservation.start_at)} was cancelled by the office.`,
        relatedId: reservation.id,
        eventKey: `reservation:${reservation.id}:status:Cancelled:${reservation.updated_at}`,
        officeName: 'Library',
        transaction: `Room reservation for ${roomName}`,
      })
      return res.json({ message: `Reservation for ${roomName} was cancelled.` })
    }

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await adminClient
      .from('reservations')
      .update({
        status: 'cancelled',
        updated_at: now,
      })
      .eq('id', reservationId)
      .eq('status', reservation.status)
      .select('id, student_id, status, start_at, updated_at, rooms(name)')
      .maybeSingle()

    if (updateError) {
      return res.status(500).json({ error: updateError.message })
    }
    if (!updated) return res.status(409).json({ error: 'This reservation changed. Refresh and try again.' })

    if (cancelledByOffice) {
      const roomName = updated.rooms?.name || 'Discussion Room'
      await createStudentNotification({
        adminClient,
        recipientId: updated.student_id,
        title: 'Room Reservation Cancelled',
        category: 'reservation',
        message: `Your reservation for ${roomName} on ${formatReservationDateTime(updated.start_at)} was cancelled by the office.`,
        relatedId: updated.id,
        eventKey: `reservation:${updated.id}:status:Cancelled:${updated.updated_at}`,
        officeName: 'Library',
        transaction: `Room reservation for ${roomName}`,
      })
    }

    res.json({
      message: `Reservation for ${reservation.rooms?.name || 'Room'} was cancelled.`,
    })
  } catch (err) {
    console.error('Error cancelling reservation:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/update-status', authenticateUser, requireRole(['staff', 'admin']), requireLibraryOffice, async (req, res) => {
  const { reservationId, status } = req.body
  const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : ''
  const statusLabel = reservationStatusLabels[normalizedStatus]
  const updatedAt = new Date().toISOString()

  if (!reservationId || !['confirmed', 'completed', 'cancelled', 'no_show'].includes(normalizedStatus)) {
    return res.status(400).json({ error: 'Valid reservationId and status (Confirmed, Completed, Cancelled, No Show) required.' })
  }

  try {
    const adminClient = getAdminClient()
    const allowedFrom = normalizedStatus === 'confirmed'
      ? ['pending']
      : normalizedStatus === 'no_show'
        ? ['confirmed']
      : normalizedStatus === 'completed'
        ? ['confirmed', 'no_show']
        : ['pending', 'confirmed']
    let updateQuery = adminClient
      .from('reservations')
      .update({
        status: normalizedStatus,
        handled_by: req.user.id,
        updated_at: updatedAt,
      })
      .eq('id', reservationId)
    if (normalizedStatus === 'completed') {
      updateQuery = updateQuery.or('status.eq.confirmed,and(status.eq.no_show,room_id.not.is.null)')
    } else {
      updateQuery = updateQuery.in('status', allowedFrom)
    }
    if (normalizedStatus === 'no_show') {
      updateQuery = updateQuery
        .not('room_id', 'is', null)
        .lt('end_at', updatedAt)
    }
    const { data: updated, error: updateError } = await updateQuery
      .select('id, student_id, status, service_id, room_id, start_at, end_at, updated_at, rooms(name)')
      .maybeSingle()

    if (updateError) {
      return res.status(500).json({ error: updateError.message })
    }
    let currentReservation = updated
    const statusChanged = Boolean(updated)
    if (!currentReservation) {
      const { data: current, error: lookupError } = await adminClient
        .from('reservations')
        .select('id, student_id, status, service_id, room_id, start_at, end_at, updated_at, rooms(name)')
        .eq('id', reservationId)
        .maybeSingle()

      if (lookupError) return res.status(500).json({ error: lookupError.message })
      if (!current || String(current.status || '').toLowerCase() !== normalizedStatus) {
        if (
          normalizedStatus === 'no_show' &&
          current &&
          String(current.status || '').toLowerCase() === 'confirmed' &&
          new Date(current.end_at) >= new Date(updatedAt)
        ) {
          return res.status(400).json({ error: 'A reservation can only be marked No Show after its scheduled end time.' })
        }
        return res.status(409).json({ error: 'Reservation status changed or is no longer eligible for this action.' })
      }
      currentReservation = current
    }

    const officeName = 'Library'
    const transaction = `Room reservation for ${currentReservation.rooms?.name || 'Library Room'}`
    const reservationTime = formatReservationDateTime(currentReservation.end_at || currentReservation.start_at)
    const message = normalizedStatus === 'no_show'
      ? `Your reservation for ${currentReservation.rooms?.name || 'Discussion Room'} ending at ${reservationTime} was marked No Show. If you attended, contact Library staff to correct the status.`
      : `Your reservation for ${currentReservation.rooms?.name || 'Discussion Room'} on ${reservationTime} has been ${statusLabel.toLowerCase()}.`
    await createStudentNotification({
      adminClient,
      recipientId: currentReservation.student_id,
      title: `Room Reservation ${statusLabel}`,
      category: 'reservation',
      message,
      relatedId: currentReservation.id,
      eventKey: `reservation:${currentReservation.id}:status:${statusLabel}:${currentReservation.updated_at}`,
      officeName,
      transaction,
    })

    if (normalizedStatus === 'completed' && statusChanged) {
      await adminClient.from('service_history').insert({
        student_id: currentReservation.student_id,
        service_id: currentReservation.service_id,
        transaction_id: currentReservation.id,
        transaction_type: 'Reservation',
        title: `Library Room Reservation: ${currentReservation.rooms?.name || 'Room'}`,
        completed_at: new Date().toISOString(),
      })
    }

    res.json({
      message: `Reservation status updated to ${statusLabel}.`,
      reservation: formatReservationForClient(currentReservation),
    })
  } catch (err) {
    console.error('Error updating reservation status:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

export default router