
<template>
  <main class="main-content">
    <div class="page-heading">
      <h2>History</h2>
      <p>
        Select a concise history item to view its complete audit details.
      </p>
    </div>

    <section class="history-list" aria-label="Activity history">
      <article
        v-for="record in historyRecords"
        :key="record.id"
        class="history-item"
      >
        <div class="history-item-content">
          <h3>{{ record.title }}</h3>
          <p class="history-date">
            {{ record.date }} <span aria-hidden="true">•</span>
            {{ record.time }}
          </p>
        </div>

        <button
          type="button"
          class="view-details-button"
          @click="viewDetails(record)"
        >
          View details
        </button>
      </article>

      <div v-if="historyRecords.length === 0" class="empty-state">
        <div class="empty-icon">↻</div>
        <h3>No history records yet</h3>
        <p>
          Previous activities will appear here when records are available.
        </p>
      </div>
    </section>

    <div
      v-if="selectedRecord"
      class="modal-overlay"
      @click.self="selectedRecord = null"
    >
      <section
        class="history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-dialog-title"
      >
        <div class="dialog-header">
          <div>
            <span class="details-eyebrow">HISTORY DETAILS</span>

            <h3 id="history-dialog-title">
              {{ selectedRecord.title }}
            </h3>

            <p>
              {{ selectedRecord.date }} · {{ selectedRecord.time }}
            </p>
          </div>

          <button
            type="button"
            class="close-button"
            aria-label="Close history details"
            @click="selectedRecord = null"
          >
            ×
          </button>
        </div>

        <div class="dialog-content">
          <div class="detail-group">
            <label>Activity</label>
            <p>{{ selectedRecord.title }}</p>
          </div>

          <div class="detail-group">
            <label>Date and time</label>
            <p>
              {{ selectedRecord.date }} · {{ selectedRecord.time }}
            </p>
          </div>

          <div class="detail-group">
            <label>Student name</label>
            <p>{{ selectedRecord.student }}</p>
          </div>

          <div class="detail-group">
            <label>Transaction type</label>
            <p>{{ selectedRecord.transactionType }}</p>
          </div>

          <div class="detail-group">
            <label>Transaction ID</label>
            <p>{{ selectedRecord.transactionId }}</p>
          </div>

          <div class="detail-group">
            <label>Service</label>
            <p>{{ selectedRecord.serviceName }}</p>
          </div>

          <div class="detail-group">
            <label>Previous status</label>
            <p>{{ selectedRecord.previousStatus }}</p>
          </div>

          <div class="detail-group">
            <label>Final status</label>
            <p>{{ selectedRecord.finalStatus }}</p>
          </div>

          <div class="detail-group">
            <label>Performed by</label>
            <p>{{ selectedRecord.performedBy }}</p>
          </div>
        </div>

        <div class="dialog-actions">
          <button
            type="button"
            class="close-dialog-button"
            @click="selectedRecord = null"
          >
            Close
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'

const REGISTRAR_SERVICE_IDS = [
  '33f59554-67be-4f04-87ab-dc27cd56fa94',
  '6a14093e-89a9-45ab-b1b8-1b2235459e5a',
  '7cbd715f-1e2b-4c29-8f12-7f8e8c2e4441',
  'ce8513bc-cd47-401e-96b0-503a4ebc1129',
]

const historyRecords = ref([])
const selectedRecord = ref(null)

let historyChannel = null

function formatDate(date) {
  if (!date) return 'Date unavailable'

  return new Date(date).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(date) {
  if (!date) return 'Time unavailable'

  return new Date(date).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

async function loadHistory() {
  try {
    const { data, error } = await supabase
      .from('service_history')
      .select(`
        id,
        student_id,
        service_id,
        transaction_type,
        transaction_id,
        title,
        previous_status,
        final_status,
        performed_by,
        completed_at,
        created_at,
        student:profiles!service_history_student_id_fkey (
          full_name,
          student_id
        ),
        service:office_services!service_history_service_id_fkey (
          name,
          office_id
        )
      `)
      .in('service_id', REGISTRAR_SERVICE_IDS)
      .order('created_at', { ascending: false })

    if (error) throw error

    historyRecords.value = (data || []).map((item) => {
      const activityDate = item.completed_at || item.created_at

      return {
        id: item.id,
        title: item.title || 'Untitled activity',
        date: formatDate(activityDate),
        time: formatTime(activityDate),
        student: item.student?.full_name || 'Unknown student',
        studentNumber: item.student?.student_id || 'Not available',
        transactionType: item.transaction_type || 'Not available',
        transactionId: item.transaction_id || 'Not available',
        finalStatus: item.final_status || 'Not available',
        previousStatus: item.previous_status || 'Not available',
        performedBy: item.performed_by || 'Not available',
        serviceName: item.service?.name || 'Not available',
        createdAt: item.created_at,
      }
    })

    if (
      selectedRecord.value &&
      !historyRecords.value.some(
        (record) => record.id === selectedRecord.value.id
      )
    ) {
      selectedRecord.value = null
    }
  } catch (error) {
    console.error('Error loading Registrar history:', error)
  }
}

function subscribeToHistory() {
  historyChannel = supabase
    .channel('registrar-service-history')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'service_history',
      },
      () => {
        loadHistory()
      }
    )
    .subscribe((status) => {
      console.log('Registrar history Realtime status:', status)
    })
}

