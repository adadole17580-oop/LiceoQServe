<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "../lib/supabase.js";

const router = useRouter();
const notifications = ref([]);
const loading = ref(true);

let realtimeSubscription = null;

const unreadCount = computed(
  () => notifications.value.filter((item) => item.unread).length
);

async function fetchNotifications() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, category, message, is_read, created_at')
      .eq('recipient_id', session.user.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      notifications.value = data.map((n) => ({
        id: n.id,
        title: n.title,
        detail: n.message,
        extra: new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        category: n.category || 'general',
        unread: !n.is_read,
        target: getTargetRoute(n.category),
      }))
    }
  } catch (err) {
    console.error('Error fetching notifications:', err)
  } finally {
    loading.value = false
  }
}

function getTargetRoute(category) {
  switch (category?.toLowerCase()) {
    case 'queue':
      return '/student/queue'
    case 'appointment':
      return '/student/appointments'
    case 'request':
      return '/student/requests'
    case 'library':
      return '/student/services'
    case 'reservation':
      return '/student/appointments?section=reservations'
    default:
      return '/student/home'
  }
}

async function markAllAsRead() {
  notifications.value.forEach((item) => {
    item.unread = false;
  });

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', session.user.id)
    }
  } catch (err) {
    console.error('Error marking notifications as read:', err)
  }
}

async function openNotification(notification) {
  notification.unread = false;

  try {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notification.id)
  } catch (err) {
    console.warn('Could not update notification read status:', err)
  }

  if (notification.target) {
    router.push(notification.target);
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
            if (payload.new) {
              notifications.value.unshift({
                id: payload.new.id,
                title: payload.new.title,
                detail: payload.new.message,
                extra: 'Just now',
                category: payload.new.category || 'general',
                unread: true,
                target: getTargetRoute(payload.new.category),
              })
            }
          }
        )
        .subscribe()
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
      <p>Select an update to open the related transaction.</p>
    </div>

    <div class="notification-toolbar">
      <span v-if="unreadCount" class="unread-count">
        {{ unreadCount }} unread
      </span>

      <button
        class="mark-all-button"
        type="button"
        :disabled="unreadCount === 0"
        @click="markAllAsRead"
      >
        Mark all as read
      </button>
    </div>

    <div v-if="notifications.length" class="notification-list">
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
          @click="openNotification(notification)"
        >
          Open
        </button>
      </article>
    </div>

    <div v-else class="empty-notifications">
      <h2>No notifications yet</h2>
      <p>Updates about your campus transactions will appear here.</p>
    </div>
  </section>
</template>

<style src="../assets/styles/notifications.css"></style>
