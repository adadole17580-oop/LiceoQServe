
<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  appointments: {
    type: Array,
    default: () => []
  }
})

const selectedHistory = ref(null)

const historyItems = computed(() => {
  return props.appointments.map(item => {
    const student =
      typeof item.student === 'object'
        ? item.student?.full_name ||
          item.student?.name ||
          'Unknown Student'
        : item.student ||
          item.student_name ||
          item.studentName ||
          'Unknown Student'

    const service =
      item.service?.name ||
      item.service?.service_name ||
      item.service_name ||
      item.serviceName ||
      item.type ||
      'Guidance Appointment'

    const scheduledAt =
      item.scheduledAt ||
      item.scheduled_at ||
      null

    const date = scheduledAt
      ? formatDate(scheduledAt)
      : item.date
        ? formatDate(item.date)
        : 'Date unavailable'

    const time = scheduledAt
      ? formatTime(scheduledAt)
      : item.time || 'Time unavailable'

    const status = String(item.status || 'Unknown')

    return {
      id: item.id,
      title: `${service} - ${student}`,
      date,
      time,
      student,

      studentId:
        item.studentId ||
        item.student_id ||
        'N/A',

      service,

      transactionId:
        item.reference ||
        item.transaction_id ||
        String(item.id || 'N/A'),

      previousStatus:
        item.previous_status ||
        item.previousStatus ||
        'Not recorded',

      updatedStatus: status,

      performedBy:
        item.performed_by_name ||
        item.handled_by ||
        item.performed_by ||
        item.performedBy ||
        'Not recorded',

      whatHappened: `${service} - ${student}`,

      purpose: item.purpose || 'No purpose provided.',

      studentNotes:
        item.student_notes ||
        item.studentNotes ||
        'No student notes recorded.',

      staffNotes:
        item.staff_notes ||
        item.staffNotes ||
        'No staff notes recorded.'
    }
  })
})

