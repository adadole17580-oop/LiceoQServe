<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import {
  buildCalendarCells,
  eventOccursOnDate,
  normalizeCalendarDate,
} from '../utils/servicesCalendar.js'
import '../assets/styles/services.css'

const router = useRouter()
const route = useRoute()
const selectedOffice = ref('')
const searchQuery = ref('')
const bookSearch = ref('')
const returnBook = ref('')
const services = ref([])
const officeSchedules = ref([])
const campusEvents = ref([])
const currentTime = ref(Date.now())
const today = new Date()
const calendarMonth = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const selectedCalendarDate = ref(localDateKey(today))
const books = ref([])
const loans = ref([])
const loading = ref(true)
const officeSchedulesLoading = ref(true)
const campusEventsLoading = ref(true)
const bookLoading = ref(false)
const loansLoading = ref(false)
const returnSubmitting = ref(false)
const errorMessage = ref('')
const scheduleError = ref('')
const eventsError = ref('')
const catalogError = ref('')
const bookError = ref('')
const loansError = ref('')
const notice = ref('')
const libraryCatalogVisible = ref(false)
let officeClockInterval = null
let servicesRealtimeChannel = null
const SUPABASE_REQUEST_TIMEOUT_MS = 15_000
let authenticatedSessionPromise = null
let bookSearchTimeout = null
let bookSearchRequestId = 0
let bookSearchController = null
let booksLoaded = false
let loansLoaded = false
const realtimeRefreshTimeouts = new Map()

const actionsByOffice = {
  registrar: ['Join Queue', 'Book Appointment', 'Submit Request'],
  cashier: ['Join Queue', 'Submit Request'],
  library: ['Book Appointment', 'Submit Request', 'Room Reservation', 'Book Borrow/Return'],
  guidance: ['Book Appointment'],
  osa: ['Book Appointment', 'Submit Request'],
}

function officeType(name) {
  const normalized = String(name || '').trim().toLowerCase()
  if (normalized.includes('registrar')) return 'registrar'
  if (normalized.includes('cashier')) return 'cashier'
  if (normalized.includes('library')) return 'library'
  if (normalized.includes('guidance')) return 'guidance'
  if (normalized.includes('student affairs') || normalized === 'osa' || normalized.includes('osa')) return 'osa'
  return ''
}

function officeCode(type) {
  return {
    registrar: 'RE',
    cashier: 'CA',
    library: 'LIB',
    guidance: 'GO',
    osa: 'OSA',
  }[type] || ''
}

function officeCardSubtitle(office) {
  const labels = {
    registrar: ['Appointments', 'Queue', 'Requests'],
    cashier: ['Payment-related Queue'],
    library: ['Appointments', 'Book Services', 'Rooms'],
    guidance: ['Appointments'],
    osa: ['Appointments', 'Requests'],
  }
  return (labels[office.type] || []).join(' · ')
}

const offices = computed(() => {
  const displayOrder = ['registrar', 'cashier', 'library', 'guidance', 'osa']
  const officeRecords = new Map(
    officeSchedules.value.map((office) => [office.id, office]),
  )
  for (const service of services.value) {
    const office = service.offices
    if (office?.id && !officeRecords.has(office.id)) {
      officeRecords.set(office.id, { ...office, office_schedules: [] })
    }
  }

  return [...officeRecords.values()]
    .map((office) => {
      const type = officeType(office.name)
      const officeServices = services.value.filter((service) => service.office_id === office.id)
      const options = officeServices
        .filter((service) => type !== 'cashier' || /tuition|payment|account|balance/i.test(service.name))
        .map((service) => service.name)
      return {
        id: office.id,
        type,
        name: office.name,
        code: officeCode(type),
        office_schedules: office.office_schedules || [],
        options: [...new Set(options)],
        actions: actionsByOffice[type] || [],
      }
    })
    .filter((office) => office.type)
    .sort((first, second) =>
      displayOrder.indexOf(first.type) - displayOrder.indexOf(second.type),
    )
})

const filteredOffices = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return offices.value
  return offices.value.filter((office) =>
    [office.name, ...office.options].some((item) => item.toLowerCase().includes(query)),
  )
})

const activeOffice = computed(() => offices.value.find(
  (office) => office.name === selectedOffice.value,
))

const calendarMonthLabel = computed(() =>
  new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
    .format(calendarMonth.value),
)

