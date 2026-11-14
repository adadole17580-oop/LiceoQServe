<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { apiRequest } from '../lib/api.js'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { useStudentDataSync } from '../composables/useStudentDataSync.js'
import '../assets/styles/requests.css'

const route = useRoute()
const requests = ref([])
const loans = ref([])
const services = ref([])
const loading = ref(true)
const loadError = ref('')
const serviceError = ref('')
const notice = ref('')
const formError = ref('')
const submitting = ref(false)
const showForm = ref(false)
const showReview = ref(false)
const selectedRequest = ref(null)
const requestToCancel = ref(null)
const cancellingRequest = ref(false)
const returnLoanToConfirm = ref(null)
const submittingReturn = ref(false)
const loanLoadError = ref('')
const activeFilter = ref('All')

const form = ref({
  office: 'Registrar',
  serviceId: '',
  details: '',
})

const filters = [
  { value: 'All', label: 'All' },
  { value: 'Books', label: 'Books' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'ready_for_pickup', label: 'Ready for Pickup' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]
const offices = computed(() => [...new Set(
  services.value
    .map((service) => service.offices?.name)
    .filter((name) => name && name !== 'Cashier'),
)])
const availableServices = computed(() => services.value.filter(
  (service) => service.offices?.name === form.value.office,
))
const requestItems = computed(() => {
  const items = requests.value.map((request) => ({
    ...request,
    loan: findRequestLoan(request),
  }))
  const linkedRequestIds = new Set(requests.value.map((request) => request.id))
  for (const loan of loans.value) {
    if (loan.source_request_id && linkedRequestIds.has(loan.source_request_id)) continue
    items.push({
      id: `loan-${loan.id}`,
      title: `Book Borrow Request: ${loan.library_books?.title || 'Library Book'}`,
      request_type: 'Book Borrowing',
      details: '',
      status: 'confirmed',
      databaseStatus: 'confirmed',
      submitted_at: loan.borrowed_at,
      office: 'Library',
      service: 'Book Borrowing',
      book_id: loan.book_id,
      library_books: loan.library_books,
      loan,
      syntheticLoan: true,
    })
  }
  return items.sort((left, right) => (
    new Date(right.submitted_at || right.created_at || 0) -
    new Date(left.submitted_at || left.created_at || 0)
  ))
})
const filteredRequests = computed(() => {
  if (activeFilter.value === 'All') {
    return requestItems.value
  }
  if (activeFilter.value === 'Books') {
    return requestItems.value.filter((request) => isBookRequest(request))
  }
  return requestItems.value.filter((request) => request.status === activeFilter.value)
})
const selectedService = computed(() => services.value.find(
  (service) => service.id === form.value.serviceId,
))
const returnConfirmationMessage = computed(() => {
  const loan = returnLoanToConfirm.value
  if (!loan) return ''
  const title = loan.library_books?.title || 'Library Book'
  return `Book: ${title}. Author: ${loan.library_books?.author || 'Not listed'}. Loan due: ${formatDate(loan.due_at)}. Confirming submits a return request only. You must physically return the book to Library staff; the loan remains Borrowed until staff verifies receipt.`
})

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function statusDescription(status, office) {
  const descriptions = {
    pending: 'Your request has been received and is waiting for review.',
    processing: `The ${office} is currently processing your request.`,
    ready_for_pickup: `Your document is ready for pickup at the ${office}.`,
    confirmed: 'The Library confirmed your borrowing request and issued a book loan.',
    rejected: 'The office could not approve this request.',
    completed: 'This request has been completed.',
    cancelled: 'This request has been cancelled.',
  }
  return descriptions[status] || 'The office will update this request as it progresses.'
}

function normalizeRequestStatus(status) {
  const normalized = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return normalized === 'submitted' ? 'pending' : normalized
}

function isPendingRequest(request) {
  return request.databaseStatus === 'pending'
}

function requestStatusLabel(status) {
  const labels = {
    pending: 'Pending',
    processing: 'Processing',
    ready_for_pickup: 'Ready for Pickup',
    confirmed: 'Confirmed',
    rejected: 'Rejected',
    borrowed: 'Borrowed',
    completed: 'Completed',
    cancelled: 'Cancelled',
    Books: 'Books',
  }
  return labels[status] || status
}

function findRequestLoan(request) {
  const returnLoanId = request.book_loan_id ||
    request.details?.match(/Return request for loan\s+([0-9a-f-]+)/i)?.[1]
  if (returnLoanId) return loans.value.find((loan) => loan.id === returnLoanId) || null
  return loans.value.find((loan) => loan.source_request_id === request.id) || null
}

function isBookRequest(request) {
  return Boolean(
    request.book_id ||
    request.book_loan_id ||
    request.syntheticLoan ||
    /^Book (Borrow|Return) Request:/i.test(request.title || ''),
  )
}

function bookTitle(request) {
  return request.library_books?.title ||
    request.loan?.library_books?.title ||
    request.title?.replace(/^Book (Borrow|Return) Request:\s*/i, '') ||
    'Library Book'
}

function bookTransactionType(request) {
  if (request.syntheticLoan) return 'Borrowing'
  return /^Book Return Request:/i.test(request.title || '') ? 'Return Request' : 'Borrowing Request'
}

function loanStatusLabel(status) {
  const normalized = String(status || '').trim().toLowerCase()
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : '—'
}

function hasOpenReturnRequest(loan) {
  return requests.value.some((request) => {
    const linkedLoanId = request.book_loan_id ||
      request.details?.match(/Return request for loan\s+([0-9a-f-]+)/i)?.[1]
    return linkedLoanId === loan.id && ['pending', 'processing'].includes(request.status)
  })
}

function canRequestReturn(request) {
  return Boolean(
    request.loan &&
    String(request.loan.status || '').trim().toLowerCase() === 'borrowed' &&
    !hasOpenReturnRequest(request.loan),
  )
}

function openReturnConfirmation(loan) {
  formError.value = ''
  returnLoanToConfirm.value = loan
}

function closeReturnConfirmation(isOpen) {
  if (!isOpen && !submittingReturn.value) returnLoanToConfirm.value = null
}

async function fetchMyRequests() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await apiRequest('/api/requests/my')
    requests.value = (data.requests || []).map((request) => ({
      ...request,
      databaseStatus: request.status,
      status: normalizeRequestStatus(request.status),
      office: request.office_services?.offices?.name || 'Campus Office',
      service: request.request_type || request.office_services?.name || 'Service request',
    }))
    try {
      const loanData = await apiRequest('/api/library/my-loans')
      loans.value = loanData.loans || []
      loanLoadError.value = ''
    } catch (error) {
      console.error('Error fetching Library loans for My Requests:', error)
      loans.value = []
      loanLoadError.value = error.message || 'Book loan details could not be loaded.'
    }
    const recordId = typeof route.query.record === 'string' ? route.query.record : ''
    if (recordId) {
      selectedRequest.value = requestItems.value.find((request) => request.id === recordId) || null
    } else if (selectedRequest.value) {
      selectedRequest.value = requestItems.value.find((request) => request.id === selectedRequest.value.id) || null
    }
  } catch (error) {
    console.error('Error fetching requests:', error)
    loadError.value = error.message || 'Could not load your requests.'
  } finally {
    loading.value = false
  }
}

