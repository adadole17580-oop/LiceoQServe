<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import '../assets/styles/services.css'

const router = useRouter()
const selectedOffice = ref('')
const searchQuery = ref('')
const bookSearch = ref('')
const returnBook = ref('')
const services = ref([])
const books = ref([])
const loading = ref(true)
const bookLoading = ref(false)
const returnSubmitting = ref(false)
const errorMessage = ref('')
const bookError = ref('')
const notice = ref('')

const actionsByOffice = {
  Registrar: ['Join Queue', 'Book Appointment', 'Submit Request'],
  Cashier: ['Join Queue'],
  Library: ['Book Appointment', 'Room Reservation', 'Book Borrow/Return'],
  Guidance: ['Book Appointment', 'Submit Request'],
  'Guidance Office': ['Book Appointment', 'Submit Request'],
  OSA: ['Book Appointment', 'Submit Request'],
  'Office of Student Affairs': ['Book Appointment', 'Submit Request'],
}

const offices = computed(() => {
  const grouped = new Map()
  for (const service of services.value) {
    const officeName = service.offices?.name
    if (!officeName) continue
    const entry = grouped.get(officeName) || {
      name: officeName,
      code: officeName === 'Library' ? 'LIB' : officeName === 'Registrar' ? 'RE' : officeName.slice(0, 2).toUpperCase(),
      options: [],
      actions: actionsByOffice[officeName] || [],
    }
    entry.options.push(service.name)
    grouped.set(officeName, entry)
  }
  return [...grouped.values()]
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

async function loadServices() {
  loading.value = true
  errorMessage.value = ''
  const { data, error } = await supabase
    .from('office_services')
    .select('id, name, office_id, offices!inner(id, name, is_active)')
    .eq('is_active', true)
    .eq('offices.is_active', true)
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching campus services:', error)
    errorMessage.value = 'Could not load campus services. Please try again.'
  } else {
    services.value = data || []
  }
  loading.value = false
}

async function loadBooks() {
  bookLoading.value = true
  bookError.value = ''
  try {
    const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/library/books?query=${encodeURIComponent(bookSearch.value)}`
    const response = await fetch(url)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'Could not search the Library catalog.')
    books.value = payload.books || []
  } catch (error) {
    console.error('Error searching the Library catalog:', error)
    bookError.value = error.message || 'Could not search the Library catalog.'
  } finally {
    bookLoading.value = false
  }
}

function selectOffice(name) {
  selectedOffice.value = name
  notice.value = ''
  if (name === 'Library') loadBooks()
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
    notice.value = 'Use the catalog below to request a book or request a return by title or ISBN.'
  }
}

async function requestBook(book) {
  bookError.value = ''
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    bookError.value = 'Your session has expired. Please sign in again.'
    return
  }

  try {
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
    bookError.value = error.message || 'Could not submit the borrowing request.'
  }
}

async function requestBookReturn() {
  const book = returnBook.value.trim()
  if (!book || returnSubmitting.value) return

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    bookError.value = 'Your session has expired. Please sign in again.'
    return
  }

  returnSubmitting.value = true
  bookError.value = ''
  try {
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
    bookError.value = error.message || 'Could not submit the return request.'
  } finally {
    returnSubmitting.value = false
  }
}

onMounted(loadServices)
</script>

<template>
  <div class="services-page">
    <div class="services-heading">
      <h2>Campus Services</h2>
      <p>Manage queues, appointments, requests, and campus service updates in one place.</p>
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

    <p v-if="notice" class="services-notice" role="status">
      {{ notice }}
      <button type="button" aria-label="Dismiss notice" @click="notice = ''">×</button>
    </p>
    <p v-if="errorMessage" class="services-error" role="alert">
      {{ errorMessage }}
      <button type="button" @click="loadServices">Try Again</button>
    </p>
    <p v-if="loading" class="no-results" role="status">Loading active campus services…</p>

    <section v-else class="office-cards" aria-label="Campus offices">
      <button
        v-for="office in filteredOffices"
        :key="office.name"
        type="button"
        class="office-card"
        :class="{ 'office-card-selected': selectedOffice === office.name }"
        @click="selectOffice(office.name)"
      >
        <span class="office-code">{{ office.code }}</span>
        <span class="office-card-text">
          <strong>{{ office.name }}</strong>
          <small>{{ office.options.length }} active services</small>
        </span>
      </button>
      <p v-if="!filteredOffices.length" class="no-results">
        {{ offices.length ? 'No offices or services match your search.' : 'No active campus services are available.' }}
      </p>
    </section>

    <section v-if="activeOffice" class="office-detail">
      <div class="detail-topline">
        <span>ACTIVE SERVICES</span>
        <button type="button" class="detail-close" @click="selectedOffice = ''">Close</button>
      </div>
      <h3>{{ activeOffice.name }}</h3>
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

      <div v-if="activeOffice.name === 'Library'" class="library-catalog">
        <h4>Search Library Catalog</h4>
        <label for="book-search">Search by title, author, or ISBN</label>
        <input
          id="book-search"
          v-model="bookSearch"
          type="search"
          placeholder="Search Library catalog…"
          @input="loadBooks"
        />
        <p v-if="bookError" class="services-error" role="alert">{{ bookError }}</p>
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
      </div>
    </section>
  </div>
</template>