const calendarCells = computed(() => buildCalendarCells({
  year: calendarMonth.value.getFullYear(),
  month: calendarMonth.value.getMonth(),
  todayKey: localDateKey(new Date(currentTime.value)),
  selectedDateKey: selectedCalendarDate.value,
  events: campusEvents.value,
  offices: offices.value,
}))

const selectedDateEvents = computed(() =>
  campusEvents.value.filter((event) => eventOccursOnDate(event, selectedCalendarDate.value)),
)

const selectedDateSchedules = computed(() => {
  return offices.value.flatMap((office) => {
    return (office.office_schedules || [])
      .filter(
      (schedule) => schedule.effective_date && dateKey(schedule.effective_date) === selectedCalendarDate.value,
      )
      .map((schedule) => ({
      officeName: office.name,
      schedule,
      }))
  })
})

const calendarWeekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function localDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function moveCalendarMonth(amount) {
  const nextMonth = new Date(
    calendarMonth.value.getFullYear(),
    calendarMonth.value.getMonth() + amount,
    1,
  )
  calendarMonth.value = nextMonth
  selectedCalendarDate.value = localDateKey(nextMonth)
}

function selectCalendarDate(key) {
  selectedCalendarDate.value = key
}

function selectEventDate(event) {
  const key = dateKey(event.starts_at)
  if (!key) return
  selectedCalendarDate.value = key
  const [year, month] = key.split('-').map(Number)
  calendarMonth.value = new Date(year, month - 1, 1)
}

function dateKey(value) {
  return normalizeCalendarDate(value)
}

function weekdayName(dayIndex) {
  return new Intl.DateTimeFormat('en', { weekday: 'long' })
    .format(new Date(2024, 0, 7 + dayIndex))
}

function weekdayNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  if (Number.isInteger(numeric) && String(value).trim() !== '') {
    return numeric >= 1 && numeric <= 7 ? numeric : null
  }
  const normalized = String(value).trim().toLowerCase()
  for (let day = 1; day <= 7; day += 1) {
    const date = new Date(2024, 0, 7 + (day % 7))
    const names = [
      new Intl.DateTimeFormat('en', { weekday: 'long' }).format(date).toLowerCase(),
      new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date).toLowerCase(),
    ]
    if (names.includes(normalized)) return day
  }
  return null
}

function weekdayLabel(value) {
  if (value === null || value === undefined || value === '') return 'Day unavailable'
  const number = weekdayNumber(value)
  return number === null ? String(value) : weekdayName(number % 7)
}

function scheduleMatchesWeekday(schedule, date) {
  const value = schedule.day_of_week
  if (value === null || value === undefined || value === '') return false
  const numeric = Number(value)
  if (Number.isInteger(numeric) && String(value).trim() !== '') {
    return numeric === (date.getDay() || 7)
  }

  const targetNames = [
    new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date),
    new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date),
  ].map((name) => name.toLowerCase())
  return targetNames.includes(String(value).trim().toLowerCase())
}

