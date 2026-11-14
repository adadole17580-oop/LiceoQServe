import express from 'express'
import { authenticateUser, requireRole } from '../middleware/auth.js'
import { getAdminClient } from '../supabase.js'
import { createStudentNotification } from '../utils/studentNotifications.js'

const router = express.Router()

router.get('/my', authenticateUser, async (req, res) => {
  try {
    const adminClient = getAdminClient()
    const { data: appointments, error } = await adminClient
      .from('appointments')
      .select('id, student_id, service_id, status, purpose, scheduled_at, created_at, updated_at, office_services(id, name, office_id, offices(id, name))')
      .eq('student_id', req.user.id)
      .order('scheduled_at', { ascending: false })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({ appointments })
  } catch (err) {
    console.error('Error fetching appointments:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/book', authenticateUser, async (req, res) => {
  const { serviceId, scheduledAt, purpose } = req.body

  if (!serviceId || !scheduledAt || !purpose) {
    return res.status(400).json({
      error: 'Please provide serviceId, scheduledAt, and purpose.',
    })
  }

  const appointmentDate = new Date(scheduledAt)
  if (isNaN(appointmentDate.getTime()) || appointmentDate < new Date()) {
    return res.status(400).json({ error: 'Please choose a valid date and time in the future.' })
  }

  try {
    const adminClient = getAdminClient()

    const { data: service, error: serviceError } = await adminClient
      .from('office_services')
      .select('id, name, is_active, office_id, offices(id, name, is_active)')
      .eq('id', serviceId)
      .single()

    if (serviceError || !service || !service.is_active || !service.offices?.is_active) {
      return res.status(404).json({ error: 'Selected service is currently unavailable.' })
    }

    const officeName = service.offices.name

    if (officeName === 'Cashier') {
      return res.status(400).json({
        error: 'Cashier office does not accept appointments. Please use the Cashier tuition queue.',
      })
    }

    const { data: newAppointment, error: insertError } = await adminClient
      .from('appointments')
      .insert({
        student_id: req.user.id,
        service_id: service.id,
        scheduled_at: appointmentDate.toISOString(),
        purpose: purpose.trim(),
        status: 'pending',
      })
      .select('id, scheduled_at, status, purpose, created_at')
      .single()

    if (insertError) {
      return res.status(500).json({ error: insertError.message })
    }

    res.status(201).json({
      message: 'Your appointment request has been submitted and is pending confirmation.',
      appointment: {
        ...newAppointment,
        office: officeName,
        service: service.name,
      },
    })
  } catch (err) {
    console.error('Error booking appointment:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/reschedule', authenticateUser, async (req, res) => {
  const { appointmentId, scheduledAt, purpose } = req.body

  if (!appointmentId || !scheduledAt || !purpose?.trim()) {
    return res.status(400).json({ error: 'Appointment, date/time, and purpose are required.' })
  }

  const appointmentDate = new Date(scheduledAt)
  if (isNaN(appointmentDate.getTime()) || appointmentDate <= new Date()) {
    return res.status(400).json({ error: 'Please choose a valid date and time in the future.' })
  }

  try {
    const adminClient = getAdminClient()
    const { data: appointment, error: fetchError } = await adminClient
      .from('appointments')
      .select('id, student_id, status, office_services(name, offices(name))')
      .eq('id', appointmentId)
      .maybeSingle()

    if (fetchError) return res.status(500).json({ error: fetchError.message })
    if (!appointment) return res.status(404).json({ error: 'Appointment not found.' })
    if (appointment.student_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only reschedule your own appointments.' })
    }
    const currentStatus = String(appointment.status).toLowerCase()
    const officeName = appointment.office_services?.offices?.name
    if (currentStatus === 'confirmed' && officeName?.trim().toLowerCase() === 'guidance') {
      return res.status(400).json({
        error: 'Confirmed Guidance appointments cannot be rescheduled.',
      })
    }
    if (!['pending', 'confirmed'].includes(currentStatus)) {
      return res.status(400).json({ error: `Cannot reschedule an appointment that is ${appointment.status}.` })
    }

    const { data: updated, error: updateError } = await adminClient
      .from('appointments')
      .update({
        scheduled_at: appointmentDate.toISOString(),
        purpose: purpose.trim(),
        status: 'reschedule_requested',
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)
      .eq('status', appointment.status)
      .select('id, scheduled_at, status, purpose, service_id, office_services(name, offices(name))')
      .single()

    if (updateError?.code === 'PGRST116') {
      return res.status(409).json({ error: 'This appointment changed. Refresh and try again.' })
    }
    if (updateError) return res.status(500).json({ error: updateError.message })
    return res.json({
      message: 'Your rescheduling request was submitted for office confirmation.',
      appointment: updated,
    })
  } catch (err) {
    console.error('Error rescheduling appointment:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/cancel', authenticateUser, async (req, res) => {
  const { appointmentId } = req.body

  if (!appointmentId) {
    return res.status(400).json({ error: 'Appointment ID is required.' })
  }

  try {
    const adminClient = getAdminClient()

    const { data: appointment, error: fetchError } = await adminClient
      .from('appointments')
      .select('id, student_id, status, service_id, scheduled_at, updated_at, office_services(name, offices(name))')
      .eq('id', appointmentId)
      .single()

    if (fetchError || !appointment) {
      return res.status(404).json({ error: 'Appointment not found.' })
    }

    if (appointment.student_id !== req.user.id && req.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You can only cancel your own appointments.' })
    }

    const cancelledByOffice = appointment.student_id !== req.user.id
    const currentStatus = String(appointment.status).toLowerCase()
    if (['cancelled', 'completed'].includes(currentStatus)) {
      if (currentStatus !== 'cancelled' || !cancelledByOffice) {
        return res.status(400).json({ error: `Cannot cancel an appointment that is already ${appointment.status}.` })
      }

      const officeName = appointment.office_services?.offices?.name || 'Campus Office'
      const transaction = appointment.office_services?.name || 'Appointment'
      await createStudentNotification({
        adminClient,
        recipientId: appointment.student_id,
        title: 'Appointment cancelled',
        category: 'appointment',
        message: `Your ${transaction} appointment with ${officeName} on ${new Date(appointment.scheduled_at).toLocaleString()} was cancelled by the office.`,
        relatedId: appointment.id,
        eventKey: `appointment:${appointment.id}:status:cancelled:${appointment.updated_at}`,
        officeName,
        transaction,
      })
      return res.json({ message: 'Appointment was cancelled successfully.' })
    }

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await adminClient
      .from('appointments')
      .update({
        status: 'cancelled',
        updated_at: now,
      })
      .eq('id', appointmentId)
      .eq('status', appointment.status)
      .select('id, student_id, status, service_id, scheduled_at, updated_at, office_services(name, offices(name))')
      .maybeSingle()

    if (updateError) {
      return res.status(500).json({ error: updateError.message })
    }
    if (!updated) return res.status(409).json({ error: 'This appointment changed. Refresh and try again.' })

    if (cancelledByOffice) {
      const officeName = updated.office_services?.offices?.name || 'Campus Office'
      const transaction = updated.office_services?.name || 'Appointment'
      await createStudentNotification({
        adminClient,
        recipientId: updated.student_id,
        title: 'Appointment cancelled',
        category: 'appointment',
        message: `Your ${transaction} appointment with ${officeName} on ${new Date(updated.scheduled_at).toLocaleString()} was cancelled by the office.`,
        relatedId: updated.id,
        eventKey: `appointment:${updated.id}:status:cancelled:${updated.updated_at}`,
        officeName,
        transaction,
      })
    }

    res.json({
      message: 'Appointment was cancelled successfully.',
    })
  } catch (err) {
    console.error('Error cancelling appointment:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/update-status', authenticateUser, requireRole(['staff', 'admin']), async (req, res) => {
  const { appointmentId, status, scheduledAt, message } = req.body || {}
  const validStatuses = ['confirmed', 'completed', 'cancelled', 'rejected', 'no_show']

  if (!appointmentId || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Valid appointmentId and status (${validStatuses.join(', ')}) required.` })
  }
  if (message !== undefined && (typeof message !== 'string' || message.trim().length > 2000)) {
    return res.status(400).json({ error: 'The student message must be 2000 characters or fewer.' })
  }
  if (scheduledAt && status !== 'confirmed') {
    return res.status(400).json({ error: 'A new appointment date and time can only be saved when confirming the appointment.' })
  }
  const newSchedule = scheduledAt ? new Date(scheduledAt) : null
  if (scheduledAt && (Number.isNaN(newSchedule.getTime()) || newSchedule <= new Date())) {
    return res.status(400).json({ error: 'Choose a valid appointment date and time in the future.' })
  }

  try {
    const adminClient = getAdminClient()
    const { data: appointment, error: fetchError } = await adminClient
      .from('appointments')
      .select('id, student_id, status, scheduled_at, updated_at, service_id, office_services!inner(name, office_id, offices(name))')
      .eq('id', appointmentId)
      .maybeSingle()

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message })
    }
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found.' })
    }
    if (req.profile.role !== 'admin' && appointment.office_services.office_id !== req.profile.office_id) {
      return res.status(403).json({ error: 'You are not authorized to manage appointments for this office.' })
    }

    let updated = appointment
    const scheduleChanged = newSchedule && newSchedule.toISOString() !== new Date(appointment.scheduled_at).toISOString()
    let appointmentChanged = false
    if (appointment.status !== status || scheduleChanged) {
      const now = new Date().toISOString()
      const updateData = {
        status,
        handled_by: req.user.id,
        updated_at: now,
      }
      if (newSchedule) updateData.scheduled_at = newSchedule.toISOString()

      const { data, error: updateError } = await adminClient
        .from('appointments')
        .update(updateData)
        .eq('id', appointmentId)
        .eq('status', appointment.status)
        .select('id, student_id, status, scheduled_at, updated_at, service_id, office_services(name, office_id, offices(name))')
        .maybeSingle()

      if (updateError) {
        return res.status(500).json({ error: updateError.message })
      }
      if (!data) {
        return res.status(409).json({ error: 'This appointment changed. Refresh the list and try again.' })
      }
      updated = data
      appointmentChanged = true
    }

    const officeName = updated.office_services?.offices?.name || 'Campus Office'
    const transaction = updated.office_services?.name || 'Appointment'
    const scheduleText = scheduleChanged
      ? ` It has been rescheduled to ${new Date(updated.scheduled_at).toLocaleString()}.`
      : ''
    const additionalMessage = message?.trim() ? ` ${message.trim()}` : ''
    await createStudentNotification({
      adminClient,
      recipientId: updated.student_id,
      title: scheduleChanged ? 'Appointment rescheduled' : `Appointment ${status}`,
      category: 'appointment',
      message: `Your ${transaction} appointment with ${officeName} on ${new Date(updated.scheduled_at).toLocaleString()} has been ${scheduleChanged ? 'rescheduled and confirmed' : status}.${scheduleText}${additionalMessage}`,
      relatedId: updated.id,
      eventKey: `appointment:${updated.id}:status:${status}:${updated.updated_at}`,
      officeName,
      transaction,
    })

    if (status === 'completed' && appointmentChanged) {
      await adminClient.from('service_history').insert({
        student_id: updated.student_id,
        service_id: updated.service_id,
        transaction_id: updated.id,
        transaction_type: 'Appointment',
        title: `${updated.office_services?.offices?.name || 'Campus'} Appointment (${updated.office_services?.name})`,
        completed_at: new Date().toISOString(),
      })
    }

    res.json({ message: `Appointment status updated to ${status}.`, appointment: updated })
  } catch (err) {
    console.error('Error updating appointment:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

export default router