
<template>
  <section class="notifications-page">

    <!-- PAGE HEADING -->
    <div class="page-heading">
      <h1>NOTIFICATIONS</h1>
      <p>Select a notification to open its related transaction.</p>
    </div>

    <!-- TOOLBAR -->
    <div class="notification-toolbar">

      <div class="filter-group">
        <button
          v-for="filter in filters"
          :key="filter"
          type="button"
          class="filter-button"
          :class="{ active: activeFilter === filter }"
          @click="activeFilter = filter"
        >
          {{ filter }}

          <span v-if="filter === 'Unread'">
            ({{ unreadCount }})
          </span>
        </button>
      </div>

      <button
        v-if="unreadCount > 0"
        type="button"
        class="mark-all-button"
        :disabled="markingAll"
        @click="markAllAsRead"
      >
        {{ markingAll ? 'Updating...' : 'Mark all as read' }}
      </button>

    </div>

    <!-- LOADING -->
    <div v-if="loading" class="state-message">
      Loading notifications...
    </div>

    <!-- ERROR -->
    <div v-else-if="errorMessage" class="error-message">
      {{ errorMessage }}

      <button
        type="button"
        @click="fetchNotifications"
      >
        Try Again
      </button>
    </div>

    <!-- NOTIFICATION LIST -->
    <div v-else class="notification-list">

      <article
        v-for="notification in filteredNotifications"
        :key="notification.id"
        class="notification-card"
        :class="{ unread: !notification.is_read }"
      >

        <div
          class="notification-dot"
          :class="{ read: notification.is_read }"
        ></div>

        <div class="notification-content">

          <div class="notification-title-row">

            <h3>{{ notification.title }}</h3>

            <span
              v-if="!notification.is_read"
              class="unread-label"
            >
              NEW
            </span>

          </div>

          <p>{{ notification.message }}</p>

          <span class="notification-date">
            {{ formatDate(notification.created_at) }}
          </span>

        </div>

        <button
          type="button"
          class="open-button"
          :disabled="openingId === notification.id"
          @click="openNotification(notification)"
        >
          {{ openingId === notification.id ? 'Opening...' : 'Open' }}
        </button>

      </article>

      <!-- EMPTY STATE -->
      <div
        v-if="filteredNotifications.length === 0"
        class="empty-state"
      >
        <h3>No notifications found.</h3>

        <p>
          {{
            activeFilter === 'Unread'
              ? 'You have no unread notifications.'
              : activeFilter === 'Read'
                ? 'You have no read notifications.'
                : 'New notifications will appear here.'
          }}
        </p>
      </div>

    </div>

    <!-- FOOTER -->
    <div class="notifications-footer">
      Showing {{ filteredNotifications.length }} notification(s)
    </div>

  </section>
</template>

<script setup>
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount
} from 'vue'

import { supabase } from '../lib/Supabase.js'

// =====================================================
// EMITS
// =====================================================

const emit = defineEmits(['navigate'])

// =====================================================
// OSA SERVICE IDS
// =====================================================

const OSA_SERVICE_IDS = [
  '5c2ab6fc-5f24-4573-896a-f5a11ad6625e',
  '65a94572-bce2-460f-b3e8-2ed568ee7bbf',
  'e5121b34-a6d2-4370-a023-5153a73c97f8'
]

// =====================================================
// STATE
// =====================================================

const notifications = ref([])

const loading = ref(true)
const markingAll = ref(false)
const openingId = ref(null)

const errorMessage = ref('')
const currentUserId = ref(null)

const activeFilter = ref('All')
const syncingRequests = ref(false)
const syncingAppointments = ref(false)

const filters = ['All', 'Unread', 'Read']

let notificationChannel = null
let requestChannel = null
let appointmentChannel = null

// =====================================================
// COMPUTED
// =====================================================

const unreadCount = computed(() => {
  return notifications.value.filter(
    notification => !notification.is_read
  ).length
})

