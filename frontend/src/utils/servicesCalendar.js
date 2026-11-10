export function normalizeCalendarDate(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function eventOccursOnDate(event, key) {
  const start = normalizeCalendarDate(event.starts_at)
  const end = normalizeCalendarDate(event.ends_at) || start
  return Boolean(start && key >= start && key <= end)
}

export function buildCalendarCells({
  year,
  month,
  todayKey,
  selectedDateKey,
  events = [],
  offices = [],
}) {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const dayCount = new Date(year, month + 1, 0).getDate()
  const cellCount = Math.ceil((firstWeekday + dayCount) / 7) * 7

  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - firstWeekday + 1
    if (day < 1 || day > dayCount) return null

    const date = new Date(year, month, day)
    const key = normalizeCalendarDate(date)
    return {
      day,
      key,
      isToday: key === todayKey,
      isSelected: key === selectedDateKey,
      hasEvents: events.some((event) => eventOccursOnDate(event, key)),
      hasScheduleChange: offices.some((office) =>
        (office.office_schedules || []).some(
          (schedule) => schedule.effective_date && normalizeCalendarDate(schedule.effective_date) === key,
        ),
      ),
    }
  })
}
