<script setup>
const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  confirmText: {
    type: String,
    default: 'Confirm',
  },
  cancelText: {
    type: String,
    default: 'Cancel',
  },
  busy: {
    type: Boolean,
    default: false,
  },
  busyText: {
    type: String,
    default: 'Processing…',
  },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

function close() {
  if (!props.busy) emit('update:modelValue', false)
}
</script>

<template>
  <div
    v-if="modelValue"
    class="logout-overlay"
    @click.self="close"
  >
    <section
      class="logout-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div class="logout-dialog-heading">
        <span class="logout-warning-icon">!</span>
        <h2 id="confirm-dialog-title">{{ title }}</h2>
      </div>

      <p>{{ message }}</p>

      <div class="logout-dialog-actions">
        <button
          type="button"
          class="logout-back-button"
          :disabled="busy"
          @click="close"
        >
          {{ cancelText }}
        </button>

        <button
          type="button"
          class="logout-confirm-button"
          :disabled="busy"
          @click="emit('confirm')"
        >
          {{ busy ? busyText : confirmText }}
        </button>
      </div>
    </section>
  </div>
</template>
