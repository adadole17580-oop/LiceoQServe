
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { supabase } from '../../lib/supabase'

const REGISTRAR_SERVICE_ID = '6a14093e-89a9-45ab-b1b8-1b2235459e5a'

const loading = ref(false)
const currentTicket = ref({})
const waiting = ref([])
const studentArrived = ref(false)
const message = ref('')

const isQueueOpen = ref(true)
const updatingQueueStatus = ref(false)

let queueSettingsChannel = null
let queueChannel = null

function getTodayDate() {
  const today = new Date()

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
}

function formatQueueNumber(number) {
  return `R-${String(number).padStart(3, '0')}`
}

// LOAD OPEN / CLOSED STATUS
async function fetchQueueSetting() {
  try {
    const { data, error } = await supabase
      .from('queue_settings')
      .select('is_open')
      .eq('service_id', REGISTRAR_SERVICE_ID)
      .single()

    if (error) throw error

    isQueueOpen.value = data.is_open
  } catch (error) {
    console.error('Error loading queue setting:', error)
    message.value = 'Unable to load the Registrar Queue status.'
  }
}

// OPEN OR CLOSE QUEUE
async function toggleQueueStatus() {
  if (updatingQueueStatus.value) return

  updatingQueueStatus.value = true
  message.value = ''

  try {
    const newStatus = !isQueueOpen.value

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) throw userError

    const { error } = await supabase
      .from('queue_settings')
      .update({
        is_open: newStatus,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      })
      .eq('service_id', REGISTRAR_SERVICE_ID)

    if (error) throw error

    isQueueOpen.value = newStatus

    message.value = newStatus
      ? 'Registrar Queue is now OPEN. New students can join the queue.'
      : 'Registrar Queue is now CLOSED. Existing tickets can still be served.'
  } catch (error) {
    console.error('Error updating queue status:', error)
    message.value = error.message || 'Unable to update the queue status.'
  } finally {
    updatingQueueStatus.value = false
  }
}