function formatDate(value) {
  if (!value) return 'Date unavailable'

  // Already formatted date from the backend
  if (
    typeof value === 'string' &&
    /^[A-Za-z]{3,}\.?\s+\d{1,2},?\s+\d{4}$/.test(value)
  ) {
    return value
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatTime(value) {
  if (!value) return 'Time unavailable'

  // Already formatted time from the backend
  if (
    typeof value === 'string' &&
    /\b(AM|PM)\b/i.test(value)
  ) {
    return value
  }

  // Handle HH:mm time strings
  if (/^\d{1,2}:\d{2}$/.test(value)) {
    const [hour, minute] = value.split(':').map(Number)

    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${
      hour >= 12 ? 'PM' : 'AM'
    }`
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function openDetails(item) {
  selectedHistory.value = item
}

function closeDetails() {
  selectedHistory.value = null
}
</script>

<template>
  <section class="history-page">

    <header class="history-heading">
      <h1>History</h1>
      <p>
        Select a concise history item to view its complete audit details.
      </p>
    </header>

    <div v-if="historyItems.length > 0" class="history-list">

      <article
        v-for="item in historyItems"
        :key="item.id"
        class="history-item"
      >
        <div class="history-item-info">
          <h2>{{ item.title }}</h2>
          <p>{{ item.date }} · {{ item.time }}</p>
        </div>

        <button
          class="history-details-button"
          @click="openDetails(item)"
        >
          View details
        </button>
      </article>

    </div>

    <div v-else class="history-empty">
      <h2>No History Records Found</h2>
      <p>
        There are currently no appointment records matching your history.
      </p>
    </div>

    <div
      v-if="selectedHistory"
      class="history-modal-backdrop"
      @click.self="closeDetails"
      @keydown.esc="closeDetails"
    >
      <section
        class="history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
      >

        <header class="history-modal-header">
          <div>
            <span class="history-eyebrow">
              HISTORY DETAILS
            </span>

            <h2 id="history-modal-title">
              {{ selectedHistory.whatHappened }}
            </h2>

            <p class="history-modal-date">
              {{ selectedHistory.date }}
              ·
              {{ selectedHistory.time }}
            </p>
          </div>

          <button
            class="history-close-button"
            aria-label="Close history details"
            @click="closeDetails"
          >
            Close
          </button>
        </header>

        <div class="history-details-grid">

          <div class="history-detail">
            <span>What Happened</span>
            <strong>{{ selectedHistory.whatHappened }}</strong>
          </div>

          <div class="history-detail">
            <span>Student</span>
            <strong>{{ selectedHistory.student }}</strong>
          </div>

          <div class="history-detail">
            <span>Student ID</span>
            <strong>{{ selectedHistory.studentId }}</strong>
          </div>

          <div class="history-detail">
            <span>Transaction ID</span>
            <strong>{{ selectedHistory.transactionId }}</strong>
          </div>

          <div class="history-detail">
            <span>Previous Status</span>
            <strong>{{ selectedHistory.previousStatus }}</strong>
          </div>

          <div class="history-detail">
            <span>Updated Status</span>
            <strong>{{ selectedHistory.updatedStatus }}</strong>
          </div>

          <div class="history-detail">
            <span>Performed By</span>
            <strong>{{ selectedHistory.performedBy }}</strong>
          </div>

        </div>

        <div class="history-notes">

          <div class="note-section">
            <strong>Purpose</strong>
            <p>{{ selectedHistory.purpose }}</p>
          </div>

          <div class="note-section">
            <strong>Student Notes</strong>
            <p>{{ selectedHistory.studentNotes }}</p>
          </div>

          <div class="note-section">
            <strong>Staff Notes</strong>
            <p>{{ selectedHistory.staffNotes }}</p>
          </div>

        </div>

      </section>
    </div>

  </section>
</template>

<style scoped>
.history-page {
  width: 100%;
  min-width: 0;
  color: #39090c;
}

.history-heading {
  margin-bottom: 32px;
}

.history-heading h1 {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 34px;
  font-weight: normal;
  line-height: 1.2;
}

.history-heading p {
  margin: 2px 0 0;
  font-size: 16px;
}

.history-list {
  width: 100%;
  overflow: hidden;
  background: #f8eeee;
  border: 1px solid #a8787c;
  border-radius: 25px;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 72px;
  padding: 16px 30px;
}

.history-item + .history-item {
  border-top: 1px solid #e2caca;
}

.history-item-info {
  min-width: 0;
}

.history-item-info h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
}

.history-item-info p {
  margin: 3px 0 0;
  color: #806d6e;
  font-size: 11px;
}

.history-details-button {
  flex-shrink: 0;
  padding: 8px 4px;
  color: #51090e;
  background: transparent;
  border: 0;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.history-details-button:hover {
  text-decoration: underline;
}

.history-empty {
  width: 100%;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
  text-align: center;
  background: #f8eeee;
  border: 1px solid #a8787c;
  border-radius: 25px;
}

.history-empty h2 {
  margin: 0 0 8px;
  font-size: 18px;
}

.history-empty p {
  margin: 0;
  color: #806d6e;
  font-size: 13px;
}

.history-modal-backdrop {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgb(35 20 20 / 42%);
}

.history-modal {
  width: min(100%, 516px);
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding: 18px 17px 14px;
  background: #f8eeee;
  border-radius: 16px;
  box-shadow: 0 10px 35px rgb(0 0 0 / 12%);
}

.history-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.history-modal-header > div {
  min-width: 0;
}

.history-eyebrow {
  display: block;
  margin-bottom: 3px;
  color: #8b7273;
  font-size: 11px;
  letter-spacing: 0.2px;
}

.history-modal-header h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.history-modal-date {
  margin: 3px 0 0;
  color: #806d6e;
  font-size: 11px;
}

.history-close-button {
  flex-shrink: 0;
  padding: 2px 0;
  color: #806d6e;
  background: transparent;
  border: 0;
  font-size: 11px;
  cursor: pointer;
}

.history-close-button:hover {
  text-decoration: underline;
}

.history-details-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 24px;
}

.history-detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.history-detail span {
  color: #8b7273;
  font-size: 11px;
}

.history-detail strong {
  color: #39090c;
  font-size: 12px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.history-notes {
  margin-top: 28px;
  padding: 18px 13px;
  background: #edd9da;
  border-radius: 10px;
  color: #39090c;
}

.note-section + .note-section {
  margin-top: 14px;
}

.note-section strong {
  font-size: 12px;
}

.note-section p {
  margin: 5px 0 0;
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

@media (max-width: 600px) {
  .history-heading h1 {
    font-size: 29px;
  }

  .history-heading p {
    font-size: 13px;
  }

  .history-item {
    gap: 10px;
    padding: 14px;
  }

  .history-item-info h2 {
    font-size: 13px;
  }

  .history-details-button {
    font-size: 11px;
  }

  .history-modal-header h2 {
    font-size: 19px;
  }

  .history-details-grid {
    gap: 12px;
  }
}
</style>
