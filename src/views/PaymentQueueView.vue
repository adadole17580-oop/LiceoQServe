
<template>
  <main class="queue-page">
    <header class="page-heading">
      <div>
        <h1>Queue Management</h1>
        <p class="subtitle">Automatic next, 30-second arrival timer, and three recall attempts.</p>
      </div>
    </header>

    <div v-if="loading && queues.length === 0" class="empty-state">
      Loading queue...
    </div>

    <template v-else>
      <section class="serving-card">
        <p class="serving-label">NOW SERVING</p>

        <h2>{{ servingQueue?.queue_number || '—' }}</h2>

        <p class="serving-name">
          {{ servingQueue?.student_name || 'No student being served' }}
        </p>

        <p class="serving-service">
          {{ servingQueue?.service_type || 'Cashier Queue' }}
        </p>

        <p class="counter-label">
          {{ assignedCounterId || 'No counter assigned' }} ·
          {{ counterStatus }}
        </p>

        <template v-if="servingQueue">
          <div
            v-if="!servingQueue.arrival_confirmed_at"
            class="arrival-timer"
            :class="{ 'timer-expired': remainingSeconds <= 5 }"
          >
            <span>TIME TO ARRIVE</span>
            <strong>
              {{ remainingSeconds > 0 ? `${remainingSeconds}s` : 'Processing...' }}
            </strong>
          </div>

          <div v-else class="arrival-confirmed">
            <span class="arrival-check">✓</span>
            Student has arrived
          </div>

          <div class="serving-actions">
            <button
              v-if="!servingQueue.arrival_confirmed_at"
              class="serving-button arrival-button"
              :disabled="!!processingId || remainingSeconds <= 0"
              @click="askConfirmation('arrival', servingQueue)"
            >
              Student Arrived
            </button>

            <template v-else>
              <button
                class="serving-button finish-button"
                :disabled="!!processingId"
                @click="askConfirmation('finish', servingQueue)"
              >
                Complete & Call Next
              </button>

              <button
                class="serving-button suspend-button"
                :disabled="!!processingId"
                @click="askConfirmation('finishSuspend', servingQueue)"
              >
                Complete & Suspend Service
              </button>
            </template>

            <button
              v-if="servingQueue.call_type === 'recall' && !servingQueue.arrival_confirmed_at"
              class="serving-button undo-button"
              :disabled="!!processingId"
              @click="askConfirmation('undo', servingQueue)"
            >
              Undo Recall
            </button>
          </div>
        </template>

        <template v-else>
          <p v-if="!assignedCounterId" class="no-serving-message">
            No counter is assigned to your account.
          </p>

          <template v-else-if="!counterInfo?.is_open">
            <p class="no-serving-message">
              Counter is closed. No students will be called.
            </p>
          </template>

          <template v-else-if="counterInfo?.is_suspended">
            <p class="suspended-message">
              Service is currently suspended. The next student will not be called until service resumes.
            </p>

            <button
              class="serving-button resume-button"
              :disabled="!!processingId"
              @click="askConfirmation('resume')"
            >
              Resume Service
            </button>
          </template>

          <p v-else class="no-serving-message">
            Waiting for the next student...
          </p>
        </template>
      </section>

      <section class="queue-panel">
        <div class="queue-heading">
          <h2>Queue List</h2>
          <span>{{ counts.waiting }} Waiting</span>
        </div>

        <div v-if="waitingQueues.length === 0" class="empty-list">
          No students are waiting in the queue.
        </div>

        <div
          v-for="ticket in waitingQueues"
          :key="ticket.id"
          class="queue-item"
        >
          <div class="ticket-number">
            {{ ticket.queue_number || '—' }}
          </div>

          <div class="ticket-details">
            <strong>{{ ticket.student_name }}</strong>
            <p>{{ ticket.service_type }}</p>
            <small>{{ ticket.student_email || 'No email available' }}</small>
          </div>

          <span class="ticket-status waiting-status">
            Waiting
          </span>
        </div>

        <div
          v-for="ticket in skippedQueues"
          :key="ticket.id"
          class="queue-item skipped-item"
        >
          <div class="ticket-number">
            {{ ticket.queue_number || '—' }}
          </div>

          <div class="ticket-details">
            <strong>{{ ticket.student_name }}</strong>
            <p>{{ ticket.service_type }}</p>

            <small v-if="ticket.availability_status === 'pending'">
              Awaiting student response
            </small>

            <small v-else-if="ticket.availability_status === 'confirmed'">
              Eligible for automatic recall · {{ ticket.recall_count }}/3 attempts
            </small>

            <small v-else-if="ticket.recall_count >= 3">
              Maximum recall attempts reached
            </small>

            <small v-else>
              Student unavailable
            </small>
          </div>

          <span
            class="ticket-status"
            :class="ticket.availability_status === 'confirmed'
              ? 'eligible-status'
              : 'skipped-status'"
          >
            {{ ticket.availability_status === 'confirmed'
              ? 'Recall Priority'
              : ticket.availability_status === 'pending'
                ? 'Pending'
                : 'Absent' }}
          </span>
        </div>

        <div v-if="loading" class="loading-message">
          Refreshing queue...
        </div>
      </section>
    </template>

    <AppModal
      v-model="modalOpen"
      :title="modalTitle"
      :description="modalDescription"
      :type="modalType"
      :confirm-text="modalConfirmText"
      :cancel-text="'Cancel'"
      :show-cancel="modalKind === 'confirm'"
      :loading="!!processingId"
      :loading-text="'Processing...'"
      :confirm-disabled="!!processingId"
      @confirm="handleModalConfirm"
      @cancel="closeModal"
    >
      <div
        v-if="modalKind === 'confirm' && confirmation?.ticket"
        class="modal-ticket"
      >
        <strong>{{ confirmation.ticket.queue_number || '—' }}</strong>
        <span>{{ confirmation.ticket.student_name }}</span>
      </div>
    </AppModal>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { supabase } from '../supabase.js'
