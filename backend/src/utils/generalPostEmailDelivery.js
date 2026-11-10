import { createHash } from 'node:crypto'
import { getAdminClient } from '../supabase.js'
import { sendStudentNotificationEmail } from './studentNotifications.js'
import { isGeneralPostNotification } from './generalPostEmailEligibility.js'

export { isGeneralPostNotification } from './generalPostEmailEligibility.js'

let deliveryChannel = null
const inFlightDeliveries = new Map()

export function startGeneralPostEmailDelivery() {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.warn('General-post email delivery is disabled: configure backend RESEND_API_KEY and EMAIL_FROM.')
  }

  const adminClient = getAdminClient()
  deliveryChannel = adminClient
    .channel('general-post-email-delivery')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      ({ new: notification }) => {
        if (!isGeneralPostNotification(notification)) return

        queueEmailDelivery(notification.event_key, () => sendStudentNotificationEmail({
            adminClient,
            recipientId: notification.recipient_id,
            title: notification.title,
            category: notification.category,
            message: notification.message,
            eventKey: notification.event_key,
            officeName: notification.message?.match(/^Office: (.+)$/m)?.[1],
            createdAt: notification.created_at,
          }))
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'guidance_blocked_schedules' },
      ({ new: schedule }) => {
        void deliverGuidanceBlockedSchedule(adminClient, schedule).catch((error) => {
          console.error('Could not deliver Guidance schedule-closure emails:', error)
        })
      },
    )
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('General-post email Realtime listener failed:', error?.message || status)
      }
    })

  return deliveryChannel
}

function queueEmailDelivery(eventKey, deliver) {
  if (inFlightDeliveries.has(eventKey)) {
    return inFlightDeliveries.get(eventKey)
  }

  const delivery = Promise.resolve()
    .then(deliver)
    .catch((error) => {
      console.error(JSON.stringify({
        event: 'student_notification_email_failed',
        reason: 'delivery_handler_failed',
        eventKey,
        message: error.message,
      }))
    })
    .finally(() => {
      inFlightDeliveries.delete(eventKey)
    })
  inFlightDeliveries.set(eventKey, delivery)
  return delivery
}

async function deliverGuidanceBlockedSchedule(adminClient, schedule) {
  if (!schedule?.id || !schedule.office_id) return

  const { data: office, error: officeError } = await adminClient
    .from('offices')
    .select('name, is_active')
    .eq('id', schedule.office_id)
    .maybeSingle()
  if (officeError) throw officeError
  if (!office?.is_active) return

  const { data: students, error: studentsError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('role', 'student')
    .eq('is_active', true)
  if (studentsError) throw studentsError

  const fingerprint = createHash('sha256')
    .update(JSON.stringify([
      schedule.office_id,
      schedule.blocked_date,
      schedule.start_time,
      schedule.end_time,
      schedule.is_all_day,
      schedule.reason,
    ]))
    .digest('hex')

  const message = [
    `Date: ${schedule.blocked_date}`,
    schedule.is_all_day
      ? 'Unavailable all day'
      : `Unavailable: ${schedule.start_time || 'Start time unavailable'}–${schedule.end_time || 'End time unavailable'}`,
    schedule.reason || '',
  ].filter(Boolean).join('\n')

  for (let index = 0; index < (students || []).length; index += 10) {
    const batch = students.slice(index, index + 10)
    await Promise.all(batch.map((student) => {
      const eventKey = `general-post:guidance_blocked_schedules:${schedule.id}:${fingerprint}:${student.id}`
      return queueEmailDelivery(eventKey, () => sendStudentNotificationEmail({
        adminClient,
        recipientId: student.id,
        title: 'Temporary Office Unavailability',
        category: 'office_closure',
        message,
        eventKey,
        officeName: office.name,
        createdAt: schedule.created_at,
      }))
    }))
  }
}

export async function stopGeneralPostEmailDelivery() {
  if (!deliveryChannel) return
  const adminClient = getAdminClient()
  await adminClient.removeChannel(deliveryChannel)
  deliveryChannel = null
}
