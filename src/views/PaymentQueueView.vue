
<template>
  <main class="queue-page">
    <header class="page-heading">
      <div>
        <h1>Queue Management</h1>
        <p class="subtitle">
          Automatic next, 30-second arrival timer, and three recall attempts.
        </p>
      </div>
    </header>

    <div v-if="loading && queues.length === 0" class="empty-state">
      Loading queue...
    </div>

    <template v-else>
      <!-- NOW SERVING -->
      <section class="serving-card">
        <p class="serving-label">NOW SERVING</p>

        <h2>{{ formatQueueNumber(servingQueue?.queue_number) }}</h2>

        <p class="serving-name">
          {{ servingQueue?.student_name || 'No student being served' }}
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
              Service is currently suspended. The next student will not be
              called until service resumes.
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

      <!-- QUEUE LIST -->
      <section class="queue-panel">
        <div class="queue-heading">
          <div>
            <h2>Queue List</h2>
            <p>Students currently waiting for their turn</p>
          </div>

          <span class="waiting-count">
            {{ counts.waiting }} Waiting
          </span>
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
            {{ formatQueueNumber(ticket.queue_number) }}
          </div>

          <div class="ticket-details">
            <strong>{{ ticket.student_name }}</strong>
            <small>Waiting for their turn</small>
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
            {{ formatQueueNumber(ticket.queue_number) }}
          </div>

          <div class="ticket-details">
            <strong>{{ ticket.student_name }}</strong>

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

    <!-- CONFIRMATION MODAL -->
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
        <strong>
          {{ formatQueueNumber(confirmation.ticket.queue_number) }}
        </strong>
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

// Display-only number formatting.
// Does not modify queue numbers stored in Supabase.
function formatQueueNumber(value) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  const number = String(value).trim()

  if (/^C-\d+$/i.test(number)) {
    const numericPart = number.replace(/^C-/i, '')
    return `C-${numericPart.padStart(3, '0')}`
  }

  if (/^\d+$/.test(number)) {
    return `C-${number.padStart(3, '0')}`
  }

  return number
}

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
          full_name
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
        `Student ${formatQueueNumber(ticket.queue_number)} has been marked as arrived. The arrival timer has stopped.`
      )
    }

    if (action === 'finish') {
      await refreshCounterAndQueue()

      showSuccess(
        `Student ${formatQueueNumber(ticket.queue_number)} completed. The next eligible student will be called automatically.`
      )
    }

    if (action === 'finishSuspend') {
      await refreshCounterAndQueue()

      showSuccess(
        `Student ${formatQueueNumber(ticket.queue_number)} completed. Counter ${assignedCounterId.value} is now suspended. Resume service when you are ready to call the next student.`
      )
    }

    if (action === 'undo') {
      await loadQueue()

      showSuccess(
        `Recall for student ${formatQueueNumber(ticket.queue_number)} was undone successfully.`
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
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800&display=swap');

* {
  box-sizing: border-box;
}

.queue-page {
  min-height: 100%;
  padding: 30px;
  color: #382629;
  background: #f0e6e6;
  font-family: 'Inter', sans-serif;
}

/* PAGE HEADING */

.page-heading {
  margin-bottom: 22px;
}

.page-heading h1 {
  margin: 0 0 6px;
  color: #481522;
  font-family: 'Playfair Display', serif;
  font-size: clamp(26px, 3vw, 34px);
  font-weight: 700;
}

.subtitle {
  margin: 0;
  color: #89777a;
  font-size: 12px;
}

/* NOW SERVING CARD */

.serving-card {
  display: flex;
  min-height: 280px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 25px;
  padding: 30px 20px;
  color: #fff;
  background: #501313;
  border-radius: 14px;
  text-align: center;
  box-shadow: 0 5px 16px rgba(65, 17, 20, 0.12);
}

.serving-label {
  margin: 0 0 5px;
  color: #d9b9bd;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 3px;
}

.serving-card h2 {
  margin: 0;
  color: #fff;
  font-family: 'Playfair Display', serif;
  font-size: clamp(58px, 7vw, 82px);
  font-weight: 700;
  line-height: 1.12;
  letter-spacing: 1px;
}

.serving-name {
  margin: 10px 0 4px;
  color: #fff;
  font-size: 17px;
  font-weight: 600;
}

.counter-label {
  margin: 5px 0 0;
  color: #d9b9bd;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 1px;
}

/* ARRIVAL TIMER */

.arrival-timer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 18px;
  color: #f0d8a7;
}

.arrival-timer span {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.5px;
}

.arrival-timer strong {
  font-size: 32px;
  font-weight: 700;
}

.arrival-timer.timer-expired {
  color: #ffb7b7;
}

.arrival-confirmed {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
  color: #d4f0d9;
  font-size: 13px;
  font-weight: 600;
}

.arrival-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #d4f0d9;
  color: #286647;
  font-size: 14px;
}