import AppModal from '../components/AppModal.vue'

const CASHIER_SERVICE_ID = '1693d4bf-4bf9-48e0-948a-a5330387dfe2'

const queues = ref([])
const loading = ref(false)
const processingId = ref(null)

const assignedCounterId = ref(null)
const counterInfo = ref(null)
const confirmation = ref(null)

const modalOpen = ref(false)
const modalKind = ref('')
const modalTitle = ref('')
const modalDescription = ref('')
const modalType = ref('info')
const modalConfirmText = ref('Okay')

const currentTime = ref(Date.now())
const realtimeChannel = ref(null)

let clockInterval = null
let expiryInterval = null
let dispatchInterval = null
let realtimeTimeout = null

let processingExpiredCalls = false
let dispatching = false
let componentMounted = false

const confirmationMessages = {
  arrival: {
    title: 'Confirm Student Arrival?',
    description: 'Confirm that this student has arrived at your counter. The 30-second arrival timer will stop.',
    button: 'Confirm Arrival',
  },
  finish: {
    title: 'Complete Transaction?',
    description: 'This student will be marked as finished. The next eligible student will automatically be called.',
    button: 'Complete & Call Next',
  },
  finishSuspend: {
    title: 'Complete Transaction & Suspend Service?',
    description: 'This student will be marked as finished and your counter service will be suspended. No next student will be called until you resume service.',
    button: 'Complete & Suspend',
  },
  undo: {
    title: 'Undo Recall?',
    description: 'This student will be returned to recall eligibility without counting this attempt as a missed recall.',
    button: 'Undo Recall',
  },
  resume: {
    title: 'Resume Counter Service?',
    description: 'Your counter will become available again. The next eligible student will automatically be called if one is waiting.',
    button: 'Resume Service',
  },
}

const servingQueue = computed(() =>
  queues.value.find(
    (item) =>
      item.status === 'being_served' &&
      item.counter_name === assignedCounterId.value
  ) || null
)

const counterStatus = computed(() => {
  if (!counterInfo.value) return 'STATUS UNKNOWN'
  if (!counterInfo.value.is_open) return 'COUNTER CLOSED'
  if (counterInfo.value.is_suspended) return 'SERVICE SUSPENDED'
  return 'SERVICE ACTIVE'
})

