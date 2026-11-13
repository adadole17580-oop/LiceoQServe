
<template>
  <main class="main-content">
    <section class="history-heading">
      <h1>HISTORY</h1>
      <p>
        Select a concise history item to view its complete audit details.
      </p>
    </section>

    <section class="history-card">
      <div v-if="isLoading" class="empty-state">
        Loading history records...
      </div>

      <div v-else-if="errorMessage" class="empty-state error-state">
        {{ errorMessage }}
      </div>

      <template v-else>
        <article
          v-for="item in historyItems"
          :key="item.id"
          class="history-row"
        >
          <div class="history-info">
            <h3>{{ item.title }}</h3>
            <span>{{ item.date }}</span>
          </div>

          <button
            type="button"
            class="view-details"
            @click="viewDetails(item)"
          >
            View details
          </button>
        </article>

        <div v-if="historyItems.length === 0" class="empty-state">
          No history records available.
        </div>
      </template>
    </section>

    <Teleport to="body">
      <div
        v-if="selectedItem"
        class="history-overlay"
        @click.self="closeDetails"
      >
        <section
          class="history-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-modal-title"
        >
          <div class="modal-header">
            <span class="modal-label">History Details</span>

            <button
              type="button"
              class="modal-close"
              @click="closeDetails"
            >
              Close
            </button>
          </div>

          <div class="modal-title-section">
            <h2 id="history-modal-title">
              {{ selectedItem.title }}
            </h2>

            <p class="modal-date">
              {{ selectedItem.date }}
            </p>
          </div>

          <div class="audit-grid">
            <div class="audit-field">
              <span>What happened</span>
              <p>{{ selectedItem.activity }}</p>
            </div>

            <div class="audit-field">
              <span>Student</span>
              <p>{{ selectedItem.student }}</p>
            </div>

            <div class="audit-field">
              <span>Transaction ID</span>
              <p>{{ selectedItem.transactionId }}</p>
            </div>

            <div class="audit-field">
              <span>Previous Status</span>
              <p>{{ selectedItem.previousStatus }}</p>
            </div>

            <div class="audit-field">
              <span>New Status</span>
              <p>{{ selectedItem.newStatus }}</p>
            </div>

            <div class="audit-field">
              <span>Performed by</span>
              <p>{{ selectedItem.performedBy }}</p>
            </div>
          </div>

          <div class="audit-notes">
            <strong>
              Notes/Instructions: {{ selectedItem.notes }}
            </strong>
          </div>
        </section>
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { supabase } from '../lib/Supabase.js'

const historyItems = ref([])
const selectedItem = ref(null)

const isLoading = ref(false)
const errorMessage = ref('')

let historyChannel = null

