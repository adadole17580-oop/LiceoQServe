
<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  accessToken: {
    type: String,
    required: true
  }
})

const API_BASE_URL = 'http://localhost:3000'

const selectedDate = ref('')
const selectedTime = ref('')
const blockReason = ref('')

const officeHours = ref([])
const blockedSchedules = ref([])

const isLoading = ref(false)
const isSaving = ref(false)
const isRemoving = ref(null)

const errorMessage = ref('')
const successMessage = ref('')

const showRemoveDialog = ref(false)
const selectedBlockedId = ref(null)

const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
]

const timeOptions = [
  '9:00 AM - 10:00 AM',
  '10:00 AM - 11:00 AM',
  '11:00 AM - 12:00 PM',
  '12:00 PM - 1:00 PM',
  '1:00 PM - 2:00 PM',
  '2:00 PM - 3:00 PM',
  '3:00 PM - 4:00 PM',
  '4:00 PM - 5:00 PM',
  '9:00 AM - 5:00 PM'
]

const sortedOfficeHours = computed(() => {
  return dayNames.map((name, index) => {
    const record = officeHours.value.find(
      item => Number(item.day_of_week) === index
    )

    return {
      day: name,
      isOpen: record ? Boolean(record.is_open) : false,
      openingTime: record?.opening_time || null,
      closingTime: record?.closing_time || null,
      hasRecord: Boolean(record)
    }
  })
})

const blockedCount = computed(() => blockedSchedules.value.length)

// ========================================
// BACKEND API REQUEST
// ========================================

