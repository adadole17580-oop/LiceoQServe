
<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'

import { supabase } from '../lib/Supabase.js'
import RequestCard from '../components/RequestCard.vue'
import RequestDetails from '../components/RequestDetails.vue'
import StatusConfirmModal from '../components/StatusConfirmModal.vue'

const LIBRARY_SERVICE_IDS = [
  '987d7769-8a02-44a1-9b95-cdfec559a70e',
  'faa4239d-cae7-4fe7-af69-3f25bec2fe44',
  '99a740ad-96d7-43a5-9bcc-3f9723cabd28',
  '11153e05-a183-48cd-83b0-12e46d921915',
  'be4db8a9-3ac2-41ae-ba72-5e96a3034512',
  '2e171fa5-701e-4e91-9d3a-a99214dfce59',
]

const requests = ref([])
const selectedRequestId = ref(null)

const activeFilter = ref('All')
const searchQuery = ref('')

const loading = ref(false)
const saving = ref(false)

const errorMessage = ref('')
const successMessage = ref('')

const showStatusModal = ref(false)
const pendingStatus = ref('Confirm')
const confirmationForm = ref(null)

let realtimeChannel = null
let noticeTimeout = null

const filters = [
  'All',
  'Pending',
  'Borrowed',
  'Processing',
  'Completed',
  'Cancelled',
]

const selectedRequest = computed(() => {
  return requests.value.find(
    request => request.id === selectedRequestId.value,
  ) || null
})

// DATABASE STATUS TO DISPLAY LABEL
function formatStatus(status) {
  const statusMap = {
    pending: 'Pending',
    borrowed: 'Borrowed',
    processing: 'Processing',
    completed: 'Completed',
    cancelled: 'Cancelled',
    rejected: 'Cancelled',
  }

  return statusMap[status] || status
}