const filteredNotifications = computed(() => {
  if (activeFilter.value === 'Unread') {
    return notifications.value.filter(
      notification => !notification.is_read
    )
  }

  if (activeFilter.value === 'Read') {
    return notifications.value.filter(
      notification => notification.is_read
    )
  }

  return notifications.value
})

// =====================================================
// FETCH NOTIFICATION RECORDS
// =====================================================

async function loadNotificationRecords(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select(`
      id,
      recipient_id,
      title,
      message,
      category,
      related_id,
      is_read,
      created_at
    `)
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error

  notifications.value = data || []
}

// =====================================================
// CREATE MISSING APPOINTMENT NOTIFICATIONS
// =====================================================

async function syncAppointmentNotifications(userId) {
  if (syncingAppointments.value) return

  syncingAppointments.value = true

  try {
    // Fetch all pending OSA appointments.
    const { data: appointments, error: appointmentError } =
      await supabase
        .from('appointments')
        .select(`
          id,
          student_id,
          service_id,
          scheduled_at,
          status,
          student:profiles!appointments_student_id_fkey (
            full_name
          ),
          service:office_services!appointments_service_id_fkey (
            name
          )
        `)
        .in('service_id', OSA_SERVICE_IDS)
        .eq('status', 'pending')

    if (appointmentError) throw appointmentError

    if (!appointments || appointments.length === 0) return

    const appointmentIds = appointments.map(
      appointment => appointment.id
    )

    // Find existing appointment notifications.
    const { data: existingNotifications, error: existingError } =
      await supabase
        .from('notifications')
        .select('id, related_id')
        .eq('recipient_id', userId)
        .eq('category', 'appointment')
        .in('related_id', appointmentIds)

    if (existingError) throw existingError

    const existingIds = new Set(
      (existingNotifications || []).map(
        notification => notification.related_id
      )
    )

    // Identify appointments without notifications.
    const missingNotifications = appointments
      .filter(
        appointment => !existingIds.has(appointment.id)
      )
      .map(appointment => {
        const studentName =
          appointment.student?.full_name || 'A student'

        const serviceName =
          appointment.service?.name || 'OSA Appointment'

        const appointmentDate = appointment.scheduled_at
          ? new Date(appointment.scheduled_at).toLocaleString(
              'en-PH',
              {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: 'Asia/Manila'
              }
            )
          : 'Date not available'

        return {
          recipient_id: userId,
          title: 'New Appointment Received',
          message:
            `${studentName} submitted a new appointment for ` +
            `${serviceName}. Appointment schedule: ${appointmentDate}.`,
          category: 'appointment',
          related_id: appointment.id,
          is_read: false
        }
      })

    if (missingNotifications.length === 0) {
      console.log(
        'OSA appointment notifications are already synchronized.'
      )
      return
    }

    // Insert missing appointment notifications.
    const { data: inserted, error: insertError } =
      await supabase
        .from('notifications')
        .insert(missingNotifications)
        .select()

    if (insertError) throw insertError

    console.log(
      'MISSING APPOINTMENT NOTIFICATIONS CREATED:',
      inserted
    )

  } catch (error) {
    console.error(
      'SYNC APPOINTMENT NOTIFICATIONS ERROR:',
      error
    )

    throw error

  } finally {
    syncingAppointments.value = false
  }
}

// =====================================================
// CREATE MISSING REQUEST NOTIFICATIONS
// =====================================================

