
<script setup>
import { computed } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    default: 'Confirm',
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['confirm', 'cancel'])

const isConfirm = computed(() => props.status === 'Confirm')

const modalTitle = computed(() =>
  isConfirm.value
    ? 'Confirm this Book Request?'
    : 'Cancel this Book Request?',
)

const modalMessage = computed(() =>
  isConfirm.value
    ? 'This will confirm the request, create a book loan record, and update the available book copies.'
    : 'Are you sure you want to cancel this request? This action will not create a book loan.',
)

function handleConfirm() {
  if (props.loading || !props.show) return

  emit('confirm')
}

function handleCancel() {
  if (props.loading || !props.show) return

  emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="modal-overlay"
      @click.self="handleCancel"
    >
      <section
        class="confirmation-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="modalTitle"
      >
        <div class="warning-icon">!</div>

        <div class="modal-content">
          <h2>{{ modalTitle }}</h2>

          <p>{{ modalMessage }}</p>

          <div class="modal-actions">
            <button
              type="button"
              class="back-button"
              :disabled="loading"
              @click="handleCancel"
            >
              Go Back
            </button>

            <button
              type="button"
              :class="
                isConfirm
                  ? 'confirm-button'
                  : 'cancel-button'
              "
              :disabled="loading"
              @click="handleConfirm"
            >
              <span v-if="loading">
                Please wait...
              </span>

              <span v-else-if="isConfirm">
                Confirm Request
              </span>

              <span v-else>
                Cancel Request
              </span>
            </button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 20px;
  background: rgb(25 18 18 / 48%);

  pointer-events: auto;
}

.confirmation-modal {
  position: relative;
  z-index: 100000;

  display: flex;
  align-items: flex-start;
  gap: 14px;

  width: min(100%, 450px);
  padding: 22px;

  border-radius: 12px;
  background: #f8eeee;
  color: #390607;

  box-shadow: 0 12px 40px rgb(0 0 0 / 18%);
}

.warning-icon {
  display: grid;
  flex-shrink: 0;

  width: 38px;
  height: 38px;

  place-items: center;

  border-radius: 10px;
  background: #ead1d1;
  color: #760f16;

  font-size: 25px;
  font-weight: 700;
}

.modal-content {
  flex: 1;
  min-width: 0;
}

h2 {
  margin: 4px 0 12px;

  font-family: Georgia, serif;
  font-size: 19px;
}

p {
  margin: 0;

  font-size: 12px;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;

  margin-top: 20px;
}

.modal-actions button {
  position: relative;
  z-index: 100001;

  padding: 10px 14px;

  border-radius: 8px;
  cursor: pointer;

  font-size: 11px;
  pointer-events: auto;
}

.modal-actions button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.back-button {
  border: 1px solid #bda0a0;
  background: transparent;
  color: #390607;
}

.confirm-button {
  border: 1px solid #16803c;
  background: #16803c;
  color: white;
}

.cancel-button {
  border: 1px solid #a32626;
  background: #a32626;
  color: white;
}

@media (max-width: 450px) {
  .confirmation-modal {
    padding: 16px;
    gap: 10px;
  }

  .modal-actions {
    flex-direction: column;
  }

  .modal-actions button {
    width: 100%;
  }
}
</style>
