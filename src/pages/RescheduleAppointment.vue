
<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  appointment: {
    type: Object,
    default: null
  },
  saving: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['save', 'cancel'])

const newDate = ref('')
const newTime = ref('')
const errorMessage = ref('')
const showReview = ref(false)
const pendingSchedule = ref(null)

const timeOptions = [
  { label: '09:00 AM', value: '09:00' },
  { label: '10:00 AM', value: '10:00' },
  { label: '11:00 AM', value: '11:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '01:00 PM', value: '13:00' },
  { label: '02:00 PM', value: '14:00' },
  { label: '03:00 PM', value: '15:00' },
  { label: '04:00 PM', value: '16:00' },
  { label: '05:00 PM', value: '17:00' }
]

const studentName = computed(() => {
  return props.appointment?.student ||
    props.appointment?.studentName ||
    'Student'
})

// FORMAT DATE
function formatDate(date) {
  if (!date) return 'Not set'

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-')

    const months = [
      'Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.',
      'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'
    ]

    return `${months[Number(month) - 1]} ${Number(day)}, ${year}`
  }

  const parsedDate = new Date(date)

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Not set'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila'
  }).format(parsedDate)
}

// FORMAT TIME
function formatTime(time) {
  if (!time) return 'Not set'

  if (/^\d{1,2}:\d{2}$/.test(time)) {
    const [hours, minutes] = time.split(':')
    const hour = Number(hours)

    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  const parsedDate = new Date(time)

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Not set'
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila'
  }).format(parsedDate)
}

// GET TODAY'S DATE IN PHILIPPINE TIME
function todayString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())

  const year = parts.find(part => part.type === 'year').value
  const month = parts.find(part => part.type === 'month').value
  const day = parts.find(part => part.type === 'day').value

  return `${year}-${month}-${day}`
}

// RESET FORM
function resetForm() {
  newDate.value = ''
  newTime.value = ''
  errorMessage.value = ''
  showReview.value = false
  pendingSchedule.value = null
}

// RESET WHEN APPOINTMENT CHANGES
watch(
  () => props.appointment?.id,
  () => {
    resetForm()
  },
  { immediate: true }
)

// REVIEW NEW SCHEDULE
function reviewSchedule() {
  errorMessage.value = ''

  if (!props.appointment) {
    errorMessage.value = 'No appointment selected.'
    return
  }

  if (!newDate.value || !newTime.value) {
    errorMessage.value = 'Please choose a new date and time.'
    return
  }

  if (newDate.value < todayString()) {
    errorMessage.value = 'Please choose a date that is not in the past.'
    return
  }

  pendingSchedule.value = {
    ...props.appointment,
    date: newDate.value,
    time: newTime.value
  }

  showReview.value = true
}

// CONFIRM RESCHEDULE
function confirmSchedule() {
  if (!pendingSchedule.value || props.saving) return

  emit('save', pendingSchedule.value)
}

// RETURN TO FORM
function cancelReview() {
  if (props.saving) return

  showReview.value = false
  pendingSchedule.value = null
  errorMessage.value = ''
}

// CANCEL EDITING
function cancelEditing() {
  if (props.saving) return

  resetForm()
  emit('cancel')
}
</script>

