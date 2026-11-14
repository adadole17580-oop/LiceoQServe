
<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  count: {
    type: [Number, String],
    default: 0
  },
  subtitle: {
    type: String,
    default: 'View Details'
  }
})

const emit = defineEmits(['click'])
</script>

<template>
  <article class="stat-card">
    <span class="stat-title">{{ title }}</span>

    <strong class="stat-count">{{ count }}</strong>

    <button
      type="button"
      class="stat-subtitle"
      @click="emit('click')"
    >
      {{ subtitle }}
    </button>
  </article>
</template>

<style scoped>
.stat-subtitle {
  display: inline-block;
  width: fit-content;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  color: #59070d;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: inherit;
  text-align: left;
  cursor: pointer;
}

.stat-subtitle:hover {
  text-decoration: underline;
}

.stat-subtitle:focus-visible {
  outline: 2px solid #59070d;
  outline-offset: 4px;
  border-radius: 3px;
}
</style>
