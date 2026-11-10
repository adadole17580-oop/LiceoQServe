const defaultFrontendUrl = 'http://localhost:5173'

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  })
}

function getStudentPortalUrl() {
  const configuredUrl = process.env.FRONTEND_URL || defaultFrontendUrl
  let frontendUrl
  try {
    frontendUrl = new URL(configuredUrl)
  } catch {
    frontendUrl = new URL(defaultFrontendUrl)
  }
  if (!['http:', 'https:'].includes(frontendUrl.protocol)) frontendUrl = new URL(defaultFrontendUrl)
  return new URL('/student/home', frontendUrl).toString()
}

export function createStudentNotificationEmail({
  studentName,
  title,
  category,
  message,
  officeName,
  createdAt,
}) {
  const greetingName = String(studentName || '').trim() || 'Student'
  const safeTitle = String(title || 'You have a new notification')
  const safeCategory = String(category || 'Notification').replaceAll('_', ' ')
  const safeMessage = String(message || '')
  const date = formatDate(createdAt)
  const portalUrl = getStudentPortalUrl()

  const text = [
    `Hello ${greetingName},`,
    '',
    safeTitle,
    officeName ? `Office: ${officeName}` : '',
    `Type: ${safeCategory}`,
    date ? `Date: ${date}` : '',
    '',
    safeMessage,
    '',
    `Open LiceoQServe: ${portalUrl}`,
    '',
    'This is an automated notification. Please do not reply to this email.',
  ].filter(Boolean).join('\n')

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(safeTitle)}</title>
  </head>
  <body style="margin:0;padding:32px 16px;background:#f8e9eb;color:#351719;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;">
      <div style="padding:20px 24px;background:#59080d;border-radius:12px 12px 0 0;color:#fff;">
        <div style="font-size:20px;font-weight:700;letter-spacing:.2px;">LiceoQServe</div>
        <div style="margin-top:5px;font-size:13px;color:#f5dfe1;">Notifications</div>
      </div>
      <main style="padding:30px 28px;background:#fff;border-radius:0 0 12px 12px;box-shadow:0 8px 24px rgba(89,8,13,.08);">
        <p style="margin:0 0 20px;font-size:16px;">Hello ${escapeHtml(greetingName)},</p>
        <h1 style="margin:0 0 18px;color:#59080d;font-size:23px;line-height:1.35;">${escapeHtml(safeTitle)}</h1>
        <div style="margin-bottom:20px;padding:16px;background:#fff7f8;border-left:4px solid #59080d;border-radius:4px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(safeMessage)}</div>
        <div style="margin-bottom:24px;color:#68484a;font-size:13px;line-height:1.7;">
          ${officeName ? `<div><strong>Office:</strong> ${escapeHtml(officeName)}</div>` : ''}
          <div><strong>Type:</strong> ${escapeHtml(safeCategory)}</div>
          ${date ? `<div><strong>Date:</strong> ${escapeHtml(date)}</div>` : ''}
        </div>
        <a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 20px;background:#59080d;border-radius:6px;color:#fff;text-decoration:none;font-weight:700;">Open LiceoQServe</a>
        <p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #f0dfe1;color:#80696a;font-size:12px;line-height:1.5;">
          This is an automated notification. Please do not reply to this email.
        </p>
      </main>
      <p style="margin:16px 0 0;text-align:center;color:#967f80;font-size:11px;">LiceoQServe · Student Services</p>
    </div>
  </body>
</html>`

  return { html, text }
}