function formatTime(value) {
  if (!value) return 'Time unavailable'
  const match = String(value).match(/(?:T)?(\d{1,2}):(\d{2})/)
  if (!match) return String(value)
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return String(value)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function formatDate(value) {
  if (!value) return 'Date unavailable'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T00:00:00`)
    : new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function officeSchedulesForToday(office) {
  const today = new Date(currentTime.value)
  const todayKey = localDateKey(today)
  const schedules = office.office_schedules || []
  const effectiveSchedules = schedules.filter((schedule) =>
    dateKey(schedule.effective_date) === todayKey,
  )
  if (effectiveSchedules.length) return effectiveSchedules
  return schedules.filter((schedule) =>
    !schedule.effective_date && scheduleMatchesWeekday(schedule, today),
  )
}

function currentOfficeStatus(office) {
  const schedules = officeSchedulesForToday(office)
  if (!schedules.length) return 'Schedule unavailable'
  if (schedules.some((schedule) => schedule.is_closed)) return 'Closed'

  const now = new Date(currentTime.value)
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const validSchedules = schedules.filter((schedule) => {
    const open = timeInMinutes(schedule.opens_at)
    const close = timeInMinutes(schedule.closes_at)
    return open !== null && close !== null
  })
  if (!validSchedules.length) return 'Schedule unavailable'

  const isOpen = validSchedules.some((schedule) => {
    const open = timeInMinutes(schedule.opens_at)
    const close = timeInMinutes(schedule.closes_at)
    return close < open
      ? currentMinutes >= open || currentMinutes < close
      : currentMinutes >= open && currentMinutes < close
  })

  return isOpen ? 'Open' : 'Closed'
}

function officeStatusClass(office) {
  const status = currentOfficeStatus(office)
  return status === 'Open' ? 'open' : status === 'Closed' ? 'closed' : 'unavailable'
}

function timeInMinutes(value) {
  const match = value && String(value).match(/(?:T)?(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

function regularSchedules(office) {
  return (office.office_schedules || [])
    .filter((schedule) => !schedule.effective_date)
    .slice()
    .sort((first, second) =>
      (weekdayNumber(first.day_of_week) ?? 8) - (weekdayNumber(second.day_of_week) ?? 8),
    )
}

function temporarySchedules(office) {
  const today = localDateKey(new Date(currentTime.value))
  return (office.office_schedules || [])
    .filter((schedule) => schedule.effective_date && dateKey(schedule.effective_date) >= today)
    .slice()
    .sort((first, second) => dateKey(first.effective_date).localeCompare(dateKey(second.effective_date)))
}

function shortTime(value) {
  const formatted = formatTime(value)
  return formatted.replace(':00 ', '').replace(' ', '')
}

function regularScheduleSummary(office) {
  const schedules = regularSchedules(office)
  if (!schedules.length) return 'Schedule unavailable'

  const groups = []
  for (const schedule of schedules) {
    const day = weekdayNumber(schedule.day_of_week)
    const hours = scheduleDescription(schedule)
    const previous = groups[groups.length - 1]
    if (day !== null && previous && previous.hours === hours && previous.endDay === day - 1) {
      previous.endDay = day
      continue
    }
    groups.push({
      startDay: day,
      endDay: day,
      label: day === null ? weekdayLabel(schedule.day_of_week) : '',
      hours,
    })
  }

  return groups.map((group) => {
    if (group.startDay === null) return `${group.label}, ${group.hours}`
    const start = new Intl.DateTimeFormat('en', { weekday: 'short' })
      .format(new Date(2024, 0, 7 + (group.startDay % 7)))
    const end = new Intl.DateTimeFormat('en', { weekday: 'short' })
      .format(new Date(2024, 0, 7 + (group.endDay % 7)))
    const days = group.startDay === group.endDay ? start : `${start}-${end}`
    return `${days}, ${group.hours}`
  }).join(' · ')
}

function scheduleOverrideSummary(office) {
  return temporarySchedules(office)
    .map((schedule) => `${formatDate(schedule.effective_date)}: ${scheduleDescription(schedule)}`)
    .join(' · ')
}

function eventDateParts(value) {
  if (!value) return { month: '—', day: '—', year: '' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { month: '—', day: '—', year: '' }
  return {
    month: new Intl.DateTimeFormat('en', { month: 'short' }).format(date).toUpperCase(),
    day: new Intl.DateTimeFormat('en', { day: '2-digit' }).format(date),
    year: new Intl.DateTimeFormat('en', { year: 'numeric' }).format(date),
  }
}

function scheduleDescription(schedule) {
  if (schedule.is_closed) return 'Closed'
  return `${shortTime(schedule.opens_at)} - ${shortTime(schedule.closes_at)}`
}

async function getAuthenticatedSession() {
  if (authenticatedSessionPromise) return authenticatedSessionPromise

  let timeoutId
  authenticatedSessionPromise = Promise.race([
    supabase.auth.getSession(),
    new Promise((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error('Timed out while checking your sign-in session.')),
        SUPABASE_REQUEST_TIMEOUT_MS,
      )
    }),
  ])
    .then(({ data: { session }, error }) => {
      if (error) throw error
      if (!session?.user) throw new Error('Your sign-in session is unavailable. Please sign in again.')
      return session
    })
    .finally(() => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      authenticatedSessionPromise = null
    })
  return authenticatedSessionPromise
}

async function runSupabaseQuery(query) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    SUPABASE_REQUEST_TIMEOUT_MS,
  )
  try {
    return await query.abortSignal(controller.signal)
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function loadErrorMessage(error, fallback) {
  const detail = error?.message || String(error || '')
  return detail ? `${fallback} ${detail}` : fallback
}

async function loadOfficeSchedules() {
  officeSchedulesLoading.value = true
  scheduleError.value = ''
  try {
    await getAuthenticatedSession()
    const { data, error } = await runSupabaseQuery(
      supabase
        .from('offices')
        .select('id, name, office_schedules(id, office_id, day_of_week, opens_at, closes_at, is_closed, effective_date, note)')
        .order('name', { ascending: true }),
    )
    if (error) throw error
    officeSchedules.value = data || []
  } catch (error) {
    console.error('Error fetching office schedules:', error)
    scheduleError.value = loadErrorMessage(error, 'Could not load office schedules.')
  } finally {
    officeSchedulesLoading.value = false
  }
}

async function loadCampusEvents() {
  campusEventsLoading.value = true
  eventsError.value = ''
  try {
    await getAuthenticatedSession()
    const { data, error } = await runSupabaseQuery(
      supabase
        .from('school_events')
        .select('id, title, description, starts_at, ends_at, location, event_type, office_id, offices(id, name)')
        .eq('is_published', true)
        .order('starts_at', { ascending: true, nullsFirst: false }),
    )
    if (error) throw error
    campusEvents.value = data || []
  } catch (error) {
    console.error('Error fetching published campus events:', error)
    eventsError.value = loadErrorMessage(error, 'Could not load campus calendar updates.')
  } finally {
    campusEventsLoading.value = false
  }
}

async function loadOfficeUpdates() {
  await Promise.all([loadOfficeSchedules(), loadCampusEvents()])
}

async function loadServices() {
  loading.value = true
  errorMessage.value = ''
  try {
    await getAuthenticatedSession()
    const { data, error } = await runSupabaseQuery(
      supabase
        .from('office_services')
        .select('id, name, office_id, offices!inner(id, name, is_active)')
        .eq('is_active', true)
        .eq('offices.is_active', true)
        .order('name', { ascending: true }),
    )
    if (error) throw error
    services.value = data || []
  } catch (error) {
    console.error('Error fetching campus services:', error)
    errorMessage.value = loadErrorMessage(error, 'Could not load campus services.')
  } finally {
    loading.value = false
  }
}

async function loadBooks() {
  if (bookSearchTimeout !== null) {
    window.clearTimeout(bookSearchTimeout)
    bookSearchTimeout = null
  }
  if (bookSearchController) bookSearchController.abort()
  const requestId = ++bookSearchRequestId
  bookLoading.value = true
  catalogError.value = ''
  const controller = new AbortController()
  bookSearchController = controller
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    SUPABASE_REQUEST_TIMEOUT_MS,
  )
  try {
    const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/library/books?query=${encodeURIComponent(bookSearch.value)}`
    const response = await fetch(url, { signal: controller.signal })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'Could not search the Library catalog.')
    if (requestId === bookSearchRequestId) {
      books.value = payload.books || []
      booksLoaded = true
    }
  } catch (error) {
    console.error('Error searching the Library catalog:', error)
    if (requestId === bookSearchRequestId) {
      catalogError.value = error.name === 'AbortError'
        ? 'The Library catalog request timed out. Please try again.'
        : error.message || 'Could not search the Library catalog.'
    }
  } finally {
    window.clearTimeout(timeoutId)
    if (requestId === bookSearchRequestId) {
      bookLoading.value = false
      bookSearchController = null
    }
  }
}