const remainingSeconds = computed(() => {
  if (!servingQueue.value || servingQueue.value.arrival_confirmed_at) {
    return 0
  }

  if (!servingQueue.value.arrival_deadline_at) {
    return 0
  }

  const deadline = new Date(
    servingQueue.value.arrival_deadline_at
  ).getTime()

  return Math.max(0, Math.ceil((deadline - currentTime.value) / 1000))
})

const counts = computed(() => ({
  waiting: queues.value.filter(
    (item) => item.status === 'waiting'
  ).length,

  skipped: queues.value.filter(
    (item) => item.status === 'skipped'
  ).length,
}))

const waitingQueues = computed(() =>
  queues.value
    .filter((item) => item.status === 'waiting')
    .sort((a, b) => a.queue_number - b.queue_number)
)

const skippedQueues = computed(() =>
  queues.value
    .filter((item) => item.status === 'skipped')
    .sort((a, b) => {
      if (
        a.availability_status === 'confirmed' &&
        b.availability_status !== 'confirmed'
      ) return -1

      if (
        a.availability_status !== 'confirmed' &&
        b.availability_status === 'confirmed'
      ) return 1

      return new Date(a.missed_at || a.created_at || 0) -
        new Date(b.missed_at || b.created_at || 0)
    })
)

function openModal({
  kind = 'notice',
  title,
  description,
  type = 'info',
  confirmText = 'Okay',
}) {
  modalKind.value = kind
  modalTitle.value = title
  modalDescription.value = description
  modalType.value = type
  modalConfirmText.value = confirmText
  modalOpen.value = true
}

function closeModal() {
  if (processingId.value) return

  modalOpen.value = false
  modalKind.value = ''

  if (confirmation.value) {
    confirmation.value = null
  }
}

function showSuccess(message) {
  confirmation.value = null

  openModal({
    kind: 'success',
    title: 'Action Completed',
    description: message,
    type: 'success',
    confirmText: 'Okay',
  })
}

function showError(message) {
  confirmation.value = null

  openModal({
    kind: 'error',
    title: 'Something Went Wrong',
    description: message,
    type: 'error',
    confirmText: 'Okay',
  })
}

function askConfirmation(action, ticket = null) {
  const content = confirmationMessages[action]

  if (!content) return

  confirmation.value = { action, ticket }

  openModal({
    kind: 'confirm',
    title: content.title,
    description: content.description,
    type: 'warning',
    confirmText: content.button,
  })
}

async function handleModalConfirm() {
  if (modalKind.value !== 'confirm') {
    closeModal()
    return
  }

  if (!confirmation.value || processingId.value) return

  const { action, ticket } = confirmation.value

  if (action === 'resume') {
    await resumeCounterService()
    return
  }

  if (!ticket) return

  await performQueueAction(ticket, action)
}

function getErrorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.'
}

async function loadAssignedCounter() {
  const { data, error } = await supabase.rpc('cashier_get_counters_v2')

  if (error) throw error

  const assignedCounter = (data || []).find(
    (counter) => counter.is_mine
  )

  if (!assignedCounter) {
    assignedCounterId.value = null
    counterInfo.value = null
    throw new Error('No counter is assigned to your cashier account.')
  }

  assignedCounterId.value = assignedCounter.counter_name
  counterInfo.value = assignedCounter
}

async function refreshCounterAndQueue() {
  await loadAssignedCounter()
  await loadQueue()
}

async function loadQueue() {
  if (!assignedCounterId.value) {
    queues.value = []
    return
  }

  loading.value = true

  try {
    const { data, error } = await supabase
      .from('queues')
      .select(`
        id,
        student_id,
        service_id,
        queue_number,
        queue_date,
        counter_name,
        status,
        recall_count,
        call_type,
        arrival_deadline_at,
        arrival_confirmed_at,
        missed_at,
        availability_status,
        recall_priority_at,
        recalled_at,
        created_at,
        student:profiles!queues_student_id_fkey(
          full_name,
          university_email
        ),
        service:office_services!queues_service_id_fkey(
          name,
          office_id
        )
      `)
      .eq('service_id', CASHIER_SERVICE_ID)
      .eq('queue_date', new Date().toISOString().slice(0, 10))
      .in('status', ['waiting', 'being_served', 'skipped'])
      .order('queue_number', { ascending: true })

    if (error) throw error

    queues.value = (data || []).map((item) => ({
      ...item,
      student_name: item.student?.full_name || 'Student',
      student_email: item.student?.university_email || '',
      service_type: item.service?.name || 'Cashier Queue',
    }))
  } catch (error) {
    console.error('Load queue error:', error)
    showError(getErrorMessage(error))
  } finally {
    loading.value = false
  }
}

