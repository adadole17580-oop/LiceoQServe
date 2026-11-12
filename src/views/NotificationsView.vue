
<script setup>
import { ref, computed, onMounted, watch } from 'vue'

const props = defineProps({
  accessToken: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['open'])

const API_BASE_URL = 'http://localhost:3000'

const notifications = ref([])
const loading = ref(false)
const errorMessage = ref('')
const markingAllAsRead = ref(false)
const openingNotificationId = ref(null)

const hasUnreadNotifications = computed(() =>
  notifications.value.some(item => !item.read)
)

function formatDate(value) {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function getDestination(notification) {
  const title = (notification.title || '').toLowerCase()
  const category = (notification.category || '').toLowerCase()

  if (title.includes('reschedule')) {
    return 'Reschedule'
  }

  if (
    title.includes('appointment') ||
    category.includes('appointment')
  ) {
    return 'Appointments'
  }

  if (
    title.includes('session') ||
    category.includes('session')
  ) {
    return 'Guidance Sessions'
  }

  if (category.includes('request')) {
    return 'Students'
  }

  return 'Notifications'
}

async function loadNotifications() {
  if (!props.accessToken) {
    notifications.value = []
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/guidance/notifications`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${props.accessToken}`
        }
      }
    )

    const result = await response.json()

    if (!response.ok || result.success === false) {
      throw new Error(
        result.message || 'Unable to load notifications.'
      )
    }

    const records = Array.isArray(result.notifications)
      ? result.notifications
      : Array.isArray(result.data)
        ? result.data
        : []

    notifications.value = records.map(notification => ({
      ...notification,
      read: notification.is_read === true,
      date: formatDate(notification.created_at),
      destination: getDestination(notification)
    }))
  } catch (error) {
    console.error('LOAD NOTIFICATIONS ERROR:', error)
    errorMessage.value =
      error.message || 'Unable to load notifications.'
  } finally {
    loading.value = false
  }
}

async function markAllAsRead() {
  if (
    markingAllAsRead.value ||
    !hasUnreadNotifications.value ||
    !props.accessToken
  ) {
    return
  }

  markingAllAsRead.value = true
  errorMessage.value = ''

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/guidance/notifications/read-all`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${props.accessToken}`
        }
      }
    )

    const result = await response.json()

    if (!response.ok || result.success === false) {
      throw new Error(
        result.message || 'Unable to mark all as read.'
      )
    }

    notifications.value.forEach(item => {
      item.read = true
      item.is_read = true
    })
  } catch (error) {
    console.error('MARK ALL AS READ ERROR:', error)
    errorMessage.value =
      error.message || 'Unable to mark all as read.'
  } finally {
    markingAllAsRead.value = false
  }
}

