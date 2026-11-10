import { createStudentNotificationEmail } from './studentNotificationEmailTemplate.js'
import { isGeneralPostNotification } from './generalPostEmailEligibility.js'

const emailApiUrl = 'https://api.resend.com/emails'
const emailRetryDelays = [0, 1000, 3000]

function formatSenderIdentity(from) {
  const address = from.match(/<[^<>]+>/)?.[0] || `<${from.trim()}>`
  return `LiceoQServe Notifications ${address}`
}

async function sendEmailWithRetry({ apiKey, from, to, subject, text, html, eventKey }) {
  for (let attempt = 0; attempt < emailRetryDelays.length; attempt += 1) {
    if (emailRetryDelays[attempt]) {
      await new Promise((resolve) => setTimeout(resolve, emailRetryDelays[attempt]))
    }

    try {
      const response = await fetch(emailApiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': eventKey,
        },
        body: JSON.stringify({
          from: formatSenderIdentity(from),
          to: [to],
          subject,
          text,
          html,
        }),
      })
      const providerResponse = await response.json().catch(() => ({}))
      if (response.ok && typeof providerResponse.id === 'string' && providerResponse.id) {
        return { accepted: true, providerMessageId: providerResponse.id }
      }

      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt === emailRetryDelays.length - 1) {
        return {
          accepted: false,
          reason: response.ok ? 'provider_acceptance_missing' : 'provider_rejected',
          status: response.status,
          retryable,
        }
      }
    } catch (error) {
      if (attempt === emailRetryDelays.length - 1) {
        return {
          accepted: false,
          reason: 'provider_request_failed',
          message: error.message,
          retryable: true,
        }
      }
    }
  }

  return { accepted: false, reason: 'provider_request_failed', retryable: true }
}

export async function createStudentNotification({
  adminClient,
  recipientId,
  title,
  category,
  message,
  relatedId,
  eventKey,
  officeName,
  transaction,
}) {
  const { data: notification, error } = await adminClient
    .from('notifications')
    .insert({
      recipient_id: recipientId,
      title,
      category,
      message,
      related_id: relatedId,
      event_key: eventKey,
      is_read: false,
    })
    .select('id')
    .maybeSingle()

  let savedNotification = notification
  let created = Boolean(notification)

  if (error?.code === '23505') {
    const { data: existingNotification, error: lookupError } = await adminClient
      .from('notifications')
      .select('id')
      .eq('event_key', eventKey)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (existingNotification) {
      savedNotification = existingNotification
      created = false
    } else {
      throw error
    }
  } else if (error) {
    throw error
  }

  if (!savedNotification) {
    throw new Error('The student notification was not saved.')
  }

  if (isGeneralPostNotification({ category, event_key: eventKey })) {
    await sendStudentNotificationEmail({
      adminClient,
      recipientId,
      title,
      category,
      message,
      eventKey,
      officeName,
      transaction,
    })
  }

  return { notification: savedNotification, created }
}

export async function sendStudentNotificationEmail({
  adminClient,
  recipientId,
  title,
  category,
  message,
  eventKey,
  officeName,
  transaction,
  createdAt,
}) {
  if (!isGeneralPostNotification({ category, event_key: eventKey })) {
    return false
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    console.warn(JSON.stringify({
      event: 'student_notification_email_skipped',
      reason: 'email_provider_not_configured',
      eventKey,
    }))
    return false
  }

  let profile
  try {
    const { data, error } = await adminClient
      .from('profiles')
      .select('university_email, full_name')
      .eq('id', recipientId)
      .maybeSingle()
    if (error) throw error
    profile = data
  } catch (error) {
    console.error(JSON.stringify({
      event: 'student_notification_email_failed',
      reason: 'recipient_lookup_failed',
      eventKey,
      recipientId,
      message: error.message,
    }))
    return false
  }

  if (!profile?.university_email) {
    console.warn(JSON.stringify({
      event: 'student_notification_email_skipped',
      reason: 'registered_email_missing',
      eventKey,
      recipientId,
    }))
    return false
  }

  const email = createStudentNotificationEmail({
    studentName: profile.full_name,
    title,
    category,
    message,
    officeName,
    createdAt,
  })
  const result = await sendEmailWithRetry({
    apiKey,
    from,
    to: profile.university_email,
    subject: `LiceoQServe: ${title}`,
    ...email,
    eventKey,
  })

  if (result.accepted) {
    console.info(JSON.stringify({
      event: 'student_notification_email_accepted',
      eventKey,
      providerMessageId: result.providerMessageId,
    }))
    return true
  }

  console.error(JSON.stringify({
    event: 'student_notification_email_failed',
    reason: result.reason,
    ...(result.status ? { status: result.status } : {}),
    eventKey,
    recipientId,
    ...(result.message ? { message: result.message } : {}),
    retryable: result.retryable,
  }))
  return false
}

export async function sendTestStudentNotificationEmail({ recipientEmail, eventKey }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    return { accepted: false, reason: 'email_provider_not_configured' }
  }

  const title = 'LiceoQServe test email'
  const email = createStudentNotificationEmail({
    studentName: 'LiceoQServe student',
    title,
    category: 'Test',
    message: 'This is a sample email to verify the LiceoQServe notification email template.',
    officeName: 'LiceoQServe',
  })
  const result = await sendEmailWithRetry({
    apiKey,
    from,
    to: recipientEmail,
    subject: `LiceoQServe: ${title}`,
    ...email,
    eventKey,
  })

  if (result.accepted) {
    console.info(JSON.stringify({
      event: 'student_notification_test_email_accepted',
      providerMessageId: result.providerMessageId,
    }))
    return { accepted: true }
  }

  console.error(JSON.stringify({
    event: 'student_notification_test_email_failed',
    reason: result.reason,
    ...(result.status ? { status: result.status } : {}),
    retryable: result.retryable,
    ...(result.message ? { message: result.message } : {}),
  }))
  return { accepted: false, reason: result.reason }
}