function viewDetails(record) {
  selectedRecord.value = record
}

onMounted(async () => {
  await loadHistory()
  subscribeToHistory()
})

onUnmounted(() => {
  if (historyChannel) {
    supabase.removeChannel(historyChannel)
    historyChannel = null
  }
})
</script>

<style scoped>
* {
  box-sizing: border-box;
}

.main-content {
  --maroon: #650b18;
  --dark-maroon: #50070e;
  --text-color: #281719;
  --muted-color: #8c7477;
  --page-background: #eee0e1;
  --card-background: #f8eeee;
  --border-color: #d3babb;

  width: 100%;
  min-width: 0;
  min-height: 100%;
  padding: 3px 2px 24px;
  background: transparent;
  color: var(--text-color);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
}

.page-heading {
  margin-bottom: 22px;
}

.page-heading h2 {
  margin: 0 0 8px;
  color: var(--dark-maroon);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 30px;
  font-weight: 500;
}

.page-heading p {
  margin: 0;
  color: #887477;
  font-size: 15px;
  line-height: 1.5;
}

.history-list {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 15px;
}

.history-item {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 63px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 15px 33px;
  border: 1px solid var(--border-color);
  border-radius: 17px;
  background: var(--card-background);
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.history-item:hover {
  border-color: #b99599;
  background: #f5e8e9;
}

.history-item-content {
  flex: 1;
  min-width: 0;
}

.history-item-content h3 {
  margin: 0 0 5px;
  color: #251719;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.history-date {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--muted-color);
  font-size: 11px;
  line-height: 1.4;
}

.view-details-button {
  flex-shrink: 0;
  padding: 7px 0 7px 10px;
  border: 0;
  background: transparent;
  color: var(--maroon);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  font-weight: 400;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s ease;
}

.view-details-button:hover {
  color: #8c1725;
  text-decoration: underline;
}

.view-details-button:focus-visible,
.close-button:focus-visible,
.close-dialog-button:focus-visible {
  outline: 2px solid var(--maroon);
  outline-offset: 3px;
}

.empty-state {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 9px;
  padding: 25px;
  border: 1px solid var(--border-color);
  border-radius: 17px;
  background: var(--card-background);
  text-align: center;
}

.empty-icon {
  display: flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #ead5d6;
  color: var(--maroon);
  font-size: 23px;
}

.empty-state h3 {
  margin: 4px 0 0;
  color: var(--dark-maroon);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 18px;
  font-weight: 500;
}

.empty-state p {
  margin: 0;
  color: var(--muted-color);
  font-size: 12px;
  line-height: 1.5;
}

.modal-overlay {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow-y: auto;
  background: rgb(30 8 10 / 50%);
}

.history-dialog {
  width: min(100%, 500px);
  max-height: 90vh;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 13px;
  background: #fff7f7;
  box-shadow: 0 12px 40px rgb(0 0 0 / 15%);
}

.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 20px;
  border-bottom: 1px solid #e5ced0;
}

.details-eyebrow {
  color: #997a7c;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.dialog-header h3 {
  margin: 8px 0 6px;
  color: var(--dark-maroon);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
}

.dialog-header p {
  margin: 0;
  color: var(--muted-color);
  font-size: 12px;
}

.close-button {
  display: flex;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid #dec4c6;
  border-radius: 6px;
  background: #fff7f7;
  color: var(--dark-maroon);
  font-size: 22px;
  cursor: pointer;
}

.close-button:hover {
  background: #f0dddd;
}

.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}

.detail-group label {
  display: block;
  margin-bottom: 7px;
  color: var(--muted-color);
  font-size: 11px;
}

.detail-group p {
  margin: 0;
  color: var(--text-color);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  padding: 15px 20px;
  border-top: 1px solid #e2cacc;
}

.close-dialog-button {
  min-height: 36px;
  padding: 9px 18px;
  border: 1px solid var(--maroon);
  border-radius: 5px;
  background: var(--maroon);
  color: #fff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.close-dialog-button:hover {
  background: #710d16;
}

@media (max-width: 600px) {
  .main-content {
    padding: 3px 2px 24px;
  }

  .page-heading h2 {
    font-size: 25px;
  }

  .page-heading p {
    font-size: 14px;
  }

  .history-list {
    gap: 11px;
  }

  .history-item {
    min-height: 62px;
    gap: 12px;
    padding: 14px 15px;
    border-radius: 13px;
  }

  .history-item-content h3 {
    font-size: 12px;
  }

  .history-date {
    font-size: 10px;
  }

  .view-details-button {
    padding-left: 0;
    font-size: 11px;
  }

  .dialog-header,
  .dialog-content {
    padding: 15px;
  }

  .dialog-header h3 {
    font-size: 18px;
  }

  .dialog-actions {
    padding: 12px 15px;
  }
}
</style>
