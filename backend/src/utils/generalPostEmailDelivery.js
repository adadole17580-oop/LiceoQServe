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

export async function stopGeneralPostEmailDelivery() {
  if (!deliveryChannel) return
  const adminClient = getAdminClient()
  await adminClient.removeChannel(deliveryChannel)
  deliveryChannel = null
}
