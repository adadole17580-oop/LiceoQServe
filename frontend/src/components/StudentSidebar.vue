<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const emit = defineEmits(['logout'])

const router = useRouter()
const route = useRoute()
const { studentName, studentId } = useAuth()

const menu = [
  { label: 'HOME', path: '/student/home', name: 'student-home' },
  { label: 'SERVICES', path: '/student/services', name: 'student-services' },
  { label: 'MY QUEUE', path: '/student/queue', name: 'student-queue' },
  { label: 'MY APPOINTMENTS', path: '/student/appointments', name: 'student-appointments' },
  { label: 'MY REQUESTS', path: '/student/requests', name: 'student-requests' },
  { label: 'HISTORY', path: '/student/history', name: 'student-history' },
]

function navigateTo(path) {
  router.push(path)
}
</script>

<template>
  <aside class="sidebar">
    <div class="student">
      <p class="student-label">SIGNED IN AS</p>
      <h2>{{ studentName }}</h2>
      <p class="student-id">{{ studentId }}</p>
    </div>

    <nav class="main-nav" aria-label="Student navigation">
      <button
        v-for="item in menu"
        :key="item.path"
        :class="{ active: route.path === item.path }"
        :aria-current="route.path === item.path ? 'page' : undefined"
        type="button"
        @click="navigateTo(item.path)"
      >
        {{ item.label }}
      </button>
    </nav>

    <button
      class="logout"
      type="button"
      @click="emit('logout')"
    >
      LOG OUT
    </button>
  </aside>
</template>
