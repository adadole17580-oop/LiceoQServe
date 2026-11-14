
<script setup>
import {
  ref,
  computed,
  watch,
  onMounted,
  onUnmounted
} from 'vue'

import { supabase } from '../lib/Supabase.js'
import './Request.css'

const props = defineProps({
  initialFilter: {
    type: String,
    default: 'All'
  }
})

const filters = [
  'All',
  'Pending',
  'Processing',
  'Completed',
  'Cancelled'
]

const OSA_SERVICE_IDS = [
  '5c2ab6fc-5f24-4573-896a-f5a11ad6625e',
  '65a94572-bce2-460f-b3e8-2ed568ee7bbf',
  'e5121b34-a6d2-4370-a023-5153a73c97f8'
]

const requests = ref([])
const loading = ref(false)
const saving = ref(false)
const updatingStatus = ref(false)
const errorMessage = ref('')

const selectedRequestId = ref(null)
const selectedFilter = ref(
  filters.includes(props.initialFilter)
    ? props.initialFilter
    : 'All'
)

const expectedCompletion = ref('')
const customInstructions = ref('')

const showConfirmModal = ref(false)
const showSuccessModal = ref(false)
const successMessage = ref('')

let requestSubscription = null
let isMounted = false
let isFetching = false
let refreshAgain = false

// FILTERED REQUESTS
const filteredRequests = computed(() => {
  if (selectedFilter.value === 'All') {
    return requests.value
  }

  return requests.value.filter(
    request => request.displayStatus === selectedFilter.value
  )
})

const selectedRequest = computed(() => {
  return requests.value.find(
    request => request.id === selectedRequestId.value
  ) || null
})

function getDisplayStatus(status) {
  const statusMap = {
    pending: 'Pending',
    processing: 'Processing',
    ready_for_pickup: 'Ready for Pick Up',
    completed: 'Completed',
    cancelled: 'Cancelled'
  }

  return statusMap[status] || (
    status
      ? status.charAt(0).toUpperCase() + status.slice(1)
      : 'Pending'
  )
}

function getStatusClass(status) {
  return status.toLowerCase().replace(/[^a-z]+/g, '-')
}

function mapRequest(row) {
  const student = row.student || {}
  const service = row.service || {}

  return {
    id: row.id,
    reference: `REQ-${String(row.id).slice(0, 8).toUpperCase()}`,
    student: student.full_name || 'Unknown Student',
    studentId: student.student_id || 'Not available',
    email: student.university_email || '',
    service: service.name || row.title || row.request_type || 'Service Request',
    requestType: row.request_type || 'General',
    title: row.title || '',
    details: row.details || '',
    submittedAt: row.submitted_at,
    expectedCompletion: row.expected_completion || '',
    status: row.status || 'pending',
    displayStatus: getDisplayStatus(row.status),
    instructions: row.instructions || '',
    staffNotes: row.staff_notes || ''
  }
}

async function fetchRequests() {
  if (!isMounted) return

  if (isFetching) {
    refreshAgain = true
    return
  }

  isFetching = true

  try {
    do {
      refreshAgain = false
      loading.value = requests.value.length === 0
      errorMessage.value = ''

      const { data, error } = await supabase
        .from('service_requests')
        .select(`
          id,
          student_id,
          service_id,
          request_type,
          title,
          details,
          status,
          staff_notes,
          handled_by,
          submitted_at,
          updated_at,
          completed_at,
          expected_completion,
          instructions,
          instruction_template,
          instructions_sent_at,
          student:profiles!service_requests_student_id_fkey (
            id,
            student_id,
            full_name,
            university_email
          ),
          service:office_services!service_requests_service_id_fkey (
            id,
            name,
            office_id
          )
        `)
        .in('service_id', OSA_SERVICE_IDS)
        .order('submitted_at', { ascending: false })

      if (error) throw error

      requests.value = (data || []).map(mapRequest)

      if (selectedRequestId.value) {
        const updatedRequest = requests.value.find(
          request => request.id === selectedRequestId.value
        )

        if (updatedRequest && !saving.value) {
          expectedCompletion.value =
            updatedRequest.expectedCompletion || ''

          customInstructions.value =
            updatedRequest.instructions || ''
        }

        if (!updatedRequest) {
          clearSelectedRequest()
        }
      }

    } while (refreshAgain && isMounted)

  } catch (error) {
    console.error('Unable to fetch requests:', error)
    errorMessage.value = error.message || 'Unable to load requests.'

  } finally {
    isFetching = false
    loading.value = false
  }
}

function selectRequest(request) {
  if (saving.value) return

  selectedRequestId.value = request.id

  expectedCompletion.value =
    request.expectedCompletion || ''

  customInstructions.value =
    request.instructions || ''

  errorMessage.value = ''
}