async function openNotification(notification) {
  if (openingNotificationId.value !== null) return

  errorMessage.value = ''
  openingNotificationId.value = notification.id

  try {
    if (!notification.read) {
      const response = await fetch(
        `${API_BASE_URL}/api/guidance/notifications/${notification.id}/read`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${props.accessToken}`
          }
        }
      )

      const result = await response.json()

      if (!response.ok || result.success === false) {
        throw new Error(
          result.message || 'Unable to update notification.'
        )
      }

      // Immediately update the visual read state.
      notification.read = true
      notification.is_read = true
    }

    // Preserve the existing App.vue navigation.
    emit('open', notification)
  } catch (error) {
    console.error('MARK NOTIFICATION READ ERROR:', error)
    errorMessage.value =
      error.message || 'Unable to update notification.'
  } finally {
    openingNotificationId.value = null
  }
}

onMounted(loadNotifications)

watch(
  () => props.accessToken,
  loadNotifications
)
</script>

<template>
  <section class="notifications-page">

    <header class="notifications-heading">
      <h1>Notifications</h1>
      <p>Select an update to open the related transaction.</p>
    </header>

    <div class="notification-toolbar">
      <button
        class="mark-read-button"
        type="button"
        :disabled="
          loading ||
          markingAllAsRead ||
          !hasUnreadNotifications
        "
        @click="markAllAsRead"
      >
        {{ markingAllAsRead ? 'Updating...' : 'Mark all as read' }}
      </button>
    </div>

    <p
      v-if="errorMessage"
      class="notification-empty error"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <p v-if="loading" class="notification-empty">
      Loading notifications...
    </p>

    <div
      v-else-if="notifications.length === 0"
      class="notification-empty"
    >
      No notifications yet.
    </div>

    <div v-else class="notification-list">
      <article
        v-for="notification in notifications"
        :key="notification.id"
        class="notification-card"
        :class="{
          'is-read': notification.read,
          'is-unread': !notification.read
        }"
      >
        <span
          class="notification-dot"
          :class="{ 'dot-read': notification.read }"
          aria-hidden="true"
        ></span>

        <div class="notification-content">
          <h2>{{ notification.title }}</h2>
          <p>{{ notification.date }}</p>
        </div>

        <button
          class="notification-open"
          type="button"
          :disabled="openingNotificationId !== null"
          @click="openNotification(notification)"
        >
          {{
            openingNotificationId === notification.id
              ? 'Opening...'
              : 'Open'
          }}
        </button>
      </article>
    </div>

  </section>
</template>

<style scoped>
/* ========================================
   PAGE
   ======================================== */

.notifications-page {
  width: 100%;
  min-width: 0;
  color: #39090c;
}

.notifications-heading {
  margin-bottom: 7px;
}

.notifications-heading h1 {
  margin: 0;
  color: #39090c;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 29px;
  font-weight: normal;
  line-height: 1.3;
}

.notifications-heading p {
  margin: 0;
  color: #39090c;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  line-height: 1.4;
}

/* ========================================
   MARK ALL AS READ
   ======================================== */

.notification-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-height: 27px;
}

.mark-read-button {
  padding: 4px 6px;
  color: #51090e;
  background: transparent;
  border: none;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.mark-read-button:disabled {
  color: #a27b7e;
  opacity: 1;
  cursor: not-allowed;
}

.mark-read-button:not(:disabled):hover {
  text-decoration: underline;
}

/* ========================================
   NOTIFICATION LIST
   ======================================== */

.notification-list {
  display: grid;
  gap: 16px;
  padding: 0 11px;
}

/* ========================================
   NOTIFICATION CARDS
   ======================================== */

.notification-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 80px;
  padding: 15px 14px;
  background: #f8eeee;
  border: 1px solid #a8787c;
  border-radius: 15px;
  opacity: 1;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

/* Read cards have softer borders */
.notification-card.is-read {
  background: #f5ebeb;
  border-color: #c6a6a7;
}

/* ========================================
   READ / UNREAD DOT
   ======================================== */

.notification-dot {
  flex: 0 0 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #650f18;
}

.notification-dot.dot-read {
  background: #ad898b;
}

/* ========================================
   NOTIFICATION TEXT
   ======================================== */

.notification-content {
  flex: 1;
  min-width: 0;
}

/* UNREAD — DARK, CLEAR, FIGMA STYLE */
.notification-content h2 {
  margin: 0;
  color: #39090c;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.notification-content p {
  margin: 6px 0 0;
  color: #56383b;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11px;
  line-height: 1.4;
}

/* READ — AUTOMATICALLY FADED */
.notification-card.is-read .notification-content h2 {
  color: #987d7e;
  font-weight: 500;
}

.notification-card.is-read .notification-content p {
  color: #a18a8c;
}

/* ========================================
   OPEN BUTTON
   ======================================== */

/* UNREAD — DARK RED */
.notification-open {
  flex-shrink: 0;
  align-self: center;
  padding: 5px 10px;
  color: #a4000b;
  background: transparent;
  border: none;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.notification-open:not(:disabled):hover {
  text-decoration: underline;
}

/* READ — FADED RED */
.notification-card.is-read .notification-open {
  color: #d66d70;
  font-weight: 500;
}

.notification-open:disabled {
  cursor: wait;
}

/* ========================================
   EMPTY / LOADING / ERROR
   ======================================== */

.notification-empty {
  margin: 0;
  padding: 24px 10px;
  color: #775f60;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  text-align: center;
}

.notification-empty.error {
  color: #a00008;
}

/* ========================================
   RESPONSIVE
   ======================================== */

@media (max-width: 600px) {
  .notifications-heading h1 {
    font-size: 25px;
  }

  .notification-list {
    padding: 0;
  }

  .notification-card {
    gap: 8px;
    padding: 14px 10px;
  }

  .notification-content h2 {
    font-size: 14px;
  }

  .notification-open {
    padding: 5px;
    font-size: 12px;
  }
}
</style>
