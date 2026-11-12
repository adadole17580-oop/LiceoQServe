
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

const filters = ['All', 'For Confirmation', 'Confirmed', 'Cancelled']

const activeFilter = ref('All')
const selectedRequestId = ref(null)
const showStatusModal = ref(false)
const pendingStatus = ref('Confirm')
const searchQuery = ref('')
const notice = ref('')
const requests = ref([])
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')

let requestSubscription = null

function formatStatus(status) {
  const normalized = String(status || '').toLowerCase()

  if (normalized === 'borrowed') return 'Confirmed'

  if (
    normalized === 'cancelled' ||
    normalized === 'rejected'
  ) {
    return 'Cancelled'
  }

  return 'For Confirmation'
}

async function fetchRequests() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data: requestData, error: requestError } = await supabase
      .from('service_requests')
      .select('*')
      .in('service_id', LIBRARY_SERVICE_IDS)
      .order('submitted_at', { ascending: false })

    if (requestError) throw requestError

    const studentIds = [
      ...new Set(
        (requestData || [])
          .map((request) => request.student_id)
          .filter(Boolean),
      ),
    ]

    let profilesMap = {}

    if (studentIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, student_id')
        .in('id', studentIds)

      if (profileError) throw profileError

      profilesMap = Object.fromEntries(
        (profiles || []).map((profile) => [
          profile.id,
          profile,
        ]),
      )
    }

    requests.value = (requestData || []).map((request) => {
      const student = profilesMap[request.student_id]

      return {
        id: request.id,
        requestNumber: `REQ-${request.id.slice(0, 8).toUpperCase()}`,
        studentName: student?.full_name || 'Unknown Student',
        studentId: student?.student_id || 'Not available',
        type:
          request.request_type ||
          request.title ||
          'Library Request',
        requestDate: request.submitted_at
          ? request.submitted_at.slice(0, 10)
          : '',
        expectedDate: request.expected_completion || '',
        status: formatStatus(request.status),
        instruction:
          request.instructions ||
          request.staff_notes ||
          '',
        details: request.details || '',
        studentUuid: request.student_id,
        serviceId: request.service_id,
        databaseStatus: request.status,
      }
    })

    if (
      !requests.value.some(
        (request) => request.id === selectedRequestId.value,
      )
    ) {
      selectedRequestId.value = requests.value[0]?.id || null
    }
  } catch (error) {
    console.error('Error fetching Library requests:', error)
    errorMessage.value =
      error.message || 'Unable to load requests from Supabase.'
  } finally {
    loading.value = false
  }
}

const selectedRequest = computed(() =>
  requests.value.find(
    (request) => request.id === selectedRequestId.value,
  ) || null,
)

const filteredRequests = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return requests.value.filter((request) => {
    const matchesStatus =
      activeFilter.value === 'All' ||
      request.status === activeFilter.value

    const matchesSearch =
      !query ||
      [
        request.studentName,
        request.requestNumber,
        request.type,
        request.studentId,
      ].some((value) =>
        String(value || '').toLowerCase().includes(query),
      )

    return matchesStatus && matchesSearch
  })
})

function selectRequest(request) {
  selectedRequestId.value = request.id
  notice.value = ''
}

function askForStatusChange(action, formData = null) {
  if (!selectedRequest.value) return

  if (selectedRequest.value.databaseStatus !== 'pending') {
    notice.value = 'This request has already been handled.'
    return
  }

  pendingStatus.value = action
  confirmationForm.value = formData
  showStatusModal.value = true
}

const confirmationForm = ref(null)

