
<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { supabase } from '../lib/Supabase.js'

const LIBRARY_SERVICE_ID = '99a740ad-96d7-43a5-9bcc-3f9723cabd28'

const activeTab = ref('Borrow Requests')

const books = ref([])
const requests = ref([])
const borrowedBooks = ref([])

const searchBook = ref('')

const loadingBooks = ref(false)
const loadingRequests = ref(false)
const loadingLoans = ref(false)
const processing = ref(false)
const savingBook = ref(false)

const booksError = ref('')
const requestsError = ref('')
const loansError = ref('')
const actionError = ref('')
const actionMessage = ref('')
const newBookError = ref('')

const showAddBookModal = ref(false)
const showConfirmation = ref(false)

const selectedRequest = ref(null)
const confirmationAction = ref('')

const newBook = ref({
  isbn: '',
  title: '',
  author: '',
  category: '',
  shelf_location: '',
  total_copies: 1,
})

let subscriptions = []

// ========================================
// COMPUTED DATA
// ========================================

function isReturnRequest(request) {
  return Boolean(request.book_loan_id) ||
    String(request.title || '')
      .toLowerCase()
      .startsWith('book return request:')
}

const pendingRequests = computed(() =>
  requests.value.filter(request =>
    String(request.status || '').toLowerCase() === 'pending' &&
    !isReturnRequest(request)
  )
)

const pendingReturnRequests = computed(() =>
  requests.value.filter(request =>
    String(request.status || '').toLowerCase() === 'pending' &&
    isReturnRequest(request)
  )
)

const otherRequests = computed(() =>
  requests.value.filter(request =>
    String(request.status || '').toLowerCase() !== 'pending'
  )
)

const filteredBooks = computed(() => {
  const keyword = searchBook.value.trim().toLowerCase()

  if (!keyword) return books.value

  return books.value.filter(book =>
    [
      book.title,
      book.author,
      book.isbn,
      book.category,
      book.shelf_location,
    ].some(value =>
      String(value || '').toLowerCase().includes(keyword)
    )
  )
})

const activeLoans = computed(() =>
  borrowedBooks.value.filter(loan =>
    String(loan.status || '').toLowerCase() === 'borrowed'
  )
)

const returnedLoans = computed(() =>
  borrowedBooks.value.filter(loan =>
    String(loan.status || '').toLowerCase() === 'returned'
  )
)

const confirmationTitle = computed(() => {
  if (confirmationAction.value === 'Approve') {
    return 'Approve Borrow Request?'
  }

  if (confirmationAction.value === 'Cancel') {
    return 'Cancel Borrow Request?'
  }

  return 'Confirm Book Return?'
})

const confirmationMessage = computed(() => {
  const request = selectedRequest.value

  if (!request) return ''

  const bookTitle = request.book?.title || request.title || 'this book'
  const studentName = request.student?.full_name || 'Unknown student'

  if (confirmationAction.value === 'Return') {
    return `Confirm that ${studentName} has returned ${bookTitle}?`
  }

  if (confirmationAction.value === 'Approve') {
    return `Approve ${studentName}'s request for ${bookTitle}?`
  }

  return `Cancel ${studentName}'s request for ${bookTitle}?`
})

// ========================================
// HELPERS
// ========================================

