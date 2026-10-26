<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase.js'
import '../assets/styles/requests.css'

const requests = ref([])
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
const activeFilter = ref('All')

const form = ref({
  office: 'Registrar',
  serviceId: '',
  details: '',
})

const filters = [
  { value: 'All', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'ready_for_pickup', label: 'Ready for Pickup' },
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
const filteredRequests = computed(() => activeFilter.value === 'All'
  ? requests.value
  : requests.value.filter((request) => request.status === activeFilter.value))
const selectedService = computed(() => services.value.find(
  (service) => service.id === form.value.serviceId,
))

function apiUrl(path) {
  return `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${path}`
}

async function apiRequest(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.')

  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.error || 'The request could not be completed.')
  }
  return payload
}

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
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  return labels[status] || status
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
      service: request.title || request.office_services?.name || 'Service request',
    }))
  } catch (error) {
    console.error('Error fetching requests:', error)
    loadError.value = error.message || 'Could not load your requests.'
  } finally {
    loading.value = false
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

  services.value = (data || []).filter((service) => service.offices?.name !== 'Cashier')
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
      <button class="request-primary" type="button" @click="showForm ? cancelForm() : openForm()">
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
          class="request-primary"
          type="button"
          :disabled="!availableServices.length || !!serviceError"
          @click="reviewRequest"
        >
          Review and Submit
        </button>
        <button v-else class="request-primary" type="button" :disabled="submitting" @click="submitRequest">
          {{ submitting ? 'Submitting…' : 'Confirm and Submit' }}
        </button>
      </div>
    </section>

    <template v-else>
      <nav class="request-filters" aria-label="Filter requests by status">
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

      <div v-if="loading" class="request-empty" role="status">Loading your requests…</div>

      <section v-else-if="!loadError && filteredRequests.length" class="request-list">
        <article v-for="item in filteredRequests" :key="item.id" class="request-card">
          <div class="request-card-top">
            <div>
              <p class="request-reference">
                {{ item.office }} · Reference {{ String(item.id).slice(0, 8).toUpperCase() }}
              </p>
              <h2 class="request-title">{{ item.title || item.service }}</h2>
            </div>
            <span class="request-status" :class="item.status.toLowerCase().replace(/[\s_]+/g, '-')">
              {{ requestStatusLabel(item.status) }}
            </span>
          </div>

          <p class="request-details">{{ item.details || item.title || item.service }}</p>
          <p class="request-description">{{ statusDescription(item.status, item.office) }}</p>
          <div class="request-dates">
            <div>
              <span>Submitted</span>
              <strong>{{ formatDate(item.submitted_at || item.created_at) }}</strong>
            </div>
            <div v-if="item.expected_completion_at || item.expected_at">
              <span>Expected completion</span>
              <strong>{{ formatDate(item.expected_completion_at || item.expected_at) }}</strong>
            </div>
            <div>
              <span>Last updated</span>
              <strong>{{ formatDate(item.updated_at || item.submitted_at || item.created_at) }}</strong>
            </div>
          </div>
          <p v-if="item.status === 'ready_for_pickup'" class="request-help">
            Your document is ready for pickup at the {{ item.office }}.
          </p>
          <div class="request-card-actions">
            <button class="request-outline" type="button" @click="selectedRequest = item">View Details</button>
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
        <h2>{{ activeFilter === 'All' ? 'No requests yet' : `No ${requestStatusLabel(activeFilter).toLowerCase()} requests` }}</h2>
        <p>
          {{ activeFilter === 'All'
            ? 'Your submitted campus service requests and status updates will appear here.'
            : 'There are no requests with this status.' }}
        </p>
        <button v-if="activeFilter === 'All'" class="request-primary" type="button" @click="openForm">
          Submit a Request
        </button>
      </section>
    </template>

    <div v-if="selectedRequest" class="request-modal-overlay" @click.self="selectedRequest = null">
      <section class="request-modal" role="dialog" aria-modal="true" aria-labelledby="request-detail-title">
        <header class="request-modal-heading">
          <div>
            <p class="request-eyebrow">{{ selectedRequest.office }}</p>
            <h3 id="request-detail-title">{{ selectedRequest.service }}</h3>
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
        <p class="request-detail-copy">{{ selectedRequest.details || 'No additional details were provided.' }}</p>
        <p v-if="selectedRequest.status === 'ready_for_pickup'" class="request-help">
          Your document is ready for pickup at the {{ selectedRequest.office }}.
        </p>
        <div class="request-form-actions">
          <button class="request-primary" type="button" @click="selectedRequest = null">Close</button>
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
  </section>
</template>