function formatDate(date) {
  if (!date) return 'Not available'

  const parsedDate = new Date(date)

  if (Number.isNaN(parsedDate.getTime())) {
    return date
  }

  return parsedDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function showNotice(message, type = 'success') {
  successMessage.value = type === 'success' ? message : ''
  errorMessage.value = type === 'error' ? message : ''

  if (noticeTimeout) {
    clearTimeout(noticeTimeout)
  }

  noticeTimeout = setTimeout(() => {
    successMessage.value = ''
    errorMessage.value = ''
  }, 7000)
}

function getErrorMessage(error) {
  return [
    error?.message || 'Unknown error',
    error?.code ? `Code: ${error.code}` : '',
    error?.details ? `Details: ${error.details}` : '',
    error?.hint ? `Hint: ${error.hint}` : '',
  ].filter(Boolean).join('\n')
}

// FETCH LIBRARY REQUESTS
async function fetchRequests() {
  loading.value = true

  try {
    const { data, error } = await supabase
      .from('service_requests')
      .select('*')
      .in('service_id', LIBRARY_SERVICE_IDS)
      .order('submitted_at', { ascending: false })

    if (error) throw error

    const requestRows = data || []

    const studentIds = [
      ...new Set(
        requestRows
          .map(row => row.student_id || row.user_id)
          .filter(Boolean),
      ),
    ]

    let profilesMap = {}

    if (studentIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, student_id')
        .in('id', studentIds)

      if (profilesError) throw profilesError

      profilesMap = Object.fromEntries(
        (profiles || []).map(profile => [
          profile.id,
          profile,
        ]),
      )
    }

    requests.value = requestRows.map(row => {
      const studentUuid = row.student_id || row.user_id
      const profile = profilesMap[studentUuid] || {}

      const databaseStatus = row.status || 'pending'

      return {
        id: row.id,

        requestNumber: `REQ-${String(row.id).slice(0, 8).toUpperCase()}`,

        studentName:
          profile.full_name ||
          row.student_name ||
          'Unknown Student',

        studentId:
          profile.student_id ||
          row.student_number ||
          'Not available',

        type:
          row.request_type ||
          row.title ||
          'Library Request',

        requestDate: formatDate(row.submitted_at),

        expectedDate: row.expected_completion || '',

        status: formatStatus(databaseStatus),

        instruction: row.instructions || '',

        details:
          row.details ||
          row.description ||
          row.title ||
          '',

        studentUuid,
        serviceId: row.service_id,
        databaseStatus,
      }
    })

    if (
      selectedRequestId.value &&
      !requests.value.some(
        request => request.id === selectedRequestId.value,
      )
    ) {
      selectedRequestId.value = null
    }
  } catch (error) {
    console.error('FETCH REQUEST ERROR:', error)

    showNotice(
      getErrorMessage(error),
      'error',
    )
  } finally {
    loading.value = false
  }
}

// FILTER AND SEARCH
const filteredRequests = computed(() => {
  let result = [...requests.value]

  if (activeFilter.value !== 'All') {
    result = result.filter(
      request => request.status === activeFilter.value,
    )
  }

  const search = searchQuery.value.trim().toLowerCase()

  if (search) {
    result = result.filter(request => {
      return [
        request.requestNumber,
        request.studentName,
        request.studentId,
        request.type,
        request.status,
      ]
        .filter(Boolean)
        .some(value =>
          String(value).toLowerCase().includes(search),
        )
    })
  }

  return result
})

function selectRequest(request) {
  selectedRequestId.value = request.id
}

// HANDLE REQUEST ACTIONS
function askForStatusChange(action, formData = null) {
  if (!selectedRequest.value) return

  // COMPLETE: PROCESSING -> COMPLETED
  if (action === 'Complete') {
    if (selectedRequest.value.databaseStatus !== 'processing') {
      showNotice(
        'Only processing requests can be completed.',
        'error',
      )
      return
    }

    completeRequest(formData?.id || selectedRequest.value.id)
    return
  }

  // CONFIRM AND CANCEL ARE ONLY FOR PENDING REQUESTS
  if (selectedRequest.value.databaseStatus !== 'pending') {
    showNotice(
      'This request has already been handled.',
      'error',
    )
    return
  }

  pendingStatus.value = action
  confirmationForm.value = formData
  showStatusModal.value = true
}

function closeStatusModal() {
  if (saving.value) return

  showStatusModal.value = false
  confirmationForm.value = null
}

// COMPLETE REQUEST: PROCESSING -> COMPLETED
async function completeRequest(requestId) {
  if (saving.value) return

  saving.value = true
  errorMessage.value = ''

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) throw authError

    if (!user) {
      throw new Error('Please log in again.')
    }

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('service_requests')
      .update({
        status: 'completed',
        handled_by: user.id,
        completed_at: now,
        updated_at: now,
      })
      .eq('id', requestId)
      .eq('status', 'processing')
      .select('id, status')
      .maybeSingle()

    if (error) throw error

    if (!data) {
      throw new Error(
        'Request was not completed. It may no longer be processing or you may not have permission to update it.',
      )
    }

    showNotice(
      'Request successfully completed!',
      'success',
    )

    await fetchRequests()
  } catch (error) {
    console.error('COMPLETE REQUEST ERROR:', error)

    showNotice(
      getErrorMessage(error),
      'error',
    )
  } finally {
    saving.value = false
  }
}

