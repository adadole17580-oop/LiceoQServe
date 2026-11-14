<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import StudentSidebar from '../components/StudentSidebar.vue'
import { useAuth } from '../composables/useAuth.js'
import '../assets/styles/app.css'

const router = useRouter()
const { signOut } = useAuth()
const showLogoutDialog = ref(false)
const mobileSidebarOpen = ref(false)
const originalBodyOverflow = document.body.style.overflow

watch(mobileSidebarOpen, (isOpen) => {
  document.body.style.overflow = isOpen ? 'hidden' : originalBodyOverflow
})

function closeMobileSidebar() {
  mobileSidebarOpen.value = false
}

function handleKeydown(event) {
  if (event.key === 'Escape') closeMobileSidebar()
}

function handleResize() {
  if (window.innerWidth > 650) closeMobileSidebar()
}

async function confirmLogout() {
  closeMobileSidebar()
  showLogoutDialog.value = false
  await signOut()
  router.push('/')
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleResize)
  document.body.style.overflow = originalBodyOverflow
})
</script>

<template>
  <div class="app">
    <AppHeader
      :mobile-sidebar-open="mobileSidebarOpen"
      @toggle-sidebar="mobileSidebarOpen = !mobileSidebarOpen"
    />

    <div
      v-if="mobileSidebarOpen"
      class="sidebar-overlay"
      aria-hidden="true"
      @click="closeMobileSidebar"
    />

    <StudentSidebar
      :mobile-open="mobileSidebarOpen"
      @close="closeMobileSidebar"
      @logout="showLogoutDialog = true"
    />

    <main class="content">
      <RouterView />
    </main>

    <ConfirmDialog
      v-model="showLogoutDialog"
      title="Log Out of LiceoQServe?"
      message="You will return to authentication login/
register screen."
      cancel-text="Go Back"
      confirm-text="Log Out"
      @confirm="confirmLogout"
    />
  </div>
</template>
