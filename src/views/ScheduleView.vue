
<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  accessToken: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['navigate'])

const API_BASE_URL = 'http://localhost:3000'

const selectedDate = ref('')
const selectedTime = ref('')
const blockReason = ref('')

const officeHours = ref([])
const blockedSchedules = ref([])

const isLoading = ref(false)
const isSaving = ref(false)

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

// ========================================
// BACKEND API REQUEST
// ========================================

async function apiRequest(endpoint, options = {}) {
  if (!props.accessToken) {
    throw new Error('Authentication token is missing. Please log in again.')
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
// FORMAT DATE AND TIME
// ========================================

function getDayName(day) {
  return dayNames[Number(day)] || 'Unknown'
}

function formatDatabaseTime(time) {
  if (!time) return ''

  const [hour, minute] = time.split(':').map(Number)

  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${
    hour >= 12 ? 'PM' : 'AM'
  }`
}

function formatDate(date) {
  if (!date) return ''

  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric'
  })
}

function convertToDatabaseTime(timeText) {
  const match = timeText.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/)

  if (!match) {
    throw new Error('Invalid selected time.')
  }

  let hour = Number(match[1])
  const minute = match[2]
  const period = match[3]

  if (period === 'PM' && hour !== 12) {
    hour += 12
  }

  if (period === 'AM' && hour === 12) {
    hour = 0
  }

  return `${String(hour).padStart(2, '0')}:${minute}:00`
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
    reason: item.reason || 'Unavailable'
  }))
}

// ========================================
// LOAD ALL SCHEDULE DATA
// ========================================

async function loadScheduleData() {
  isLoading.value = true

  try {
    await Promise.all([
      loadOfficeHours(),
      loadBlockedSchedules()
    ])
  } catch (error) {
    console.error('Failed to load Guidance schedule:', error)

    alert(`Unable to load schedule: ${error.message}`)
  } finally {
    isLoading.value = false
  }
}

// ========================================
// ADD BLOCKED SCHEDULE
// ========================================

async function blockSchedule() {
  if (!selectedDate.value || !selectedTime.value) {
    alert('Please select a date and time.')
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

    alert('Schedule blocked successfully.')
  } catch (error) {
    console.error('Failed to block schedule:', error)

    alert(error.message)
  } finally {
    isSaving.value = false
  }
}

// ========================================
// DELETE BLOCKED SCHEDULE
// ========================================

async function removeBlockedSchedule(id) {
  if (!confirm('Are you sure you want to remove this blocked schedule?')) {
    return
  }

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

    alert('Blocked schedule removed successfully.')
  } catch (error) {
    console.error('Failed to remove blocked schedule:', error)

    alert(error.message)
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
    <header class="page-heading">
      <h1>Manage Schedule</h1>
      <p>
        Manage office hours, availability, slots and blocked dates
      </p>
    </header>

    <div class="schedule-grid">

      <!-- OFFICE HOURS -->
      <section class="schedule-panel office-panel">
        <h2>Office Hours</h2>

        <div class="office-hours-list">
          <div
            v-for="item in officeHours"
            :key="item.id"
            class="office-hour-row"
          >
            <strong>
              {{ getDayName(item.day_of_week) }}
            </strong>

            <span>
              <template v-if="item.is_open">
                {{ formatDatabaseTime(item.opening_time) }}
                -
                {{ formatDatabaseTime(item.closing_time) }}
              </template>

              <template v-else>
                Closed
              </template>
            </span>
          </div>

          <p
            v-if="isLoading && !officeHours.length"
            class="empty-message"
          >
            Loading office hours...
          </p>

          <p
            v-else-if="!officeHours.length"
            class="empty-message"
          >
            No office hours available.
          </p>
        </div>
      </section>

      <!-- BLOCK A DATE OR TIME -->
      <section class="schedule-panel block-panel">
        <h2>Block a date or time</h2>

        <form @submit.prevent="blockSchedule">
          <label for="block-date" class="visually-hidden">
            Select date
          </label>

          <input
            id="block-date"
            v-model="selectedDate"
            type="date"
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
            placeholder="Reason (e.g. University Event)"
          />

          <button
            type="submit"
            class="block-button"
            :disabled="isSaving"
          >
            {{ isSaving ? 'SAVING...' : 'BLOCK DATE AND TIME' }}
          </button>
        </form>

        <!-- BLOCKED SCHEDULE LIST -->
        <div
          v-for="item in blockedSchedules"
          :key="item.id"
          class="blocked-item"
        >
          <span>
            {{ formatDate(item.date) }}
            · {{ item.time }}
            · {{ item.reason }}
          </span>

          <button
            type="button"
            class="remove-button"
            aria-label="Remove blocked schedule"
            @click="removeBlockedSchedule(item.id)"
          >
            ×
          </button>
        </div>

        <p
          v-if="isLoading && !blockedSchedules.length"
          class="empty-message"
        >
          Loading blocked schedules...
        </p>

        <p
          v-else-if="!blockedSchedules.length"
          class="empty-message"
        >
          No blocked dates or times.
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.schedule-page {
  width: 100%;
  min-width: 0;
  color: #39090c;
}

.page-heading {
  margin-bottom: 34px;
}

.page-heading h1 {
  margin: 0 0 2px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(27px, 3vw, 34px);
  font-weight: 500;
}

.page-heading p {
  margin: 0;
  font-size: 15px;
}

.schedule-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: 26px;
  padding: 0;
}

.schedule-panel {
  min-width: 0;
  padding: 15px 16px 20px;
  background: #f8eeee;
  border: 1px solid #853c43;
  border-radius: 16px;
}

.schedule-panel h2 {
  margin: 0 0 23px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 24px;
  font-weight: 500;
}

.office-hours-list {
  display: grid;
  gap: 15px;
  padding-top: 3px;
}

.office-hour-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 15px;
}

.office-hour-row strong {
  font-weight: 600;
}

.office-hour-row span {
  text-align: right;
  white-space: nowrap;
}

.block-panel form {
  display: grid;
  gap: 12px;
}

.block-panel input,
.block-panel select {
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 6px 11px;
  color: #39090c;
  background: #f8eeee;
  border: 1px solid #9b555b;
  border-radius: 9px;
  font: inherit;
  font-size: 14px;
}

.block-panel input::placeholder,
.block-panel select:invalid {
  color: #927878;
}

.block-button {
  justify-self: start;
  min-height: 35px;
  padding: 9px 12px;
  color: #fffafa;
  background: #650f18;
  border: 0;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.block-button:hover {
  background: #51090e;
}

.block-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.blocked-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 35px;
  padding: 8px;
  margin-top: 9px;
  color: #39090c;
  background: #dfc7c8;
  border-radius: 8px;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.remove-button {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  color: #650f18;
  background: transparent;
  border: 0;
  border-radius: 5px;
  font-size: 20px;
  cursor: pointer;
}

.remove-button:hover {
  background: #f3dfe0;
}

.empty-message {
  margin: 14px 0 0;
  color: #775f60;
  font-size: 12px;
}

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

@media (max-width: 1000px) {
  .schedule-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }
}

@media (max-width: 600px) {
  .page-heading {
    margin-bottom: 22px;
  }

  .schedule-panel {
    padding: 15px 13px;
  }

  .office-hour-row {
    font-size: 13px;
  }

  .schedule-panel h2 {
    font-size: 22px;
  }
}
</style>
