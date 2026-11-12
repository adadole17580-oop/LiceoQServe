
<script setup>
defineProps({
  show: Boolean,
  appointment: {
    type: Object,
    default: () => ({}),
  },
  newDate: {
    type: String,
    default: '',
  },
  newTime: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['close', 'confirm'])

function formatDate(dateString) {
  if (!dateString) return ''

  const [year, month, day] = dateString.split('-').map(Number)

  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
</script>

<template>
  <div
    v-if="show"
    class="overlay"
    @click.self="emit('close')"
  >
    <section
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-title"
    >
      <div class="heading">
        <div class="icon">!</div>
        <h2 id="review-title">Review Reschedule Changes</h2>
      </div>

      <p class="description">
        Please review the new schedule for
        <strong>{{ appointment.student }}</strong>.
      </p>

      <div class="schedule">
        <p class="label">Current Schedule</p>
        <p>{{ appointment.date }} · {{ appointment.time }}</p>

        <div class="divider"></div>

        <p class="label">New Schedule</p>
        <p>{{ formatDate(newDate) }} · {{ newTime }}</p>
      </div>

      <div class="actions">
        <button type="button" class="back" @click="emit('close')">
          Go Back
        </button>

        <button type="button" class="confirm" @click="emit('confirm')">
          Confirm Changes
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(0 0 0 / 45%);
}

.modal {
  width: min(100%, 450px);
  padding: 22px;
  border-radius: 13px;
  background: #f8eeee;
  color: #390607;
  box-shadow: 0 8px 30px rgb(0 0 0 / 20%);
}

.heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 10px;
  background: #efc6c8;
  color: #790b13;
  font-size: 25px;
  font-weight: bold;
}

h2 {
  margin: 0;
  font: 22px Georgia, serif;
}

.description {
  font-size: 13px;
  line-height: 1.6;
}

.schedule {
  margin: 18px 0;
  padding: 14px;
  border-radius: 8px;
  background: #efdfdf;
  font-size: 13px;
}

.schedule p {
  margin: 5px 0;
}

.schedule .label {
  font-weight: 700;
}

.divider {
  height: 1px;
  margin: 14px 0;
  background: #d7b9b9;
}

.actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

button {
  min-height: 36px;
  padding: 0 15px;
  border: 1px solid #95686a;
  border-radius: 10px;
  background: transparent;
  color: #390607;
  font-weight: 600;
  cursor: pointer;
}

.confirm {
  border-color: #650b12;
  background: #650b12;
  color: white;
}

@media (max-width: 480px) {
  .actions button {
    flex: 1;
  }
}
</style>
