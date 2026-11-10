import express from 'express'
import { randomUUID } from 'node:crypto'
import { authenticateUser, requireRole } from '../middleware/auth.js'
import { getAdminClient } from '../supabase.js'
import { formatQueueNumber } from '../utils/queueNumber.js'
import { sendStudentNotificationEmail, sendTestStudentNotificationEmail } from '../utils/studentNotifications.js'
import { isGeneralPostNotification } from '../utils/generalPostEmailDelivery.js'

const router = express.Router()

router.use(authenticateUser, requireRole(['staff', 'admin']), (req, res, next) => {
  if (req.profile.role === 'staff' && !req.profile.office_id) {
    return res.status(403).json({ error: 'Staff account has no office assigned.' })
  }
  next()
})

router.get('/overview', async (req, res) => {
  const staffOfficeId = req.profile.office_id

  try {
    const adminClient = getAdminClient()

    let officeInfo = null
    if (staffOfficeId) {
      const { data } = await adminClient
        .from('offices')
        .select('id, name, location, is_active')
        .eq('id', staffOfficeId)
        .maybeSingle()
      officeInfo = data
    }

    let queueQuery = adminClient
      .from('queues')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'waiting')
    if (staffOfficeId) {
      queueQuery = queueQuery.eq('office_services.office_id', staffOfficeId)
    }
    const { count: waitingQueues } = await queueQuery

    let aptQuery = adminClient
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'reschedule_requested'])
    if (staffOfficeId) {
      aptQuery = aptQuery.eq('office_services.office_id', staffOfficeId)
    }
    const { count: pendingAppointments } = await aptQuery

    let reqQuery = adminClient
      .from('service_requests')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'processing', 'Submitted', 'Processing'])
    if (staffOfficeId) {
      reqQuery = reqQuery.eq('office_services.office_id', staffOfficeId)
    }
    const { count: pendingRequests } = await reqQuery

    res.json({
      office: officeInfo,
      stats: {
        waitingQueues: waitingQueues || 0,
        pendingAppointments: pendingAppointments || 0,
        pendingRequests: pendingRequests || 0,
      },
    })
  } catch (err) {
    console.error('Error fetching staff overview:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.get('/queue-list', async (req, res) => {
  const staffOfficeId = req.profile.office_id

  try {
    const adminClient = getAdminClient()
    let activeQuery = adminClient
      .from('queues')
      .select('id, queue_number, status, called_at, created_at, profiles(full_name, student_id), office_services!inner(name, office_id, offices(name))')
      .in('status', ['waiting', 'being_served'])
      .order('created_at', { ascending: true })

    let skippedQuery = adminClient
      .from('queues')
      .select('id, queue_number, status, called_at, created_at, profiles(full_name, student_id), office_services!inner(name, office_id, offices(name))')
      .eq('status', 'skipped')
      .order('created_at', { ascending: false })
      .limit(25)

    if (staffOfficeId) {
      activeQuery = activeQuery.eq('office_services.office_id', staffOfficeId)
      skippedQuery = skippedQuery.eq('office_services.office_id', staffOfficeId)
    }

    const [
      { data: tickets, error: activeError },
      { data: skippedTickets, error: skippedError },
    ] = await Promise.all([activeQuery, skippedQuery])
    if (activeError || skippedError) {
      return res.status(500).json({ error: activeError?.message || skippedError.message })
    }

    res.json({
      tickets: (tickets || []).map((ticket) => ({
        ...ticket,
        queue_number: formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name),
      })),
      skippedTickets: (skippedTickets || []).map((ticket) => ({
        ...ticket,
        queue_number: formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name),
      })),
    })
  } catch (err) {
    console.error('Error fetching staff queue list:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.get('/requests-list', async (req, res) => {
  const staffOfficeId = req.profile.office_id

  try {
    const adminClient = getAdminClient()
    let query = adminClient
      .from('service_requests')
      .select('id, student_id, request_type, title, details, status, submitted_at, completed_at, profiles:profiles!service_requests_student_id_fkey(full_name, student_id), office_services!inner(name, office_id, offices!inner(name))')
      .order('submitted_at', { ascending: false })

    if (staffOfficeId) {
      query = query.eq('office_services.office_id', staffOfficeId)
    }

    const { data: requests, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    res.json({ requests })
  } catch (err) {
    console.error('Error fetching staff requests list:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.get('/appointments-list', async (req, res) => {
  const staffOfficeId = req.profile.office_id

  try {
    const adminClient = getAdminClient()
    let query = adminClient
      .from('appointments')
      .select('id, student_id, service_id, scheduled_at, end_at, purpose, status, created_at, updated_at, profiles:profiles!appointments_student_id_fkey(full_name, student_id), office_services!inner(name, office_id, offices!inner(name))')
      .order('scheduled_at', { ascending: true })

    if (staffOfficeId) {
      query = query.eq('office_services.office_id', staffOfficeId)
    }

    const { data: appointments, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    res.json({ appointments })
  } catch (err) {
    console.error('Error fetching staff appointments list:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/notifications/:notificationId/retry-email', async (req, res) => {
  if (req.profile.role !== 'admin') {
    return res.status(403).json({ error: 'Only administrators can retry announcement email delivery.' })
  }

  try {
    const adminClient = getAdminClient()
    const { data: notification, error } = await adminClient
      .from('notifications')
      .select('id, recipient_id, title, category, message, event_key')
      .eq('id', req.params.notificationId)
      .maybeSingle()

    if (error) return res.status(500).json({ error: 'Could not load the notification for retry.' })
    if (!notification || !isGeneralPostNotification(notification)) {
      return res.status(404).json({ error: 'General post notification was not found.' })
    }

    const accepted = await sendStudentNotificationEmail({
      adminClient,
      recipientId: notification.recipient_id,
      title: notification.title,
      category: notification.category,
      message: notification.message,
      eventKey: notification.event_key,
      officeName: notification.message?.match(/^Office: (.+)$/m)?.[1],
      transaction: 'Campus update',
    })

    if (!accepted) {
      return res.status(502).json({ error: 'Resend did not confirm email acceptance. See the backend delivery log before retrying.' })
    }
    return res.json({ accepted: true })
  } catch (error) {
    console.error('Could not retry general post email:', error)
    return res.status(500).json({ error: 'Could not retry general post email.' })
  }
})

if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_EMAIL_ENDPOINT === 'true') {
  router.post('/test-email', async (req, res) => {
    if (req.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can send a test email.' })
    }

    const recipientEmail = typeof req.body?.recipientEmail === 'string'
      ? req.body.recipientEmail.trim()
      : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return res.status(400).json({ error: 'Provide a valid recipientEmail address.' })
    }

    try {
      const result = await sendTestStudentNotificationEmail({
        recipientEmail,
        eventKey: `email-test:${randomUUID()}`,
      })
      if (!result.accepted) {
        const status = result.reason === 'email_provider_not_configured' ? 503 : 502
        return res.status(status).json({
          accepted: false,
          error: result.reason === 'email_provider_not_configured'
            ? 'Configure RESEND_API_KEY and EMAIL_FROM in the backend environment.'
            : 'Resend did not confirm acceptance of the test email.',
        })
      }

      return res.json({ accepted: true })
    } catch (error) {
      console.error('Could not send test email:', error)
      return res.status(500).json({ error: 'Could not send the test email.' })
    }
  })
}

export default router