async function syncRequestNotifications(userId) {
  if (syncingRequests.value) return

  syncingRequests.value = true

  try {
    const { data: requests, error: requestError } =
      await supabase
        .from('service_requests')
        .select(`
          id,
          student_id,
          service_id,
          request_type,
          title,
          details,
          status,
          submitted_at
        `)
        .in('service_id', OSA_SERVICE_IDS)
        .order('submitted_at', { ascending: false })

    if (requestError) throw requestError

    if (!requests || requests.length === 0) return

    const requestIds = requests.map(
      request => request.id
    )

    const { data: existingNotifications, error: existingError } =
      await supabase
        .from('notifications')
        .select('id, related_id')
        .eq('recipient_id', userId)
        .eq('category', 'request')
        .in('related_id', requestIds)

    if (existingError) throw existingError

    const existingIds = new Set(
      (existingNotifications || []).map(
        notification => notification.related_id
      )
    )

    const missingNotifications = requests
      .filter(request => !existingIds.has(request.id))
      .map(request => ({
        recipient_id: userId,
        title: 'New OSA Service Request',
        message:
          `${request.request_type || request.title || 'A new service request'} ` +
          `has been submitted. ${request.details || ''}`.trim(),
        category: 'request',
        related_id: request.id,
        is_read: false
      }))

    if (missingNotifications.length === 0) {
      console.log(
        'OSA request notifications are already synchronized.'
      )
      return
    }

    const { data: inserted, error: insertError } =
      await supabase
        .from('notifications')
        .insert(missingNotifications)
        .select()

    if (insertError) throw insertError

    console.log(
      'NEW OSA REQUEST NOTIFICATIONS CREATED:',
      inserted
    )

  } catch (error) {
    console.error(
      'SYNC REQUEST NOTIFICATIONS ERROR:',
      error
    )

    throw error

  } finally {
    syncingRequests.value = false
  }
}

// =====================================================
// FETCH AND SYNCHRONIZE ALL NOTIFICATIONS
// =====================================================

async function fetchNotifications() {
  loading.value = true
  errorMessage.value = ''

  try {
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError) throw authError

    if (!user) {
      notifications.value = []
      currentUserId.value = null

      errorMessage.value =
        'Please log in to view notifications.'

      return
    }

    currentUserId.value = user.id

    // First load existing notifications.
    await loadNotificationRecords(user.id)

    // Synchronize missing appointment notifications.
    await syncAppointmentNotifications(user.id)

    // Synchronize missing request notifications.
    await syncRequestNotifications(user.id)

    // Reload to display newly inserted notifications.
    await loadNotificationRecords(user.id)

  } catch (error) {
    console.error(
      'FETCH NOTIFICATIONS ERROR:',
      error
    )

    errorMessage.value =
      error.message || 'Unable to load notifications.'

  } finally {
    loading.value = false
  }
}

// =====================================================
// MARK ONE NOTIFICATION AS READ
// =====================================================

async function markAsRead(notification) {
  if (notification.is_read) return true

  if (!currentUserId.value) return false

  try {
    const { error } = await supabase
      .from('notifications')
      .update({
        is_read: true
      })
      .eq('id', notification.id)
      .eq('recipient_id', currentUserId.value)

    if (error) throw error

    notification.is_read = true

    return true

  } catch (error) {
    console.error(
      'MARK NOTIFICATION AS READ ERROR:',
      error
    )

    errorMessage.value =
      error.message || 'Unable to update notification.'

    return false
  }
}

// =====================================================
// MARK ALL NOTIFICATIONS AS READ
// =====================================================

async function markAllAsRead() {
  if (!currentUserId.value || unreadCount.value === 0) {
    return
  }

  markingAll.value = true
  errorMessage.value = ''

  try {
    const { error } = await supabase
      .from('notifications')
      .update({
        is_read: true
      })
      .eq('recipient_id', currentUserId.value)
      .eq('is_read', false)

    if (error) throw error

    notifications.value = notifications.value.map(
      notification => ({
        ...notification,
        is_read: true
      })
    )

  } catch (error) {
    console.error(
      'MARK ALL NOTIFICATIONS ERROR:',
      error
    )

    errorMessage.value =
      error.message || 'Unable to mark all notifications as read.'

  } finally {
    markingAll.value = false
  }
}

// =====================================================
// DETERMINE TARGET PAGE
// =====================================================