function scheduleBookSearch() {
  if (bookSearchTimeout !== null) window.clearTimeout(bookSearchTimeout)
  bookSearchTimeout = window.setTimeout(() => {
    bookSearchTimeout = null
    void loadBooks()
  }, 250)
}

async function loadMyLoans() {
  loansLoading.value = true
  loansError.value = ''
  try {
    const session = await getAuthenticatedSession()

    const response = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/library/my-loans`,
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    )
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'Could not load your Library loans.')
    loans.value = payload.loans || []
    loansLoaded = true
  } catch (error) {
    console.error('Error loading student Library loans:', error)
    loansError.value = error.message || 'Could not load your Library loans.'
  } finally {
    loansLoading.value = false
  }
}

function selectOffice(name) {
  selectedOffice.value = name
  notice.value = ''
  libraryCatalogVisible.value = officeType(name) === 'library'
  if (libraryCatalogVisible.value) openLibraryCatalog()
}

function openLibraryCatalog() {
  libraryCatalogVisible.value = true
  if (!booksLoaded) void loadBooks()
  if (!loansLoaded) void loadMyLoans()
}

function navigate(path, office) {
  if (office) sessionStorage.setItem('appointmentOffice', office)
  router.push(path)
}

function chooseAction(action) {
  if (action === 'Join Queue') return navigate('/student/queue')
  if (action === 'Book Appointment') return navigate('/student/appointments', selectedOffice.value)
  if (action === 'Submit Request') return navigate('/student/requests')
  if (action === 'Room Reservation') {
    sessionStorage.setItem('libraryTab', 'Rooms')
    return navigate('/student/appointments', 'Library')
  }
  if (action === 'Book Borrow/Return') {
    openLibraryCatalog()
  }
}

async function requestBook(book) {
  bookError.value = ''
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw error
    if (!session?.access_token) {
      throw new Error('Your session has expired. Please sign in again.')
    }
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/library/borrow-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ bookId: book.id }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'Could not submit the borrowing request.')
    notice.value = payload.message || `Your request to borrow "${book.title}" was submitted.`
  } catch (error) {
    console.error('Error submitting book borrowing request:', error)
    bookError.value = error?.message || 'Could not submit the borrowing request.'
  }
}

async function requestBookReturn() {
  const book = returnBook.value.trim()
  if (!book || returnSubmitting.value) return

  returnSubmitting.value = true
  bookError.value = ''
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw error
    if (!session?.access_token) {
      throw new Error('Your session has expired. Please sign in again.')
    }
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/library/return-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ book }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'Could not submit the return request.')
    notice.value = payload.message
    returnBook.value = ''
  } catch (error) {
    console.error('Error submitting book return request:', error)
    bookError.value = error?.message || 'Could not submit the return request.'
  } finally {
    returnSubmitting.value = false
  }
}

watch([offices, () => route.query.office], ([officeList, requestedType]) => {
  if (selectedOffice.value || !requestedType) return
  const requestedOffice = officeList.find(
    (office) => office.type === officeType(requestedType),
  )
  if (requestedOffice) selectedOffice.value = requestedOffice.name
}, { immediate: true })

watch(
  [campusEvents, officeSchedules, services, () => route.query],
  ([events, scheduledOffices, serviceRecords, query]) => {
    if (query.event) {
      const event = events.find((item) => String(item.id) === String(query.event))
      if (event) selectEventDate(event)
      return
    }

    if (query.schedule) {
      const schedule = scheduledOffices
        .flatMap((office) => office.office_schedules || [])
        .find((item) => String(item.id) === String(query.schedule))
      if (schedule) {
        const date = schedule.effective_date
          ? new Date(`${dateKey(schedule.effective_date)}T00:00:00`)
          : new Date(currentTime.value)
        if (!schedule.effective_date) {
          const targetDay = weekdayNumber(schedule.day_of_week)
          if (targetDay !== null) {
            const todayDay = date.getDay() || 7
            date.setDate(date.getDate() + ((targetDay - todayDay + 7) % 7))
          }
        }
        if (!Number.isNaN(date.getTime())) {
          selectedCalendarDate.value = localDateKey(date)
          calendarMonth.value = new Date(date.getFullYear(), date.getMonth(), 1)
        }
      }
      return
    }

    if (query.service) {
      const service = serviceRecords.find((item) => String(item.id) === String(query.service))
      const office = offices.value.find((item) => item.id === service?.office_id)
      if (office) {
        selectedOffice.value = office.name
        if (office.type === 'library') openLibraryCatalog()
      }
    }
  },
  { immediate: true },
)

async function startServicesRealtime() {
  try {
    const session = await getAuthenticatedSession()
    if (!session?.user || !servicesPageMounted) return

    const userId = session.user.id
    const channel = supabase.channel(`student-services-${userId}`)
    const subscribeTo = (table, onChange) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        onChange,
      )
    }

    subscribeTo('office_services', () => scheduleRealtimeRefresh('services', loadServices))
    subscribeTo('offices', () => {
      scheduleRealtimeRefresh('services', loadServices)
      scheduleRealtimeRefresh('schedules', loadOfficeSchedules)
    })
    subscribeTo('office_schedules', () => scheduleRealtimeRefresh('schedules', loadOfficeSchedules))
    subscribeTo('school_events', () => scheduleRealtimeRefresh('events', loadCampusEvents))
    subscribeTo('library_books', () => {
      if (libraryCatalogVisible.value) scheduleRealtimeRefresh('books', loadBooks)
    })
    subscribeTo('book_loans', () => {
      if (libraryCatalogVisible.value) scheduleRealtimeRefresh('loans', loadMyLoans)
    })

    servicesRealtimeChannel = channel
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Services Realtime updates are unavailable.')
      }
    })
  } catch (error) {
    if (servicesPageMounted) {
      console.error('Could not start Services Realtime updates:', error)
    }
  }
}

function scheduleRealtimeRefresh(resource, refresh) {
  const previousTimeout = realtimeRefreshTimeouts.get(resource)
  if (previousTimeout !== undefined) window.clearTimeout(previousTimeout)
  const timeout = window.setTimeout(() => {
    realtimeRefreshTimeouts.delete(resource)
    if (servicesPageMounted) void refresh()
  }, 100)
  realtimeRefreshTimeouts.set(resource, timeout)
}

let servicesPageMounted = false

onMounted(() => {
  servicesPageMounted = true
  void loadServices()
  void loadOfficeUpdates()
  void startServicesRealtime()
  officeClockInterval = window.setInterval(() => {
    currentTime.value = Date.now()
  }, 60_000)
})

onUnmounted(() => {
  servicesPageMounted = false
  if (officeClockInterval !== null) window.clearInterval(officeClockInterval)
  if (bookSearchTimeout !== null) window.clearTimeout(bookSearchTimeout)
  if (bookSearchController) bookSearchController.abort()
  for (const timeout of realtimeRefreshTimeouts.values()) window.clearTimeout(timeout)
  realtimeRefreshTimeouts.clear()
  if (servicesRealtimeChannel) {
    void supabase.removeChannel(servicesRealtimeChannel)
    servicesRealtimeChannel = null
  }
})
</script>

<template>
  <div class="services-page">
    <div class="services-heading">
      <h2>Campus Services</h2>
      <p>Find a service and check office availability before booking, or visiting campus.</p>
    </div>

    <div class="service-search">
      <span class="search-symbol" aria-hidden="true">⌕</span>
      <input
        v-model="searchQuery"
        type="search"
        placeholder='Try "Form 137", "Tuition", "Counseling", or an office name'
        aria-label="Search campus services"
      />
      <button v-if="searchQuery" type="button" aria-label="Clear search" @click="searchQuery = ''">×</button>
    </div>

    <section class="office-updates" aria-labelledby="office-updates-title">
      <div class="updates-title">
        <h3 id="office-updates-title">Office Schedule &amp; Campus Updates</h3>
        <p>Check office hours and important campus events.</p>
      </div>

      <div class="updates-layout">
        <section aria-labelledby="office-schedule-title">
          <h4 id="office-schedule-title" class="visually-hidden">Office Schedule</h4>
          <div v-if="scheduleError" class="services-error" role="alert">
            {{ scheduleError }}
            <button type="button" @click="loadOfficeSchedules">Try Again</button>
          </div>
          <p v-else-if="officeSchedulesLoading" class="no-results" role="status">Loading office schedules…</p>
          <p v-else-if="!offices.length" class="no-results">
            No office schedule records are available.
          </p>
          <div v-else class="schedule-table-wrap">
            <table class="schedule-table">
              <thead>
                <tr><th>Office</th><th>Regular Schedule</th><th>Status</th></tr>
              </thead>
              <tbody>
                <tr v-for="office in offices" :key="office.id">
                  <td>{{ office.name }}</td>
                  <td>
                    <span>{{ regularScheduleSummary(office) }}</span>
                    <small v-if="scheduleOverrideSummary(office)" class="schedule-override">
                      Date-specific: {{ scheduleOverrideSummary(office) }}
                    </small>
                  </td>
                  <td>
                    <span class="office-status" :class="officeStatusClass(office)">
                      {{ currentOfficeStatus(office) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="campus-events-column" aria-labelledby="campus-calendar-title">
          <h4 id="campus-calendar-title" class="visually-hidden">Campus Calendar</h4>
          <div class="campus-calendar" aria-label="Campus calendar">
            <div class="campus-calendar-header">
              <button
                type="button"
                aria-label="Previous month"
                @click="moveCalendarMonth(-1)"
              >
                ‹
              </button>
              <h5>{{ calendarMonthLabel }}</h5>
              <button
                type="button"
                aria-label="Next month"
                @click="moveCalendarMonth(1)"
              >
                ›
              </button>
            </div>
            <div class="calendar-grid calendar-weekdays" aria-hidden="true">
              <span v-for="weekday in calendarWeekdays" :key="weekday">{{ weekday }}</span>
            </div>
            <div class="calendar-grid calendar-dates">
              <template
                v-for="(cell, index) in calendarCells"
                :key="cell ? cell.key : `empty-${index}`"
              >
                <span v-if="!cell" class="calendar-empty"></span>
                <button
                  v-else
                  type="button"
                  class="calendar-date"
                  :class="{
                    'calendar-date-today': cell.isToday,
                    'calendar-date-selected': cell.isSelected,
                    'calendar-date-has-event': cell.hasEvents,
                    'calendar-date-has-schedule': cell.hasScheduleChange,
                  }"
                  :aria-label="formatDate(cell.key)"
                  :aria-pressed="cell.isSelected"
                  @click="selectCalendarDate(cell.key)"
                >
                  <span>{{ cell.day }}</span>
                  <span class="calendar-indicators" aria-hidden="true">
                    <i v-if="cell.hasEvents" class="calendar-event-indicator"></i>
                    <i v-if="cell.hasScheduleChange" class="calendar-schedule-indicator"></i>
                  </span>
                </button>
              </template>
            </div>
            <div class="calendar-legend">
              <span><i class="calendar-event-indicator"></i> Campus event</span>
              <span><i class="calendar-schedule-indicator"></i> Schedule change</span>
            </div>
          </div>

          <section class="calendar-day-details" aria-live="polite">
            <h5>{{ formatDate(selectedCalendarDate) }}</h5>
            <p
              v-if="officeSchedulesLoading || campusEventsLoading"
              class="calendar-empty-state"
              role="status"
            >
              Loading this date’s schedule changes and events…
            </p>
            <template v-else>
              <div v-if="selectedDateSchedules.length" class="calendar-detail-group">
                <h6>Schedule changes</h6>
                <p v-for="item in selectedDateSchedules" :key="`${item.officeName}-${item.schedule.day_of_week}`">
                  <strong>{{ item.officeName }}:</strong> {{ scheduleDescription(item.schedule) }}
                  <span v-if="item.schedule.note"> · {{ item.schedule.note }}</span>
                </p>
              </div>
              <div v-if="selectedDateEvents.length" class="calendar-detail-group">
                <h6>Campus events</h6>
                <article v-for="event in selectedDateEvents" :key="event.id">
                  <strong>{{ event.title }}</strong>
                  <span>{{ event.event_type }} · {{ event.location || 'Campus-wide' }}</span>
                  <small>{{ event.description || 'No description provided.' }}</small>
                </article>
              </div>
              <p
                v-if="!selectedDateSchedules.length && !selectedDateEvents.length"
                class="calendar-empty-state"
              >
                No schedule changes or campus events for this date.
              </p>
            </template>
          </section>

          <div v-if="eventsError" class="services-error" role="alert">
            {{ eventsError }}
            <button type="button" @click="loadCampusEvents">Try Again</button>
          </div>
          <p v-else-if="campusEventsLoading" class="no-results" role="status">Loading campus calendar…</p>
          <p v-else-if="!campusEvents.length" class="no-results">
            No published campus events are available.
          </p>
          <div v-else class="campus-events">
            <article v-for="event in campusEvents" :key="event.id" class="event-card">
              <div class="event-date" aria-label="Event date">
                <strong>{{ eventDateParts(event.starts_at).month }}</strong>
                <b>{{ eventDateParts(event.starts_at).day }}</b>
                <small>{{ eventDateParts(event.starts_at).year }}</small>
              </div>
              <div class="event-info">
                <h4>{{ event.title }}</h4>
                <p>{{ event.event_type }}<span v-if="event.ends_at && dateKey(event.ends_at) !== dateKey(event.starts_at)"> · Until {{ formatDate(event.ends_at) }}</span></p>
                <small>{{ event.description || 'No description provided.' }}</small>
                <small v-if="event.location">{{ event.location }}</small>
                <small class="event-office">
                  {{ event.office_id ? (event.offices?.name || 'Office information unavailable') : 'Campus-wide' }}
                </small>
              </div>
              <span class="event-calendar" aria-hidden="true"></span>
            </article>
          </div>
        </section>
      </div>
    </section>

    <p v-if="notice" class="services-notice" role="status">
      {{ notice }}
      <button type="button" aria-label="Dismiss notice" @click="notice = ''">×</button>
    </p>
    <div v-if="errorMessage" class="services-error" role="alert">
      {{ errorMessage }}
      <button type="button" @click="loadServices">Try Again</button>
    </div>
    <p v-if="loading && !offices.length" class="no-results" role="status">Loading active campus services…</p>

    <section class="office-cards" aria-label="Campus offices">
      <button
        v-for="office in filteredOffices"
        :key="office.id"
        type="button"
        class="office-card"
        :class="{ 'office-card-selected': selectedOffice === office.name }"
        @click="selectOffice(office.name)"
      >
        <span class="office-code">{{ office.code }}</span>
        <span class="office-card-text">
          <strong>{{ office.name }}</strong>
          <small>{{ officeCardSubtitle(office) }}</small>
        </span>
      </button>
      <p v-if="!loading && !errorMessage && !filteredOffices.length" class="no-results">
        {{ offices.length ? 'No offices or services match your search.' : 'No office records are available.' }}
      </p>
    </section>

    <section v-if="activeOffice" class="office-detail">
      <div class="detail-topline">
        <span>AVAILABLE THROUGH</span>
        <button type="button" class="detail-close" @click="selectedOffice = ''">Close</button>
      </div>
      <h3>{{ activeOffice.name }}</h3>
      <p v-if="!activeOffice.options.length" class="no-results">
        No active service categories are available.
      </p>
      <div class="service-options">
        <span v-for="option in activeOffice.options" :key="option" class="service-chip">{{ option }}</span>
      </div>
      <div v-if="activeOffice.actions.length" class="office-actions">
        <button
          v-for="action in activeOffice.actions"
          :key="action"
          type="button"
          :class="{ 'primary-action': action !== 'Submit Request' }"
          @click="chooseAction(action)"
        >
          {{ action }}
        </button>
      </div>

      <div v-if="activeOffice.type === 'library' && libraryCatalogVisible" class="library-catalog">
        <h4>Search Library Catalog</h4>
        <label for="book-search">Search by title, author, or ISBN</label>
        <input
          id="book-search"
          v-model="bookSearch"
          type="search"
          placeholder="Search Library catalog…"
            @input="scheduleBookSearch"
        />
        <p v-if="catalogError" class="services-error" role="alert">
          {{ catalogError }}
          <button type="button" @click="loadBooks">Try Again</button>
        </p>
        <p v-else-if="bookLoading" class="no-results" role="status">Searching the catalog…</p>
        <p v-else-if="!books.length" class="no-results">No books match your search.</p>
        <div v-else class="library-table-wrap">
          <table class="library-book-table">
            <thead>
              <tr><th>Book</th><th>Availability</th><th>Action</th></tr>
            </thead>
            <tbody>
              <tr v-for="book in books" :key="book.id">
                <td>
                  <strong>{{ book.title }}</strong>
                  <small>{{ book.author || 'Author not listed' }} · {{ book.isbn || book.id }}</small>
                </td>
                <td>
                  <span class="book-status" :class="book.available_copies > 0 ? 'available' : 'unavailable'">
                    {{ book.available_copies }} available
                  </span>
                </td>
                <td>
                  <button type="button" :disabled="book.available_copies <= 0" @click="requestBook(book)">
                    Request to Borrow
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="bookError" class="services-error" role="alert">{{ bookError }}</p>
        <form class="library-return-form" @submit.prevent="requestBookReturn">
          <h4>Request a Book Return</h4>
          <label for="return-book">Borrowed book title or ISBN</label>
          <input
            id="return-book"
            v-model="returnBook"
            type="text"
            placeholder="Enter the exact title or ISBN of your borrowed book"
            required
          />
          <button type="submit" :disabled="returnSubmitting">
            {{ returnSubmitting ? 'Submitting…' : 'Submit Return Request' }}
          </button>
        </form>
        <p class="library-note">Borrowing and return requests are tracked through My Requests and require Library staff confirmation.</p>

        <section class="library-my-loans" aria-labelledby="my-library-loans-title">
          <h4 id="my-library-loans-title">My Library Loans</h4>
          <p v-if="loansError" class="services-error" role="alert">
            {{ loansError }}
            <button type="button" @click="loadMyLoans">Try Again</button>
          </p>
          <p v-else-if="loansLoading" class="no-results" role="status">Loading your loans…</p>
          <p v-else-if="!loans.length" class="no-results">You have no Library loans.</p>
          <div v-else class="library-table-wrap">
            <table class="library-book-table">
              <thead>
                <tr><th>Book</th><th>Status</th><th>Due Date</th><th>Returned</th></tr>
              </thead>
              <tbody>
                <tr
                  v-for="loan in loans"
                  :key="loan.id"
                  :style="{ outline: loan.id === route.query.record ? '2px solid #59080d' : undefined }"
                >
                  <td>
                    <strong>{{ loan.library_books?.title || 'Library Book' }}</strong>
                    <small>{{ loan.library_books?.isbn || loan.id }}</small>
                  </td>
                  <td>{{ loan.status }}</td>
                  <td>{{ loan.due_at ? new Date(loan.due_at).toLocaleDateString() : '—' }}</td>
                  <td>{{ loan.returned_at ? new Date(loan.returned_at).toLocaleDateString() : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>