function clearSelectedRequest() {
  if (saving.value) return

  selectedRequestId.value = null
  expectedCompletion.value = ''
  customInstructions.value = ''
}

function formatDate(date) {
  if (!date) return 'Not set'

  const parsed = new Date(`${date}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) return date

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatSubmittedDate(date) {
  if (!date) return 'Not available'

  const parsed = new Date(date)

  if (Number.isNaN(parsed.getTime())) {
    return 'Not available'
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila'
  })
}

function selectFilter(filter) {
  selectedFilter.value = filter
}

watch(
  () => props.initialFilter,
  (filter) => {
    selectedFilter.value = filters.includes(filter)
      ? filter
      : 'All'
  }
)

watch(selectedFilter, () => {
  if (
    selectedRequestId.value &&
    !filteredRequests.value.some(
      request => request.id === selectedRequestId.value
    )
  ) {
    clearSelectedRequest()
  }
})

function saveAndNotify() {
  if (!selectedRequest.value) {
    errorMessage.value = 'Please select a request first.'
    return
  }

  if (selectedRequest.value.status !== 'processing') {
    errorMessage.value =
      'Please confirm the request first before sending instructions or notes.'
    return
  }

  if (saving.value) return

  errorMessage.value = ''
  showConfirmModal.value = true
}

function cancelConfirmation() {
  if (saving.value) return
  showConfirmModal.value = false
}

async function confirmSaveAndNotify() {
  if (saving.value) return

  const request = selectedRequest.value

  if (!request) {
    showConfirmModal.value = false
    return
  }

  if (request.status !== 'processing') {
    showConfirmModal.value = false
    errorMessage.value =
      'The request must be confirmed before sending instructions.'
    return
  }

  saving.value = true
  errorMessage.value = ''

  try {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()

    if (userError) throw userError

    if (!user) {
      throw new Error('Your staff session has expired. Please log in again.')
    }

    const instructions = customInstructions.value.trim()

    const updateValues = {
      expected_completion: expectedCompletion.value || null,
      instructions: instructions || null,
      staff_notes: instructions || null,
      handled_by: user.id,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('service_requests')
      .update(updateValues)
      .eq('id', request.id)
      .in('service_id', OSA_SERVICE_IDS)
      .select('id, student_id')
      .maybeSingle()

    if (error) throw error

    if (!data) {
      throw new Error(
        'Request details were not saved. Check your staff permissions.'
      )
    }

    if (!data.student_id) {
      throw new Error('The request has no associated student.')
    }

    const message = instructions
      ? instructions
      : 'Your OSA service request has been updated.'

    const { error: notificationError } = await supabase
      .from('notifications')
      .insert({
        recipient_id: data.student_id,
        title: 'OSA Request Update',
        message,
        category: 'request',
        related_id: request.id,
        is_read: false
      })

    if (notificationError) {
      throw new Error(
        'Request details were saved, but notification failed: ' +
        notificationError.message
      )
    }

    const { error: timestampError } = await supabase
      .from('service_requests')
      .update({
        instructions_sent_at: new Date().toISOString()
      })
      .eq('id', request.id)

    if (timestampError) {
      console.error('Timestamp update failed:', timestampError)
    }

    await fetchRequests()

    showConfirmModal.value = false
    successMessage.value =
      'Request details saved and student notified successfully.'

    showSuccessModal.value = true

  } catch (error) {
    console.error('Unable to save request:', error)

    showConfirmModal.value = false

    window.alert(
      error.message || 'Unable to save request details.'
    )

  } finally {
    saving.value = false
  }
}

async function updateStatus(request, newStatus) {
  if (!request || updatingStatus.value || saving.value) return

  if (
    request.status === 'pending' &&
    !['processing', 'cancelled'].includes(newStatus)
  ) {
    return
  }

  if (
    request.status === 'processing' &&
    !['completed', 'cancelled'].includes(newStatus)
  ) {
    return
  }

  if (['completed', 'cancelled'].includes(request.status)) {
    return
  }

  updatingStatus.value = true
  errorMessage.value = ''

  try {
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError) throw authError

    if (!user) {
      throw new Error('Your staff session has expired.')
    }

    const { data, error } = await supabase
      .from('service_requests')
      .update({
        status: newStatus,
        handled_by: user.id,
        completed_at: newStatus === 'completed'
          ? new Date().toISOString()
          : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', request.id)
      .in('service_id', OSA_SERVICE_IDS)
      .select('id, status')
      .maybeSingle()

    if (error) throw error

    if (!data) {
      throw new Error('Request status was not updated.')
    }

    await fetchRequests()

    const messages = {
      processing:
        'Request confirmed successfully. You can now add instructions or notes.',
      completed:
        'Request marked as completed successfully.',
      cancelled:
        'Request cancelled successfully.'
    }

    successMessage.value =
      messages[newStatus] || 'Request status updated successfully.'

    showSuccessModal.value = true

  } catch (error) {
    console.error('Status update failed:', error)

    errorMessage.value =
      error.message || 'Unable to update request status.'

  } finally {
    updatingStatus.value = false
  }
}

function subscribeToRequests() {
  if (requestSubscription) return

  requestSubscription = supabase
    .channel('osa-service-requests-realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'service_requests'
      },
      () => {
        fetchRequests()
      }
    )
    .subscribe((status, error) => {
      console.log('Realtime status:', status)

      if (error) {
        console.error('Realtime error:', error)
      }

      if (status === 'SUBSCRIBED') {
        fetchRequests()
      }
    })
}

onMounted(() => {
  isMounted = true
  subscribeToRequests()
  fetchRequests()
})

onUnmounted(() => {
  isMounted = false

  if (requestSubscription) {
    supabase.removeChannel(requestSubscription)
    requestSubscription = null
  }
})
</script>

<template>
  <section class="request-page">

    <header class="request-heading">
      <h1>REQUEST MANAGEMENT</h1>
      <p>
        Manage student service requests and monitor their progress.
      </p>
    </header>

    <div class="request-workspace">

      <section class="request-list-section">

        <div class="request-list-header">
          <h2>Student requests</h2>
          <span>{{ filteredRequests.length }} found</span>
        </div>

        <div class="request-toolbar">

          <div class="request-search">
            <input
              type="text"
              placeholder="Search name, request number"
              aria-label="Search requests"
              @input="$event.target.dataset.search = $event.target.value.toLowerCase()"
            />
          </div>

          <div class="request-filters">
            <button
              v-for="filter in filters"
              :key="filter"
              type="button"
              class="request-filter"
              :class="{ active: selectedFilter === filter }"
              @click="selectFilter(filter)"
            >
              {{ filter }}
              <span>
                {{
                  filter === 'All'
                    ? requests.length
                    : requests.filter(r => r.displayStatus === filter).length
                }}
              </span>
            </button>
          </div>

        </div>

        <div v-if="loading" class="request-empty">
          Loading student requests...
        </div>

        <div
          v-else-if="errorMessage && requests.length === 0"
          class="request-empty"
        >
          {{ errorMessage }}

          <button type="button" @click="fetchRequests">
            Try Again
          </button>
        </div>

        <div v-else class="request-list">

          <article
            v-for="request in filteredRequests"
            :key="request.id"
            class="request-list-card"
            :class="{
              'request-selected':
                selectedRequestId === request.id
            }"
          >

            <div class="request-card-main">

              <div class="request-card-info">
                <strong>{{ request.student }}</strong>

                <span>
                  {{ request.reference }} · {{ request.service }}
                </span>

                <small>
                  Expected:
                  {{ formatDate(request.expectedCompletion) }}
                </small>
              </div>

              <span
                class="request-status"
                :class="getStatusClass(request.displayStatus)"
              >
                {{ request.displayStatus }}
              </span>

            </div>

            <div
              v-if="request.status === 'pending'"
              class="request-card-actions"
            >

              <button
                type="button"
                class="request-view-button"
                @click="selectRequest(request)"
              >
                View Details
              </button>

              <button
                type="button"
                class="request-confirm-button"
                :disabled="updatingStatus || saving"
                @click="updateStatus(request, 'processing')"
              >
                Confirm
              </button>

              <button
                type="button"
                class="request-cancel-action"
                :disabled="updatingStatus || saving"
                @click="updateStatus(request, 'cancelled')"
              >
                Cancel
              </button>

            </div>

            <div
              v-else
              class="request-card-actions"
            >
              <button
                type="button"
                class="request-view-button"
                @click="selectRequest(request)"
              >
                View Details
              </button>
            </div>

          </article>

          <div
            v-if="filteredRequests.length === 0"
            class="request-empty"
          >
            No student requests found.
          </div>

        </div>
      </section>

      <div
        v-if="selectedRequest"
        class="request-right-panel"
      >

        <section class="request-details">

          <div class="details-topline">
            <span>Request details</span>

            <button
              type="button"
              class="details-close"
              :disabled="saving"
              @click="clearSelectedRequest"
            >
              Close
            </button>
          </div>

          <h2>{{ selectedRequest.service }}</h2>

          <div class="request-meta">

            <div>
              <span>Student</span>
              <strong>{{ selectedRequest.student }}</strong>
            </div>

            <div>
              <span>Student ID</span>
              <strong>{{ selectedRequest.studentId }}</strong>
            </div>

            <div>
              <span>Request number</span>
              <strong>{{ selectedRequest.reference }}</strong>
            </div>

            <div>
              <span>Current status</span>
              <strong>{{ selectedRequest.displayStatus }}</strong>
            </div>

          </div>

          <div
            v-if="selectedRequest.status === 'pending'"
            class="request-pending-notice"
          >
            <strong>Request awaiting confirmation</strong>

            <p>
              Please confirm this request first before providing
              instructions or notes to the student.
            </p>
          </div>

          <template v-if="selectedRequest.status === 'processing'">

            <div class="request-field">
              <label for="expected-completion">
                Expected completion
              </label>

              <input
                id="expected-completion"
                type="date"
                v-model="expectedCompletion"
                :disabled="saving"
              />
            </div>

            <div class="request-field">
              <label for="custom-instructions">
                Instruction / Notes
              </label>

              <textarea
                id="custom-instructions"
                v-model="customInstructions"
                placeholder="Enter instructions for the student..."
                :disabled="saving"
              ></textarea>
            </div>

            <button
              type="button"
              class="request-save"
              :disabled="saving || updatingStatus"
              @click="saveAndNotify"
            >
              {{ saving ? 'Saving...' : 'Save and notify student' }}
            </button>

            <div class="request-status-actions">

              <button
                type="button"
                :disabled="updatingStatus || saving"
                @click="updateStatus(selectedRequest, 'completed')"
              >
                Completed
              </button>

              <button
                type="button"
                :disabled="updatingStatus || saving"
                @click="updateStatus(selectedRequest, 'cancelled')"
              >
                Cancelled
              </button>

            </div>

          </template>

          <div
            v-if="['completed', 'cancelled'].includes(selectedRequest.status)"
            class="request-pending-notice"
          >
            <strong>
              Request {{ selectedRequest.displayStatus }}
            </strong>

            <p>
              This request has already been
              {{ selectedRequest.displayStatus.toLowerCase() }}.
              No further instructions can be sent.
            </p>
          </div>

        </section>

        <section class="request-overview">

          <h3>Request overview</h3>

          <div class="overview-timeline">

            <div class="overview-item">
              <span class="overview-dot"></span>

              <div>
                <strong>Request submitted</strong>
                <p>
                  {{ formatSubmittedDate(selectedRequest.submittedAt) }}
                </p>
              </div>
            </div>

            <div class="overview-item">
              <span class="overview-dot"></span>

              <div>
                <strong>Current status</strong>
                <p>{{ selectedRequest.displayStatus }}</p>
              </div>
            </div>

            <div class="overview-item">
              <span class="overview-dot"></span>

              <div>
                <strong>Expected completion</strong>
                <p>
                  {{
                    expectedCompletion
                      ? formatDate(expectedCompletion)
                      : 'Not set'
                  }}
                </p>
              </div>
            </div>

          </div>
        </section>

      </div>

      <section
        v-else
        class="request-details details-placeholder"
      >
        Select a student request to view its details.
      </section>

    </div>

    <Teleport to="body">

      <div
        v-if="showConfirmModal"
        class="request-success-overlay"
        @click.self="cancelConfirmation"
      >
        <div
          class="request-success-modal"
          role="dialog"
          aria-modal="true"
        >
          <div class="request-success-header">
            <div class="request-confirm-icon">?</div>
            <h2>Confirm Request</h2>
          </div>

          <p class="request-success-message">
            Are you sure you want to save the request details
            and notify {{ selectedRequest?.student }}?

            <br><br>

            Custom instructions are optional. You can proceed
            without adding any instructions.
          </p>

          <div class="request-success-actions">
            <button
              type="button"
              class="request-cancel-button"
              :disabled="saving"
              @click="cancelConfirmation"
            >
              Cancel
            </button>

            <button
              type="button"
              class="request-success-button"
              :disabled="saving"
              @click="confirmSaveAndNotify"
            >
              {{ saving ? 'Saving...' : 'Confirm' }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="showSuccessModal"
        class="request-success-overlay"
        @click.self="showSuccessModal = false"
      >
        <div
          class="request-success-modal"
          role="dialog"
          aria-modal="true"
        >
          <div class="request-success-header">
            <div class="request-success-icon">✓</div>
            <h2>Success!</h2>
          </div>

          <p class="request-success-message">
            {{ successMessage }}
          </p>

          <div class="request-success-actions">
            <button
              type="button"
              class="request-success-button"
              @click="showSuccessModal = false"
            >
              OK
            </button>
          </div>
        </div>
      </div>

    </Teleport>

  </section>
</template>