function getTargetPage(category) {
  const value = String(category || '').toLowerCase()

  if (value.includes('appointment')) {
    return 'Appointments'
  }

  if (value.includes('student')) {
    return 'Students'
  }

  if (
    value.includes('history') ||
    value.includes('transaction')
  ) {
    return 'History'
  }

  return 'Request'
}

// =====================================================
// OPEN NOTIFICATION
// =====================================================

async function openNotification(notification) {
  if (openingId.value) return

  openingId.value = notification.id

  const successfullyMarked = await markAsRead(notification)

  if (!successfullyMarked && !notification.is_read) {
    openingId.value = null
    return
  }

  const targetPage = getTargetPage(notification.category)

  emit('navigate', targetPage)

  openingId.value = null
}

// =====================================================
// FORMAT DATE
// =====================================================

function formatDate(dateValue) {
  if (!dateValue) return 'Date unavailable'

  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable'
  }

  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila'
  })
}

// =====================================================
// NOTIFICATION REALTIME
// =====================================================

function subscribeToNotifications() {
  if (!currentUserId.value) return

  if (notificationChannel) {
    supabase.removeChannel(notificationChannel)
    notificationChannel = null
  }

  notificationChannel = supabase
    .channel(`osa-notifications-${currentUserId.value}`)

    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${currentUserId.value}`
      },
      async () => {
        console.log(
          'OSA NOTIFICATION DATABASE CHANGE DETECTED.'
        )

        await fetchNotifications()
      }
    )

    .subscribe(status => {
      console.log(
        'NOTIFICATIONS REALTIME STATUS:',
        status
      )
    })
}

// =====================================================
// SERVICE REQUEST REALTIME
// =====================================================

function subscribeToRequests() {
  if (requestChannel) {
    supabase.removeChannel(requestChannel)
    requestChannel = null
  }

  requestChannel = supabase
    .channel('osa-notification-service-requests')

    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'service_requests'
      },
      async payload => {
        const newRequest = payload.new

        if (!OSA_SERVICE_IDS.includes(newRequest.service_id)) {
          return
        }

        console.log(
          'NEW OSA REQUEST DETECTED:',
          newRequest
        )

        await fetchNotifications()
      }
    )

    .subscribe(status => {
      console.log(
        'OSA REQUEST NOTIFICATION REALTIME STATUS:',
        status
      )
    })
}

// =====================================================
// APPOINTMENT REALTIME FALLBACK
// =====================================================

function subscribeToAppointments() {
  if (appointmentChannel) {
    supabase.removeChannel(appointmentChannel)
    appointmentChannel = null
  }

  appointmentChannel = supabase
    .channel('osa-notification-appointment-fallback')

    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'appointments'
      },
      async payload => {
        const appointment = payload.new

        if (!OSA_SERVICE_IDS.includes(appointment.service_id)) {
          return
        }

        console.log(
          'NEW APPOINTMENT DETECTED IN NOTIFICATIONS:',
          appointment
        )

        // App.vue creates the notification.
        // Here we only reload the notification records.
        await fetchNotifications()
      }
    )

    .subscribe(status => {
      console.log(
        'APPOINTMENT NOTIFICATION REALTIME STATUS:',
        status
      )
    })
}

// =====================================================
// INITIALIZATION
// =====================================================

onMounted(async () => {
  await fetchNotifications()

  if (currentUserId.value) {
    subscribeToNotifications()
    subscribeToRequests()
    subscribeToAppointments()
  }
})

// =====================================================
// CLEANUP
// =====================================================

onBeforeUnmount(() => {
  if (notificationChannel) {
    supabase.removeChannel(notificationChannel)
    notificationChannel = null
  }

  if (requestChannel) {
    supabase.removeChannel(requestChannel)
    requestChannel = null
  }

  if (appointmentChannel) {
    supabase.removeChannel(appointmentChannel)
    appointmentChannel = null
  }
})
</script>

<style scoped>
.notifications-page {
  min-height: 100%;
  padding: 24px 22px;
  box-sizing: border-box;
  background: #efdfdf;
  color: #350609;
  font-family: Georgia, "Times New Roman", serif;
}

.page-heading {
  margin-bottom: 26px;
}

.page-heading h1 {
  margin: 0 0 5px;
  color: #5b090f;
  font-size: 22px;
  font-weight: 700;
}

.page-heading p {
  margin: 0;
  color: #927a7b;
  font-family: Arial, sans-serif;
  font-size: 12px;
}

.notification-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.filter-button {
  padding: 7px 13px;
  border: 1px solid #d5b2b5;
  border-radius: 20px;
  background: #f8eeee;
  color: #79575a;
  font-family: Arial, sans-serif;
  font-size: 11px;
  cursor: pointer;
}

.filter-button.active {
  border-color: #59080e;
  background: #59080e;
  color: #fff;
}

.mark-all-button {
  padding: 7px 0;
  border: none;
  background: transparent;
  color: #59080e;
  font-family: Arial, sans-serif;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.mark-all-button:hover {
  text-decoration: underline;
}

.mark-all-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
}

.notification-card {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 73px;
  padding: 12px 16px;
  border: 1px solid #e2c4c6;
  border-radius: 15px;
  background: #f8eeee;
  box-sizing: border-box;
  transition: background 0.2s ease;
}

.notification-card:hover {
  background: #f5e7e7;
}

.notification-card.unread {
  border-left: 3px solid #59080e;
}

.notification-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #350609;
}

.notification-dot.read {
  background: #c9aeb0;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 5px;
}

.notification-content h3 {
  margin: 0;
  color: #350609;
  font-family: Arial, sans-serif;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
}

.unread-label {
  padding: 3px 6px;
  border-radius: 4px;
  background: #ead4d5;
  color: #59080e;
  font-family: Arial, sans-serif;
  font-size: 8px;
  font-weight: 700;
}

.notification-content p {
  margin: 0 0 5px;
  color: #927a7b;
  font-family: Arial, sans-serif;
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.notification-date {
  color: #a18b8c;
  font-family: Arial, sans-serif;
  font-size: 10px;
}

.open-button {
  flex-shrink: 0;
  padding: 8px 4px 8px 12px;
  border: none;
  background: transparent;
  color: #59080e;
  font-family: Arial, sans-serif;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.open-button:hover {
  text-decoration: underline;
}

.open-button:disabled {
  opacity: 0.5;
  cursor: wait;
}

.state-message,
.empty-state {
  padding: 35px 15px;
  border: 1px solid #e2c4c6;
  border-radius: 12px;
  background: #f8eeee;
  color: #927a7b;
  font-family: Arial, sans-serif;
  font-size: 12px;
  text-align: center;
}

.empty-state h3 {
  margin: 0 0 7px;
  color: #59080e;
  font-size: 14px;
}

.empty-state p {
  margin: 0;
}

.error-message {
  padding: 18px;
  border: 1px solid #d7a5a5;
  border-radius: 10px;
  background: #f8eeee;
  color: #8a2828;
  font-family: Arial, sans-serif;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.error-message button {
  display: block;
  margin-top: 10px;
  padding: 7px 12px;
  border: none;
  border-radius: 5px;
  background: #59080e;
  color: white;
  cursor: pointer;
}

.notifications-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  color: #927a7b;
  font-family: Arial, sans-serif;
  font-size: 12px;
}

@media (max-width: 600px) {
  .notifications-page {
    padding: 22px 15px;
  }

  .page-heading h1 {
    font-size: 19px;
  }

  .notification-toolbar {
    align-items: flex-start;
  }

  .notification-card {
    padding: 12px 10px;
  }

  .notification-content h3 {
    font-size: 12px;
  }
}
</style>