/* SERVING ACTIONS */

.serving-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 18px;
}

.serving-button {
  padding: 10px 16px;
  color: #fff;
  background: transparent;
  border: 1px solid #a87880;
  border-radius: 7px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.serving-button:hover:not(:disabled) {
  background: #68252b;
  transform: translateY(-1px);
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
  margin-top: 16px;
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
  margin: 15px 0 0;
  color: #e4cbd1;
  font-size: 12px;
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

/* QUEUE PANEL */

.queue-panel {
  overflow: hidden;
  background: #f8eeee;
  border: 1px solid #e5d0d2;
  border-radius: 12px;
  box-shadow: 0 4px 14px rgba(65, 17, 20, 0.06);
}

.queue-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  padding: 17px 20px;
  background: #dfc5c8;
}

.queue-heading h2 {
  margin: 0;
  color: #54232e;
  font-family: 'Playfair Display', serif;
  font-size: 18px;
}

.queue-heading p {
  margin: 4px 0 0;
  color: #80666b;
  font-size: 10px;
}

.waiting-count {
  flex-shrink: 0;
  padding: 7px 12px;
  color: #6e4c53;
  background: #f8eeee;
  border: 1px solid #eadada;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
}

/* QUEUE ITEMS */

.queue-item {
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: 76px;
  padding: 13px 20px;
  border-bottom: 1px solid #eadcdd;
  transition: background 0.2s ease;
}

.queue-item:hover {
  background: #fff8f8;
}

.queue-item:last-child {
  border-bottom: 0;
}

.ticket-number {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-start;
  min-width: 105px;
  color: #762036;
  font-family: 'Playfair Display', serif;
  font-size: 25px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.ticket-details {
  flex: 1;
  min-width: 0;
}

.ticket-details strong {
  display: block;
  overflow: hidden;
  margin-bottom: 5px;
  color: #443035;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket-details small {
  display: block;
  overflow: hidden;
  color: #938084;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* STATUS BADGES */

.ticket-status {
  flex-shrink: 0;
  min-width: 85px;
  padding: 7px 12px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
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

.skipped-item:hover {
  background: #fff0eb;
}

.skipped-status {
  color: #98575b;
  background: #f2dddd;
}

.eligible-status {
  color: #286647;
  background: #edf8f0;
}

/* EMPTY AND LOADING STATES */

.empty-state,
.empty-list,
.loading-message {
  padding: 28px 18px;
  color: #918084;
  font-size: 12px;
  text-align: center;
}

.loading-message {
  padding: 13px;
  background: #fbf4f4;
}

/* MODAL TICKET */

.modal-ticket {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 16px;
  padding: 16px;
  background: #f7eeee;
  border: 1px solid #eadada;
  border-radius: 9px;
  text-align: center;
}

.modal-ticket strong {
  color: #800000;
  font-family: 'Playfair Display', serif;
  font-size: 32px;
}

.modal-ticket span {
  color: #594348;
  font-size: 13px;
}

/* RESPONSIVE */

@media (max-width: 768px) {
  .queue-page {
    padding: 22px 16px;
  }

  .serving-card {
    min-height: 250px;
  }

  .serving-card h2 {
    font-size: clamp(48px, 11vw, 68px);
  }

  .ticket-number {
    min-width: 90px;
    font-size: 21px;
  }

  .queue-item {
    gap: 12px;
    padding: 12px;
  }
}

@media (max-width: 480px) {
  .queue-page {
    padding: 18px 10px;
  }

  .page-heading h1 {
    font-size: 25px;
  }

  .serving-card {
    min-height: 230px;
    padding: 24px 12px;
  }

  .serving-card h2 {
    font-size: 48px;
  }

  .serving-actions {
    gap: 7px;
  }

  .serving-button {
    padding: 9px 10px;
    font-size: 10px;
  }

  .queue-heading {
    padding: 13px;
  }

  .queue-heading h2 {
    font-size: 16px;
  }

  .queue-item {
    gap: 8px;
    min-height: 68px;
    padding: 10px;
  }

  .ticket-number {
    min-width: 75px;
    font-size: 18px;
  }

  .ticket-details strong {
    font-size: 11px;
  }

  .ticket-details small {
    font-size: 9px;
  }

  .ticket-status {
    min-width: 70px;
    padding: 6px 7px;
    font-size: 9px;
  }
}
</style>