function formatDate(value) {
  if (!value) return 'Not available'

  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function statusLabel(status) {
  const labels = {
    pending: 'Pending',
    processing: 'Processing',
    ready_for_pickup: 'Ready for Pickup',
    claimed: 'Approved / Issued',
    completed: 'Completed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    borrowed: 'Borrowed',
    returned: 'Returned',
  }

  return labels[String(status || '').toLowerCase()] || status
}

function statusClass(status) {
  return String(status || '').toLowerCase().replaceAll('_', '-')
}

function getAvailability(book) {
  return Number(book.available_copies) > 0
    ? 'Available'
    : 'Unavailable'
}

// ========================================
// FETCH BOOK CATALOG
// ========================================

async function fetchBooks() {
  loadingBooks.value = true
  booksError.value = ''

  try {
    const { data, error } = await supabase
      .from('library_books')
      .select(`
        id,
        isbn,
        title,
        author,
        category,
        shelf_location,
        total_copies,
        available_copies,
        is_active
      `)
      .eq('is_active', true)
      .order('title', { ascending: true })

    if (error) throw error

    books.value = data || []
  } catch (error) {
    console.error('Fetch books error:', error)
    booksError.value = error.message
  } finally {
    loadingBooks.value = false
  }
}

// ========================================
// ADD BOOK
// ========================================

function openAddBookModal() {
  newBookError.value = ''

  newBook.value = {
    isbn: '',
    title: '',
    author: '',
    category: '',
    shelf_location: '',
    total_copies: 1,
  }

  showAddBookModal.value = true
}

function closeAddBookModal() {
  if (savingBook.value) return
  showAddBookModal.value = false
}

async function addBook() {
  if (savingBook.value) return

  if (!newBook.value.title.trim()) {
    newBookError.value = 'Book title is required.'
    return
  }

  const copies = Number(newBook.value.total_copies)

  if (!Number.isInteger(copies) || copies < 1) {
    newBookError.value = 'Enter a valid number of copies.'
    return
  }

  savingBook.value = true
  newBookError.value = ''

  try {
    const { error } = await supabase
      .from('library_books')
      .insert({
        isbn: newBook.value.isbn.trim() || null,
        title: newBook.value.title.trim(),
        author: newBook.value.author.trim() || null,
        category: newBook.value.category.trim() || null,
        shelf_location: newBook.value.shelf_location.trim() || null,
        total_copies: copies,
        available_copies: copies,
        is_active: true,
      })

    if (error) throw error

    showAddBookModal.value = false
    actionMessage.value = 'Book added successfully.'

    await fetchBooks()
  } catch (error) {
    console.error('Add book error:', error)
    newBookError.value = error.message
  } finally {
    savingBook.value = false
  }
}

// ========================================
// FETCH LIBRARY REQUESTS
// ========================================

async function fetchRequests() {
  loadingRequests.value = true
  requestsError.value = ''

  try {
    const { data, error } = await supabase
      .from('service_requests')
      .select(`
        id,
        student_id,
        book_id,
        book_loan_id,
        title,
        details,
        request_type,
        status,
        staff_notes,
        submitted_at
      `)
      .eq('service_id', LIBRARY_SERVICE_ID)
      .order('submitted_at', { ascending: false })

    if (error) throw error

    const rows = data || []

    const studentIds = [
      ...new Set(rows.map(item => item.student_id).filter(Boolean)),
    ]

    const bookIds = [
      ...new Set(rows.map(item => item.book_id).filter(Boolean)),
    ]

    let profiles = []
    let selectedBooks = []

    if (studentIds.length) {
      const result = await supabase
        .from('profiles')
        .select('id, student_id, full_name, university_email, program')
        .in('id', studentIds)

      if (result.error) throw result.error

      profiles = result.data || []
    }

    if (bookIds.length) {
      const result = await supabase
        .from('library_books')
        .select('id, title, author, isbn, category, available_copies')
        .in('id', bookIds)

      if (result.error) throw result.error

      selectedBooks = result.data || []
    }

    requests.value = rows.map(request => ({
      ...request,
      student: profiles.find(
        profile => profile.id === request.student_id
      ) || null,
      book: selectedBooks.find(
        book => book.id === request.book_id
      ) || null,
    }))
  } catch (error) {
    console.error('Fetch requests error:', error)
    requestsError.value = error.message
  } finally {
    loadingRequests.value = false
  }
}

// ========================================
// FETCH BORROWED BOOKS
// ========================================

async function fetchBorrowedBooks() {
  loadingLoans.value = true
  loansError.value = ''

  try {
    const { data, error } = await supabase
      .from('book_loans')
      .select(`
        id,
        book_id,
        student_id,
        borrowed_at,
        due_at,
        returned_at,
        status,
        source_request_id
      `)
      .order('borrowed_at', { ascending: false })

    if (error) throw error

    const rows = data || []

    const studentIds = [
      ...new Set(rows.map(item => item.student_id).filter(Boolean)),
    ]

    const bookIds = [
      ...new Set(rows.map(item => item.book_id).filter(Boolean)),
    ]

    let profiles = []
    let selectedBooks = []

    if (studentIds.length) {
      const result = await supabase
        .from('profiles')
        .select('id, student_id, full_name')
        .in('id', studentIds)

      if (result.error) throw result.error

      profiles = result.data || []
    }

    if (bookIds.length) {
      const result = await supabase
        .from('library_books')
        .select('id, title, author')
        .in('id', bookIds)

      if (result.error) throw result.error

      selectedBooks = result.data || []
    }

    borrowedBooks.value = rows.map(loan => ({
      ...loan,
      student: profiles.find(
        profile => profile.id === loan.student_id
      ) || null,
      book: selectedBooks.find(
        book => book.id === loan.book_id
      ) || null,
    }))
  } catch (error) {
    console.error('Fetch loans error:', error)
    loansError.value = error.message
  } finally {
    loadingLoans.value = false
  }
}

// ========================================
// REFRESH
// ========================================

async function refreshAll() {
  await Promise.all([
    fetchBooks(),
    fetchRequests(),
    fetchBorrowedBooks(),
  ])
}

// ========================================
// CONFIRMATION MODALS
// ========================================

function openConfirmation(request, action) {
  selectedRequest.value = request
  confirmationAction.value = action
  actionError.value = ''
  actionMessage.value = ''
  showConfirmation.value = true
}

function openReturnConfirmation(request) {
  selectedRequest.value = request
  confirmationAction.value = 'Return'
  actionError.value = ''
  actionMessage.value = ''
  showConfirmation.value = true
}

function closeConfirmation() {
  if (processing.value) return

  showConfirmation.value = false
  selectedRequest.value = null
  actionError.value = ''
}

// ========================================
// APPROVE / CANCEL / CONFIRM RETURN
// ========================================

async function confirmRequest() {
  if (processing.value) return

  processing.value = true
  actionError.value = ''
  actionMessage.value = ''

  try {
    // APPROVE BORROW REQUEST
    if (confirmationAction.value === 'Approve') {
      if (!selectedRequest.value) {
        throw new Error('No selected request.')
      }

      if (isReturnRequest(selectedRequest.value)) {
        throw new Error(
          'This is a return request. Please use Confirm Return instead.'
        )
      }

      if (!selectedRequest.value.book_id) {
        throw new Error(
          'This request has no selected book. A valid book selection is required.'
        )
      }

      const { error } = await supabase.rpc(
        'approve_library_borrow_request',
        {
          p_request_id: selectedRequest.value.id,
        }
      )

      if (error) throw error

      actionMessage.value = 'Borrow request approved successfully.'
    }

    // CANCEL BORROW REQUEST
    else if (confirmationAction.value === 'Cancel') {
      if (!selectedRequest.value) {
        throw new Error('No selected request.')
      }

      if (isReturnRequest(selectedRequest.value)) {
        throw new Error(
          'This is a return request. It cannot be cancelled through this action.'
        )
      }

      const { data: userData, error: userError } =
        await supabase.auth.getUser()

      if (userError) throw userError

      const { data, error } = await supabase
        .from('service_requests')
        .update({
          status: 'cancelled',
          handled_by: userData.user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedRequest.value.id)
        .eq('service_id', LIBRARY_SERVICE_ID)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()

      if (error) throw error

      if (!data) {
        throw new Error(
          'Request was not updated. It may no longer be pending or permission is missing.'
        )
      }

      actionMessage.value = 'Borrow request cancelled successfully.'
    }

    // CONFIRM BOOK RETURN REQUEST
    else if (confirmationAction.value === 'Return') {
      if (!selectedRequest.value) {
        throw new Error('No selected return request.')
      }

      if (!isReturnRequest(selectedRequest.value)) {
        throw new Error('This is not a valid book return request.')
      }

      if (!selectedRequest.value.book_loan_id) {
        throw new Error(
          'This return request has no linked book loan.'
        )
      }

      const { data, error } = await supabase.rpc(
        'confirm_library_book_return',
        {
          p_return_request_id: selectedRequest.value.id,
        }
      )

      if (error) throw error

      actionMessage.value = data === false
        ? 'This return request was already processed.'
        : 'Book return confirmed successfully. Available copies have been updated.'
    }

    showConfirmation.value = false
    selectedRequest.value = null

    await refreshAll()
  } catch (error) {
    console.error('Library action error:', error)
    actionError.value = error.message || 'Something went wrong.'
  } finally {
    processing.value = false
  }
}

// ========================================
// REALTIME
// ========================================

function subscribeToChanges() {
  const channel = supabase
    .channel('library-books-realtime')

    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'library_books',
      },
      () => {
        fetchBooks()
        fetchRequests()
      }
    )

    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'service_requests',
      },
      payload => {
        const serviceId =
          payload.new?.service_id || payload.old?.service_id

        if (serviceId === LIBRARY_SERVICE_ID) {
          fetchRequests()
          fetchBorrowedBooks()
        }
      }
    )

    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'book_loans',
      },
      () => {
        fetchBorrowedBooks()
        fetchBooks()
      }
    )

    .subscribe()

  subscriptions.push(channel)
}