async function submitReturnRequest() {
  const loan = returnLoanToConfirm.value
  if (!loan || submittingReturn.value) return

  submittingReturn.value = true
  formError.value = ''
  try {
    const result = await apiRequest('/api/library/return-request', {
      method: 'POST',
      body: JSON.stringify({ loanId: loan.id }),
    })
    notice.value = result.message || 'Your return request was submitted to the Library.'
    returnLoanToConfirm.value = null
    await fetchMyRequests()
  } catch (error) {
    console.error('Error submitting book return request:', error)
    formError.value = error.message || 'Could not submit the return request.'
  } finally {
    submittingReturn.value = false
  }
}

async function fetchServices() {
  serviceError.value = ''
  const { data, error } = await supabase
    .from('office_services')
    .select('id, name, office_id, offices!inner(name, is_active)')
    .eq('is_active', true)
    .eq('offices.is_active', true)
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching request services:', error)
    serviceError.value = 'Request types could not be loaded. Please try again later.'
    return
  }

  services.value = (data || []).filter((service) => {
    const officeName = String(service.offices?.name || '').trim().toLowerCase()
    return officeName !== 'cashier' && officeName !== 'guidance'
  })
  if (offices.value.length && !offices.value.includes(form.value.office)) {
    form.value.office = offices.value[0]
  }
  changeOffice()
}

function changeOffice() {
  form.value.serviceId = availableServices.value[0]?.id || ''
}

function openForm() {
  form.value = {
    office: offices.value.includes('Registrar') ? 'Registrar' : (offices.value[0] || ''),
    serviceId: '',
    details: '',
  }
  changeOffice()
  formError.value = ''
  showReview.value = false
  showForm.value = true
}

function cancelForm() {
  showForm.value = false
  showReview.value = false
  formError.value = ''
  form.value = {
    office: offices.value.includes('Registrar') ? 'Registrar' : (offices.value[0] || ''),
    serviceId: '',
    details: '',
  }
}

