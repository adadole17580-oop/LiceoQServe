
<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  show: Boolean,
  appointment: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['close', 'review'])

const newDate = ref('')
const newTime = ref('')

function getLocalDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

watch(
  () => [props.show, props.appointment?.appointmentId],
  ([isOpen]) => {
    if (isOpen) {
      newDate.value = ''
      newTime.value = ''
    }
  },
)

function reviewChanges() {
  if (!newDate.value || !newTime.value) {
    window.alert('Please select a new date and time.')
    return
  }

  if (newDate.value < getLocalDate()) {
    window.alert('Please select a future date.')
    return
  }

  emit('review', {
    appointment: props.appointment,
    date: newDate.value,
    time: newTime.value,
  })
}
</script>

<template>
  <div
    v-if="show"
    class="overlay"
    @click.self="emit('close')"
  >
    <section class="reschedule-modal">
      <h2>Reschedule Appointment</h2>

      <p class="subtitle">
        {{ appointment.purpose }} · {{ appointment.id }}
      </p>

      <form class="form-card" @submit.prevent="reviewChanges">
        <div class="current-schedule">
          <strong>Current Schedule:</strong>
          {{ appointment.date }} at {{ appointment.time }}
        </div>

        <label for="new-date">New Date</label>
        <input
          id="new-date"
          v-model="newDate"
          type="date"
          :min="getLocalDate()"
          required
        />

        <label for="new-time">New Time</label>
        <select id="new-time" v-model="newTime" required>
          <option value="" disabled>Choose a time</option>
          <option>8:00 AM</option>
          <option>9:00 AM</option>
          <option>10:00 AM</option>
          <option>11:00 AM</option>
          <option>1:00 PM</option>
          <option>2:00 PM</option>
          <option>3:00 PM</option>
          <option>4:00 PM</option>
        </select>

        <div class="actions">
          <button class="review" type="submit">
            Review Changes
          </button>

          <button
            class="cancel"
            type="button"
            @click="emit('close')"
          >
            Cancel Editing
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  overflow-y: auto;
  padding: 20px;
  background: rgb(0 0 0 / 48%);
}

.reschedule-modal {
  width: min(100%, 650px);
  padding: 24px;
  border-radius: 12px;
  background: #efdfdf;
  color: #390607;
}

h2 {
  margin: 0 0 2px;
  font: 26px Georgia, serif;
}

.subtitle {
  margin: 0 0 28px;
  font-size: 13px;
}

.form-card {
  display: grid;
  gap: 12px;
  padding: 20px;
  border: 1px solid #b98b8c;
  border-radius: 7px;
  background: #f8eeee;
}

.current-schedule {
  margin-bottom: 8px;
  padding: 15px 12px;
  border-radius: 6px;
  background: #d9b7b8;
  font-size: 13px;
}

label {
  font-size: 12px;
  font-weight: 600;
}

input,
select {
  width: 100%;
  min-height: 39px;
  padding: 9px;
  border: 1px solid #b98b8c;
  border-radius: 6px;
  background: #f8eeee;
  color: #390607;
  font: inherit;
  font-size: 12px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 2px;
}

button {
  min-height: 36px;
  padding: 0 20px;
  border: 1px solid #95686a;
  border-radius: 6px;
  background: transparent;
  color: #390607;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

button.review {
  border-color: #a97d80;
  background: #a97d80;
  color: white;
}

button:hover {
  filter: brightness(0.96);
}

@media (max-width: 480px) {
  .reschedule-modal {
    padding: 16px;
  }

  .actions button {
    flex: 1;
  }
}
</style>