async function dispatchOpenCounters() {
  if (dispatching || !componentMounted) return

  dispatching = true

  try {
    const { error } = await supabase.rpc(
      'cashier_dispatch_open_counters'
    )

    if (error) throw error
  } catch (error) {
    console.error('Queue dispatch error:', error)
  } finally {
    dispatching = false
  }
}

async function processExpiredCalls() {
  if (processingExpiredCalls || !componentMounted) return

  processingExpiredCalls = true

  try {
    const { data, error } = await supabase.rpc(
      'cashier_process_expired_calls'
    )

    if (error) throw error

    if (
      data?.expired_calls_processed > 0 ||
      (data?.dispatch?.results || []).some(
        (result) => result.queue_id
      )
    ) {
      await loadQueue()
      await loadAssignedCounter()
    }
  } catch (error) {
    console.error('Expired call processing error:', error)
  } finally {
    processingExpiredCalls = false
  }
}

async function performQueueAction(ticket, action) {
  if (processingId.value) return

  processingId.value = ticket.id

  try {
    let rpcName = ''
    let rpcParams = {}

    if (action === 'arrival') {
      rpcName = 'cashier_confirm_student_arrival'
      rpcParams = {
        p_queue_id: ticket.id,
      }
    }

    if (action === 'finish') {
      rpcName = 'cashier_finish_queue'
      rpcParams = {
        p_queue_id: ticket.id,
      }
    }

    if (action === 'finishSuspend') {
      rpcName = 'cashier_finish_queue_and_suspend'
      rpcParams = {
        p_queue_id: ticket.id,
      }
    }

    if (action === 'undo') {
      rpcName = 'cashier_undo_recall'
      rpcParams = {
        p_queue_id: ticket.id,
      }
    }

    if (!rpcName) {
      throw new Error('Invalid queue action.')
    }

    const { data, error } = await supabase.rpc(
      rpcName,
      rpcParams
    )

    if (error) throw error

    if (data?.success === false) {
      throw new Error(data.message || 'The action was not completed.')
    }

    confirmation.value = null
    modalOpen.value = false

    if (action === 'arrival') {
      await loadQueue()

      showSuccess(
        `Student ${ticket.queue_number} has been marked as arrived. The arrival timer has stopped.`
      )
    }

    if (action === 'finish') {
      await refreshCounterAndQueue()

      showSuccess(
        `Student ${ticket.queue_number} completed. The next eligible student will be called automatically.`
      )
    }

    if (action === 'finishSuspend') {
      await refreshCounterAndQueue()

      showSuccess(
        `Student ${ticket.queue_number} completed. Counter ${assignedCounterId.value} is now suspended. Resume service when you are ready to call the next student.`
      )
    }

    if (action === 'undo') {
      await loadQueue()

      showSuccess(
        `Recall for student ${ticket.queue_number} was undone successfully.`
      )
    }
  } catch (error) {
    console.error('Queue action error:', error)

    confirmation.value = null
    modalOpen.value = false

    showError(getErrorMessage(error))
    await loadQueue()
    await loadAssignedCounter()
  } finally {
    processingId.value = null
  }
}

async function resumeCounterService() {
  if (processingId.value) return

  processingId.value = 'resume-counter'

  try {
    const { data, error } = await supabase.rpc(
      'cashier_resume_counter'
    )

    if (error) throw error

    if (data?.success === false) {
      throw new Error(data.message || 'Unable to resume counter service.')
    }

    confirmation.value = null
    modalOpen.value = false

    await dispatchOpenCounters()
    await refreshCounterAndQueue()

    showSuccess(
      `Counter ${data?.counter_name || assignedCounterId.value} has resumed service. The next eligible student will be called automatically if one is waiting.`
    )
  } catch (error) {
    console.error('Resume counter error:', error)

    confirmation.value = null
    modalOpen.value = false

    showError(getErrorMessage(error))
    await loadAssignedCounter()
    await loadQueue()
  } finally {
    processingId.value = null
  }
}