function reviewRequest() {
  formError.value = ''
  if (!selectedService.value) {
    formError.value = 'Select an available request type before continuing.'
    return
  }
  showReview.value = true
}

async function submitRequest() {
  if (!selectedService.value || submitting.value) return
  submitting.value = true
  formError.value = ''
  try {
    await apiRequest('/api/requests/submit', {
      method: 'POST',
      body: JSON.stringify({
        serviceId: selectedService.value.id,
        requestType: selectedService.value.name,
        title: selectedService.value.name,
        details: form.value.details.trim() || selectedService.value.name,
      }),
    })
    showForm.value = false
    showReview.value = false
    activeFilter.value = 'All'
    notice.value = 'Your request has been submitted successfully.'
    await fetchMyRequests()
  } catch (error) {
    console.error('Error submitting request:', error)
    formError.value = error.message || 'Failed to submit your request. Please try again.'
  } finally {
    submitting.value = false
  }
}

function openRequestReschedule(request) {
  notice.value = `Rescheduling is not available for service requests yet. Please contact ${request.office} for assistance.`
}

async function confirmCancelRequest() {
  if (!requestToCancel.value || cancellingRequest.value) return
  cancellingRequest.value = true
  formError.value = ''

  try {
    await apiRequest('/api/requests/cancel-own', {
      method: 'POST',
      body: JSON.stringify({ requestId: requestToCancel.value.id }),
    })
    notice.value = 'Your request was cancelled.'
    requestToCancel.value = null
    await fetchMyRequests()
  } catch (error) {
    console.error('Error cancelling request:', error)
    formError.value = error.message || 'Could not cancel this request. Please try again.'
  } finally {
    cancellingRequest.value = false
  }
}

useStudentDataSync(fetchMyRequests, [{ table: 'service_requests' }])

onMounted(() => {
  fetchMyRequests()
  fetchServices()
})
</script>

