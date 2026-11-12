
<script setup>
const props = defineProps({
  show: Boolean,
  processing: {
    type: Boolean,
    default: false,
  },
  action: {
    type: String,
    default: 'complete',
  },
  appointment: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['close', 'confirm'])

const details = {
  confirm: {
    title: 'Approve this Appointment?',
    button: 'Approve Appointment',
    color: '#16803c',
  },
  complete: {
    title: 'Complete this Appointment?',
    button: 'Confirm completed',
    color: '#650b12',
  },
  cancel: {
    title: 'Cancel this Appointment?',
    button: 'Confirm cancelled',
    color: '#d00000',
  },
  'no-show': {
    title: 'No-show this Appointment?',
    button: 'Confirm no-show',
    color: '#d00000',
  },
}

function closeModal() {
  if (props.processing) return
  emit('close')
}
</script>

<template>
  <div
    v-if="show"
    class="modal-overlay"
    @click.self="closeModal"
  >
    <section
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-label="details[action]?.title"
    >
      <div class="heading">
        <div class="warning">!</div>
        <h2>{{ details[action]?.title }}</h2>
      </div>

      <p class="description">
        {{ appointment.student }} · {{ appointment.purpose }}
        · {{ appointment.date }} at {{ appointment.time }}
      </p>

      <div class="buttons">
        <button
          class="back"
          type="button"
          :disabled="processing"
          @click="closeModal"
        >
          Go Back
        </button>

        <button
          class="confirm"
          type="button"
          :disabled="processing"
          :style="{ background: details[action]?.color }"
          @click="emit('confirm', action)"
        >
          <span v-if="processing" class="spinner"></span>
          {{ processing ? 'Processing...' : details[action]?.button }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(0 0 0 / 45%);
}

.modal {
  width: min(100%, 460px);
  padding: 20px;
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

.warning {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 54px;
  height: 54px;
  border-radius: 11px;
  background: #efc6c8;
  color: #790b13;
  font-size: 28px;
  font-weight: bold;
}

h2 {
  margin: 0;
  font: 500 23px Georgia, serif;
}

.description {
  margin: 17px 0;
  font-size: 12px;
  line-height: 1.6;
}

.buttons {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.buttons button {
  min-height: 36px;
  padding: 0 16px;
  border: 1px solid #6b3337;
  border-radius: 12px;
  background: transparent;
  color: #390607;
  font-weight: 600;
  cursor: pointer;
}

.buttons .confirm {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-color: transparent;
  color: white;
}

.buttons button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgb(255 255 255 / 40%);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 480px) {
  h2 {
    font-size: 19px;
  }
}
</style>