function formatDate(dateValue) {
  if (!dateValue) return 'Date not available'

  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) {
    return 'Date not available'
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function getProfileName(profile) {
  if (!profile) return 'Not recorded'

  return profile.full_name || 'Not recorded'
}

async function fetchHistory() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError) throw authError

    if (!user) {
      throw new Error('Please log in to view history records.')
    }

    const { data: staffProfile, error: profileError } =
      await supabase
        .from('profiles')
        .select('id, full_name, role, office_id')
        .eq('id', user.id)
        .single()

    if (profileError) throw profileError

    if (!staffProfile.office_id) {
      throw new Error('Your account is not assigned to an office.')
    }

    const { data: historyData, error: historyError } =
      await supabase
        .from('service_history')
        .select(`
          id,
          student_id,
          service_id,
          transaction_type,
          transaction_id,
          title,
          final_status,
          completed_at,
          created_at
        `)
        .order('created_at', { ascending: false })

    if (historyError) throw historyError

    if (!historyData || historyData.length === 0) {
      historyItems.value = []
      return
    }

    const { data: officeServices, error: servicesError } =
      await supabase
        .from('office_services')
        .select('id, name, office_id')
        .eq('office_id', staffProfile.office_id)

    if (servicesError) throw servicesError

    const serviceMap = new Map(
      (officeServices || []).map(service => [
        service.id,
        service
      ])
    )

    const officeHistory = historyData.filter(item =>
      serviceMap.has(item.service_id)
    )

    if (officeHistory.length === 0) {
      historyItems.value = []
      return
    }

    const studentIds = [
      ...new Set(
        officeHistory
          .map(item => item.student_id)
          .filter(Boolean)
      )
    ]

    const requestIds = officeHistory
      .filter(item =>
        String(item.transaction_type).toLowerCase() === 'request'
      )
      .map(item => item.transaction_id)
      .filter(Boolean)

    const appointmentIds = officeHistory
      .filter(item =>
        String(item.transaction_type).toLowerCase() === 'appointment'
      )
      .map(item => item.transaction_id)
      .filter(Boolean)

    // 6. Fetch related records
    const [
      studentsResult,
      requestsResult,
      appointmentsResult
    ] = await Promise.all([
      studentIds.length
        ? supabase
            .from('profiles')
            .select('id, full_name, student_id')
            .in('id', studentIds)
        : Promise.resolve({ data: [], error: null }),

      requestIds.length
        ? supabase
            .from('service_requests')
            .select('id, title, status, staff_notes, handled_by')
            .in('id', requestIds)
        : Promise.resolve({ data: [], error: null }),

      appointmentIds.length
        ? supabase
            .from('appointments')
            .select('id, purpose, status, staff_notes, handled_by')
            .in('id', appointmentIds)
        : Promise.resolve({ data: [], error: null })
    ])

    if (studentsResult.error) throw studentsResult.error
    if (requestsResult.error) throw requestsResult.error
    if (appointmentsResult.error) throw appointmentsResult.error

    const studentMap = new Map(
      (studentsResult.data || []).map(student => [
        student.id,
        student
      ])
    )

    const requestMap = new Map(
      (requestsResult.data || []).map(request => [
        request.id,
        request
      ])
    )

    const appointmentMap = new Map(
      (appointmentsResult.data || []).map(appointment => [
        appointment.id,
        appointment
      ])
    )

    const handlerIds = [
      ...new Set([
        ...(requestsResult.data || []).map(item => item.handled_by),
        ...(appointmentsResult.data || []).map(item => item.handled_by)
      ].filter(Boolean))
    ]

    let handlerMap = new Map()

    if (handlerIds.length > 0) {
      const { data: handlers, error: handlersError } =
        await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', handlerIds)

      if (handlersError) throw handlersError

      handlerMap = new Map(
        (handlers || []).map(handler => [
          handler.id,
          handler
        ])
      )
    }

    historyItems.value = officeHistory.map(item => {
      const transactionType =
        String(item.transaction_type).toLowerCase()

      const isRequest = transactionType === 'request'

      const transaction = isRequest
        ? requestMap.get(item.transaction_id)
        : appointmentMap.get(item.transaction_id)

      const student = studentMap.get(item.student_id)
      const service = serviceMap.get(item.service_id)

      const handler = transaction?.handled_by
        ? handlerMap.get(transaction.handled_by)
        : null

      const serviceName = service?.name || item.title || 'Service'

      const transactionTitle = isRequest
        ? transaction?.title || item.title || serviceName
        : transaction?.purpose || item.title || serviceName

      const activity = isRequest
        ? `Request Completed - ${serviceName}`
        : `Appointment Completed - ${serviceName}`

      const title = isRequest
        ? `Request Completed - ${transactionTitle}`
        : `Appointment Completed - ${transactionTitle}`

      return {
        id: item.id,
        title,
        date: formatDate(item.completed_at || item.created_at),

        activity,

        student: student
          ? `${student.full_name || 'Unknown Student'}${
              student.student_id
                ? ` (${student.student_id})`
               : ''
            }`
          : 'Not available',

        transactionId: item.transaction_id || 'Not available',

        previousStatus: 'Not recorded',

        newStatus: item.final_status || 'Not recorded',

        performedBy: getProfileName(handler),

        notes: transaction?.staff_notes || 'No notes recorded.'
      }
    })

  } catch (error) {
    console.error('Error fetching history:', error)

    errorMessage.value =
      error.message || 'Unable to load history records.'

    historyItems.value = []

  } finally {
    isLoading.value = false
  }
}

function viewDetails(item) {
  selectedItem.value = item
}

function closeDetails() {
  selectedItem.value = null
}

function handleKeydown(event) {
  if (event.key === 'Escape' && selectedItem.value) {
    closeDetails()
  }
}

