<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import '../assets/styles/appointments.css'

const route = useRoute()
const activeTab = ref('All')
const showForm = ref(false)
const showConfirm = ref(false)
const notice = ref('')
const loading = ref(true)
const loadError = ref('')
const submitting = ref(false)
const appointments = ref([])
const reservations = ref([])
const rooms = ref([])
const books = ref([])
const services = ref([])
const libraryTab = ref('Consultation / Assistance')
const editingAppointment = ref(null)
const selectedBooking = ref(null)
const selectedBook = ref('')
const bookSearch = ref('')
const booksLoading = ref(false)
const booksError = ref('')

const form = ref({
  office: '',
  serviceId: '',
  date: '',
  time: '',
  purpose: '',
})

const roomForm = ref({
  type: '',
  roomId: '',
  date: '',
  startTime: '',
  endTime: '',
  purpose: '',
})

const filters = ['All', 'Upcoming', 'Pending', 'Completed', 'Cancelled']
const allowedOffices = computed(() => [...new Set(
  services.value
    .map((service) => service.offices?.name)
    .filter((name) => name && name !== 'Cashier'),
)])
const availableServices = computed(() => services.value.filter(
  (service) => {
    if (service.offices?.name !== form.value.office) return false
    if (form.value.office !== 'Library' || libraryTab.value !== 'Consultation / Assistance') return true
    return !/\b(room|discussion|viewing|reservation|borrow|borrowing|return|book)\b/i.test(service.name)
  },
))
const availableRooms = computed(() => rooms.value.filter((room) => {
  const type = `${room.room_type || ''} ${room.name || ''}`.toLowerCase()
  if (roomForm.value.type.toLowerCase().includes('view')) return type.includes('view')
  if (roomForm.value.type.toLowerCase().includes('discussion')) return type.includes('discussion')
  return true
}))
const selectedService = computed(() => availableServices.value.find(
  (service) => service.id === form.value.serviceId,
))
const libraryRoomServices = computed(() => services.value.filter((service) => (
  service.offices?.name === 'Library' &&
  /discussion|viewing|room reservation/i.test(service.name)
)))
const reservationService = computed(() => libraryRoomServices.value.find(
  (service) => service.name === roomForm.value.type,
))
const filteredBooks = computed(() => {
  const query = bookSearch.value.trim().toLowerCase()
  if (!query) return books.value
  return books.value.filter((book) => (
    `${book.title} ${book.author || ''} ${book.isbn || ''} ${book.id}`.toLowerCase().includes(query)
  ))
})
const bookingRecords = computed(() => [
  ...appointments.value.map((item) => ({ ...item, recordType: 'appointment', reference: item.id })),
  ...reservations.value.map((item) => ({
    ...item,
    recordType: 'reservation',
    office: 'Library',
    reference: item.id,
  })),
].sort((first, second) => new Date(second.scheduled_at || second.start_at) - new Date(first.scheduled_at || first.start_at)))
const filteredBookings = computed(() => bookingRecords.value.filter((item) => (
  activeTab.value === 'All' ||
  (item.recordType === 'appointment'
    ? (
      (activeTab.value === 'Upcoming' && item.status === 'confirmed') ||
      (activeTab.value === 'Pending' && ['pending', 'reschedule_requested'].includes(item.status)) ||
      item.status === activeTab.value.toLowerCase()
    )
    : (
      (activeTab.value === 'Upcoming' && item.status === 'Confirmed') ||
      item.status === activeTab.value
    ))
)))

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000'

async function apiRequest(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.')

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The request could not be completed.')
  return payload
}

function localDateTimeParts(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { date: '', time: '' }
  const pad = (number) => String(number).padStart(2, '0')
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  }
}

const today = computed(() => localDateTimeParts(new Date()).date)

