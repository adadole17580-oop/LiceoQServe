<template>
  <div class="requests-page">
    <div class="page-heading">
      <h1>Request Management</h1>
      <p>Update status, expected completion, and transaction-specific instructions.</p>
    </div>

    <!-- STATUS FILTERS -->
    <div class="status-filters">
      <button
        v-for="status in statuses"
        :key="status"
        type="button"
        class="filter-button"
        :class="{ active: activeStatus === status }"
        @click="setStatus(status)"
      >
        <span v-if="status === 'All'" class="all-icon">▦</span>
        {{ status }}
        <span v-if="status !== 'All'" class="filter-count">
          {{ countStatus(status) }}
        </span>
      </button>
    </div>

    <!-- SORT AND REFRESH -->
    <div class="sort-row">
      <label for="request-sort">Sort by</label>

      <select id="request-sort" v-model="sortBy">
        <option value="expected">Expected completion</option>
        <option value="oldest">Oldest</option>
        <option value="updated">Recently updated</option>
      </select>

      <button
        type="button"
        class="refresh-button"
        :disabled="loading"
        @click="loadRequests"
      >
        {{ loading ? 'Refreshing...' : 'Refresh' }}
      </button>
    </div>

    <!-- MAIN LAYOUT -->
    <section class="requests-layout">
      <!-- LEFT: REQUEST LIST -->
      <div class="request-list-panel">
        <div class="panel-heading">
          <h2>Requests</h2>
          <span class="filter-count">{{ filteredRequests.length }}</span>
        </div>

        <div class="request-list">
          <div v-if="loading" class="empty-state">
            <p>Loading requests...</p>
          </div>

          <div v-else-if="loadError" class="empty-state">
            <h2>Unable to load requests</h2>
            <p>{{ loadError }}</p>
            <button
              type="button"
              class="action-button secondary"
              @click="loadRequests"
            >
              Try Again
            </button>
          </div>

          <template v-else>
            <article
              v-for="request in filteredRequests"
              :key="request.databaseId"
              class="request-card"
              :class="{
                selected: selectedRequest?.databaseId === request.databaseId
              }"
              role="button"
              tabindex="0"
              @click="selectRequest(request)"
              @keydown.enter="selectRequest(request)"
              @keydown.space.prevent="selectRequest(request)"
            >
              <div class="request-topline">
                <span class="request-student">
                  {{ request.studentName }}
                </span>

                <span
                  class="status-badge"
                  :class="statusClass(request.status)"
                >
                  {{ request.status }}
                </span>
              </div>

              <p class="request-description">
                {{ request.reference }} · {{ request.documentType }}
              </p>

              <p class="request-date">
                Submitted: {{ formatDateTime(request.createdAt) }}
              </p>

              <p class="request-date">
                Expected: {{ formatDate(request.expectedCompletion) }}
              </p>
            </article>

            <div v-if="filteredRequests.length === 0" class="empty-state">
              <div class="empty-symbol">▦</div>
              <h2>No requests found</h2>
              <p>There are no requests under this status.</p>

              <button
                type="button"
                class="action-button secondary"
                @click="activeStatus = 'All'"
              >
                View All Requests
              </button>
            </div>
          </template>
        </div>
      </div>

      <!-- RIGHT: REQUEST DETAILS -->
      <div class="request-details-panel">
        <template v-if="selectedRequest">
          <!-- DETAILS HEADER -->
          <div class="details-header">
            <div>
              <span class="details-eyebrow">REQUEST DETAILS</span>
              <h2>{{ selectedRequest.title }}</h2>
              <p class="details-subtitle">
                {{ selectedRequest.reference }} ·
                {{ selectedRequest.documentType }}
              </p>
            </div>

            <button
              type="button"
              class="close-button"
              :disabled="saving"
              @click="closeDetails"
            >
              Close
            </button>
          </div>

          <!-- STUDENT INFORMATION -->
          <div class="details-section">
            <div class="information-grid">
              <div class="information-item">
                <span class="field-label">Student</span>
                <strong class="field-value">
                  {{ selectedRequest.studentName }}
                </strong>
              </div>

              <div class="information-item">
                <span class="field-label">Student ID</span>
                <strong class="field-value">
                  {{ selectedRequest.studentId }}
                </strong>
              </div>
            </div>
          </div>

          <!-- REQUEST INFORMATION -->
          <div class="details-section">
            <div class="information-grid">
              <div class="information-item">
                <span class="field-label">Request number</span>
                <strong class="field-value">
                  {{ selectedRequest.reference }}
                </strong>
              </div>

              <div class="information-item">
                <span class="field-label">Expected completion</span>
                <strong class="field-value">
                  {{ formatDate(selectedRequest.expectedCompletion) }}
                </strong>
              </div>
            </div>

            <div class="form-field expected-field">
              <label for="expected-completion">
                Expected completion date
              </label>

              <input
                id="expected-completion"
                v-model="selectedRequest.expectedCompletion"
                type="date"
                :disabled="saving"
              />
            </div>
          </div>

          <!-- INSTRUCTIONS -->
          <div class="instructions-section">
            <div class="form-field">
              <label for="instruction-template">
                Instruction template
              </label>

              <select
                id="instruction-template"
                v-model="selectedRequest.instructionTemplate"
                :disabled="saving"
                @change="applyTemplate"
              >
                <option value="">Choose a template</option>
                <option value="pickup">Document pickup instructions</option>
                <option value="processing">Processing instructions</option>
                <option value="requirements">Additional requirements</option>
              </select>
            </div>

            <div class="form-field custom-instructions-field">
              <label for="custom-instructions">
                Custom instructions
              </label>

              <textarea
                id="custom-instructions"
                v-model="selectedRequest.instructions"
                :disabled="saving"
                rows="5"
                placeholder="Enter instructions for the student..."
              ></textarea>

              <span class="textarea-hint">
                Write a message for the student. You can resize this box.
              </span>
            </div>

            <!-- LAST RECORDED -->
            <div
              v-if="selectedRequest.instructionsSentAt"
              class="instruction-history"
            >
              <span class="history-label">Last recorded:</span>
              <strong>
                {{ formatDateTime(selectedRequest.instructionsSentAt) }}
              </strong>
            </div>

            <!-- SAVE AND NOTIFY -->
            <button
              type="button"
              class="save-notify-button"
              :disabled="saving"
              @click="saveChanges(true)"
            >
              {{ saving ? 'Saving...' : 'Save and notify student' }}
            </button>
          </div>

          <!-- STATUS BUTTONS -->
          <div class="status-actions-section">
            <div class="status-action-buttons">
              <button
                v-for="status in requestStatuses"
                :key="status"
                type="button"
                class="status-action-button"
                :class="{
                  'current-status': selectedRequest.status === status
                }"
                :disabled="saving || selectedRequest.status === status"
                @click="requestStatusChange(status)"
              >
                {{ status }}
              </button>
            </div>
          </div>

          <!-- SAVE FEEDBACK -->
          <p
            v-if="message"
            class="save-message"
            :class="{ error: messageType === 'error' }"
            role="status"
          >
            {{ message }}
          </p>
        </template>

        <div v-else class="details-empty-state">
          <div class="empty-symbol">▤</div>
          <p>Select a request to open its details.</p>
        </div>
      </div>
    </section>

    <!-- STATUS CONFIRMATION POPUP -->
    <Transition name="modal">
      <div
        v-if="showStatusConfirmation"
        class="confirmation-overlay"
        @click.self="cancelStatusChange"
      >
        <div
          class="confirmation-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirmation-title"
        >
          <div class="confirmation-heading">
            <div class="confirmation-icon">!</div>

            <h2 id="confirmation-title">
              Change Status to {{ pendingStatus }}?
            </h2>
          </div>

          <p>
            The request timeline will update and the student will receive
            a notification.
          </p>

          <div class="confirmation-actions">
            <button
              type="button"
              class="action-button secondary"
              :disabled="saving"
              @click="cancelStatusChange"
            >
              Go Back
            </button>

            <button
              type="button"
              class="action-button primary"
              :disabled="saving"
              @click="confirmStatusChange"
            >
              {{ saving ? 'Updating...' : 'Confirm status change' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- FEEDBACK TOAST -->
    <div
      v-if="message && !selectedRequest"
      class="feedback-message"
      role="status"
    >
      <span>✓</span>
      {{ message }}

      <button
        type="button"
        aria-label="Dismiss"
        @click="message = ''"
      >
        ×
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'

const REGISTRAR_OFFICE_ID =
  '00409abc-cb88-480e-bdc0-5b94ac322ae7'

const statuses = [
  'All',
  'Pending',
  'Processing',
  'Ready for Pickup',
  'Claimed',
  'Completed'
]

const requestStatuses = [
  'Pending',
  'Processing',
  'Ready for Pickup',
  'Claimed',
  'Completed'
]

const templates = {
  pickup: 'Bring your valid school ID and request receipt.',
  processing: 'Your request is being processed. Please wait for an update.',
  requirements: 'Please prepare the required documents for verification.'
}

const activeStatus = ref('All')
const sortBy = ref('expected')

const selectedRequest = ref(null)
const requests = ref([])

const message = ref('')
const messageType = ref('success')

const loading = ref(false)
const saving = ref(false)
const loadError = ref('')

const showStatusConfirmation = ref(false)
const pendingStatus = ref('')
const previousStatus = ref('')

const filteredRequests = computed(() => {
  const result = requests.value.filter(request =>
    activeStatus.value === 'All' ||
    request.status === activeStatus.value
  )

  return [...result].sort((a, b) => {
    if (sortBy.value === 'oldest') {
      return (a.createdAt || '').localeCompare(b.createdAt || '')
    }

    if (sortBy.value === 'updated') {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '')
    }

    return (a.expectedCompletion || '9999-12-31')
      .localeCompare(b.expectedCompletion || '9999-12-31')
  })
})

function normalizeStatus(status) {
  const value = (status || '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .trim()

  const statusMap = {
    pending: 'Pending',
    processing: 'Processing',
    'in progress': 'Processing',
    'ready for pickup': 'Ready for Pickup',
    claimed: 'Claimed',
    completed: 'Completed'
  }

  return statusMap[value] || formatStatus(status)
}

function formatStatus(status) {
  if (!status) return 'Pending'

  return status
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function makeReference(id) {
  return `REQ-${id.slice(0, 8).toUpperCase()}`
}

async function loadRequests() {
  loading.value = true
  loadError.value = ''

  try {
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
        profiles:student_id (
          full_name,
          student_id
        ),
        office_services!inner (
          id,
          name,
          office_id
        )
      `)
      .eq('office_services.office_id', REGISTRAR_OFFICE_ID)
      .order('submitted_at', { ascending: false })

    if (error) throw error

    requests.value = (data || []).map(item => ({
      databaseId: item.id,
      reference: makeReference(item.id),

      studentUuid: item.student_id,
      studentName: item.profiles?.full_name || 'Unknown Student',
      studentId: item.profiles?.student_id || 'Not available',

      serviceId: item.service_id,
      serviceName: item.office_services?.name || 'Registrar Service',

      documentType: item.title || item.request_type || 'Service Request',
      title: item.title || item.request_type || 'Service Request',

      requestType: item.request_type || '',
      details: item.details || '',

      status: normalizeStatus(item.status),

      expectedCompletion: item.expected_completion || '',
      instructions: item.instructions || '',
      instructionTemplate: item.instruction_template || '',
      instructionsSentAt: item.instructions_sent_at || '',

      staffNotes: item.staff_notes || '',
      handledBy: item.handled_by || null,

      createdAt: item.submitted_at || '',
      updatedAt: item.updated_at || '',
      completedAt: item.completed_at || ''
    }))

    if (selectedRequest.value) {
      const refreshed = requests.value.find(
        item => item.databaseId === selectedRequest.value.databaseId
      )

      selectedRequest.value = refreshed ? { ...refreshed } : null
    }

    console.log('Registrar service requests:', requests.value)
  } catch (error) {
    console.error('Error loading Registrar service requests:', error)
    loadError.value = error.message || 'Unable to load requests.'
  } finally {
    loading.value = false
  }
}

function setStatus(status) {
  activeStatus.value = status
  message.value = ''

  if (
    selectedRequest.value &&
    status !== 'All' &&
    selectedRequest.value.status !== status
  ) {
    closeDetails()
  }
}

function countStatus(status) {
  return requests.value.filter(
    request => request.status === status
  ).length
}

function selectRequest(request) {
  if (showStatusConfirmation.value || saving.value) return

  selectedRequest.value = { ...request }
  message.value = ''
}

function closeDetails() {
  if (saving.value) return

  cancelStatusChange()
  selectedRequest.value = null
  message.value = ''
}

function requestStatusChange(newStatus) {
  if (!selectedRequest.value || saving.value) return
  if (newStatus === selectedRequest.value.status) return

  previousStatus.value = selectedRequest.value.status
  pendingStatus.value = newStatus
  showStatusConfirmation.value = true
}

function cancelStatusChange() {
  if (saving.value) return

  showStatusConfirmation.value = false
  pendingStatus.value = ''
  previousStatus.value = ''
}

function statusClass(status) {
  return (status || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
}

function formatDate(value) {
  if (!value) return 'Not set'

  const [year, month, day] = value.split('-').map(Number)

  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatDateTime(value) {
  if (!value) return 'Not available'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function applyTemplate() {
  if (!selectedRequest.value) return

  const template = selectedRequest.value.instructionTemplate

  if (template && templates[template]) {
    selectedRequest.value.instructions = templates[template]
  }
}

async function confirmStatusChange() {
  if (!selectedRequest.value || !pendingStatus.value || saving.value) return

  const oldStatus = previousStatus.value
  const newStatus = pendingStatus.value

  selectedRequest.value.status = newStatus
  showStatusConfirmation.value = false

  // This saves the status. The database status trigger
  // is responsible for the status-change notification.
  const success = await saveChanges()

  if (!success && selectedRequest.value) {
    selectedRequest.value.status = oldStatus
  }

  pendingStatus.value = ''
  previousStatus.value = ''
}

/*
  SAVE CHANGES

  saveChanges(true):
  - Saves the request.
  - Inserts a custom-instructions notification for the student.

  saveChanges():
  - Saves the request only.
  - Used by the status confirmation flow.
*/
async function saveChanges(notifyStudent = false) {
  if (!selectedRequest.value || saving.value) return false

  saving.value = true
  message.value = ''

  try {
    const { data: userData, error: userError } =
      await supabase.auth.getUser()

    if (userError) throw userError

    if (!userData.user) {
      throw new Error('You must be logged in.')
    }

    const request = selectedRequest.value
    const instructions = (request.instructions || '').trim()
    const now = new Date().toISOString()

    // A message is required when notifying the student.
    if (notifyStudent && !instructions) {
      throw new Error(
        'Please enter custom instructions before notifying the student.'
      )
    }

    if (notifyStudent && !request.studentUuid) {
      throw new Error(
        'The student account could not be identified. The notification was not sent.'
      )
    }

    const updateData = {
      status: request.status.toLowerCase().replaceAll(' ', '_'),
      expected_completion: request.expectedCompletion || null,
      instructions,
      instruction_template: request.instructionTemplate || null,

      // Only update this timestamp when the admin sends instructions.
      instructions_sent_at: notifyStudent
        ? now
        : request.instructionsSentAt || null,

      staff_notes: request.staffNotes || null,
      handled_by: userData.user.id,
      updated_at: now,
      completed_at:
        request.status === 'Completed'
          ? now
          : null
    }

    // 1. SAVE THE SERVICE REQUEST.
    const { data, error } = await supabase
      .from('service_requests')
      .update(updateData)
      .eq('id', request.databaseId)
      .select('id')

    if (error) throw error

    if (!data || data.length === 0) {
      throw new Error(
        'No request was updated. Please check your Supabase permissions.'
      )
    }

    // 2. INSERT AN IN-APP NOTIFICATION FOR THE STUDENT.
    if (notifyStudent) {
      const notificationMessage =
        `The Registrar has sent you new instructions for your service request "${request.title}": ${instructions}`

      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          recipient_id: request.studentUuid,
          title: 'New Instructions from Registrar',
          message: notificationMessage,
          category: 'request',
          related_id: request.databaseId,
          is_read: false,
          created_at: now,
          event_key: `service_request_instructions:${request.databaseId}:${crypto.randomUUID()}`
        })

      if (notificationError) {
        console.error(
          'Request saved, but notification insert failed:',
          notificationError
        )

        throw new Error(
          `The request was saved, but the student notification could not be created: ${notificationError.message}`
        )
      }
    }

    // 3. REFRESH THE REQUEST LIST.
    const requestId = request.databaseId

    await loadRequests()

    const updatedRequest = requests.value.find(
      item => item.databaseId === requestId
    )

    selectedRequest.value = updatedRequest
      ? { ...updatedRequest }
      : null

    messageType.value = 'success'

    message.value = notifyStudent
      ? 'Instructions saved and student notified successfully.'
      : 'Request changes saved successfully.'

    return true

  } catch (error) {
    console.error('Error saving Registrar request:', error)

    messageType.value = 'error'
    message.value = error.message || 'Unable to save changes.'

    return false

  } finally {
    saving.value = false
  }
}

onMounted(loadRequests)
</script>

<style scoped>
.requests-page {
  padding: 3px 2px 24px;
  color: #4c2026;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
}

.page-heading {
  margin: 0 0 22px;
}

.page-heading h1 {
  margin: 0;
  color: #50070e;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 30px;
  font-weight: 500;
  line-height: 1.2;
}

.page-heading p {
  margin: 7px 0 0;
  color: #887477;
  font-size: 15px;
  line-height: 1.5;
}

/* FILTERS */
.status-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  margin-bottom: 19px;
}

.filter-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: 22px;
  background: #fff;
  color: #75565b;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.filter-button:hover {
  border-color: #e6cdd0;
  background: #f8eeee;
}

.filter-button.active {
  background: #650b18;
  color: #fff;
}

.all-icon {
  font-size: 15px;
}

.filter-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 19px;
  height: 19px;
  padding: 0 4px;
  border-radius: 12px;
  background: #f2e2e3;
  color: #650b18;
  font-size: 11px;
}

.filter-button.active .filter-count {
  background: #fff;
  color: #650b18;
}

/* SORT */
.sort-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin: -5px 0 18px;
}

.sort-row label {
  color: #887477;
  font-size: 13px;
}

.sort-row select,
.form-field select,
.form-field input,
.form-field textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d9b9be;
  border-radius: 7px;
  background: #f9f0f0;
  color: #30080c;
  font-family: inherit;
  font-size: 13px;
}

.sort-row select {
  width: 205px;
  min-height: 40px;
}

.form-field select,
.form-field input {
  min-height: 39px;
}

.form-field textarea {
  min-height: 120px;
  resize: vertical;
  line-height: 1.6;
}

.form-field textarea::placeholder {
  color: #b99fa3;
}

.sort-row select:focus,
.form-field select:focus,
.form-field input:focus,
.form-field textarea:focus {
  outline: 2px solid rgb(101 11 24 / 14%);
  border-color: #9b515a;
}

.refresh-button {
  min-height: 40px;
  padding: 8px 14px;
  border: 1px solid #d9b9be;
  border-radius: 7px;
  background: #fff;
  color: #650b18;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.refresh-button:hover {
  background: #f3e3e5;
}

.refresh-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* MAIN LAYOUT */
.requests-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: 12px;
}

.request-list-panel,
.request-details-panel {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #e6cdd0;
  border-radius: 17px;
  background: #f9f0f0;
  box-shadow: 0 2px 6px rgb(80 7 14 / 3%);
}

.request-list-panel {
  padding: 16px 18px;
}

.panel-heading {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 6px;
}

.panel-heading h2 {
  margin: 0;
  color: #50070e;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 20px;
  font-weight: 600;
}

.request-list {
  display: flex;
  flex-direction: column;
}

.request-card {
  padding: 15px 9px;
  border-bottom: 1px solid #ead6d8;
  cursor: pointer;
  transition: background 0.15s;
}

.request-card:last-child {
  border-bottom: none;
}

.request-card:hover,
.request-card.selected {
  background: #f3e5e6;
}

.request-card.selected {
  border-radius: 7px;
}

.request-topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.request-student {
  color: #4c2026;
  font-size: 14px;
  font-weight: 700;
}

.request-description {
  margin: 6px 0 4px;
  color: #8b6268;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.request-date {
  margin: 3px 0 0;
  color: #765e62;
  font-size: 12px;
  line-height: 1.5;
}

/* STATUS BADGES */
.status-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 18px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
  text-align: center;
}

.status-badge.pending,
.status-badge.processing {
  background: #f6e9b9;
  color: #876818;
}

.status-badge.ready-for-pickup,
.status-badge.claimed {
  background: #dcefe2;
  color: #367653;
}

.status-badge.completed {
  background: #e6e2e2;
  color: #62595a;
}

/* DETAILS PANEL */
.request-details-panel {
  padding: 18px;
}

.details-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 17px;
  border-bottom: 1px solid #ead6d8;
}

.details-eyebrow {
  display: block;
  margin-bottom: 5px;
  color: #8b6268;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.7px;
}

.details-header h2 {
  margin: 0;
  color: #30080c;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 25px;
  font-weight: 600;
  line-height: 1.3;
}

.details-subtitle {
  margin: 6px 0 0;
  color: #8b6268;
  font-size: 13px;
  line-height: 1.5;
}

.close-button {
  flex-shrink: 0;
  padding: 5px 0;
  border: 0;
  background: transparent;
  color: #80696d;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.close-button:hover {
  color: #650b18;
}

.close-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.details-section {
  padding: 17px 0;
  border-bottom: 1px solid #ead6d8;
}

.information-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.information-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.field-label {
  color: #887477;
  font-size: 12px;
  line-height: 1.5;
}

.field-value {
  overflow-wrap: anywhere;
  color: #30080c;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.expected-field {
  margin-top: 17px;
}

/* INSTRUCTIONS */
.instructions-section {
  padding: 17px 0 14px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.form-field label {
  display: block;
  color: #30080c;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
}

/* RESIZABLE MESSAGE COMPOSER */
.custom-instructions-field {
  padding: 12px;
  border: 1px solid #ead6d8;
  border-radius: 10px;
  background: #f9f0f0;
}

.form-field textarea {
  min-height: 120px;
  height: 120px;
  resize: vertical;
  padding: 13px 14px;
  border: 1px solid #d9b9be;
  border-radius: 8px;
  background: #f9f0f0;
  color: #30080c;
  line-height: 1.6;
  font-family: inherit;
  font-size: 13px;
}

.form-field textarea::placeholder {
  color: #b99fa3;
}

.textarea-hint {
  color: #9a7b80;
  font-size: 10px;
  line-height: 1.4;
}

/* LAST RECORDED GREEN RECTANGLE */
.instruction-history {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  width: 100%;
  box-sizing: border-box;
  margin: 5px 0 10px;
  padding: 9px 12px;
  border: 1px solid #c6e2ce;
  border-radius: 5px;
  background: #dcefe2;
  color: #367653;
  font-size: 11px;
  line-height: 1.5;
}

.history-label {
  font-weight: 500;
}

.instruction-history strong {
  color: #286342;
  font-weight: 700;
}

/* SAVE BUTTON */
.save-notify-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  min-height: 36px;
  margin-top: 0;
  padding: 9px 16px;
  border: 0;
  border-radius: 7px;
  background: #a8797e;
  color: #fff;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}

.save-notify-button:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #650b18;
}

.save-notify-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* STATUS BUTTONS */
.status-actions-section {
  padding: 0 0 5px;
}

.status-action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 9px 10px;
}

.status-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 7px 13px;
  border: 1px solid #650b18;
  border-radius: 8px;
  background: transparent;
  color: #30080c;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
}

.status-action-button:hover:not(:disabled) {
  background: #f3e3e5;
}

.status-action-button.current-status {
  background: #650b18;
  color: #fff;
  cursor: default;
}

.status-action-button:disabled:not(.current-status) {
  opacity: 0.5;
  cursor: not-allowed;
}

/* FEEDBACK */
.save-message {
  margin: 10px 0 0;
  color: #367653;
  font-size: 12px;
  line-height: 1.5;
}

.save-message.error {
  color: #b42318;
}

.details-empty-state {
  display: flex;
  min-height: 275px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9a7b80;
  text-align: center;
}

.details-empty-state p {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.5;
}

.empty-state {
  padding: 35px 15px;
  text-align: center;
}

.empty-symbol {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: #f0dcdf;
  color: #650b18;
  font-size: 21px;
}

.empty-state h2 {
  margin: 0 0 7px;
  color: #50070e;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 19px;
}

.empty-state p {
  margin: 0 0 15px;
  color: #887477;
  font-size: 13px;
}

.action-button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: 7px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.action-button.primary {
  background: #650b18;
  color: #fff;
}

.action-button.secondary {
  border-color: #d9b9be;
  background: #fff;
  color: #650b18;
}

.action-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* CONFIRMATION MODAL */
.confirmation-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgb(35 15 18 / 42%);
}

.confirmation-modal {
  width: min(500px, 100%);
  padding: 26px 28px;
  border: 1px solid #ead6d8;
  border-radius: 12px;
  background: #fffafa;
  box-shadow: 0 12px 35px rgb(35 15 18 / 20%);
}

.confirmation-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.confirmation-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid #ead0d3;
  border-radius: 8px;
  background: #f3dfe2;
  color: #650b18;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 24px;
  font-weight: 700;
}

.confirmation-modal h2 {
  margin: 0;
  color: #50070e;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 19px;
  font-weight: 600;
  line-height: 1.4;
}

.confirmation-modal > p {
  margin: 0 0 20px;
  color: #80696d;
  font-size: 13px;
  line-height: 1.6;
}

.confirmation-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 18px;
}

.confirmation-actions .action-button {
  min-height: 36px;
  padding: 8px 15px;
  border-radius: 7px;
  font-size: 12px;
}

.confirmation-actions .action-button.secondary {
  border-color: #d9b9be;
  background: #fffafa;
  color: #650b18;
}

.confirmation-actions .action-button.primary {
  background: #650b18;
  color: #fff;
}

.confirmation-actions .action-button:hover:not(:disabled) {
  filter: brightness(0.94);
}

.confirmation-actions .action-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* MODAL ANIMATION */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .confirmation-modal,
.modal-leave-active .confirmation-modal {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .confirmation-modal,
.modal-leave-to .confirmation-modal {
  transform: translateY(8px) scale(0.98);
}

/* FEEDBACK TOAST */
.feedback-message {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 1100;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(400px, calc(100vw - 44px));
  padding: 13px 15px;
  border: 1px solid #d5e6d9;
  border-left: 4px solid #367653;
  border-radius: 8px;
  background: #fff;
  color: #345b42;
  box-shadow: 0 7px 24px rgb(45 20 24 / 12%);
  font-size: 14px;
}

.feedback-message button {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: #66806d;
  font-size: 20px;
  cursor: pointer;
}

/* RESPONSIVE */
@media (max-width: 1000px) {
  .requests-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 600px) {
  .page-heading h1 {
    font-size: 25px;
  }

  .page-heading p {
    font-size: 14px;
  }

  .status-filters {
    gap: 6px;
  }

  .filter-button {
    padding: 7px 10px;
    font-size: 12px;
  }

  .sort-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .sort-row select {
    width: 100%;
  }

  .request-list-panel,
  .request-details-panel {
    padding: 14px;
  }

  .request-topline {
    gap: 7px;
  }

  .status-badge {
    max-width: 125px;
    white-space: normal;
  }

  .information-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .details-header h2 {
    font-size: 21px;
  }

  .status-action-buttons {
    gap: 8px;
  }

  .status-action-button {
    padding: 7px 10px;
    font-size: 11px;
  }

  .confirmation-modal {
    padding: 24px 19px;
  }

  .confirmation-actions {
    flex-direction: column-reverse;
  }

  .confirmation-actions button {
    width: 100%;
  }
}
</style>