// CONFIRM OR CANCEL REQUEST
async function confirmStatusChange() {
  if (!selectedRequest.value || saving.value) return

  const requestId = selectedRequest.value.id

  saving.value = true
  errorMessage.value = ''

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) throw authError

    if (!user) {
      throw new Error('Please log in again.')
    }

    if (pendingStatus.value === 'Confirm') {
      if (!confirmationForm.value) {
        throw new Error(
          'Request handling details are missing. Please go back and try again.',
        )
      }

      // STEP 1: SAVE EXPECTED COMPLETION AND INSTRUCTIONS
      const { data: updatedRequest, error: updateError } = await supabase
        .from('service_requests')
        .update({
          expected_completion:
            confirmationForm.value.expectedDate || null,

          instructions:
            confirmationForm.value.instruction || null,

          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select('id, status')
        .maybeSingle()

      if (updateError) {
        throw new Error(
          `Failed to save request details: ${getErrorMessage(updateError)}`,
        )
      }

      if (!updatedRequest) {
        throw new Error(
          'No pending request was updated. Check the request status and Supabase UPDATE permissions.',
        )
      }

      // STEP 2: APPROVE BORROW REQUEST
      // RPC changes status to borrowed, decreases available copies,
      // and creates the book loan record.
      const { error: rpcError } = await supabase.rpc(
        'approve_library_borrow_request',
        {
          p_request_id: requestId,
        },
      )

      if (rpcError) {
        throw new Error(
          `Approval RPC failed: ${getErrorMessage(rpcError)}`,
        )
      }

      showNotice(
        'Borrow request successfully approved! Status is now Borrowed.',
        'success',
      )

    } else if (pendingStatus.value === 'Cancel') {

      const { data: cancelledRequest, error: cancelError } = await supabase
        .from('service_requests')
        .update({
          status: 'cancelled',
          handled_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select('id, status')
        .maybeSingle()

      if (cancelError) throw cancelError

      if (!cancelledRequest) {
        throw new Error(
          'No pending request was cancelled. Check its current status and Supabase permissions.',
        )
      }

      showNotice(
        'Library request successfully cancelled.',
        'success',
      )
    }

    showStatusModal.value = false
    confirmationForm.value = null

    await fetchRequests()

  } catch (error) {
    console.error('FULL SUPABASE ERROR:', error)

    showNotice(
      getErrorMessage(error),
      'error',
    )

    alert(
      'UNABLE TO UPDATE REQUEST\n\n' +
      getErrorMessage(error),
    )

  } finally {
    saving.value = false
  }
}

// REALTIME UPDATES
function setupRealtime() {
  realtimeChannel = supabase
    .channel('library-requests-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'service_requests',
      },
      () => {
        fetchRequests()
      },
    )
    .subscribe()
}

onMounted(async () => {
  await fetchRequests()
  setupRealtime()
})

onUnmounted(() => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
  }

  if (noticeTimeout) {
    clearTimeout(noticeTimeout)
  }
})
</script>

<template>
  <main class="requests-page">

    <header class="page-header">
      <div>
        <p class="eyebrow">LIBRARY MANAGEMENT</p>
        <h1>Library Requests</h1>
        <p class="page-description">
          Review and manage student library requests.
        </p>
      </div>
    </header>

    <div
      v-if="successMessage"
      class="notice success-notice"
      role="status"
    >
      {{ successMessage }}
    </div>

    <div
      v-if="errorMessage"
      class="notice error-notice"
      role="alert"
    >
      {{ errorMessage }}
    </div>

    <section class="requests-toolbar">

      <div class="filter-list">
        <button
          v-for="filter in filters"
          :key="filter"
          type="button"
          class="filter-button"
          :class="{ active: activeFilter === filter }"
          @click="activeFilter = filter"
        >
          {{ filter }}
        </button>
      </div>

      <div class="search-wrapper">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search requests..."
          aria-label="Search library requests"
        />
      </div>

    </section>

    <section class="requests-workspace">

      <div class="requests-list-panel">

        <div class="panel-heading">
          <div>
            <h2>Request List</h2>
            <p>
              {{ filteredRequests.length }}
              {{ filteredRequests.length === 1 ? 'request' : 'requests' }}
            </p>
          </div>

          <button
            type="button"
            class="refresh-button"
            :disabled="loading"
            @click="fetchRequests"
          >
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>

        <div
          v-if="loading && requests.length === 0"
          class="empty-state"
        >
          Loading requests...
        </div>

        <div
          v-else-if="filteredRequests.length === 0"
          class="empty-state"
        >
          <h3>No Requests Found</h3>
          <p>
            There are no library requests matching your search or filter.
          </p>
        </div>

        <div v-else class="request-cards">

          <RequestCard
            v-for="request in filteredRequests"
            :key="request.id"
            :request="request"
            :selected="selectedRequestId === request.id"
            @select="selectRequest"
          />

        </div>

      </div>

      <div class="request-details-panel">

        <RequestDetails
          :request="selectedRequest"
          @change-status="(action, formData) => askForStatusChange(action, formData)"
          @close="selectedRequestId = null"
        />

      </div>

    </section>

    <StatusConfirmModal
      :show="showStatusModal"
      :status="pendingStatus"
      :loading="saving"
      @confirm="confirmStatusChange"
      @cancel="closeStatusModal"
    />

  </main>