<template>
  <section class="reschedule-page">

    <!-- PAGE HEADING -->
    <header class="page-heading">
      <h1>Reschedule Appointment</h1>

      <p>
        {{ studentName }} ·
        {{ appointment?.id || 'Appointment' }}
      </p>
    </header>

    <!-- APPOINTMENT FORM -->
    <div v-if="appointment" class="reschedule-card">

      <!-- CURRENT SCHEDULE -->
      <div class="current-schedule">
        <strong>
          Current:
          {{ formatDate(appointment.scheduled_at || appointment.date) }}
          at
          {{ formatTime(appointment.scheduled_at || appointment.time) }}
        </strong>
      </div>

      <!-- NEW SCHEDULE FORM -->
      <template v-if="!showReview">

        <div class="field-group">
          <label for="new-date">New date</label>

          <input
            id="new-date"
            v-model="newDate"
            type="date"
            :min="todayString()"
            :disabled="saving"
          />
        </div>

        <div class="field-group">
          <label for="new-time">New time</label>

          <select
            id="new-time"
            v-model="newTime"
            :disabled="saving"
          >
            <option value="" disabled>
              Choose time
            </option>

            <option
              v-for="option in timeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>

        <p v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </p>

        <div class="form-actions">

          <button
            type="button"
            class="review-button"
            :disabled="saving"
            @click="reviewSchedule"
          >
            Review schedule
          </button>

          <button
            type="button"
            class="cancel-button"
            :disabled="saving"
            @click="cancelEditing"
          >
            Cancel editing
          </button>

        </div>
      </template>

      <!-- REVIEW SCHEDULE -->
      <template v-else>

        <h2 class="review-title">
          Review new schedule
        </h2>

        <div class="review-row">
          <span>New date</span>

          <strong>
            {{ formatDate(pendingSchedule.date) }}
          </strong>
        </div>

        <div class="review-row">
          <span>New time</span>

          <strong>
            {{ formatTime(pendingSchedule.time) }}
          </strong>
        </div>

        <p class="review-note">
          Are you sure you want to update this appointment?
        </p>

        <p v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </p>

        <div class="form-actions">

          <button
            type="button"
            class="review-button"
            :disabled="saving"
            @click="confirmSchedule"
          >
            {{ saving ? 'Saving...' : 'Confirm reschedule' }}
          </button>

          <button
            type="button"
            class="cancel-button"
            :disabled="saving"
            @click="cancelReview"
          >
            Go back
          </button>

        </div>
      </template>
    </div>

    <!-- NO APPOINTMENT SELECTED -->
    <div v-else class="reschedule-card">

      <p class="error-message">
        No appointment was selected.
      </p>

      <button
        type="button"
        class="cancel-button"
        @click="emit('cancel')"
      >
        Back to appointments
      </button>

    </div>

  </section>
</template>

<style scoped>
.reschedule-page {
  min-height: 100%;
  padding: 8px 10px 20px;
  box-sizing: border-box;
  background: #efdfdf;
  color: #350609;
  font-family: Georgia, 'Times New Roman', serif;
}

.page-heading {
  margin-bottom: 15px;
}

.page-heading h1 {
  margin: 0 0 5px;
  color: #59080e;
  font-size: 25px;
  line-height: 1.25;
  font-weight: 570;
}

.page-heading p {
  margin: 0;
  color: #a18b8c;
  font: 600 13px Arial, sans-serif;
  overflow-wrap: anywhere;
}

.reschedule-card {
  width: 100%;
  max-width: 640px;
  padding: 30px;
  box-sizing: border-box;
  border: 1px solid #e2c4c6;
  border-radius: 12px;
  background: #f8eeee;
  box-shadow: 0 2px 4px rgb(53 6 9 / 8%);
}

.current-schedule {
  margin-bottom: 17px;
  padding: 13px 15px;
  border-radius: 7px;
  background: #f1e0e1;
  color: #59080e;
  font-size: 10px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.current-schedule strong {
  display: block;
  font-weight: 700;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 16px;
}

.field-group label {
  color: #59080e;
  font-size: 11px;
  font-weight: 700;
}

.field-group input,
.field-group select {
  width: 100%;
  height: 35px;
  padding: 0 12px;
  box-sizing: border-box;
  border: 1px solid #e2c4c6;
  border-radius: 6px;
  outline: none;
  background: #fffafa;
  color: #350609;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 10px;
}

.field-group input:focus,
.field-group select:focus {
  border-color: #59080e;
}

.field-group input:disabled,
.field-group select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 4px;
}

.review-button,
.cancel-button {
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid #e2c4c6;
  border-radius: 5px;
  font: 700 10px Georgia, 'Times New Roman', serif;
  cursor: pointer;
}

.review-button {
  border-color: #59080e;
  background: #59080e;
  color: white;
}

.review-button:hover {
  background: #760e16;
}

.cancel-button {
  background: #fffafa;
  color: #59080e;
}

.cancel-button:hover {
  border-color: #59080e;
  background: #f1e0e1;
}

.review-button:disabled,
.cancel-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  margin: 0 0 12px;
  color: #a51f2a;
  font: 11px Arial, sans-serif;
  line-height: 1.5;
}

.review-title {
  margin: 0 0 14px;
  color: #59080e;
  font-size: 15px;
}

.review-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #ead4d5;
  font-size: 11px;
}

.review-row span {
  color: #927a7b;
}

.review-row strong {
  text-align: right;
}

.review-note {
  color: #927a7b;
  font: 11px Arial, sans-serif;
  line-height: 1.5;
}

@media (max-width: 600px) {
  .reschedule-page {
    padding: 12px;
  }

  .reschedule-card {
    padding: 14px;
  }
}
</style>