function handleRealtimeChange() {
  clearTimeout(realtimeTimeout)

  realtimeTimeout = setTimeout(async () => {
    if (!componentMounted) return

    try {
      await loadAssignedCounter()
      await dispatchOpenCounters()
      await loadQueue()
    } catch (error) {
      console.error('Realtime queue refresh error:', error)
    }
  }, 500)
}

function subscribeToQueue() {
  // Avoid registering callbacks on an already subscribed channel.
  if (realtimeChannel.value) return

  const channel = supabase
    .channel('cashier-queue-live')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'queues',
        filter: `service_id=eq.${CASHIER_SERVICE_ID}`,
      },
      handleRealtimeChange
    )

  realtimeChannel.value = channel

  // Register all callbacks before subscribing.
  channel.subscribe((status) => {
    if (status === 'CHANNEL_ERROR') {
      console.error('Cashier queue realtime subscription failed.')
    }

    if (status === 'SUBSCRIBED') {
      console.log('Cashier queue realtime connected.')
    }
  })
}

onMounted(async () => {
  componentMounted = true

  try {
    await loadAssignedCounter()
    await dispatchOpenCounters()
    await loadAssignedCounter()
    await loadQueue()

    subscribeToQueue()

    clockInterval = setInterval(() => {
      currentTime.value = Date.now()
    }, 1000)

    expiryInterval = setInterval(() => {
      processExpiredCalls()
    }, 1000)

    dispatchInterval = setInterval(async () => {
      await dispatchOpenCounters()

      try {
        await loadAssignedCounter()
        await loadQueue()
      } catch (error) {
        console.error('Queue refresh error:', error)
      }
    }, 5000)
  } catch (error) {
    console.error('Queue initialization error:', error)
    showError(getErrorMessage(error))
  }
})

