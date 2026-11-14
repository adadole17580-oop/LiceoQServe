const eligibleCategoriesBySource = new Map([
  ['school_events', new Set(['campus_announcement', 'campus_event', 'office_event'])],
  ['office_schedules', new Set(['office_schedule', 'office_closure'])],
  ['guidance_blocked_schedules', new Set(['office_schedule', 'office_closure'])],
  ['blocked_schedules', new Set(['office_schedule', 'office_closure'])],
])

export function isGeneralPostNotification(notification) {
  const eventKey = notification?.event_key
  if (typeof eventKey !== 'string') return false

  const match = eventKey.match(/^general-post:([^:]+):/)
  if (!match) return false

  return eligibleCategoriesBySource.get(match[1])?.has(notification.category) || false
}