async function confirmStatusChange() {
  if (!selectedRequest.value || saving.value) return

  saving.value = true
  notice.value = ''

  try {
    const requestId = selectedRequest.value.id

    const { data: authData, error: authError } =
      await supabase.auth.getUser()

    if (authError) throw authError

    const userId = authData.user?.id

    if (pendingStatus.value === 'Confirm') {
      if (!confirmationForm.value) {
        throw new Error('Please provide the confirmation details.')
      }

      // Save Expected Completion and Instructions first.
      const { data: updatedRequest, error: updateError } =
        await supabase
          .from('service_requests')
          .update({
            expected_completion:
              confirmationForm.value.expectedDate || null,
            instructions:
              confirmationForm.value.instruction?.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', requestId)
          .eq('status', 'pending')
          .select('id')

      if (updateError) throw updateError

      if (!updatedRequest?.length) {
        throw new Error('Request was already handled.')
      }

      // Run the existing book approval RPC.
      const { error: rpcError } = await supabase.rpc(
        'approve_library_borrow_request',
        {
          p_request_id: requestId,
        },
      )

      if (rpcError) throw rpcError

      notice.value = 'Book request confirmed successfully.'
    } else if (pendingStatus.value === 'Cancel') {
      const { data, error } = await supabase
        .from('service_requests')
        .update({
          status: 'cancelled',
          handled_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select('id')

      if (error) throw error

      if (!data?.length) {
        throw new Error(
          'Request was already handled or could not be cancelled.',
        )
      }

      notice.value = 'Book request cancelled successfully.'
    }

    showStatusModal.value = false
    confirmationForm.value = null

    await fetchRequests()
  } catch (error) {
    console.error('Error handling request:', error)
    notice.value = error.message || 'Failed to process request.'
  } finally {
    saving.value = false
  }
}

function closeStatusModal() {
  if (saving.value) return

  showStatusModal.value = false
}

function subscribeToRequests() {
  requestSubscription = supabase
    .channel('library-service-requests')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'service_requests',
      },
      () => fetchRequests(),
    )
    .subscribe()
}

onMounted(async () => {
  await fetchRequests()
  subscribeToRequests()
})

onUnmounted(() => {
  if (requestSubscription) {
    supabase.removeChannel(requestSubscription)
  }
})
</script>

<template>
  <main class="requests-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">LIBRARY MANAGEMENT</p>
        <h1>Requests</h1>
        <p class="subtitle">
          Review and manage student book requests.
        </p>
      </div>

      <div class="request-total">
        <span>Total requests</span>
        <strong>{{ requests.length }}</strong>
      </div>
    </header>

    <div v-if="notice" class="notice" role="status">
      <span>{{ notice }}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        @click="notice = ''"
      >
        ×
      </button>
    </div>

    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
      <button type="button" @click="fetchRequests">
        Try again
      </button>
    </div>

    <section class="requests-workspace">
      <div class="request-list-panel">
        <div class="list-heading">
          <h2>Student requests</h2>
          <span>{{ filteredRequests.length }} found</span>
        </div>

        <label class="search-box">
          <span class="sr-only">Search requests</span>
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Search name, request number..."
          />
        </label>

        <div class="filter-list">
          <button
            v-for="filter in filters"
            :key="filter"
            type="button"
            :class="{ active: activeFilter === filter }"
            :aria-pressed="activeFilter === filter"
            @click="activeFilter = filter"
          >
            {{ filter }}
            <span>
              {{
                filter === 'All'
                  ? requests.length
                  : requests.filter(
                      (request) => request.status === filter,
                    ).length
              }}
            </span>
          </button>
        </div>

        <div v-if="loading" class="empty-list">
          <p>Loading requests...</p>
        </div>

        <div
          v-else-if="filteredRequests.length"
          class="request-cards"
        >
          <RequestCard
            v-for="request in filteredRequests"
            :key="request.id"
            :request="request"
            :selected="selectedRequestId === request.id"
            @select="selectRequest"
          />
        </div>

        <div v-else class="empty-list">
          <h3>No requests found</h3>
          <p>
            {{
              requests.length === 0
                ? 'No Library requests have been submitted yet.'
                : 'Try another filter or search term.'
            }}
          </p>
        </div>
      </div>

      <div class="request-details-column">
        <RequestDetails
          :request="selectedRequest"
          @change-status="askForStatusChange"
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
  min-height: calc(100vh - 104px);
  padding: clamp(12px, 2vw, 28px);
  box-sizing: border-box;
  background: #eadcda;
  color: #390607;
  font-family: Arial, sans-serif;
}

* {
  box-sizing: border-box;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
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
  font-size: clamp(23px, 2vw, 32px);
}

.subtitle {
  margin: 8px 0 0;
  color: #795f60;
  font-size: 12px;
  line-height: 1.6;
}

.request-total {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 100px;
  padding: 13px 16px;
  border: 1px solid #d5bdbc;
  border-radius: 10px;
  background: #f8eeee;
}

.request-total span {
  color: #795f60;
  font-size: 10px;
}

.request-total strong {
  font-family: Georgia, serif;
  font-size: 25px;
}

.notice,
.error-message {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
  padding: 12px 15px;
  border-radius: 8px;
  font-size: 12px;
}

.notice {
  border: 1px solid #c6d9bf;
  background: #edf5e9;
  color: #315a2e;
}

.error-message {
  border: 1px solid #d8aaaa;
  background: #fceaea;
  color: #8a1717;
}

.notice button,
.error-message button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-weight: 700;
}

.requests-workspace {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.2fr);
  align-items: start;
  gap: clamp(12px, 1.5vw, 20px);
  width: 100%;
  min-width: 0;
}

.request-list-panel {
  min-width: 0;
  padding: clamp(12px, 1.5vw, 18px);
  border: 1px solid #d5bdbc;
  border-radius: 12px;
  background: #f6eded;
}

.list-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 15px;
}

.list-heading h2 {
  margin: 0;
  font-family: Georgia, serif;
  font-size: 17px;
}

.list-heading > span {
  color: #795f60;
  font-size: 10px;
}

.search-box {
  display: block;
  width: 100%;
  margin-bottom: 14px;
}

.search-box input {
  width: 100%;
  min-width: 0;
  padding: 11px;
  border: 1px solid #d5bdbc;
  border-radius: 7px;
  background: #fff9f8;
  color: #390607;
  font-size: 12px;
}

.filter-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.filter-list button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  max-width: 100%;
  padding: 7px 9px;
  border: 1px solid #d5bdbc;
  border-radius: 7px;
  background: transparent;
  color: #5f3839;
  cursor: pointer;
  font-size: 10px;
}

.filter-list button.active {
  border-color: #56090d;
  background: #56090d;
  color: white;
}

.request-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.request-details-column {
  min-width: 0;
  width: 100%;
}

.empty-list {
  padding: 28px 10px;
  text-align: center;
}

.empty-list h3 {
  font-size: 14px;
}

.empty-list p {
  color: #795f60;
  font-size: 11px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 1100px) {
  .requests-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 768px) {
  .requests-page {
    padding: 16px;
  }

  .page-header {
    align-items: flex-start;
  }

  .request-total {
    min-width: 85px;
  }

  .requests-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 480px) {
  .requests-page {
    padding: 10px;
  }

  .page-header h1 {
    font-size: 24px;
  }

  .request-total {
    width: 100%;
  }

  .request-list-panel {
    padding: 11px;
  }

  .filter-list button {
    flex: 1 1 auto;
  }
}
</style>