function formatDate(value) {
  if (!value) return 'Date not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date not set'
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatTime(value) {
  if (!value) return 'Time not set'
  const date = new Date(`2000-01-01T${value}`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function mapAppointment(item) {
  const parts = localDateTimeParts(item.scheduled_at)
  const status = String(item.status || '').toLowerCase().replace(/[\s-]+/g, '_')
  return {
    ...item,
    status,
    date: parts.date,
    time: parts.time,
    office: item.office_services?.offices?.name || 'Campus Office',
    service: item.office_services?.name || item.purpose || 'Appointment',
  }
}

function mapReservation(item) {
  const room = item.rooms || {}
  return {
    ...item,
    roomName: room.name || 'Library room',
    service: item.office_services?.name || `${room.room_type || 'Library Room'} Reservation`,
  }
}

async function fetchServices() {
  const { data, error } = await supabase
    .from('office_services')
    .select('id, name, office_id, offices!inner(name, is_active)')
    .eq('is_active', true)
    .eq('offices.is_active', true)
    .order('name', { ascending: true })
  if (error) throw error
  services.value = data || []
}

async function loadData() {
  loading.value = true
  loadError.value = ''
  try {
    const [appointmentData, reservationData, roomData] = await Promise.all([
      apiRequest('/api/appointments/my'),
      apiRequest('/api/reservations/my'),
      apiRequest('/api/reservations/rooms'),
    ])
    appointments.value = (appointmentData.appointments || []).map(mapAppointment)
    reservations.value = (reservationData.reservations || []).map(mapReservation)
    rooms.value = roomData.rooms || []
  } catch (error) {
    console.error('Error loading appointments and reservations:', error)
    loadError.value = error.message || 'Could not load your bookings.'
  } finally {
    loading.value = false
  }
}

function openNewAppointment() {
  editingAppointment.value = null
  form.value = {
    office: allowedOffices.value.includes('Registrar') ? 'Registrar' : (allowedOffices.value[0] || ''),
    serviceId: '',
    date: '',
    time: '',
    purpose: '',
  }
  form.value.serviceId = availableServices.value[0]?.id || ''
  libraryTab.value = 'Consultation / Assistance'
  roomForm.value = {
    type: libraryRoomServices.value[0]?.name || '',
    roomId: '',
    date: '',
    startTime: '',
    endTime: '',
    purpose: '',
  }
  selectedBook.value = ''
  showForm.value = true
  showConfirm.value = false
  notice.value = ''
}

function openRoomReservation() {
  openNewAppointment()
  form.value.office = 'Library'
  changeOffice()
  libraryTab.value = 'Rooms'
}

function closeForm() {
  showForm.value = false
  showConfirm.value = false
  editingAppointment.value = null
}

function changeOffice() {
  form.value.serviceId = availableServices.value[0]?.id || ''
}

function changeLibraryTab(tab) {
  libraryTab.value = tab
  notice.value = ''
  if (tab === 'Books') loadBooks()
}

function prepareAppointment() {
  if (!selectedService.value || !form.value.date || !form.value.time || !form.value.purpose.trim()) {
    notice.value = 'Please complete all required appointment fields.'
    return
  }
  showConfirm.value = true
}

async function confirmAppointment() {
  if (submitting.value) return
  submitting.value = true
  try {
    const scheduledAt = new Date(`${form.value.date}T${form.value.time}:00`)
    const payload = {
      appointmentId: editingAppointment.value?.id,
      serviceId: form.value.serviceId,
      scheduledAt: scheduledAt.toISOString(),
      purpose: form.value.purpose.trim(),
    }
    if (editingAppointment.value) {
      await apiRequest('/api/appointments/reschedule', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      notice.value = 'Your rescheduling request was submitted for office confirmation.'
    } else {
      await apiRequest('/api/appointments/book', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      notice.value = 'Your appointment request has been submitted.'
    }
    showConfirm.value = false
    showForm.value = false
    activeTab.value = 'Pending'
    await loadData()
  } catch (error) {
    console.error('Error submitting appointment:', error)
    notice.value = error.message || 'Could not submit your appointment.'
  } finally {
    submitting.value = false
  }
}

async function submitRoomReservation() {
  if (!roomForm.value.roomId || !roomForm.value.date || !roomForm.value.startTime ||
      !roomForm.value.endTime || !roomForm.value.purpose.trim()) {
    notice.value = 'Please complete all room reservation fields.'
    return
  }

  const startAt = new Date(`${roomForm.value.date}T${roomForm.value.startTime}:00`)
  const endAt = new Date(`${roomForm.value.date}T${roomForm.value.endTime}:00`)
  if (startAt >= endAt) {
    notice.value = 'The end time must be later than the start time.'
    return
  }

  const room = rooms.value.find((item) => item.id === roomForm.value.roomId)
  if (!window.confirm(`Submit ${roomForm.value.type.toLowerCase()} for ${room?.name || 'the selected room'} on ${formatDate(roomForm.value.date)}?`)) {
    return
  }

  submitting.value = true
  try {
    await apiRequest('/api/reservations/book', {
      method: 'POST',
      body: JSON.stringify({
        roomId: roomForm.value.roomId,
        serviceId: reservationService.value?.id || null,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        purpose: roomForm.value.purpose.trim(),
      }),
    })
    showForm.value = false
    activeTab.value = 'Pending'
    notice.value = 'Your room reservation has been submitted for confirmation.'
    await loadData()
  } catch (error) {
    console.error('Error submitting room reservation:', error)
    notice.value = error.message || 'Could not submit your room reservation.'
  } finally {
    submitting.value = false
  }
}

async function cancelAppointment(appointment) {
  if (!window.confirm(`Cancel your ${appointment.service} appointment?`)) return
  try {
    await apiRequest('/api/appointments/cancel', {
      method: 'POST',
      body: JSON.stringify({ appointmentId: appointment.id }),
    })
    notice.value = 'The appointment has been cancelled.'
    await loadData()
  } catch (error) {
    console.error('Error cancelling appointment:', error)
    notice.value = error.message || 'Could not cancel this appointment.'
  }
}

async function cancelReservation(reservation) {
  if (!window.confirm(`Cancel your reservation for ${reservation.roomName}?`)) return
  try {
    await apiRequest('/api/reservations/cancel', {
      method: 'POST',
      body: JSON.stringify({ reservationId: reservation.id }),
    })
    notice.value = 'The room reservation has been cancelled.'
    await loadData()
  } catch (error) {
    console.error('Error cancelling reservation:', error)
    notice.value = error.message || 'Could not cancel this reservation.'
  }
}

function rescheduleAppointment(appointment) {
  const parts = localDateTimeParts(appointment.scheduled_at)
  editingAppointment.value = appointment
  form.value = {
    office: appointment.office,
    serviceId: appointment.service_id,
    date: parts.date,
    time: parts.time,
    purpose: appointment.purpose || '',
  }
  showForm.value = true
  showConfirm.value = false
  notice.value = ''
}

function statusDescription(status) {
  const descriptions = {
    pending: 'Your booking is waiting for confirmation from the office.',
    reschedule_requested: 'Your rescheduling request is waiting for office confirmation.',
    confirmed: 'Your booking has been confirmed.',
    completed: 'This booking has been completed.',
    cancelled: 'This booking was cancelled.',
    Pending: 'Your booking is waiting for confirmation from the office.',
    Confirmed: 'Your booking has been confirmed.',
    Completed: 'This booking has been completed.',
    Cancelled: 'This booking was cancelled.',
  }
  return descriptions[status] || 'Check the booking details for the latest information.'
}

function bookingStatusLabel(booking) {
  if (booking.recordType === 'reservation') return booking.status
  const labels = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    reschedule_requested: 'Reschedule Requested',
    completed: 'Completed',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
    no_show: 'No Show',
  }
  return labels[booking.status] || booking.status
}

function loadBookingDetails(booking) {
  selectedBooking.value = booking
}

function bookAgain(booking) {
  openNewAppointment()
  activeTab.value = 'All'
  if (booking.recordType === 'reservation') {
    form.value.office = 'Library'
    changeOffice()
    libraryTab.value = 'Rooms'
    roomForm.value.type = booking.service
    roomForm.value.roomId = ''
    roomForm.value.purpose = booking.purpose || ''
  } else {
    form.value.office = booking.office
    changeOffice()
    form.value.serviceId = booking.service_id
    form.value.purpose = booking.purpose || ''
  }
}

async function loadBooks() {
  if (books.value.length || booksLoading.value) return
  booksLoading.value = true
  booksError.value = ''
  try {
    const payload = await apiRequest('/api/library/books')
    books.value = payload.books || []
  } catch (error) {
    console.error('Error loading Library catalog:', error)
    booksError.value = error.message || 'Could not load the Library catalog.'
  } finally {
    booksLoading.value = false
  }
}

async function submitBorrowingRequest() {
  if (!selectedBook.value || submitting.value) {
    notice.value = 'Select a book from the live Library catalog before submitting.'
    return
  }

  const book = books.value.find((item) => item.id === selectedBook.value)
  if (!book) {
    notice.value = 'The selected book is no longer available. Refresh the catalog and try again.'
    return
  }
  if (!window.confirm(`Submit a borrowing request for "${book.title}"?`)) return

  submitting.value = true
  try {
    const result = await apiRequest('/api/library/borrow-request', {
      method: 'POST',
      body: JSON.stringify({ bookId: book.id, remarks: roomForm.value.purpose.trim() }),
    })
    notice.value = result.message || 'Your borrowing request has been submitted.'
    selectedBook.value = ''
    roomForm.value.purpose = ''
    showForm.value = false
    await loadData()
  } catch (error) {
    console.error('Error submitting borrowing request:', error)
    notice.value = error.message || 'Could not submit your borrowing request.'
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  const savedTab = sessionStorage.getItem('libraryTab')
  const savedOffice = sessionStorage.getItem('appointmentOffice')
  sessionStorage.removeItem('libraryTab')
  sessionStorage.removeItem('appointmentOffice')

  try {
    await Promise.all([fetchServices(), loadData()])
  } catch (error) {
    console.error('Error loading appointment services:', error)
    loadError.value = error.message || 'Could not load available services.'
  }

  if (savedTab || savedOffice) {
    openNewAppointment()
    form.value.office = savedOffice || 'Library'
    changeOffice()
    libraryTab.value = savedTab || 'Consultation / Assistance'
  }
  if (route.query.section === 'reservations') openRoomReservation()
})
</script>

<template>
  <section class="page-content appointments-page">
    <header class="appointments-heading">
      <div>
        <h1 class="page-heading">My Appointments</h1>
        <p class="page-subtitle" v-if="!showForm">
          Queues are available only for Registrar visits and Cashier tuition payments.
        </p>
        <p class="page-subtitle" v-else>
          Appointments for every campus office in one place.
        </p>
      </div>
      <button
        v-if="showForm"
        class="appointment-outline"
        type="button"
        @click="closeForm"
      >
        Close Form
      </button>
      <button
        v-else
        class="appointment-primary"
        type="button"
        @click="openNewAppointment"
      >
        Book Appointment
      </button>
    </header>

    <p v-if="notice" class="appointment-notice" role="status">
      {{ notice }}
      <button type="button" @click="notice = ''">Dismiss</button>
    </p>

    <template v-if="!showForm">
      <nav class="appointment-tabs" aria-label="Appointment status">
        <button
          v-for="filter in filters"
          :key="filter"
          type="button"
          :class="{ active: activeTab === filter }"
          :aria-pressed="activeTab === filter"
          @click="activeTab = filter"
        >
          {{ filter }}
        </button>
      </nav>

      <p v-if="loadError" class="appointment-notice" role="alert">
        {{ loadError }}
        <button type="button" @click="loadData">Try Again</button>
      </p>
      <p v-if="loading" class="appointment-empty" role="status">Loading appointments…</p>
      <p v-else-if="!loadError && !filteredBookings.length" class="appointment-empty">
        No appointments found for this status.
      </p>

      <section v-else-if="!loading && !loadError" class="appointment-list">
        <article v-for="booking in filteredBookings" :key="`${booking.recordType}-${booking.id}`" class="appointment-card">
          <div class="appointment-card-top">
            <span class="appointment-office">{{ booking.office }}</span>
            <span class="appointment-status" :class="booking.status.toLowerCase().replace(/[\s_]+/g, '-')">
              {{ bookingStatusLabel(booking) }}
            </span>
          </div>
          <h2 class="appointment-title">
            {{ booking.recordType === 'reservation' ? `${booking.service} · ${booking.roomName}` : booking.service }}
          </h2>
          <p class="appointment-purpose">{{ booking.purpose || 'No additional details provided.' }}</p>
          <div class="appointment-meta">
            <span>Date: {{ formatDate(booking.scheduled_at || booking.start_at) }}</span>
            <span v-if="booking.recordType === 'reservation'">
              Time: {{ formatTime(localDateTimeParts(booking.start_at).time) }} –
              {{ formatTime(localDateTimeParts(booking.end_at).time) }}
            </span>
            <span v-else>Time: {{ formatTime(booking.time) }}</span>
            <span>Reference: {{ String(booking.reference).slice(0, 8).toUpperCase() }}</span>
          </div>
          <p class="appointment-status-description">{{ statusDescription(booking.status) }}</p>
          <div class="appointment-card-actions">
            <template v-if="booking.recordType === 'reservation' ? ['Pending', 'Confirmed'].includes(booking.status) : ['pending', 'confirmed', 'reschedule_requested'].includes(booking.status)">
              <button
                v-if="booking.recordType === 'appointment' && ['pending', 'confirmed'].includes(booking.status)"
                class="appointment-outline"
                type="button"
                @click="rescheduleAppointment(booking)"
              >
                Reschedule
              </button>
              <button
                class="appointment-danger"
                type="button"
                @click="booking.recordType === 'reservation' ? cancelReservation(booking) : cancelAppointment(booking)"
              >
                Cancel
              </button>
            </template>
            <template v-else-if="booking.status === (booking.recordType === 'reservation' ? 'Completed' : 'completed')">
              <button class="appointment-outline" type="button" @click="loadBookingDetails(booking)">
                View Details
              </button>
            </template>
            <template v-else-if="booking.status === (booking.recordType === 'reservation' ? 'Cancelled' : 'cancelled')">
              <button class="appointment-outline" type="button" @click="bookAgain(booking)">Book Again</button>
              <button class="appointment-outline" type="button" @click="loadBookingDetails(booking)">View Details</button>
            </template>
            <button
              v-if="booking.recordType === 'appointment' && ['reschedule_requested', 'rejected', 'no_show'].includes(booking.status)"
              class="appointment-outline"
              type="button"
              @click="loadBookingDetails(booking)"
            >
              View Details
            </button>
          </div>
        </article>
      </section>
    </template>

    <section v-else class="appointment-form-panel">
      <template v-if="editingAppointment">
        <header class="appointment-form-heading">
          <div>
            <h2>Reschedule Appointment</h2>
            <p>{{ editingAppointment.service }} · Reference {{ String(editingAppointment.id).slice(0, 8).toUpperCase() }}</p>
          </div>
        </header>
        <div class="current-schedule">
          <strong>Current Schedule</strong>
          <span>{{ formatDate(editingAppointment.scheduled_at) }} at {{ formatTime(editingAppointment.time) }}</span>
        </div>
        <form class="appointment-form reschedule-form" @submit.prevent="prepareAppointment">
          <label>
            New Date
            <input v-model="form.date" type="date" :min="today" required />
          </label>
          <label>
            New Time
            <input v-model="form.time" type="time" required />
          </label>
          <label class="full-width">
            Purpose / Details
            <textarea v-model="form.purpose" rows="3" required />
          </label>
          <div class="appointment-form-actions full-width">
            <button class="appointment-outline" type="button" @click="closeForm">Cancel Editing</button>
            <button class="appointment-primary" type="submit">Review Changes</button>
          </div>
        </form>
      </template>

      <template v-else>
        <header class="appointment-form-heading">
          <div>
            <h2>Book Appointment</h2>
            <p>Choose an available campus service and provide the required details.</p>
          </div>
        </header>
        <form class="appointment-form" @submit.prevent="prepareAppointment">
          <label>
            Office
            <select v-model="form.office" required @change="changeOffice">
              <option value="" disabled>Select an office</option>
              <option v-for="office in allowedOffices" :key="office" :value="office">{{ office }}</option>
            </select>
          </label>

          <div v-if="form.office === 'Library'" class="library-appointment-tabs">
            <button
              v-for="tab in ['Consultation / Assistance', 'Rooms', 'Books']"
              v-show="tab !== 'Rooms' || libraryRoomServices.length"
              :key="tab"
              type="button"
              :class="{ active: libraryTab === tab }"
              @click="changeLibraryTab(tab)"
            >
              {{ tab }}
            </button>
          </div>

          <template v-if="form.office !== 'Library' || libraryTab === 'Consultation / Assistance'">
            <label>
              Service
              <select v-model="form.serviceId" required>
                <option value="" disabled>Select a configured service</option>
                <option v-for="service in availableServices" :key="service.id" :value="service.id">
                  {{ service.name }}
                </option>
              </select>
            </label>
            <label>
              Appointment Date
              <input v-model="form.date" type="date" :min="today" required />
            </label>
            <label>
              Preferred Time
              <input v-model="form.time" type="time" required />
            </label>
            <label class="full-width">
              Purpose / Details
              <textarea v-model="form.purpose" rows="4" placeholder="Enter the purpose of your appointment..." required />
            </label>
            <div class="appointment-form-actions full-width">
              <button class="appointment-outline" type="button" @click="closeForm">Cancel Editing</button>
              <button class="appointment-primary" type="submit" :disabled="!availableServices.length">
                Review Appointment
              </button>
            </div>
          </template>

          <section v-else-if="libraryTab === 'Rooms'" class="library-room-section">
            <h3>Library Room Reservations</h3>
            <p>Select an available room, reservation type, date, time, and purpose.</p>
            <div class="library-room-grid">
              <button
                v-for="room in availableRooms"
                :key="room.id"
                type="button"
                class="library-room-card"
                :class="{ selected: roomForm.roomId === room.id }"
                :aria-pressed="roomForm.roomId === room.id"
                @click="roomForm.roomId = room.id"
              >
                <strong>{{ room.name }}</strong>
                <small>{{ room.location || room.room_type || 'Library room' }}</small>
                <small v-if="room.capacity">Capacity: {{ room.capacity }}</small>
                <span>{{ room.is_available ? 'Available' : 'Unavailable' }}</span>
              </button>
            </div>
            <p v-if="!availableRooms.length" role="status">
              No available rooms are configured for this reservation service.
            </p>
            <label>
              Reservation Service
              <select v-model="roomForm.type" required @change="roomForm.roomId = ''">
                <option value="" disabled>Select a configured room service</option>
                <option v-for="service in libraryRoomServices" :key="service.id" :value="service.name">
                  {{ service.name }}
                </option>
              </select>
            </label>
            <label>
              Room
              <select v-model="roomForm.roomId" required>
                <option value="" disabled>Select an available room</option>
                <option v-for="room in availableRooms" :key="room.id" :value="room.id">
                  {{ room.name }}{{ room.capacity ? ` · Capacity ${room.capacity}` : '' }}
                </option>
              </select>
            </label>
            <label>
              Reservation Date
              <input v-model="roomForm.date" type="date" :min="today" required />
            </label>
            <label>
              Start Time
              <input v-model="roomForm.startTime" type="time" required />
            </label>
            <label>
              End Time
              <input v-model="roomForm.endTime" type="time" required />
            </label>
            <label>
              Required Purpose
              <textarea v-model="roomForm.purpose" rows="3" required />
            </label>
            <p class="reservation-grace-note">Please check in within 15 minutes of your reservation start time.</p>
            <div class="appointment-form-actions">
              <button class="appointment-outline" type="button" @click="closeForm">Cancel Editing</button>
              <button class="appointment-primary" type="button" :disabled="submitting || !rooms.length" @click="submitRoomReservation">
                {{ submitting ? 'Submitting…' : 'Submit Reservation' }}
              </button>
            </div>
          </section>

          <section v-else class="library-books-section">
            <h3>Book Borrowing Request</h3>
            <p>Search the live Library catalog and submit a request for staff review.</p>
            <label>
              Search by title, author, or accession / ISBN
              <input v-model="bookSearch" type="search" placeholder="Enter a title or accession ID" @focus="loadBooks" />
            </label>
            <p v-if="booksError" class="form-error" role="alert">{{ booksError }}</p>
            <p v-else-if="booksLoading" role="status">Loading catalog…</p>
            <label v-else>
              Book
              <select v-model="selectedBook" required>
                <option value="" disabled>Select a book</option>
                <option v-for="book in filteredBooks" :key="book.id" :value="book.id">
                  {{ book.title }}{{ book.isbn ? ` · ${book.isbn}` : '' }}
                </option>
              </select>
            </label>
            <label>
              Details / Purpose
              <textarea v-model="roomForm.purpose" rows="3" placeholder="Optional information for Library staff." />
            </label>
            <div class="appointment-form-actions">
              <button class="appointment-outline" type="button" @click="closeForm">Cancel Editing</button>
              <button class="appointment-primary" type="button" :disabled="submitting || booksLoading || !!booksError" @click="submitBorrowingRequest">
                {{ submitting ? 'Submitting…' : 'Submit Borrowing Request' }}
              </button>
            </div>
          </section>
        </form>
      </template>
    </section>

    <div v-if="showConfirm" class="appointment-modal-overlay" @click.self="showConfirm = false">
      <section class="appointment-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-confirm-title">
        <h2 id="appointment-confirm-title">{{ editingAppointment ? 'Review Reschedule Changes' : 'Review Appointment' }}</h2>
        <p>Please review the information before submitting.</p>
        <dl>
          <dt>Office</dt><dd>{{ form.office }}</dd>
          <dt>Service</dt><dd>{{ selectedService?.name || editingAppointment?.service }}</dd>
          <dt>Date</dt><dd>{{ formatDate(form.date) }}</dd>
          <dt>Time</dt><dd>{{ formatTime(form.time) }}</dd>
          <dt>Purpose</dt><dd>{{ form.purpose }}</dd>
        </dl>
        <div class="appointment-form-actions">
          <button class="appointment-outline" type="button" @click="showConfirm = false">Go Back</button>
          <button class="appointment-primary" type="button" :disabled="submitting" @click="confirmAppointment">
            {{ submitting ? 'Submitting…' : (editingAppointment ? 'Submit Reschedule' : 'Submit Appointment') }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="selectedBooking" class="appointment-modal-overlay" @click.self="selectedBooking = null">
      <section class="appointment-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="booking-details-title">
        <h2 id="booking-details-title">{{ selectedBooking.service }}</h2>
        <p>{{ selectedBooking.office }} · {{ selectedBooking.status }}</p>
        <dl>
          <dt>Reference</dt><dd>{{ selectedBooking.id }}</dd>
          <dt>Date</dt><dd>{{ formatDate(selectedBooking.scheduled_at || selectedBooking.start_at) }}</dd>
          <dt>Purpose</dt><dd>{{ selectedBooking.purpose || 'No additional details provided.' }}</dd>
        </dl>
        <div class="appointment-form-actions">
          <button class="appointment-primary" type="button" @click="selectedBooking = null">Close</button>
        </div>
      </section>
    </div>
  </section>
</template>
