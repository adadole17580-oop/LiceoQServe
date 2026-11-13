<script setup>
defineProps({
  pageTitle: {
    type: String,
    default: 'Page',
  },
})
</script>

<template>
  <div class="placeholder-page">
    <h1>{{ pageTitle }}</h1>
    <p>This page is not available yet.</p>
  </div>
</template>

<style scoped>
.placeholder-page {
  padding: 24px;
  border: 1px solid #c9b8b8;
  border-radius: 12px;
  background: #f8eeee;
}

.placeholder-page h1 {
  margin: 0 0 10px;
  font-size: 25px;
}

.placeholder-page p {
  margin: 0;
  color: #8a7272;
  font-size: 13px;
}
</style>