<template>
  <section class="page-content requests-page">
    <header class="requests-heading">
      <div>
        <h1 class="page-heading">My Requests</h1>
        <p class="page-subtitle">Track long-running transactions from submission to completion.</p>
      </div>
      <button
        class="request-primary"
        :class="showForm ? 'request-outline' : 'primary-action-button'"
        type="button"
        @click="showForm ? cancelForm() : openForm()"
      >
        {{ showForm ? 'Close Form' : 'Submit Request' }}
      </button>
    </header>

    <p v-if="notice" class="request-notice" role="status">
      {{ notice }}
      <button type="button" aria-label="Dismiss notice" @click="notice = ''">×</button>
    </p>

    <section v-if="showForm" class="request-form-panel" aria-labelledby="request-form-title">
      <header class="request-modal-heading">
        <div>
          <p class="request-eyebrow">CAMPUS SERVICES</p>
          <h2 id="request-form-title">{{ showReview ? 'Review Request' : 'Submit Request' }}</h2>
        </div>
      </header>

      <template v-if="!showReview">
        <div class="request-form-grid">
          <label class="request-field">
            Office
            <select v-model="form.office" required @change="changeOffice">
              <option v-for="office in offices" :key="office" :value="office">{{ office }}</option>
            </select>
          </label>
          <label class="request-field">
            Request Type
            <select v-model="form.serviceId" required>
              <option value="" disabled>Select a configured request type</option>
              <option v-for="service in availableServices" :key="service.id" :value="service.id">
                {{ service.name }}
              </option>
            </select>
          </label>
          <label class="request-field full-width">
            Details / Other Document
            <textarea v-model="form.details" rows="4" placeholder="Add details to help the office process your request." />
          </label>
          <p v-if="selectedService?.fee != null" class="request-fee-note full-width">
            Estimated document fee: {{ selectedService.fee }}
          </p>
          <p v-if="serviceError" class="request-error full-width" role="alert">{{ serviceError }}</p>
        </div>
      </template>

      <div v-else class="request-review">
        <p>Review the details before submitting your request.</p>
        <div><span>Office</span><strong>{{ form.office }}</strong></div>
        <div><span>Request type</span><strong>{{ selectedService?.name }}</strong></div>
        <div v-if="form.details.trim()"><span>Details</span><strong>{{ form.details }}</strong></div>
        <div v-if="selectedService?.fee != null"><span>Estimated fee</span><strong>{{ selectedService.fee }}</strong></div>
      </div>

      <p v-if="formError" class="request-error" role="alert">{{ formError }}</p>
      <div class="request-form-actions">
        <button class="request-outline" type="button" @click="showReview ? showReview = false : cancelForm()">
          {{ showReview ? 'Back' : 'Cancel Editing' }}
        </button>
        <button
          v-if="!showReview"
          class="request-primary primary-action-button"
          type="button"
          :disabled="!availableServices.length || !!serviceError"
          @click="reviewRequest"
        >
          Review and Submit
        </button>
        <button v-else class="request-primary primary-action-button" type="button" :disabled="submitting" @click="submitRequest">
          {{ submitting ? 'Submitting…' : 'Confirm and Submit' }}
        </button>
      </div>
    </section>

    <template v-else>
      <nav class="request-filters" aria-label="Filter requests">
        <button
          v-for="filter in filters"
          :key="filter.value"
          :class="{ active: activeFilter === filter.value }"
          :aria-pressed="activeFilter === filter.value"
          type="button"
          @click="activeFilter = filter.value"
        >
          {{ filter.label }}
        </button>
      </nav>

      <p v-if="loadError" class="request-error" role="alert">
        {{ loadError }}
        <button class="request-outline" type="button" @click="fetchMyRequests">Try Again</button>
      </p>
      <p v-if="activeFilter === 'Books' && loanLoadError" class="request-error" role="alert">
        {{ loanLoadError }}
        <button class="request-outline" type="button" @click="fetchMyRequests">Try Again</button>
      </p>

      <div v-if="loading" class="request-empty" role="status">Loading your requests…</div>

      <section v-else-if="!loadError && filteredRequests.length" class="request-list">
        <article v-for="item in filteredRequests" :key="item.id" class="request-card">
          <div class="request-card-top">
            <div>
              <p class="request-reference">
                {{ item.office }} · Reference {{ String(item.id).slice(0, 8).toUpperCase() }}
              </p>
              <h2 class="request-title">{{ isBookRequest(item) ? bookTitle(item) : item.title || item.service }}</h2>
            </div>
            <span class="request-status" :class="item.status.toLowerCase().replace(/[\s_]+/g, '-')">
              {{ requestStatusLabel(item.status) }}
            </span>
          </div>

          <p v-if="!isBookRequest(item)" class="request-details">{{ item.details || item.title || item.service }}</p>
          <div v-else class="request-details">
            <p><strong>Transaction:</strong> {{ bookTransactionType(item) }}</p>
            <p><strong>Request status:</strong> {{ requestStatusLabel(item.status) }}</p>
            <p v-if="item.loan"><strong>Loan status:</strong> {{ loanStatusLabel(item.loan.status) }}</p>
            <p v-if="item.loan?.due_at"><strong>Due date:</strong> {{ formatDate(item.loan.due_at) }}</p>
            <p v-else-if="loanLoadError" class="request-help">Loan details are temporarily unavailable.</p>
          </div>
          <p class="request-description">{{ statusDescription(item.status, item.office) }}</p>
          <div v-if="!item.syntheticLoan" class="request-dates">
            <div>
              <span>Submitted</span>
              <strong>{{ formatDate(item.submitted_at || item.created_at) }}</strong>
            </div>
            <div v-if="item.expected_completion">
              <span>Expected completion</span>
              <strong>{{ formatDate(item.expected_completion) }}</strong>
            </div>
            <div>
              <span>Last updated</span>
              <strong>{{ formatDate(item.updated_at || item.submitted_at || item.created_at) }}</strong>
            </div>
          </div>
          <p v-if="item.status === 'ready_for_pickup'" class="request-help">
            Your document is ready for pickup at the {{ item.office }}.
          </p>
          <p v-if="item.instructions" class="request-help">
            <strong>Office instruction:</strong> {{ item.instructions }}
          </p>
          <div class="request-card-actions">
            <button class="request-outline" type="button" @click="selectedRequest = item">View Details</button>
            <button
              v-if="canRequestReturn(item)"
              class="request-primary primary-action-button"
              type="button"
              @click="openReturnConfirmation(item.loan)"
            >
              Return Book
            </button>
            <template v-if="isPendingRequest(item)">
              <button class="request-outline" type="button" @click="openRequestReschedule(item)">Reschedule</button>
              <button
                class="request-danger"
                type="button"
                @click="requestToCancel = item"
              >
                Cancel
              </button>
            </template>
          </div>
        </article>
      </section>

      <section v-else-if="!loadError" class="request-empty">
        <h2>
          {{ activeFilter === 'Books'
            ? 'No book transactions yet'
            : activeFilter === 'All'
              ? 'No requests yet'
              : `No ${requestStatusLabel(activeFilter).toLowerCase()} requests` }}
        </h2>
        <p>
          {{ activeFilter === 'Books'
            ? 'Your Library borrowing and return transactions will appear here.'
            : activeFilter === 'All'
              ? 'Your submitted campus service requests and status updates will appear here.'
              : 'There are no requests with this status.' }}
        </p>
        <button v-if="activeFilter === 'All'" class="request-primary primary-action-button" type="button" @click="openForm">
          Submit a Request
        </button>
      </section>
    </template>

    <div v-if="selectedRequest" class="request-modal-overlay" @click.self="selectedRequest = null">
      <section class="request-modal" role="dialog" aria-modal="true" aria-labelledby="request-detail-title">
        <header class="request-modal-heading">
          <div>
            <p class="request-eyebrow">{{ selectedRequest.office }}</p>
            <h3 id="request-detail-title">{{ isBookRequest(selectedRequest) ? bookTitle(selectedRequest) : selectedRequest.service }}</h3>
          </div>
          <button class="request-close" type="button" aria-label="Close details" @click="selectedRequest = null">×</button>
        </header>
        <span class="request-status" :class="selectedRequest.status.toLowerCase().replace(/[\s_]+/g, '-')">
          {{ requestStatusLabel(selectedRequest.status) }}
        </span>
        <div class="request-detail-grid">
          <div><span>Reference</span><strong>{{ selectedRequest.id }}</strong></div>
          <div><span>Submitted</span><strong>{{ formatDate(selectedRequest.submitted_at || selectedRequest.created_at) }}</strong></div>
        </div>
        <template v-if="isBookRequest(selectedRequest)">
          <div class="request-detail-grid">
            <div><span>Transaction</span><strong>{{ bookTransactionType(selectedRequest) }}</strong></div>
            <div><span>Request status</span><strong>{{ requestStatusLabel(selectedRequest.status) }}</strong></div>
            <div v-if="selectedRequest.loan"><span>Loan status</span><strong>{{ loanStatusLabel(selectedRequest.loan.status) }}</strong></div>
            <div v-if="selectedRequest.loan?.due_at"><span>Due date</span><strong>{{ formatDate(selectedRequest.loan.due_at) }}</strong></div>
          </div>
        </template>
        <p class="request-detail-copy">{{ selectedRequest.details || 'No additional details were provided.' }}</p>
        <p v-if="selectedRequest.instructions" class="request-detail-copy">
          <strong>Office instruction:</strong> {{ selectedRequest.instructions }}
        </p>
        <p v-if="selectedRequest.expected_completion" class="request-detail-copy">
          Expected completion: {{ formatDate(selectedRequest.expected_completion) }}
        </p>
        <p v-if="selectedRequest.status === 'ready_for_pickup'" class="request-help">
          Your document is ready for pickup at the {{ selectedRequest.office }}.
        </p>
        <div class="request-form-actions">
          <button class="request-outline" type="button" @click="selectedRequest = null">Close</button>
        </div>
      </section>
    </div>

    <div v-if="requestToCancel" class="request-modal-overlay" @click.self="requestToCancel = null">
      <section class="request-modal" role="dialog" aria-modal="true" aria-labelledby="request-cancel-title">
        <header class="request-modal-heading">
          <div>
            <p class="request-eyebrow">CANCEL REQUEST</p>
            <h3 id="request-cancel-title">Cancel this request?</h3>
          </div>
          <button
            class="request-close"
            type="button"
            aria-label="Close cancellation confirmation"
            :disabled="cancellingRequest"
            @click="requestToCancel = null"
          >×</button>
        </header>
        <p class="request-detail-copy">
          Are you sure you want to cancel “{{ requestToCancel.title }}”? This can only be done while the request is pending.
        </p>
        <p v-if="formError" class="request-error" role="alert">{{ formError }}</p>
        <div class="request-form-actions">
          <button
            class="request-outline"
            type="button"
            :disabled="cancellingRequest"
            @click="requestToCancel = null"
          >
            Keep Request
          </button>
          <button
            class="request-danger"
            type="button"
            :disabled="cancellingRequest"
            @click="confirmCancelRequest"
          >
            {{ cancellingRequest ? 'Cancelling…' : 'Confirm Cancel' }}
          </button>
        </div>
      </section>
    </div>

    <ConfirmDialog
      :model-value="Boolean(returnLoanToConfirm)"
      title="Confirm Book Return Request"
      :message="returnConfirmationMessage"
      confirm-text="Submit Return Request"
      :busy="submittingReturn"
      busy-text="Submitting…"
      @update:model-value="closeReturnConfirmation"
      @confirm="submitReturnRequest"
    />
  </section>
</template>
