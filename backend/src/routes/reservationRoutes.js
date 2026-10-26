import express from 'express'
import { authenticateUser, requireRole } from '../middleware/auth.js'
import { getAdminClient } from '../supabase.js'

const router = express.Router()

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

router.get('/rooms', async (_req, res) => {
  try {
    const adminClient = getAdminClient()
    const { data: rooms, error } = await adminClient
      .from('rooms')
      .select('id, name, location, capacity, room_type, is_available, notes')
      .eq('is_available', true)
      .order('name', { ascending: true })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({ rooms })
  } catch (err) {
    console.error('Error fetching rooms:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.get('/my', authenticateUser, async (req, res) => {
  try {
    const adminClient = getAdminClient()
    const { data: reservations, error } = await adminClient
      .from('reservations')
      .select('id, status, purpose, start_at, end_at, created_at, rooms(id, name, capacity, room_type), office_services(name)')
      .eq('student_id', req.user.id)
      .order('start_at', { ascending: false })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({ reservations })
  } catch (err) {
    console.error('Error fetching reservations:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.get('/staff', authenticateUser, requireRole(['staff', 'admin']), requireLibraryOffice, async (_req, res) => {
  try {
    const { data: reservations, error } = await getAdminClient()
      .from('reservations')
      .select('id, student_id, status, purpose, start_at, end_at, created_at, profiles(full_name, student_id), rooms(name, room_type), office_services(name)')
      .in('status', ['Pending', 'Confirmed'])
      .order('start_at', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ reservations })
  } catch (err) {
    console.error('Error fetching Library staff reservations:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/book', authenticateUser, async (req, res) => {
  const { roomId, serviceId, startAt, endAt, purpose } = req.body

  if (!roomId || !startAt || !endAt || !purpose) {
    return res.status(400).json({
      error: 'Please complete all required fields: roomId, startAt, endAt, purpose.',
    })
  }

  const startDate = new Date(startAt)
  const endDate = new Date(endAt)

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date/time format.' })
  }

  if (startDate >= endDate) {
    return res.status(400).json({ error: 'End time must be after start time.' })
  }

  if (startDate < new Date()) {
    return res.status(400).json({ error: 'Reservation time cannot be in the past.' })
  }

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

    const { data: overlapping, error: overlapQueryError } = await adminClient
      .from('reservations')
      .select('id, start_at, end_at, status')
      .eq('room_id', roomId)
      .in('status', ['Pending', 'Confirmed'])
      .lt('start_at', endDate.toISOString())
      .gt('end_at', startDate.toISOString())

    if (overlapQueryError) {
      return res.status(500).json({ error: overlapQueryError.message })
    }

    if (overlapping && overlapping.length > 0) {
      return res.status(409).json({
        error: `Room "${room.name}" is already reserved during this time slot. Please choose another time or room.`,
      })
    }

    const { data: newReservation, error: insertError } = await adminClient
      .from('reservations')
      .insert({
        student_id: req.user.id,
        room_id: roomId,
        service_id: serviceId || null,
        purpose: purpose.trim(),
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        status: 'Pending',
      })
      .select('id, room_id, status, purpose, start_at, end_at, created_at')
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
      reservation: newReservation,
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
      .select('id, student_id, status, room_id, rooms(name)')
      .eq('id', reservationId)
      .single()

    if (fetchError || !reservation) {
      return res.status(404).json({ error: 'Reservation not found.' })
    }

    if (reservation.student_id !== req.user.id && req.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You can only cancel your own reservations.' })
    }

    if (['Cancelled', 'Completed'].includes(reservation.status)) {
      return res.status(400).json({ error: `Cannot cancel a reservation that is already ${reservation.status}.` })
    }

    const { error: updateError } = await adminClient
      .from('reservations')
      .update({
        status: 'Cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservationId)

    if (updateError) {
      return res.status(500).json({ error: updateError.message })
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

  if (!reservationId || !['Confirmed', 'Completed', 'Cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Valid reservationId and status (Confirmed, Completed, Cancelled) required.' })
  }

  try {
    const adminClient = getAdminClient()
    const allowedFrom = status === 'Confirmed'
      ? ['Pending']
      : status === 'Completed'
        ? ['Confirmed']
        : ['Pending', 'Confirmed']
    const { data: updated, error: updateError } = await adminClient
      .from('reservations')
      .update({
        status,
        handled_by: req.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservationId)
      .in('status', allowedFrom)
      .select('id, student_id, status, service_id, room_id, rooms(name)')
      .maybeSingle()

    if (updateError) {
      return res.status(500).json({ error: updateError.message })
    }
    if (!updated) {
      return res.status(409).json({ error: 'Reservation status changed or is no longer eligible for this action.' })
    }

    await adminClient.from('notifications').insert({
      recipient_id: updated.student_id,
      title: `Room Reservation ${status}`,
      category: 'reservation',
      message: `Your reservation for ${updated.rooms?.name || 'Discussion Room'} has been ${status.toLowerCase()}.`,
      is_read: false,
    })

    if (status === 'Completed') {
      await adminClient.from('service_history').insert({
        student_id: updated.student_id,
        service_id: updated.service_id,
        transaction_id: updated.id,
        transaction_type: 'Reservation',
        title: `Library Room Reservation: ${updated.rooms?.name || 'Room'}`,
        completed_at: new Date().toISOString(),
      })
    }

    res.json({ message: `Reservation status updated to ${status}.`, reservation: updated })
  } catch (err) {
    console.error('Error updating reservation status:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

export default router