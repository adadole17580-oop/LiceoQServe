<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function goToNotifications() {
  router.push('/student/notifications')
}

function goToProfile() {
  router.push('/student/profile')
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <div class="logo">LQ</div>
      <div class="brand-text">
        <h1>LiceoQServe</h1>
        <p>Student Portal</p>
      </div>
    </div>

    <div class="header-actions">
      <button
        aria-label="Notifications"
        title="Notifications"
        @click="goToNotifications"
      >
        <svg
          class="notification-icon"
          viewBox="0 0 32 32"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M16 3.5c-4.2 0-7.5 3.3-7.5 7.5v4.1c0 1.8-.7 3.5-1.9 4.8L5 21.5h22l-1.6-1.6c-1.2-1.3-1.9-3-1.9-4.8V11c0-4.2-3.3-7.5-7.5-7.5Z" />
          <path d="M12.2 24a3.9 3.9 0 0 0 7.6 0Z" />
          <path
            d="M5.1 8.5a13 13 0 0 1 4-5.1M26.9 8.5a13 13 0 0 0-4-5.1"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
          />
        </svg>
      </button>

      <button
        aria-label="Profile"
        title="Profile"
        @click="goToProfile"
      >
        <svg
          class="profile-icon"
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="16" cy="16" r="13.5" />
          <circle cx="16" cy="11.5" r="4.2" />
          <path d="M7.8 24a8.8 8.8 0 0 1 16.4 0" />
        </svg>
      </button>
    </div>
  </header>
</template>
