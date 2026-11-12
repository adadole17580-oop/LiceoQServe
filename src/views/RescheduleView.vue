
<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  appointment: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['save', 'cancel'])

const newDate = ref('')
const newTime = ref('')

const timeSlots = [
  { value: '08:00', label: '8:00 AM' },
  { value: '09:00', label: '9:00 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '11:00', label: '11:00 AM' },
  { value: '13:00', label: '1:00 PM' },
  { value: '14:00', label: '2:00 PM' },
  { value: '15:00', label: '3:00 PM' },
  { value: '16:00', label: '4:00 PM' }
]

function getScheduleDate(appointment) {
  if (!appointment) return ''

  if (appointment.date) {
    return String(appointment.date).slice(0, 10)
  }

  const scheduledAt = appointment.scheduled_at

  if (!scheduledAt) return ''

  const date = new Date(scheduledAt)

  if (Number.isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  )

  return `${values.year}-${values.month}-${values.day}`
}

function getScheduleTime(appointment) {
  if (!appointment) return ''

  const time = appointment.time

  if (time) {
    const match = String(time).match(/^(\d{1,2}):(\d{2})/)

    if (match) {
      return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`
    }
  }

  const scheduledAt = appointment.scheduled_at

  if (!scheduledAt) return ''

  const date = new Date(scheduledAt)

  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date)
}

watch(
  () => props.appointment,
  appointment => {
    newDate.value = getScheduleDate(appointment)
    newTime.value = ''
  },
  { immediate: true }
)

function formatDate(date) {
  if (!date) return 'Date unavailable'

  const parsed = new Date(`${date}T12:00:00`)

  if (Number.isNaN(parsed.getTime())) return 'Date unavailable'

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatTime(time) {
  if (!time) return 'Time unavailable'

  const match = String(time).match(/^(\d{1,2}):(\d{2})/)

  if (!match) return 'Time unavailable'

  const hour = Number(match[1])
  const minute = Number(match[2])

  if (hour > 23 || minute > 59) return 'Time unavailable'

  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

function submitForm() {
  if (!newDate.value || !newTime.value) {
    alert('Please select a new date and time.')
    return
  }

  const selectedDateTime = new Date(
    `${newDate.value}T${newTime.value}:00+08:00`
  )

  if (Number.isNaN(selectedDateTime.getTime())) {
    alert('Invalid date or time.')
    return
  }

  if (selectedDateTime <= new Date()) {
    alert('Please select a future date and time.')
    return
  }

  emit('save', {
    date: newDate.value,
    time: newTime.value
  })
}
</script>

<template>
  <div class="reschedule-page">
    <section class="page-heading">
      <h1>Reschedule Appointments</h1>

      <p v-if="appointment">
        {{ appointment.student || appointment.student_name }}
        ·
        {{ appointment.reference || appointment.transaction_id }}
      </p>
    </section>

    <section v-if="appointment" class="reschedule-panel">
      <div class="current-schedule">
        <strong>Current Schedule:</strong>

        <span>
          {{ formatDate(getScheduleDate(appointment)) }}
          at
          {{ formatTime(getScheduleTime(appointment)) }}
        </span>
      </div>

      <form class="reschedule-form" @submit.prevent="submitForm">
        <div class="form-field">
          <label for="new-date">New Date</label>

          <input
            id="new-date"
            v-model="newDate"
            type="date"
            :min="new Date().toLocaleDateString('en-CA', {
              timeZone: 'Asia/Manila'
            })"
            required
          />
        </div>

        <div class="form-field">
          <label for="new-time">New Time</label>

          <select id="new-time" v-model="newTime" required>
            <option value="" disabled>Choose a time</option>

            <option
              v-for="slot in timeSlots"
              :key="slot.value"
              :value="slot.value"
            >
              {{ slot.label }}
            </option>
          </select>
        </div>

        <div class="form-actions">
          <button class="primary-button" type="submit">
            Review Changes
          </button>

          <button
            class="outline-button"
            type="button"
            @click="emit('cancel')"
          >
            Cancel Editing
          </button>
        </div>
      </form>
    </section>

    <section v-else class="reschedule-panel empty-panel">
      <h2>No appointment selected</h2>

      <p>
        Go back to Appointments and select an appointment to reschedule.
      </p>

      <button class="primary-button" @click="emit('cancel')">
        Back to Appointments
      </button>
    </section>
  </div>
</template>

<style scoped>
.reschedule-page {
  width: 100%;
  max-width: 100%;
}

.page-heading {
  margin: 0 0 30px;
}

.page-heading h1 {
  margin: 0;
  color: #51090e;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(27px, 2.5vw, 36px);
  font-weight: 600;
  line-height: 1.25;
}

.page-heading p {
  margin: 3px 0 0;
  color: #775f60;
  font-size: 13px;
}

.reschedule-panel {
  width: 100%;
  padding: 22px 20px 18px;
  background: #f8eeee;
  border: 1px solid #b98b8e;
  border-radius: 7px;
}

.current-schedule {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  min-height: 48px;
  padding: 12px;
  margin-bottom: 22px;
  color: #29090b;
  background: #d9b7b8;
  border-radius: 6px;
  font-size: 14px;
}

.current-schedule strong {
  font-weight: 700;
}

.reschedule-form {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-field label {
  color: #300b0d;
  font-size: 12px;
  font-weight: 700;
}

.form-field input,
.form-field select {
  display: block;
  width: 100%;
  height: 37px;
  padding: 0 11px;
  color: #300b0d;
  background: #f8eeee;
  border: 1px solid #a8797d;
  border-radius: 6px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  outline: none;
}

.form-field input:focus,
.form-field select:focus {
  border-color: #650f18;
  box-shadow: 0 0 0 2px #650f181a;
}

.form-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 1px;
}

.primary-button,
.outline-button {
  min-width: 143px;
  height: 36px;
  padding: 0 15px;
  border-radius: 6px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.primary-button {
  color: #fffafa;
  background: #650f18;
  border: 1px solid #650f18;
}

.primary-button:hover {
  background: #51090e;
}

.outline-button {
  color: #39090c;
  background: transparent;
  border: 1px solid #a8797d;
}

.outline-button:hover {
  background: #efdfdf;
}

.empty-panel h2 {
  margin-top: 0;
  color: #51090e;
  font-family: Georgia, 'Times New Roman', serif;
}

.empty-panel p {
  margin-bottom: 20px;
  color: #775f60;
  font-size: 13px;
  line-height: 1.6;
}

@media (max-width: 600px) {
  .page-heading {
    margin-bottom: 20px;
  }

  .reschedule-panel {
    padding: 16px;
  }

  .current-schedule {
    align-items: flex-start;
    flex-direction: column;
  }

  .form-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .primary-button,
  .outline-button {
    width: 100%;
  }
}
</style>
