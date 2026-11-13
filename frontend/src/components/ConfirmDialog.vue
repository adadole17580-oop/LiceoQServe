
<script setup>
import { computed } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Confirm this action?'
  },
  message: {
    type: String,
    default: ''
  },
  confirmText: {
    type: String,
    default: 'Confirm'
  },
  danger: {
    type: Boolean,
    default: false
  },
  action: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['confirm', 'close'])

// CONFIRM APPOINTMENT ICON
const isAppointmentConfirm = computed(() =>
  props.action === 'Confirm' ||
  props.title === 'Confirm this Appointment?'
)

// RESCHEDULE APPOINTMENT ICON
const isReschedule = computed(() =>
  props.action === 'Reschedule' ||
  props.title === 'Reschedule this Appointment?'
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="modal-overlay"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <section
        class="modal-card"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div class="modal-heading">

          <!-- GREEN CALENDAR CHECK FOR CONFIRM APPOINTMENT -->
          <div
            v-if="isAppointmentConfirm"
            class="modal-icon appointment-confirm-icon"
            aria-hidden="true"
          >
            <svg
              width="25"
              height="25"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M16 3v4M8 3v4M3 10h18" />
              <path d="m9 16 2 2 4-4" />
            </svg>
          </div>

          <!-- MAROON CALENDAR CLOCK FOR RESCHEDULE -->
          <div
            v-else-if="isReschedule"
            class="modal-icon reschedule-icon"
            aria-hidden="true"
          >
            <svg
              width="25"
              height="25"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M8 2v4M16 2v4M3 10h18" />
              <path
                d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h7"
              />
              <circle cx="18" cy="18" r="4" />
              <path d="M18 16v2l1.5 1" />
            </svg>
          </div>

          <!-- RED WARNING FOR CANCEL / NO-SHOW -->
          <div
            v-else
            class="modal-icon"
            :class="{ warning: danger }"
            aria-hidden="true"
          >
            !
          </div>

          <h2>{{ title }}</h2>
        </div>

        <p class="modal-message">{{ message }}</p>

        <div class="modal-actions">
          <button
            class="back-button"
            type="button"
            @click="emit('close')"
          >
            Go Back
          </button>

          <button
            class="confirm-button"
            :class="{ danger }"
            type="button"
            @click="emit('confirm')"
          >
            {{ confirmText }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(25, 17, 17, 0.43);
}

.modal-card {
  width: 100%;
  max-width: 365px;
  padding: 15px 14px 18px;
  color: #29090b;
  background: #fffafa;
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
}

.modal-heading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.modal-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  color: white;
  background: #c9151b;
  border-radius: 9px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 25px;
  font-weight: bold;
}

/* GREEN ICON FOR CONFIRM APPOINTMENT */

.appointment-confirm-icon {
  color: #287a4b;
  background: #e1f0e5;
}

.appointment-confirm-icon svg {
  display: block;
  flex-shrink: 0;
}

/* MAROON ICON FOR RESCHEDULE APPOINTMENT */

.reschedule-icon {
  color: #650f18;
  background: #f0dfe1;
}

.reschedule-icon svg {
  display: block;
  flex-shrink: 0;
}

.modal-heading h2 {
  margin: 0;
  color: #29090b;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 19px;
  font-weight: 500;
  line-height: 1.35;
  text-align: center;
}

.modal-message {
  margin: 15px 0 17px;
  color: #321012;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
  overflow-wrap: anywhere;
}

.modal-actions {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.back-button,
.confirm-button {
  min-height: 34px;
  padding: 0 15px;
  border-radius: 10px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11px;
  font-weight: bold;
  cursor: pointer;
}

.back-button {
  color: #39090c;
  background: #fffafa;
  border: 1px solid #a8797d;
}

.back-button:hover {
  background: #efdfdf;
}

.confirm-button {
  color: white;
  background: #650f18;
  border: 1px solid #650f18;
}

.confirm-button:hover {
  background: #51090e;
}

.confirm-button.danger {
  background: #d40000;
  border-color: #d40000;
}

.confirm-button.danger:hover {
  background: #b00000;
}

@media (max-width: 420px) {
  .modal-card {
    padding: 15px 12px;
  }

  .modal-heading {
    gap: 8px;
  }

  .modal-heading h2 {
    font-size: 16px;
  }
}
</style>
