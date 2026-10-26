import express from 'express'
import { authenticateUser, requireRole } from '../middleware/auth.js'
import { getAdminClient } from '../supabase.js'

const router = express.Router()

router.get('/my', authenticateUser, async (req, res) => {
  try {
    const adminClient = getAdminClient()
    const { data: appointments, error } = await adminClient
      .from('appointments')
      .select('id, student_id, service_id, status, purpose, scheduled_at, created_at, office_services(id, name, office_id, offices(id, name))')
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
      .select('id, student_id, status')
      .eq('id', appointmentId)
      .maybeSingle()

    if (fetchError) return res.status(500).json({ error: fetchError.message })
    if (!appointment) return res.status(404).json({ error: 'Appointment not found.' })
    if (appointment.student_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only reschedule your own appointments.' })
    }
    const currentStatus = String(appointment.status).toLowerCase()
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
      .select('id, scheduled_at, status, purpose, service_id, office_services(name, offices(name))')
      .single()

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
      .select('id, student_id, status, service_id, scheduled_at, office_services(name, offices(name))')
      .eq('id', appointmentId)
      .single()

    if (fetchError || !appointment) {
      return res.status(404).json({ error: 'Appointment not found.' })
    }

    if (appointment.student_id !== req.user.id && req.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You can only cancel your own appointments.' })
    }

    const currentStatus = String(appointment.status).toLowerCase()
    if (['cancelled', 'completed'].includes(currentStatus)) {
      return res.status(400).json({ error: `Cannot cancel an appointment that is already ${appointment.status}.` })
    }

    const now = new Date().toISOString()
    const { error: updateError } = await adminClient
      .from('appointments')
      .update({
        status: 'cancelled',
        updated_at: now,
      })
      .eq('id', appointmentId)

    if (updateError) {
      return res.status(500).json({ error: updateError.message })
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
  const { appointmentId, status } = req.body
  const validStatuses = ['confirmed', 'completed', 'cancelled', 'rejected', 'no_show']

  if (!appointmentId || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Valid appointmentId and status (${validStatuses.join(', ')}) required.` })
  }

  try {
    const adminClient = getAdminClient()
    const { data: appointment, error: fetchError } = await adminClient
      .from('appointments')
      .select('id, office_services!inner(office_id)')
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

    const { data: updated, error: updateError } = await adminClient
      .from('appointments')
      .update({
        status,
        handled_by: req.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)
      .select('id, student_id, status, scheduled_at, service_id, office_services(name, offices(name))')
      .single()

    if (updateError) {
      return res.status(500).json({ error: updateError.message })
    }

    await adminClient.from('notifications').insert({
      recipient_id: updated.student_id,
      title: `Appointment ${status}`,
      category: 'appointment',
      message: `Your appointment with ${updated.office_services?.offices?.name || 'office'} on ${new Date(updated.scheduled_at).toLocaleDateString()} has been ${status.toLowerCase()}.`,
      is_read: false,
    })

    if (status === 'completed') {
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