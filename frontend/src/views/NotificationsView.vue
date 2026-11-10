<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "../lib/supabase.js";

const router = useRouter();
const notifications = ref([]);
const loading = ref(true);
const loadError = ref('')
const markAllLoading = ref(false)
const updatingNotificationIds = ref(new Set())

let realtimeSubscription = null;

const unreadCount = computed(
  () => notifications.value.filter((item) => item.unread).length
);

async function fetchNotifications() {
  loadError.value = ''
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    if (!session?.user) {
      notifications.value = []
      return
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, category, message, related_id, is_read, created_at')
      .eq('recipient_id', session.user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    notifications.value = (data || []).map(mapNotification)
  } catch (err) {
    console.error('Error fetching notifications:', err)
    loadError.value = err.message || 'Could not load your notifications.'
  } finally {
    loading.value = false
  }
}

function getTargetRoute(category, relatedId) {
  const paths = {
    queue: '/student/queue',
    appointment: '/student/appointments',
    request: '/student/requests',
    library: '/student/services',
    reservation: '/student/appointments',
    campus_event: '/student/services',
    office_event: '/student/services',
    office_schedule: '/student/services',
    office_service: '/student/services',
    campus_announcement: '/student/home',
    office_announcement: '/student/home',
  }
  const normalizedCategory = category?.toLowerCase()
  const path = paths[normalizedCategory] || '/student/home'
  const query = {}
  if (relatedId) query.record = relatedId
  if (normalizedCategory === 'library') query.office = 'Library'
  if (normalizedCategory === 'campus_event' || normalizedCategory === 'office_event') {
    if (relatedId) query.event = relatedId
  }
  if (normalizedCategory === 'office_schedule' && relatedId) query.schedule = relatedId
  if (normalizedCategory === 'office_service' && relatedId) query.service = relatedId
  return Object.keys(query).length ? { path, query } : path
}

function mapNotification(notification) {
  const message = String(notification.message || '')
  const officeMatch = message.match(/^Office: (.+)\r?\n/)
  return {
    id: notification.id,
    title: notification.title,
    detail: officeMatch ? message.slice(officeMatch[0].length) : message,
    officeName: officeMatch?.[1] || '',
    extra: new Date(notification.created_at).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    category: notification.category || 'general',
    unread: !notification.is_read,
    target: getTargetRoute(notification.category, notification.related_id),
  }
}

async function markAllAsRead() {
  if (markAllLoading.value || unreadCount.value === 0) return
  markAllLoading.value = true
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    if (session?.user) {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', session.user.id)
        .eq('is_read', false)
      if (error) throw error
      notifications.value.forEach((item) => {
        item.unread = false
      })
    }
  } catch (err) {
    console.error('Error marking notifications as read:', err)
    loadError.value = err.message || 'Could not mark notifications as read.'
  } finally {
    markAllLoading.value = false
  }
}

async function markAsRead(notification) {
  if (!notification.unread || updatingNotificationIds.value.has(notification.id)) return true
  const updating = new Set(updatingNotificationIds.value)
  updating.add(notification.id)
  updatingNotificationIds.value = updating

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    if (!session?.user) throw new Error('Please sign in again to update this notification.')

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notification.id)
      .eq('recipient_id', session.user.id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('This notification was not updated. Refresh and try again.')
    notification.unread = false
    return true
  } catch (err) {
    console.error('Could not update notification read status:', err)
    loadError.value = err.message || 'Could not mark this notification as read.'
    return false
  } finally {
    const nextUpdating = new Set(updatingNotificationIds.value)
    nextUpdating.delete(notification.id)
    updatingNotificationIds.value = nextUpdating
  }
}

async function openNotification(notification) {
  if (notification.unread && !(await markAsRead(notification))) return
  if (notification.target) {
    router.push(notification.target)
  }
}

onMounted(() => {
  fetchNotifications()

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      realtimeSubscription = supabase
        .channel(`user-notifications-${session.user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${session.user.id}`,
          },
          (payload) => {
            if (payload.new && !notifications.value.some((item) => item.id === payload.new.id)) {
              notifications.value.unshift(mapNotification(payload.new))
            }
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${session.user.id}`,
          },
          (payload) => {
            const existing = notifications.value.find((item) => item.id === payload.new?.id)
            if (existing) {
              existing.unread = !payload.new.is_read
            }
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Realtime notifications are unavailable; updates will refresh when this page is opened.')
          }
        })
    }
  })
})

onUnmounted(() => {
  if (realtimeSubscription) {
    supabase.removeChannel(realtimeSubscription)
  }
})
</script>

<template>
  <section class="notifications-page">
    <div class="notifications-heading">
      <h1>Notifications</h1>
      <p>Campus, office, and transaction updates from LiceoQServe.</p>
    </div>

    <div class="notification-toolbar">
      <span v-if="unreadCount" class="unread-count">
        {{ unreadCount }} unread
      </span>

      <button
        class="mark-all-button"
        type="button"
        :disabled="unreadCount === 0 || markAllLoading"
        @click="markAllAsRead"
      >
        {{ markAllLoading ? 'Marking…' : 'Mark all as read' }}
      </button>
    </div>

    <p v-if="loadError" role="alert">
      {{ loadError }}
      <button type="button" @click="fetchNotifications">Try Again</button>
    </p>
    <p v-if="loading" role="status">Loading notifications…</p>

    <div v-if="!loading && notifications.length" class="notification-list">
      <article
        v-for="notification in notifications"
        :key="notification.id"
        class="notification-card"
        :class="{ 'is-read': !notification.unread }"
      >
        <span
          class="notification-dot"
          :class="{ 'dot-read': !notification.unread }"
          aria-hidden="true"
        ></span>

        <div class="notification-content">
          <h2>{{ notification.title }}</h2>
          <p v-if="notification.officeName" class="notification-office">
            Posted by {{ notification.officeName }}
          </p>

          <p class="notification-detail">
            <template v-if="notification.category === 'queue'">
              {{ notification.detail }}
              <span class="queue-arrow">→</span>
              {{ notification.extra }}
            </template>

            <template v-else>
              {{ notification.detail }}
              <template v-if="notification.extra">
                · {{ notification.extra }}
              </template>
            </template>
          </p>
        </div>

        <button
          class="open-notification-button"
          type="button"
          :disabled="updatingNotificationIds.has(notification.id)"
          @click="openNotification(notification)"
        >
          Open
        </button>
      </article>
    </div>

    <div v-else-if="!loading && !loadError" class="empty-notifications">
      <h2>No notifications yet</h2>
      <p>Updates about campus and office posts will appear here.</p>
    </div>
  </section>
</template>

<style src="../assets/styles/notifications.css"></style>