</template>

<style scoped>
.requests-page {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: clamp(16px, 2.5vw, 32px);
  color: #390607;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 25px;
}

.eyebrow {
  margin: 0 0 7px;
  color: #805d5e;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.3px;
}

.page-header h1 {
  margin: 0;
  font-family: Georgia, serif;
  font-size: clamp(24px, 3vw, 32px);
}

.page-description {
  margin: 8px 0 0;
  color: #795f60;
  font-size: 13px;
  line-height: 1.5;
}

.notice {
  margin-bottom: 16px;
  padding: 13px 16px;
  border-radius: 8px;
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.success-notice {
  border: 1px solid #b8d9b8;
  background: #edf7ed;
  color: #28632e;
}

.error-notice {
  border: 1px solid #e3bcbc;
  background: #fff0f0;
  color: #9a2525;
}

.requests-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 20px;
}

.filter-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-button {
  padding: 9px 14px;
  border: 1px solid #d5bdbc;
  border-radius: 7px;
  background: #fffafa;
  color: #684344;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  transition: 0.2s ease;
}

.filter-button:hover {
  background: #f3e5e4;
}

.filter-button.active {
  border-color: #56090d;
  background: #56090d;
  color: white;
}

.search-wrapper {
  width: min(100%, 260px);
}

.search-wrapper input {
  width: 100%;
  box-sizing: border-box;
  padding: 11px 13px;
  border: 1px solid #d5bdbc;
  border-radius: 7px;
  outline: none;
  background: #fffafa;
  color: #390607;
  font: inherit;
  font-size: 12px;
}

.search-wrapper input:focus {
  border-color: #805050;
}

.requests-workspace {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.2fr);
  align-items: start;
  gap: 20px;
  width: 100%;
  min-width: 0;
}

.requests-list-panel,
.request-details-panel {
  min-width: 0;
  box-sizing: border-box;
  padding: clamp(14px, 1.8vw, 22px);
  border: 1px solid #e1cecd;
  border-radius: 12px;
  background: #fffafa;
}

.panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.panel-heading h2 {
  margin: 0;
  font-family: Georgia, serif;
  font-size: 18px;
}

.panel-heading p {
  margin: 5px 0 0;
  color: #795f60;
  font-size: 11px;
}

.refresh-button {
  padding: 8px 13px;
  border: 1px solid #d5bdbc;
  border-radius: 6px;
  background: #f6eded;
  color: #56090d;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
}

.refresh-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.request-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.empty-state {
  padding: 35px 15px;
  text-align: center;
  color: #795f60;
  font-size: 12px;
  line-height: 1.6;
}

.empty-state h3 {
  margin: 0 0 8px;
  color: #390607;
  font-family: Georgia, serif;
  font-size: 17px;
}

.empty-state p {
  margin: 0;
}

.request-details-panel {
  position: relative;
  width: 100%;
  min-width: 0;
}

@media (max-width: 1100px) {
  .requests-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .request-details-panel {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .requests-page {
    padding: 16px;
  }

  .requests-toolbar {
    align-items: stretch;
  }

  .filter-list {
    width: 100%;
  }

  .search-wrapper {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .requests-page {
    padding: 12px;
  }

  .page-header {
    margin-bottom: 18px;
  }

  .filter-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filter-button {
    width: 100%;
    padding: 10px 6px;
  }

  .requests-list-panel,
  .request-details-panel {
    padding: 12px;
  }
}
</style>