onMounted(() => {
  fetchHistory()

  window.addEventListener('keydown', handleKeydown)

  historyChannel = supabase
    .channel('osa-history-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'service_history'
      },
      () => {
        fetchHistory()
      }
    )
    .subscribe()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)

  if (historyChannel) {
    supabase.removeChannel(historyChannel)
  }
})
</script>

<style scoped>

  .main-content {
  flex: 1;
  min-width: 0;
  padding: 20px 22px;
  background: var(--pink-bg, #efdfdf);
  color: #390b0e;
}

.history-heading {
  margin: 0 6px 30px;
  padding-top: 14px;
}

.history-heading h1 {
  margin: 0 0 5px;
  color: #59070d;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 16px;
  font-weight: 800;
}

.history-heading p {
  margin: 0;
  color: #987e7e;
  font-size: 10px;
  line-height: 1.6;
  font-weight: 600;
}

.history-card {
  width: 100%;
  overflow: hidden;
  border: 1px solid #b98285;
  border-radius: 15px;
  background: rgba(255, 250, 250, 0.4);
}

.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 49px;
  margin: 0 18px;
  padding: 10px 0;
}

.history-row + .history-row {
  border-top: 1px solid #a99a99;
}

.history-info {
  flex: 1;
  min-width: 0;
}

.history-info h3 {
  margin: 0 0 4px;
  color: #35090c;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.history-info span {
  color: #8e7979;
  font-size: 10px;
  font-weight: 500;
}

.view-details {
  flex-shrink: 0;
  padding: 6px 0 6px 10px;
  border: none;
  background: transparent;
  color: #59070d;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}

.view-details:hover {
  text-decoration: underline;
}

.empty-state {
  padding: 28px 15px;
  color: #907879;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
}

.error-state {
  color: #a32632;
}

.history-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  padding: 20px;
  background: rgba(35, 24, 25, 0.40);
}

.history-modal {
  position: relative;
  width: 352px;
  max-width: 100%;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding: 16px 18px 31px;
  border: none;
  border-radius: 12px;
  background: #f8eeee;
  color: #4a1013;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.06);
}

.history-modal .modal-header {
  position: static;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  margin: 0 0 9px;
  padding: 0;
  background: transparent;
  border: none;
}

.history-modal .modal-label {
  display: block;
  margin: 0;
  color: #a58d8e;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.7px;
}

.history-modal .modal-close {
  position: static;
  flex-shrink: 0;
  display: inline-block;
  margin: 0;
  padding: 2px 0 2px 8px;
  border: none;
  background: transparent;
  color: #a58d8e;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.5px;
  line-height: normal;
  cursor: pointer;
}

.history-modal .modal-close:hover {
  color: #59070d;
}

.modal-title-section h2 {
  margin: 0;
  color: #59070d;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 17px;
  font-weight: 800;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.modal-date {
  margin: 3px 0 25px;
  color: #76696a;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.audit-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 15px;
  row-gap: 20px;
}

.audit-field {
  min-width: 0;
}

.audit-field > span {
  display: block;
  margin-bottom: 4px;
  color: #7f7273;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
}

.audit-field p {
  margin: 0;
  color: #59070d;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.audit-notes {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  margin: 21px auto 0;
  padding: 9px 10px;
  border: 1px solid #b98285;
  border-radius: 12px;
  color: #390b0e;
  text-align: center;
}

.audit-notes strong {
  font-size: 9px;
  font-weight: 700;
  line-height: 1.4;
}

.view-details:focus-visible,
.history-modal .modal-close:focus-visible {
  outline: 2px solid #9c555c;
  outline-offset: 3px;
}

@media (max-width: 480px) {
  .main-content {
    padding: 18px 10px;
  }

  .history-heading {
    margin: 0 3px 22px;
  }

  .history-row {
    margin: 0 10px;
    gap: 8px;
  }

  .history-info h3 {
    font-size: 11px;
  }

  .history-info span {
    font-size: 9px;
  }

  .history-modal {
    width: 352px;
    padding: 16px 15px 24px;
  }

  .modal-title-section h2 {
    font-size: 16px;
  }

  .audit-grid {
    column-gap: 12px;
    row-gap: 18px;
  }
}
</style>