onMounted(async () => {
  await refreshAll()
  subscribeToChanges()
})

onUnmounted(() => {
  subscriptions.forEach(channel => {
    supabase.removeChannel(channel)
  })

  subscriptions = []
})
</script>

<template>
  <main class="books-page">

    <header class="page-heading">
      <h1>Books</h1>
      <p>Manage borrow requests, book catalog, and returns.</p>
    </header>

    <!-- TABS -->
    <nav class="book-tabs">
      <button
        v-for="tab in ['Borrow Requests', 'Catalog', 'Borrowed & Returns']"
        :key="tab"
        type="button"
        class="tab-button"
        :class="{ active: activeTab === tab }"
        @click="activeTab = tab"
      >
        {{ tab }}

        <span
          v-if="tab === 'Borrow Requests' && pendingRequests.length"
          class="tab-count"
        >
          {{ pendingRequests.length }}
        </span>

        <span
          v-if="tab === 'Borrowed & Returns' && pendingReturnRequests.length"
          class="tab-count"
        >
          {{ pendingReturnRequests.length }}
        </span>
      </button>
    </nav>

    <p v-if="actionMessage" class="success-message">
      {{ actionMessage }}
    </p>

    <!-- ================================= -->
    <!-- BORROW REQUESTS -->
    <!-- ================================= -->

    <section v-if="activeTab === 'Borrow Requests'">

      <div class="section-toolbar">
        <span>
          Pending Requests: {{ pendingRequests.length }}
        </span>

        <button
          type="button"
          class="refresh-button"
          :disabled="loadingRequests"
          @click="fetchRequests"
        >
          {{ loadingRequests ? 'Loading...' : 'Refresh' }}
        </button>
      </div>

      <p v-if="requestsError" class="error-message">
        {{ requestsError }}
      </p>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Book</th>
              <th>Request Details</th>
              <th>Date Submitted</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr v-if="loadingRequests && requests.length === 0">
              <td colspan="6" class="empty-cell">
                Loading pending requests...
              </td>
            </tr>

            <tr
              v-for="request in pendingRequests"
              :key="request.id"
            >
              <td>
                <strong>
                  {{ request.student?.full_name || 'Unknown Student' }}
                </strong>

                <small>
                  {{ request.student?.student_id || 'No student ID' }}
                </small>
              </td>

              <td>
                <strong>
                  {{ request.book?.title || request.title || 'Book not specified' }}
                </strong>

                <small>
                  {{ request.book?.author || 'Author not specified' }}
                </small>
              </td>

              <td>
                {{ request.details || request.request_type || 'Borrow Request' }}
              </td>

              <td>
                {{ formatDate(request.submitted_at) }}
              </td>

              <td>
                <span class="status pending">
                  Pending
                </span>
              </td>

              <td>
                <div class="table-actions">
                  <button
                    type="button"
                    class="action-button approve-button"
                    :disabled="processing"
                    @click="openConfirmation(request, 'Approve')"
                  >
                    Approve
                  </button>

                  <button
                    type="button"
                    class="action-button cancel-button"
                    :disabled="processing"
                    @click="openConfirmation(request, 'Cancel')"
                  >
                    Cancel
                  </button>
                </div>
              </td>
            </tr>

            <tr
              v-if="!loadingRequests && !requestsError && pendingRequests.length === 0"
            >
              <td colspan="6" class="empty-cell">
                No pending borrow requests.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- REQUEST HISTORY -->

      <div class="history-section">
        <h3>Request History</h3>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Book</th>
                <th>Date Submitted</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="request in otherRequests.filter(item => !isReturnRequest(item))"
                :key="request.id"
              >
                <td>
                  {{ request.student?.full_name || 'Unknown Student' }}
                </td>

                <td>
                  {{ request.book?.title || request.title || 'Book not specified' }}
                </td>

                <td>
                  {{ formatDate(request.submitted_at) }}
                </td>

                <td>
                  <span
                    class="status"
                    :class="statusClass(request.status)"
                  >
                    {{ statusLabel(request.status) }}
                  </span>
                </td>
              </tr>

              <tr
                v-if="otherRequests.filter(item => !isReturnRequest(item)).length === 0"
              >
                <td colspan="4" class="empty-cell">
                  No borrow request history yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ================================= -->
    <!-- CATALOG -->
    <!-- ================================= -->

    <section v-else-if="activeTab === 'Catalog'">

      <div class="catalog-toolbar">
        <input
          v-model="searchBook"
          type="search"
          class="search-input"
          placeholder="Search books..."
        />

        <button
          type="button"
          class="refresh-button"
          :disabled="loadingBooks"
          @click="fetchBooks"
        >
          {{ loadingBooks ? 'Loading...' : 'Refresh' }}
        </button>

        <button
          type="button"
          class="add-book-button"
          @click="openAddBookModal"
        >
          + Add Book
        </button>
      </div>

      <p v-if="booksError" class="error-message">
        {{ booksError }}
      </p>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>ISBN</th>
              <th>Book Title</th>
              <th>Author</th>
              <th>Category</th>
              <th>Shelf Location</th>
              <th>Total Copies</th>
              <th>Available Copies</th>
              <th>Availability</th>
            </tr>
          </thead>

          <tbody>
            <tr v-if="loadingBooks && books.length === 0">
              <td colspan="8" class="empty-cell">
                Loading books...
              </td>
            </tr>

            <tr
              v-for="book in filteredBooks"
              :key="book.id"
            >
              <td>{{ book.isbn || 'N/A' }}</td>
              <td><strong>{{ book.title }}</strong></td>
              <td>{{ book.author || 'N/A' }}</td>
              <td>{{ book.category || 'N/A' }}</td>
              <td>{{ book.shelf_location || 'N/A' }}</td>
              <td>{{ book.total_copies }}</td>
              <td>{{ book.available_copies }}</td>
              <td>
                <span
                  class="status"
                  :class="getAvailability(book).toLowerCase()"
                >
                  {{ getAvailability(book) }}
                </span>
              </td>
            </tr>

            <tr
              v-if="!loadingBooks && !booksError && filteredBooks.length === 0"
            >
              <td colspan="8" class="empty-cell">
                No books found.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ================================= -->
    <!-- BORROWED & RETURNS -->
    <!-- ================================= -->

    <section v-else>

      <!-- PENDING RETURN REQUESTS -->

      <div class="history-section return-requests-section">
        <h3>Pending Return Requests</h3>

        <p v-if="requestsError" class="error-message">
          {{ requestsError }}
        </p>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Book</th>
                <th>Request Details</th>
                <th>Date Submitted</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="request in pendingReturnRequests"
                :key="request.id"
              >
                <td>
                  <strong>
                    {{ request.student?.full_name || 'Unknown Student' }}
                  </strong>
                </td>

                <td>
                  <strong>
                    {{ request.book?.title || request.title || 'Unknown Book' }}
                  </strong>
                </td>

                <td>
                  {{ request.details || 'Book return request' }}
                </td>

                <td>
                  {{ formatDate(request.submitted_at) }}
                </td>

                <td>
                  <span class="status pending">
                    Pending Return
                  </span>
                </td>

                <td>
                  <button
                    type="button"
                    class="action-button return-button"
                    :disabled="processing"
                    @click="openReturnConfirmation(request)"
                  >
                    Confirm Return
                  </button>
                </td>
              </tr>

              <tr
                v-if="!loadingRequests && pendingReturnRequests.length === 0"
              >
                <td colspan="6" class="empty-cell">
                  No pending return requests.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- CURRENTLY BORROWED -->

      <div class="section-toolbar">
        <span>
          Currently Borrowed: {{ activeLoans.length }}
        </span>

        <button
          type="button"
          class="refresh-button"
          :disabled="loadingLoans"
          @click="fetchBorrowedBooks"
        >
          {{ loadingLoans ? 'Loading...' : 'Refresh' }}
        </button>
      </div>

      <p v-if="loansError" class="error-message">
        {{ loansError }}
      </p>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Book</th>
              <th>Borrowed Date</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="loan in activeLoans"
              :key="loan.id"
            >
              <td>
                {{ loan.student?.full_name || 'Unknown Student' }}
              </td>

              <td>
                {{ loan.book?.title || 'Unknown Book' }}
              </td>

              <td>{{ formatDate(loan.borrowed_at) }}</td>
              <td>{{ formatDate(loan.due_at) }}</td>

              <td>
                <span class="status borrowed">
                  Borrowed
                </span>
              </td>

              <td>
                <span class="waiting-return">
                  Waiting for return request
                </span>
              </td>
            </tr>

            <tr
              v-if="!loadingLoans && !loansError && activeLoans.length === 0"
            >
              <td colspan="6" class="empty-cell">
                No currently borrowed books.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- RETURN HISTORY -->

      <div class="history-section">
        <h3>Returned Books History</h3>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Book</th>
                <th>Borrowed Date</th>
                <th>Returned Date</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="loan in returnedLoans"
                :key="loan.id"
              >
                <td>
                  {{ loan.student?.full_name || 'Unknown Student' }}
                </td>

                <td>
                  {{ loan.book?.title || 'Unknown Book' }}
                </td>

                <td>{{ formatDate(loan.borrowed_at) }}</td>
                <td>{{ formatDate(loan.returned_at) }}</td>

                <td>
                  <span class="status returned">
                    Returned
                  </span>
                </td>
              </tr>

              <tr v-if="returnedLoans.length === 0">
                <td colspan="5" class="empty-cell">
                  No returned books yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ================================= -->
    <!-- ADD BOOK MODAL -->
    <!-- ================================= -->

    <div
      v-if="showAddBookModal"
      class="modal-overlay"
      @click.self="closeAddBookModal"
    >
      <div class="modal-content">
        <h2>Add New Book</h2>

        <p class="modal-description">
          Enter the book details.
        </p>

        <form @submit.prevent="addBook">

          <label>
            ISBN
            <input
              v-model="newBook.isbn"
              type="text"
              placeholder="Enter ISBN"
            />
          </label>

          <label>
            Book Title *
            <input
              v-model="newBook.title"
              type="text"
              placeholder="Enter book title"
              required
            />
          </label>

          <label>
            Author
            <input
              v-model="newBook.author"
              type="text"
              placeholder="Enter author"
            />
          </label>

          <label>
            Category
            <input
              v-model="newBook.category"
              type="text"
              placeholder="Enter category"
            />
          </label>

          <label>
            Shelf Location
            <input
              v-model="newBook.shelf_location"
              type="text"
              placeholder="Example: Shelf A-01"
            />
          </label>

          <label>
            Total Copies *
            <input
              v-model.number="newBook.total_copies"
              type="number"
              min="1"
              step="1"
              required
            />
          </label>

          <p v-if="newBookError" class="error-message">
            {{ newBookError }}
          </p>

          <div class="modal-actions">
            <button
              type="button"
              class="action-button cancel-button"
              :disabled="savingBook"
              @click="closeAddBookModal"
            >
              Cancel
            </button>

            <button
              type="submit"
              class="action-button approve-button"
              :disabled="savingBook"
            >
              {{ savingBook ? 'Saving...' : 'Save Book' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ================================= -->
    <!-- CONFIRMATION MODAL -->
    <!-- ================================= -->

    <div
      v-if="showConfirmation"
      class="modal-overlay"
      @click.self="closeConfirmation"
    >
      <div class="modal-content confirmation-modal">
        <div class="confirmation-icon">!</div>

        <h2>{{ confirmationTitle }}</h2>

        <p class="modal-description">
          {{ confirmationMessage }}
        </p>

        <p v-if="actionError" class="error-message">
          {{ actionError }}
        </p>

        <div class="modal-actions">
          <button
            type="button"
            class="action-button cancel-button"
            :disabled="processing"
            @click="closeConfirmation"
          >
            Go Back
          </button>

          <button
            type="button"
            class="action-button approve-button"
            :class="{ 'danger-button': confirmationAction === 'Cancel' }"
            :disabled="processing"
            @click="confirmRequest"
          >
            {{ processing ? 'Processing...' : confirmationAction === 'Return' ? 'Confirm Return' : confirmationAction }}
          </button>
        </div>
      </div>
    </div>

  </main>
</template>

<style scoped>
.books-page {
  min-height: 100vh;
  padding: 24px;
  background: #eedfdf;
  color: #39070a;
  font-family: Arial, Helvetica, sans-serif;
}

.page-heading h1 {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 25px;
  font-weight: 500;
}

.page-heading p {
  margin: 5px 0 20px;
  color: #70595a;
  font-size: 12px;
}

.book-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.tab-button {
  padding: 10px 17px;
  border: 1px solid #a76c70;
  border-radius: 25px;
  background: #f8eeee;
  color: #39070a;
  font-size: 12px;
  cursor: pointer;
}

.tab-button.active {
  border-color: #570910;
  background: #570910;
  color: white;
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  margin-left: 5px;
  padding: 0 5px;
  border-radius: 20px;
  background: white;
  color: #570910;
  font-size: 10px;
}

.section-toolbar,
.catalog-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid #c4a1a2;
  border-radius: 10px;
  background: #f8eeee;
  font-size: 12px;
}

.catalog-toolbar {
  justify-content: flex-start;
}

.search-input {
  flex: 1;
  min-width: 120px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid #bd9194;
  border-radius: 6px;
  outline: none;
  background: white;
  color: #39070a;
  font-size: 12px;
}

.search-input:focus {
  border-color: #570910;
}

.refresh-button,
.add-book-button {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #570910;
  border-radius: 6px;
  background: #570910;
  color: white;
  font-size: 11px;
  cursor: pointer;
}

.refresh-button:hover,
.add-book-button:hover {
  background: #74121b;
}

.refresh-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.table-container {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #c4a1a2;
  border-radius: 10px;
  background: #f8eeee;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.data-table th {
  padding: 13px;
  background: #f1e3e3;
  color: #542d30;
  font-size: 10px;
  text-transform: uppercase;
  white-space: nowrap;
}

.data-table td {
  padding: 13px;
  border-top: 1px solid #e6d2d2;
  color: #39070a;
  font-size: 11px;
  vertical-align: middle;
}

.data-table td strong,
.data-table td small {
  display: block;
}

.data-table td small {
  margin-top: 4px;
  color: #795f60;
  font-size: 10px;
}

.data-table tbody tr:hover {
  background: #f4e6e6;
}

.table-actions {
  display: flex;
  gap: 6px;
}

.action-button {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid #570910;
  border-radius: 6px;
  font-size: 10px;
  cursor: pointer;
  white-space: nowrap;
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.approve-button {
  background: #570910;
  color: white;
}

.approve-button:hover {
  background: #74121b;
}

.cancel-button {
  background: #f8eeee;
  color: #570910;
}

.cancel-button:hover {
  background: #ead6d7;
}

.return-button {
  border-color: #28744b;
  background: #28744b;
  color: white;
}

.return-button:hover {
  background: #1f603d;
}

.danger-button {
  border-color: #bd2020;
  background: #bd2020;
}

.status {
  display: inline-block;
  padding: 5px 9px;
  border-radius: 20px;
  background: #ead6d7;
  color: #542d30;
  font-size: 9px;
  font-weight: 600;
  white-space: nowrap;
}

.status.pending {
  background: #f3e4ae;
  color: #795d13;
}

.status.cancelled,
.status.rejected {
  background: #f4cccc;
  color: #9c1d1d;
}

.status.completed,
.status.returned,
.status.available {
  background: #cce8d4;
  color: #28613d;
}

.status.borrowed {
  background: #ecdda8;
  color: #6a4b18;
}

.status.unavailable {
  background: #f4cccc;
  color: #9c1d1d;
}

.history-section {
  margin-top: 25px;
}

.return-requests-section {
  margin-bottom: 25px;
}

.history-section h3 {
  margin: 0 0 12px;
  color: #542d30;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 18px;
  font-weight: 500;
}

.waiting-return {
  color: #795f60;
  font-size: 10px;
  white-space: nowrap;
}

.empty-cell {
  padding: 25px !important;
  color: #795f60 !important;
  text-align: center;
}

.error-message {
  margin: 10px 0;
  padding: 10px;
  border-radius: 6px;
  background: #f4dada;
  color: #a00000;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.success-message {
  margin-bottom: 15px;
  padding: 10px;
  border: 1px solid #a7d1b4;
  border-radius: 6px;
  background: #e1f2e5;
  color: #245c3b;
  font-size: 11px;
}

.modal-overlay {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgb(20 12 12 / 45%);
}

.modal-content {
  width: min(100%, 480px);
  max-height: 90vh;
  overflow-y: auto;
  padding: 23px;
  border: 1px solid #ead1d1;
  border-radius: 12px;
  background: #fff6f3;
  box-shadow: 0 12px 35px rgb(40 0 0 / 20%);
}

.modal-content h2 {
  margin: 0 0 7px;
  color: #39070a;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 22px;
}

.modal-description {
  margin: 0 0 17px;
  color: #795f60;
  font-size: 12px;
  line-height: 1.5;
}

.modal-content form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-content label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #542d30;
  font-size: 11px;
  font-weight: 600;
}

.modal-content input {
  width: 100%;
  min-height: 37px;
  padding: 8px 10px;
  border: 1px solid #bd9194;
  border-radius: 6px;
  outline: none;
  background: white;
  color: #39070a;
  font-size: 12px;
}

.modal-content input:focus {
  border-color: #570910;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.confirmation-modal {
  max-width: 420px;
}

.confirmation-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  margin-bottom: 14px;
  border-radius: 50%;
  background: #ead6d7;
  color: #570910;
  font-size: 25px;
  font-weight: bold;
}

@media (max-width: 700px) {
  .books-page {
    padding: 15px;
  }

  .catalog-toolbar {
    flex-wrap: wrap;
  }

  .search-input {
    flex-basis: 100%;
  }

  .data-table {
    min-width: 750px;
  }

  .tab-button {
    padding: 9px 12px;
  }

  .section-toolbar {
    flex-wrap: wrap;
  }
}
</style>
