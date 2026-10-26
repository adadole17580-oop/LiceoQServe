<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import StudentSidebar from '../components/StudentSidebar.vue'
import { useAuth } from '../composables/useAuth.js'
import '../assets/styles/app.css'

const router = useRouter()
const { signOut } = useAuth()
const showLogoutDialog = ref(false)

async function confirmLogout() {
  showLogoutDialog.value = false
  await signOut()
  router.push('/')
}
</script>

<template>
  <div class="app">
    <AppHeader />

    <StudentSidebar @logout="showLogoutDialog = true" />

    <main class="content">
      <RouterView />
    </main>

    <div
      v-if="showLogoutDialog"
      class="logout-overlay"
      @click.self="showLogoutDialog = false"
    >
      <section
        class="logout-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-title"
      >
        <div class="logout-dialog-heading">
          <span class="logout-warning-icon">!</span>
          <h2 id="logout-title">Log Out of LiceoQServe?</h2>
        </div>

        <p>
          You will return to authentication login/<br />
          register screen.
        </p>

        <div class="logout-dialog-actions">
          <button
            type="button"
            class="logout-back-button"
            @click="showLogoutDialog = false"
          >
            Go Back
          </button>

          <button
            type="button"
            class="logout-confirm-button"
            @click="confirmLogout"
          >
            Log Out
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