async function apiRequest(endpoint, options = {}) {
  if (!props.accessToken) {
    throw new Error(
      'Authentication token is missing. Please log in again.'
    )
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${props.accessToken}`,
      ...(options.headers || {})
    }
  })

  const result = await response.json().catch(() => ({}))

  if (!response.ok || result.success === false) {
    throw new Error(
      result.message || `Request failed (${response.status})`
    )
  }

  return result
}

// ========================================
// DATE AND TIME HELPERS
// ========================================

function formatDatabaseTime(time) {
  if (!time) return ''

  const [hour, minute] = String(time).split(':').map(Number)

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return ''
  }

  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${
    hour >= 12 ? 'PM' : 'AM'
  }`
}

function formatDate(date) {
  if (!date) return ''

  const dateText = String(date).slice(0, 10)

  return new Date(`${dateText}T12:00:00`).toLocaleDateString(
    'en-US',
    {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }
  )
}

function convertToDatabaseTime(timeText) {
  const match = String(timeText).match(
    /^(\d{1,2}):(\d{2})\s(AM|PM)$/
  )

  if (!match) {
    throw new Error('Invalid selected time.')
  }

  let hour = Number(match[1])
  const minute = match[2]
  const period = match[3]

  if (period === 'PM' && hour !== 12) hour += 12
  if (period === 'AM' && hour === 12) hour = 0

  return `${String(hour).padStart(2, '0')}:${minute}:00`
}

function getTodayDate() {
  const now = new Date()

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)

  const getPart = type =>
    parts.find(part => part.type === type)?.value || ''

  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`
}

// ========================================
// LOAD OFFICE HOURS
// ========================================

async function loadOfficeHours() {
  const result = await apiRequest(
    '/api/guidance/schedule/office-hours'
  )

  officeHours.value = result.officeHours || []
}

// ========================================
// LOAD BLOCKED SCHEDULES
// ========================================

async function loadBlockedSchedules() {
  const result = await apiRequest(
    '/api/guidance/schedule/blocked'
  )

  blockedSchedules.value = (result.blockedSchedules || []).map(item => ({
    id: item.id,
    date: item.blocked_date,
    time: item.is_all_day
      ? '9:00 AM - 5:00 PM'
      : `${formatDatabaseTime(item.start_time)} - ${formatDatabaseTime(item.end_time)}`,
    reason: item.reason || 'Unavailable',
    isAllDay: Boolean(item.is_all_day)
  }))
}

// ========================================
// LOAD ALL SCHEDULE DATA
// ========================================

async function loadScheduleData() {
  if (isLoading.value) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    await Promise.all([
      loadOfficeHours(),
      loadBlockedSchedules()
    ])
  } catch (error) {
    console.error('Failed to load Guidance schedule:', error)
    errorMessage.value = `Unable to load schedule: ${error.message}`
  } finally {
    isLoading.value = false
  }
}

async function refreshOfficeHours() {
  if (isLoading.value) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    await loadOfficeHours()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

async function refreshBlockedSchedules() {
  if (isLoading.value) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    await loadBlockedSchedules()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

// ========================================
// BLOCK DATE OR TIME
// ========================================

async function blockSchedule() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!selectedDate.value || !selectedTime.value) {
    errorMessage.value = 'Please select a date and time.'
    return
  }

  if (selectedDate.value < getTodayDate()) {
    errorMessage.value = 'Please select today or a future date.'
    return
  }

  if (isSaving.value) return

  isSaving.value = true

  try {
    const isAllDay =
      selectedTime.value === '9:00 AM - 5:00 PM'

    const [startText, endText] = selectedTime.value.split(' - ')

    const payload = {
      blocked_date: selectedDate.value,
      start_time: isAllDay
        ? null
        : convertToDatabaseTime(startText),
      end_time: isAllDay
        ? null
        : convertToDatabaseTime(endText),
      is_all_day: isAllDay,
      reason: blockReason.value.trim() || 'Unavailable'
    }

    await apiRequest('/api/guidance/schedule/blocked', {
      method: 'POST',
      body: JSON.stringify(payload)
    })

    await loadBlockedSchedules()

    selectedDate.value = ''
    selectedTime.value = ''
    blockReason.value = ''

    successMessage.value = 'Schedule blocked successfully!'
  } catch (error) {
    console.error('Failed to block schedule:', error)
    errorMessage.value = error.message
  } finally {
    isSaving.value = false
  }
}

// ========================================
// OPEN REMOVE CONFIRMATION
// ========================================

function removeBlockedSchedule(id) {
  if (isRemoving.value !== null) return

  selectedBlockedId.value = id
  showRemoveDialog.value = true

  errorMessage.value = ''
  successMessage.value = ''
}

function cancelRemove() {
  if (isRemoving.value !== null) return

  showRemoveDialog.value = false
  selectedBlockedId.value = null
}

// ========================================
// CONFIRM REMOVE
// ========================================

async function confirmRemove() {
  const id = selectedBlockedId.value

  if (!id || isRemoving.value !== null) return

  isRemoving.value = id
  errorMessage.value = ''
  successMessage.value = ''

  try {
    await apiRequest(
      `/api/guidance/schedule/blocked/${encodeURIComponent(id)}`,
      {
        method: 'DELETE'
      }
    )

    blockedSchedules.value = blockedSchedules.value.filter(
      item => item.id !== id
    )

    showRemoveDialog.value = false
    selectedBlockedId.value = null

    successMessage.value =
      'Blocked schedule removed successfully!'
  } catch (error) {
    console.error('Failed to remove blocked schedule:', error)
    errorMessage.value = error.message

    showRemoveDialog.value = false
    selectedBlockedId.value = null
  } finally {
    isRemoving.value = null
  }
}

// ========================================
// INITIAL LOAD
// ========================================

onMounted(() => {
  loadScheduleData()
})
</script>

<template>
  <div class="schedule-page">

    <!-- PAGE HEADING -->
    <header class="page-heading">
      <h1>Schedule Management</h1>
      <p>
        Manage office hours, availability, slots and blocked dates
      </p>
    </header>

    <!-- FEEDBACK MESSAGES -->
    <p
      v-if="errorMessage"
      class="feedback-message error-message"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <p
      v-if="successMessage"
      class="feedback-message success-message"
      role="status"
    >
      {{ successMessage }}
    </p>

    <!-- TOP PANELS -->
    <div class="schedule-grid">

      <!-- OFFICE HOURS -->
      <section class="schedule-panel office-panel">
       <div class="panel-heading">
  <h2>Office Hours</h2>
</div>

        <div class="office-hours-list">
          <div
            v-for="item in sortedOfficeHours"
            :key="item.day"
            class="office-hour-row"
          >
            <span class="day-name">
              {{ item.day }}
            </span>

            <span class="office-time">
              <template v-if="item.isOpen">
                {{ formatDatabaseTime(item.openingTime) }}
                -
                {{ formatDatabaseTime(item.closingTime) }}
              </template>

              <template v-else-if="item.hasRecord">
                Closed
              </template>

              <template v-else>
                {{ isLoading ? 'Loading...' : 'Not configured' }}
              </template>
            </span>
          </div>
        </div>
      </section>

      <!-- BLOCK A DATE OR TIME -->
      <section class="schedule-panel block-panel">
        <div class="panel-heading">
          <h2>Block a date or time</h2>
        </div>

        <form @submit.prevent="blockSchedule">
          <label for="block-date" class="visually-hidden">
            Select date
          </label>

          <input
            id="block-date"
            v-model="selectedDate"
            type="date"
            :min="getTodayDate()"
            required
          />

          <label for="block-time" class="visually-hidden">
            Choose a time
          </label>

          <select
            id="block-time"
            v-model="selectedTime"
            required
          >
            <option value="" disabled>
              Choose a time
            </option>

            <option
              v-for="time in timeOptions"
              :key="time"
              :value="time"
            >
              {{ time }}
            </option>
          </select>

          <label for="block-reason" class="visually-hidden">
            Reason for blocking
          </label>

          <input
            id="block-reason"
            v-model="blockReason"
            type="text"
            placeholder="Reason (optional)"
          />

          <button
            type="submit"
            class="block-button"
            :disabled="isSaving"
          >
            {{ isSaving ? 'SAVING...' : 'BLOCK DATE AND TIME' }}
          </button>
        </form>
      </section>
    </div>

    <!-- BLOCKED DATES AND TIMES -->
    <section class="schedule-panel blocked-panel">
      <div class="panel-heading blocked-heading">
        <h2>Blocked Dates and Times</h2>

        <div class="blocked-heading-actions">
          <span class="blocked-count">
            {{ blockedCount }} blocked
          </span>

          <button
            type="button"
            class="refresh-button"
            :disabled="isLoading"
            @click="refreshBlockedSchedules"
          >
            {{ isLoading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <div
        v-if="isLoading && !blockedSchedules.length"
        class="empty-state"
      >
        Loading blocked schedules...
      </div>

      <div
        v-else-if="!blockedSchedules.length"
        class="empty-state"
      >
        No blocked dates or times.
      </div>

      <div v-else class="blocked-list">
        <div
          v-for="item in blockedSchedules"
          :key="item.id"
          class="blocked-row"
        >
          <div class="blocked-details">
            <strong class="blocked-date">
              {{ formatDate(item.date) }}
            </strong>

            <span class="blocked-time">
              {{ item.time }}
            </span>

            <span
              v-if="item.reason && item.reason !== 'Unavailable'"
              class="blocked-reason"
            >
              {{ item.reason }}
            </span>
          </div>

          <button
            type="button"
            class="remove-button"
            :disabled="isRemoving === item.id"
            @click="removeBlockedSchedule(item.id)"
          >
            {{ isRemoving === item.id ? 'Removing...' : 'Remove' }}
          </button>
        </div>
      </div>
    </section>

    <!-- CUSTOM REMOVE CONFIRMATION MODAL -->
    <div
      v-if="showRemoveDialog"
      class="modal-overlay"
      @click.self="cancelRemove"
    >
      <div
        class="confirmation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-dialog-title"
      >
        <div class="modal-icon">!</div>

        <h2 id="remove-dialog-title">
          Remove Blocked Schedule?
        </h2>

        <p>
          Are you sure you want to remove this blocked
          date or time? This action cannot be undone.
        </p>

        <div class="modal-actions">
          <button
            type="button"
            class="modal-cancel-button"
            :disabled="isRemoving !== null"
            @click="cancelRemove"
          >
            Cancel
          </button>

          <button
            type="button"
            class="modal-confirm-button"
            :disabled="isRemoving !== null"
            @click="confirmRemove"
          >
            {{ isRemoving !== null ? 'Removing...' : 'Remove' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.schedule-page {
  width: 100%;
  min-width: 0;
  color: #39090c;
}

/* PAGE HEADING */

.page-heading {
  margin-bottom: 24px;
}

.page-heading h1 {
  margin: 0 0 3px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 31px;
  font-weight: 500;
}

.page-heading p {
  margin: 0;
  font-size: 13px;
  color: #684547;
}

/* TOP PANELS */

.schedule-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 20px;
  margin-bottom: 20px;
}

.schedule-panel {
  min-width: 0;
  padding: 20px;
  background: #f8eeee;
  border: 1px solid #cba6a8;
  border-radius: 13px;
}

.schedule-panel h2 {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 22px;
  font-weight: 500;
}

/* PANEL HEADERS */

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 17px;
}

.refresh-button {
  flex-shrink: 0;
  padding: 7px 12px;
  color: #650f18;
  background: transparent;
  border: 1px solid #9b555b;
  border-radius: 7px;
  font-size: 11px;
  cursor: pointer;
}

.refresh-button:hover:not(:disabled) {
  background: #f0dddd;
}

.refresh-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* OFFICE HOURS */

.office-hours-list {
  display: grid;
  gap: 17px;
  padding-top: 2px;
  padding-bottom: 1px;
}

.office-hour-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.day-name {
  font-weight: 500;
}

.office-time {
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
}

/* BLOCK FORM */

.block-panel form {
  display: grid;
  gap: 12px;
}

.block-panel input,
.block-panel select {
  width: 100%;
  min-width: 0;
  height: 42px;
  padding: 9px 12px;
  color: #39090c;
  background: #fffafa;
  border: 1px solid #d5b2b5;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
}

.block-panel input:focus,
.block-panel select:focus {
  outline: 2px solid #a96b70;
  outline-offset: 1px;
}

.block-panel input::placeholder {
  color: #947c7e;
}

.block-button {
  justify-self: start;
  min-height: 35px;
  padding: 10px 16px;
  color: #ffffff;
  background: #650f18;
  border: 0;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.block-button:hover:not(:disabled) {
  background: #51090e;
}

.block-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* BLOCKED DATES AND TIMES */

.blocked-panel {
  width: 100%;
}

.blocked-heading {
  margin-bottom: 0;
  padding-bottom: 13px;
  border-bottom: 1px solid #e3cacc;
}

.blocked-heading-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.blocked-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  padding: 5px 12px;
  color: #650f18;
  background: #efd8da;
  border-radius: 20px;
  font-size: 11px;
  white-space: nowrap;
}

.blocked-list {
  width: 100%;
}

.blocked-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 66px;
  padding: 13px 0;
  border-bottom: 1px solid #ead7d8;
}

.blocked-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.blocked-details {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.blocked-date {
  font-size: 13px;
  font-weight: 700;
}

.blocked-time {
  color: #83595d;
  font-size: 12px;
}

.blocked-reason {
  color: #95777a;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.remove-button {
  flex-shrink: 0;
  padding: 8px 13px;
  color: #650f18;
  background: transparent;
  border: 1px solid #9b555b;
  border-radius: 7px;
  font-size: 12px;
  cursor: pointer;
}

.remove-button:hover:not(:disabled) {
  background: #f0dddd;
}

.remove-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* EMPTY STATES */

.empty-state {
  padding: 24px 0 10px;
  color: #8d7274;
  font-size: 13px;
  text-align: center;
}

/* FEEDBACK */

.feedback-message {
  margin: 0 0 16px;
  padding: 11px 14px;
  border-radius: 8px;
  font-size: 12px;
}

.error-message {
  color: #8d1c2b;
  background: #f5dfe1;
  border: 1px solid #dfb4ba;
}

.success-message {
  color: #28613d;
  background: #e1f0e5;
  border: 1px solid #b5d6bd;
}

/* CUSTOM REMOVE CONFIRMATION */

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(30, 4, 8, 0.55);
}

.confirmation-modal {
  width: 100%;
  max-width: 410px;
  padding: 30px 25px;
  background: #fff8f8;
  border: 1px solid #d7b4b7;
  border-radius: 16px;
  box-shadow: 0 15px 45px rgba(0, 0, 0, 0.18);
  text-align: center;
}

.modal-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  color: #650f18;
  background: #f1dfe1;
  border-radius: 50%;
  font-size: 25px;
  font-weight: 700;
}

.confirmation-modal h2 {
  margin: 0 0 10px;
  color: #39090c;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 23px;
}

.confirmation-modal p {
  margin: 0 0 25px;
  color: #775f60;
  font-size: 13px;
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.modal-cancel-button,
.modal-confirm-button {
  min-width: 115px;
  padding: 11px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.modal-cancel-button {
  color: #650f18;
  background: transparent;
  border: 1px solid #9b555b;
}

.modal-confirm-button {
  color: white;
  background: #650f18;
  border: 1px solid #650f18;
}

.modal-cancel-button:hover:not(:disabled) {
  background: #f1dfe1;
}

.modal-confirm-button:hover:not(:disabled) {
  background: #51090e;
}

.modal-actions button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ACCESSIBILITY */

.visually-hidden {
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

/* RESPONSIVE */

@media (max-width: 1000px) {
  .schedule-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }
}

@media (max-width: 600px) {
  .page-heading h1 {
    font-size: 26px;
  }

  .page-heading p {
    font-size: 12px;
  }

  .schedule-panel {
    padding: 15px 13px;
  }

  .schedule-panel h2 {
    font-size: 20px;
  }

  .office-hour-row {
    font-size: 12px;
  }

  .blocked-heading {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .blocked-heading-actions {
    margin-left: auto;
  }

  .blocked-row {
    gap: 10px;
  }
}
</style>
