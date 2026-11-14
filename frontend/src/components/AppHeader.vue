<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'

defineProps({
  mobileSidebarOpen: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle-sidebar'])

const router = useRouter()
const unreadCount = ref(0)
let notificationChannel = null

async function loadUnreadCount() {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    if (!session?.user) {
      unreadCount.value = 0
      return
    }

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', session.user.id)
      .eq('is_read', false)
    if (error) throw error
    unreadCount.value = count || 0
  } catch (error) {
    console.error('Error loading unread notification count:', error)
  }
}

function goToNotifications() {
  router.push('/student/notifications')
}

function goToProfile() {
  router.push('/student/profile')
}

function refreshUnreadCountWhenVisible() {
  if (document.visibilityState === 'visible') {
    void loadUnreadCount()
  }
}

onMounted(async () => {
  await loadUnreadCount()
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) {
    console.error('Could not subscribe to unread notifications:', error)
    return
  }
  if (session?.user) {
    notificationChannel = supabase
      .channel(`header-notifications-${session.user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${session.user.id}`,
      }, loadUnreadCount)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Unread notification count will refresh when the portal regains focus.')
        }
      })
  }

  window.addEventListener('focus', refreshUnreadCountWhenVisible)
  document.addEventListener('visibilitychange', refreshUnreadCountWhenVisible)
})

onUnmounted(() => {
  window.removeEventListener('focus', refreshUnreadCountWhenVisible)
  document.removeEventListener('visibilitychange', refreshUnreadCountWhenVisible)
  if (notificationChannel) {
    void supabase.removeChannel(notificationChannel)
  }
})
</script>

<template>
  <header class="topbar">
    <button
      class="mobile-menu-toggle"
      type="button"
      :aria-expanded="mobileSidebarOpen"
      aria-controls="student-sidebar"
      :aria-label="mobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'"
      @click="emit('toggle-sidebar')"
    >
      ☰
    </button>

    <div class="brand">
      <div class="logo">LQ</div>
      <div class="brand-text">
        <h1>LiceoQServe</h1>
        <p>Student Portal</p>
      </div>
    </div>

    <div class="header-actions">
      <button
        :aria-label="unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'"
        title="Notifications"
        style="position: relative;"
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
        <span
          v-if="unreadCount"
          class="notification-badge"
          aria-hidden="true"
          style="position: absolute; top: -4px; right: -4px; min-width: 17px; height: 17px; padding: 0 4px; display: grid; place-items: center; border-radius: 999px; background: #d32f2f; color: #fff; font-size: 10px; font-weight: 700;"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </span>
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