// LOAD TODAY'S REGISTRAR QUEUE
async function fetchQueue() {
  loading.value = true

  try {
    const { data: queueData, error: queueError } = await supabase
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
        arrival_confirmed_at,
        called_at,
        finished_at
      `)
      .eq('service_id', REGISTRAR_SERVICE_ID)
      .eq('queue_date', getTodayDate())
      .neq('status', 'cancelled')
      .order('queue_number', { ascending: true })

    if (queueError) throw queueError

    const records = queueData || []

    if (records.length === 0) {
      currentTicket.value = {}
      waiting.value = []
      studentArrived.value = false
      return
    }

    const studentIds = [
      ...new Set(records.map(item => item.student_id).filter(Boolean)),
    ]

    let students = []

    if (studentIds.length) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', studentIds)

      if (error) throw error
      students = data || []
    }

    const studentMap = Object.fromEntries(
      students.map(student => [student.id, student.full_name])
    )

    const formattedRecords = records.map(record => ({
      ...record,
      number: formatQueueNumber(record.queue_number),
      name: studentMap[record.student_id] || 'Unknown Student',
      service: 'Registrar Queue',
    }))

    const activeTicket = formattedRecords.find(
      ticket => ticket.called_at && !ticket.finished_at
    )

    currentTicket.value = activeTicket || {}

    studentArrived.value = Boolean(
      activeTicket?.arrival_confirmed_at
    )

    waiting.value = formattedRecords.filter(
      ticket => ticket.status === 'waiting'
    )
  } catch (error) {
    console.error('Error loading queue:', error)
    message.value = error.message || 'Unable to load queue records.'
  } finally {
    loading.value = false
  }
}

// MARK STUDENT AS ARRIVED
async function markArrived() {
  if (!currentTicket.value.id) return

  loading.value = true
  message.value = ''

  try {
    const { error } = await supabase
      .from('queues')
      .update({
        arrival_confirmed_at: new Date().toISOString(),
      })
      .eq('id', currentTicket.value.id)
      .eq('service_id', REGISTRAR_SERVICE_ID)

    if (error) throw error

    message.value = `${currentTicket.value.name} has been marked as arrived.`

    await fetchQueue()
  } catch (error) {
    console.error('Error marking student as arrived:', error)
    message.value = error.message || 'Unable to update arrival status.'
  } finally {
    loading.value = false
  }
}

// CALL NEXT STUDENT
async function callNext() {
  if (!waiting.value.length) {
    message.value = 'There are no students waiting.'
    return
  }

  const next = waiting.value[0]

  loading.value = true
  message.value = ''

  try {
    const { error } = await supabase
      .from('queues')
      .update({
        status: 'serving',
        called_at: new Date().toISOString(),
      })
      .eq('id', next.id)
      .eq('service_id', REGISTRAR_SERVICE_ID)
      .eq('status', 'waiting')

    if (error) throw error

    message.value = `${next.number} is now being served.`

    await fetchQueue()
  } catch (error) {
    console.error('Error calling next student:', error)
    message.value = error.message || 'Unable to call the next student.'
  } finally {
    loading.value = false
  }
}

// COMPLETE CURRENT STUDENT AND CALL NEXT
async function completeAndNext() {
  if (!currentTicket.value.id) return

  const completedNumber = currentTicket.value.number

  loading.value = true
  message.value = ''

  try {
    const { error } = await supabase
      .from('queues')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', currentTicket.value.id)
      .eq('service_id', REGISTRAR_SERVICE_ID)

    if (error) throw error

    await fetchQueue()

    if (waiting.value.length > 0) {
      await callNext()
    } else {
      message.value = `${completedNumber} completed. No more students are waiting.`
    }
  } catch (error) {
    console.error('Error completing queue ticket:', error)
    message.value = error.message || 'Unable to complete the ticket.'
  } finally {
    loading.value = false
  }
}

// REALTIME: QUEUE SETTING
function subscribeToQueueSetting() {
  queueSettingsChannel = supabase
    .channel('registrar-queue-settings')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'queue_settings',
        filter: `service_id=eq.${REGISTRAR_SERVICE_ID}`,
      },
      payload => {
        if (payload.new) {
          isQueueOpen.value = payload.new.is_open
        }
      }
    )
    .subscribe()
}

// REALTIME: QUEUE TICKETS
function subscribeToQueue() {
  queueChannel = supabase
    .channel('registrar-queue-tickets')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'queues',
        filter: `service_id=eq.${REGISTRAR_SERVICE_ID}`,
      },
      () => {
        fetchQueue()
      }
    )
    .subscribe()
}

onMounted(async () => {
  await fetchQueueSetting()
  await fetchQueue()

  subscribeToQueueSetting()
  subscribeToQueue()
})

onUnmounted(() => {
  if (queueSettingsChannel) {
    supabase.removeChannel(queueSettingsChannel)
  }

  if (queueChannel) {
    supabase.removeChannel(queueChannel)
  }
})
</script>

<template>
  <section class="queue-page">
    <div class="page-heading">
      <div>
        <h2>Queue Management</h2>
        <p>Manage student visits and control queue admissions.</p>
      </div>
    </div>

    <!-- QUEUE ADMISSION CONTROL -->
    <section class="queue-control">
      <div class="queue-control-info">
        <strong>Student Queue Admission</strong>
        <span>
          {{
            isQueueOpen
              ? 'The Registrar is currently accepting students.'
              : 'The Registrar is not currently accepting new students.'
          }}
        </span>
      </div>

      <div
        class="queue-status"
        :class="isQueueOpen ? 'queue-open' : 'queue-closed'"
      >
        {{ isQueueOpen ? 'OPEN' : 'CLOSED' }}
      </div>

      <button
        type="button"
        class="queue-toggle-button"
        :class="{ close: isQueueOpen }"
        :disabled="updatingQueueStatus"
        @click="toggleQueueStatus"
      >
        {{
          updatingQueueStatus
            ? 'Updating...'
            : isQueueOpen
              ? 'Close Queue'
              : 'Open Queue'
        }}
      </button>
    </section>

    <!-- NOW SERVING -->
    <section class="current-ticket">
      <span class="serving-label">
        {{ currentTicket.id ? 'Being Served' : 'Now Serving' }}
      </span>

      <strong class="ticket-number">
        {{ currentTicket.number || '—' }}
      </strong>

      <div class="student-details">
        <strong>{{ currentTicket.name || 'No active student' }}</strong>
        <span>{{ currentTicket.service || 'Call the next student' }}</span>
      </div>

      <div class="ticket-actions">
        <button
          class="arrived-button"
          :class="{ arrived: studentArrived }"
          :disabled="!currentTicket.id || studentArrived || loading"
          @click="markArrived"
        >
          {{ studentArrived ? '✓ Student arrived' : 'Student arrived' }}
        </button>

        <button
          class="auto-next-button"
          :disabled="(!currentTicket.id && !waiting.length) || loading"
          @click="currentTicket.id ? completeAndNext() : callNext()"
        >
          {{ currentTicket.id ? 'Complete & auto-next' : 'Call next student' }}
        </button>
      </div>
    </section>

    <p v-if="message" class="feedback-message" role="status">
      {{ message }}
    </p>

    <!-- QUEUE LIST -->
    <section class="queue-list-panel">
      <div class="queue-list-heading">
        <h3>Queue List</h3>
        <span>{{ waiting.length }} waiting</span>
      </div>

      <div class="queue-list">
        <div v-if="loading" class="empty-state">
          Loading queue...
        </div>

        <template v-else>
          <article
            v-if="currentTicket.id"
            class="queue-row current-row"
          >
            <div class="student-info">
              <strong>{{ currentTicket.name }}</strong>
              <span>{{ currentTicket.service }}</span>
            </div>

            <span class="status-pill in-progress">In Progress</span>
          </article>

          <article
            v-for="ticket in waiting"
            :key="ticket.id"
            class="queue-row"
          >
            <div class="student-info">
              <strong>{{ ticket.name }}</strong>
              <span>{{ ticket.service }}</span>
            </div>

            <span class="status-pill waiting-status">Waiting</span>
          </article>

          <div v-if="!currentTicket.id && !waiting.length" class="empty-state">
            No students are currently in the queue.
          </div>
        </template>
      </div>
    </section>

    <div class="queue-footer">
      <span>Authorized registrar staff only</span>

      <button
        class="reset-button"
        @click="fetchQueue"
        :disabled="loading"
      >
        {{ loading ? 'Refreshing...' : 'Refresh queue' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.queue-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 3px 2px 24px;
  color: #300b0e;
}

.page-heading {
  margin: 0;
  padding: 0;
}

.page-heading h2 {
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

/* QUEUE ADMISSION CONTROL */
.queue-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 15px 17px;
  border: 1px solid #cfaeb2;
  border-radius: 12px;
  background: #f8eeee;
}

.queue-control-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.queue-control-info strong {
  color: #50070e;
  font-size: 13px;
}

.queue-control-info span {
  color: #8d6e72;
  font-size: 11px;
  line-height: 1.5;
}

.queue-status {
  padding: 6px 13px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.queue-open {
  background: #dcefe0;
  color: #216b35;
}

.queue-closed {
  background: #f4dfe1;
  color: #9b2634;
}

.queue-toggle-button {
  padding: 8px 14px;
  border: 1px solid #50070e;
  border-radius: 7px;
  background: #50070e;
  color: white;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.queue-toggle-button.close {
  background: #fff;
  color: #50070e;
}

.queue-toggle-button:hover:not(:disabled) {
  background: #6c1720;
  color: #fff;
}

.queue-toggle-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* NOW SERVING */
.current-ticket {
  display: flex;
  min-height: 198px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 22px 18px 17px;
  border-radius: 20px;
  background: #50070e;
  color: #fff;
  text-align: center;
}

.serving-label {
  margin-bottom: 3px;
  color: #f1dfe0;
  font-size: 12px;
}

.ticket-number {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(48px, 6vw, 68px);
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: 1px;
}

.student-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 7px;
}

.student-details strong {
  font-size: 12px;
  font-weight: 700;
}

.student-details span {
  color: #f1dfe0;
  font-size: 11px;
}

.ticket-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 13px;
}

.arrived-button,
.auto-next-button {
  min-height: 25px;
  padding: 4px 10px;
  border: 1px solid #d9bfc1;
  border-radius: 8px;
  background: transparent;
  color: #fff;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.arrived-button:disabled {
  cursor: default;
  opacity: 0.55;
}

.arrived-button.arrived {
  border-color: #c9e2cd;
  color: #d7f1dc;
  opacity: 1;
}

.auto-next-button {
  border-color: #fff;
}

.auto-next-button:hover:not(:disabled) {
  background: #6c1720;
}

.auto-next-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

/* FEEDBACK */
.feedback-message {
  margin: -4px 0 0;
  padding: 10px 12px;
  border: 1px solid #d9bfc1;
  border-radius: 6px;
  background: #f8eeee;
  color: #50070e;
  font-size: 11px;
  line-height: 1.5;
}

/* QUEUE LIST */
.queue-list-panel {
  overflow: hidden;
  border: 1px solid #cfaeb2;
  border-radius: 0 0 19px 0;
  background: #f7eeee;
}

.queue-list-heading {
  display: flex;
  min-height: 41px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #d8b9bd;
  background: #f1e1e2;
}

.queue-list-heading h3 {
  margin: 0;
  color: #50070e;
  font-size: 13px;
  font-weight: 700;
}

.queue-list-heading > span {
  color: #50070e;
  font-size: 11px;
  font-weight: 700;
}

.queue-row {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  padding: 7px 14px;
  border-bottom: 1px solid #d8b9bd;
  background: #f8eeee;
}

.queue-row:last-child {
  border-bottom: 0;
}

.queue-row.current-row {
  background: #f2e2e3;
}

.student-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.student-info strong {
  overflow-wrap: anywhere;
  color: #261012;
  font-size: 11px;
  font-weight: 500;
}

.student-info span {
  overflow-wrap: anywhere;
  color: #8d6e72;
  font-size: 10px;
}

.status-pill {
  display: inline-flex;
  min-width: 86px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 9px;
  font-weight: 500;
}

.in-progress {
  background: #eddf82;
  color: #5f5116;
}

.waiting-status {
  background: #eddf82;
  color: #5f5116;
}

.empty-state {
  padding: 28px 12px;
  color: #8d6e72;
  font-size: 12px;
  text-align: center;
}

/* FOOTER */
.queue-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #8d6e72;
  font-size: 10px;
}

.reset-button {
  padding: 6px 10px;
  border: 1px solid #d9bfc1;
  border-radius: 6px;
  background: #f8eeee;
  color: #50070e;
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}

.reset-button:hover {
  background: #f1e1e2;
}

.reset-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

@media (max-width: 600px) {
  .page-heading h2 {
    font-size: 30px;
  }

  .current-ticket {
    min-height: 185px;
    padding: 20px 12px;
  }

  .queue-row {
    gap: 8px;
    padding: 8px 10px;
  }

  .status-pill {
    min-width: 74px;
    padding: 4px 7px;
  }

  .queue-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .queue-control {
    align-items: flex-start;
  }
}
</style>