onUnmounted(() => {
  componentMounted = false

  clearTimeout(realtimeTimeout)

  clearInterval(clockInterval)
  clearInterval(expiryInterval)
  clearInterval(dispatchInterval)

  if (realtimeChannel.value) {
    supabase.removeChannel(realtimeChannel.value)
    realtimeChannel.value = null
  }
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');

* {
  box-sizing: border-box;
}

.queue-page {
  min-height: 100%;
  padding: 24px;
  color: #382629;
  background: #f0e6e6;
  font-family: 'Inter', sans-serif;
}

.page-heading {
  margin-bottom: 18px;
}

.page-heading h1 {
  margin: 0 0 5px;
  color: #481522;
  font-family: 'Playfair Display', serif;
  font-size: 27px;
  font-weight: 700;
}

.subtitle {
  margin: 0;
  color: #89777a;
  font-size: 11px;
}

.serving-card {
  display: flex;
  min-height: 145px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
  padding: 18px;
  color: #fff;
  background: #501313;
  border-radius: 9px;
  text-align: center;
}

.serving-label {
  margin: 0 0 2px;
  color: #e4cbd1;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1.5px;
}

.serving-card h2 {
  margin: 0;
  color: #fff;
  font-family: 'Playfair Display', serif;
  font-size: clamp(34px, 4vw, 46px);
  line-height: 1.15;
}

.serving-name {
  margin: 5px 0 3px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.serving-service {
  margin: 0;
  color: #e4cbd1;
  font-size: 10px;
}

.counter-label {
  margin: 8px 0 0;
  color: #e4cbd1;
  font-size: 9px;
  letter-spacing: 1px;
}

.arrival-timer {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 13px;
  color: #f0d8a7;
}

.arrival-timer span {
  font-size: 9px;
  letter-spacing: 1px;
}

.arrival-timer strong {
  font-size: 25px;
}

.arrival-timer.timer-expired {
  color: #ffb7b7;
}

.arrival-confirmed {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 13px;
  color: #d4f0d9;
  font-size: 11px;
  font-weight: 600;
}

.arrival-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 19px;
  height: 19px;
  border-radius: 50%;
  background: #d4f0d9;
  color: #286647;
  font-size: 12px;
}

.serving-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 9px;
  margin-top: 13px;
}

.serving-button {
  padding: 8px 13px;
  color: #fff;
  background: transparent;
  border: 1px solid #a87880;
  border-radius: 5px;
  font-family: inherit;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}

.serving-button:hover:not(:disabled) {
  background: #68252b;
}

.arrival-button {
  border-color: #c9a16c;
  background: #c9a16c;
  color: #381c1c;
}

.arrival-button:hover:not(:disabled) {
  background: #b58b55;
}

.finish-button {
  border-color: #c39b73;
  background: #c39b73;
  color: #381c1c;
}

.finish-button:hover:not(:disabled) {
  background: #ae855e;
}

.suspend-button {
  border-color: #d5a4a4;
  background: #7c3038;
  color: #fff;
}

.suspend-button:hover:not(:disabled) {
  background: #913d46;
}

.resume-button {
  margin-top: 13px;
  border-color: #c9a16c;
  background: #c9a16c;
  color: #381c1c;
}

.resume-button:hover:not(:disabled) {
  background: #b58b55;
}

.undo-button {
  border-color: #a87880;
}

.no-serving-message,
.suspended-message {
  margin: 12px 0 0;
  color: #e4cbd1;
  font-size: 10px;
}

.suspended-message {
  max-width: 460px;
  color: #f0d8a7;
  line-height: 1.6;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.queue-panel {
  overflow: hidden;
  background: #f8eeee;
  border: 1px solid #eadada;
  border-radius: 8px;
}

.queue-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 14px;
  background: #dfc5c8;
}

.queue-heading h2 {
  margin: 0;
  color: #54232e;
  font-family: 'Playfair Display', serif;
  font-size: 13px;
}

.queue-heading span {
  color: #6e4c53;
  font-size: 9px;
  font-weight: 600;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 47px;
  padding: 8px 13px;
  border-bottom: 1px solid #eadcdd;
}

.queue-item:last-child {
  border-bottom: 0;
}

.ticket-number {
  flex-shrink: 0;
  min-width: 43px;
  color: #762036;
  font-size: 10px;
  font-weight: 700;
}

.ticket-details {
  flex: 1;
  min-width: 0;
}

.ticket-details strong {
  display: block;
  overflow: hidden;
  margin-bottom: 3px;
  color: #443035;
  font-size: 10px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket-details p {
  overflow: hidden;
  margin: 0 0 2px;
  color: #79686c;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket-details small {
  display: block;
  overflow: hidden;
  color: #a09295;
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket-status {
  flex-shrink: 0;
  padding: 5px 9px;
  border-radius: 20px;
  font-size: 8px;
  font-weight: 600;
  text-align: center;
}

.waiting-status {
  color: #8a641e;
  background: #fff9e9;
  border: 1px solid #f0e2bd;
}

.skipped-item {
  background: #fcf4f1;
}

.skipped-status {
  color: #98575b;
  background: #f2dddd;
}

.eligible-status {
  color: #286647;
  background: #edf8f0;
}

.empty-state,
.empty-list,
.loading-message {
  padding: 22px 15px;
  color: #918084;
  font-size: 11px;
  text-align: center;
}

.loading-message {
  padding: 10px;
}

.modal-ticket {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 16px;
  padding: 13px;
  background: #f7eeee;
  border: 1px solid #eadada;
  border-radius: 9px;
  text-align: center;
}

.modal-ticket strong {
  color: #800000;
  font-family: 'Playfair Display', serif;
  font-size: 25px;
}

.modal-ticket span {
  color: #594348;
  font-size: 12px;
}

@media (max-width: 650px) {
  .queue-page {
    padding: 18px 12px;
  }

  .page-heading h1 {
    font-size: 24px;
  }

  .serving-card {
    min-height: 135px;
  }

  .queue-item {
    gap: 8px;
    padding: 8px;
  }

  .ticket-number {
    min-width: 38px;
  }

  .ticket-status {
    max-width: 95px;
  }
}
</style>
