
<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="modal-overlay"
        @click.self="handleBackdrop"
        @keydown.esc="handleCancel"
      >
        <section
          class="app-modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="description ? descriptionId : undefined"
        >
          <div class="modal-icon" :class="`icon-${type}`">
            <svg
              v-if="type === 'success'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m5 12 4 4L19 6" />
            </svg>

            <svg
              v-else-if="type === 'error'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16h.01" />
            </svg>

            <svg
              v-else-if="type === 'security'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>

            <svg
              v-else-if="type === 'info'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </svg>

            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 3 2.8 20h18.4L12 3Z" />
              <path d="M12 9v5M12 17h.01" />
            </svg>
          </div>

          <h2 :id="titleId" class="modal-title">
            {{ title }}
          </h2>

          <p
            v-if="description"
            :id="descriptionId"
            class="modal-description"
          >
            {{ description }}
          </p>

          <div v-if="$slots.default" class="modal-content">
            <slot />
          </div>

          <div v-if="$slots.actions || !hideActions" class="modal-actions">
            <slot name="actions">
              <button
                v-if="showCancel"
                type="button"
                class="modal-button modal-button-secondary"
                :disabled="loading"
                @click="handleCancel"
              >
                {{ cancelText }}
              </button>

              <button
                v-if="!hideActions"
                type="button"
                class="modal-button modal-button-primary"
                :disabled="loading || confirmDisabled"
                @click="handleConfirm"
              >
                <span v-if="loading" class="button-spinner"></span>
                {{ loading ? loadingText : confirmText }}
              </button>
            </slot>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, useId } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: 'Are you sure?' },
  description: { type: String, default: '' },
  type: {
    type: String,
    default: 'warning',
    validator: value =>
      ['success', 'error', 'warning', 'info', 'security'].includes(value)
  },
  confirmText: { type: String, default: 'Continue' },
  cancelText: { type: String, default: 'Cancel' },
  loadingText: { type: String, default: 'Please wait...' },
  showCancel: { type: Boolean, default: true },
  hideActions: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  confirmDisabled: { type: Boolean, default: false },
  closeOnBackdrop: { type: Boolean, default: false }
})

const emit = defineEmits([
  'update:modelValue',
  'confirm',
  'cancel'
])

const generatedId = useId()
const titleId = computed(() => `modal-title-${generatedId}`)
const descriptionId = computed(() => `modal-description-${generatedId}`)

function handleCancel() {
  if (props.loading) return

  emit('cancel')
  emit('update:modelValue', false)
}

function handleConfirm() {
  if (props.loading || props.confirmDisabled) return

  emit('confirm')
}

function handleBackdrop() {
  if (props.closeOnBackdrop) {
    handleCancel()
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(35, 25, 28, 0.48);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}

.app-modal {
  box-sizing: border-box;
  width: min(100%, 420px);
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding: 30px 32px 25px;
  background: #fffdfd;
  border: 1px solid #e9dfe0;
  border-radius: 23px;
  box-shadow: 0 12px 35px rgba(35, 15, 20, 0.14);
  text-align: left;
}

.modal-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin: 0 0 19px;
  border-radius: 11px;
  background: #f1e5e6;
  color: #65202b;
}

.modal-icon svg {
  width: 19px;
  height: 19px;
}

.icon-success {
  color: #52765c;
  background: #edf3ee;
}

.icon-error {
  color: #963b42;
  background: #f6e9e9;
}

.icon-warning,
.icon-security {
  color: #69232e;
  background: #f1e5e6;
}

.icon-info {
  color: #6d4050;
  background: #f2ebed;
}

.modal-title {
  margin: 0;
  color: #271b1d;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 27px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.5px;
}

.modal-description {
  margin: 11px 0 0;
  color: #81777a;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
  white-space: pre-line;
}

.modal-content {
  margin-top: 17px;
  text-align: left;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 25px;
}

.modal-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0 15px;
  border-radius: 8px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
}

.modal-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-button-secondary {
  color: #70414b;
  background: #fffdfd;
  border: 1px solid #dfd1d4;
}

.modal-button-secondary:hover:not(:disabled) {
  background: #f8f1f2;
  border-color: #b99da4;
}

.modal-button-primary {
  color: #fff;
  background: #4c080d;
  border: 1px solid #4c080d;
}

.modal-button-primary:hover:not(:disabled) {
  background: #68151d;
  border-color: #68151d;
}

.button-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 7px;
  vertical-align: -2px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .app-modal,
.modal-leave-active .app-modal {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .app-modal,
.modal-leave-to .app-modal {
  transform: translateY(8px) scale(0.98);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 520px) {
  .modal-overlay {
    padding: 18px;
  }

  .app-modal {
    width: 100%;
    padding: 26px 24px 22px;
    border-radius: 20px;
  }

  .modal-icon {
    margin-bottom: 17px;
  }

  .modal-title {
    font-size: 25px;
  }

  .modal-description {
    margin-top: 10px;
    font-size: 13px;
  }

  .modal-actions {
    margin-top: 22px;
  }

  .modal-button {
    min-height: 38px;
    padding: 0 13px;
  }
}

@media (max-width: 360px) {
  .modal-actions {
    gap: 7px;
  }

  .modal-button {
    padding: 0 11px;
    font-size: 11px;
  }
}
</style>
