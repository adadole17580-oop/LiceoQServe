
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { supabase } from '../lib/Supabase.js'

const LIBRARY_SERVICE_IDS = [
  '11153e05-a183-48cd-83b0-12e46d921915',
  '2e171fa5-701e-4e91-9d3a-a99214dfce59',
  '987d7769-8a02-44a1-9b95-cdfec559a70e',
  '99a740ad-96d7-43a5-9bcc-3f9723cabd28',
  'be4db8a9-3ac2-41ae-ba72-5e96a3034512',
  'faa4239d-cae7-4fe7-af69-3f25bec2fe44'
]

const appointments = ref([])
const loading = ref(false)
const errorMessage = ref('')

let realtimeChannel = null
let refreshTimeout = null

// GET TODAY'S DATE IN PHILIPPINE TIME
function getTodayDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}

// FORMAT TIME
function formatTime(value) {
  if (!value) return 'Not available'

  return new Date(value).toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit'
  })
}

// FORMAT STATUS
function formatStatus(value) {
  const statuses = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
    no_show: 'No-show',
    reschedule_requested: 'Reschedule Requested'
  }

  return statuses[String(value || '').toLowerCase()] || value || 'Pending'
}

// FETCH TODAY'S APPOINTMENTS
async function fetchTodayAppointments() {
  if (loading.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    const { data: records, error } = await supabase
      .from('appointments')
      .select(`
        id,
        student_id,
        service_id,
        scheduled_at,
        status,
        purpose
      `)
      .in('service_id', LIBRARY_SERVICE_IDS)
      .order('scheduled_at', { ascending: true })

    if (error) throw error

    const today = getTodayDate()

    // FILTER APPOINTMENTS SCHEDULED TODAY
    const todayRecords = (records || []).filter(item => {
      if (!item.scheduled_at) return false

      const appointmentDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date(item.scheduled_at))

      return appointmentDate === today
    })

    // GET STUDENT IDS
    const studentIds = [
      ...new Set(
        todayRecords
          .map(item => item.student_id)
          .filter(Boolean)
      )
    ]

    let profiles = []

    // FETCH STUDENT PROFILES
    if (studentIds.length > 0) {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', studentIds)

      if (profileError) throw profileError

      profiles = data || []
    }

    const profileMap = new Map(
      profiles.map(profile => [
        profile.id,
        profile.full_name
      ])
    )

    // DISPLAY APPOINTMENTS
    appointments.value = todayRecords.map(item => ({
      id: item.id,
      name: profileMap.get(item.student_id) || 'Student',
      activity: item.purpose || 'Library Appointment',
      time: formatTime(item.scheduled_at),
      status: formatStatus(item.status)
    }))

  } catch (error) {
    console.error('Today appointments error:', error)
    errorMessage.value = error.message || 'Unable to load appointments.'
  } finally {
    loading.value = false
  }
}

// REALTIME REFRESH
function scheduleRefresh() {
  clearTimeout(refreshTimeout)

  refreshTimeout = setTimeout(() => {
    fetchTodayAppointments()
  }, 500)
}

// SUBSCRIBE TO APPOINTMENT CHANGES
function subscribeToAppointments() {
  realtimeChannel = supabase
    .channel('library-today-appointments')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'appointments'
      },
      scheduleRefresh
    )
    .subscribe()
}

// COMPONENT MOUNT
onMounted(async () => {
  await fetchTodayAppointments()
  subscribeToAppointments()
})

// COMPONENT UNMOUNT
onUnmounted(() => {
  clearTimeout(refreshTimeout)

  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
})
</script>

<template>
  <section class="activity-card">
    <div class="card-heading">
      <h2>Today's Appointment</h2>

      <button
        type="button"
        class="refresh-button"
        @click="fetchTodayAppointments"
        :disabled="loading"
      >
        {{ loading ? 'Loading...' : 'Refresh' }}
      </button>
    </div>

    <p
      v-if="loading && appointments.length === 0"
      class="empty-message"
    >
      Loading appointments...
    </p>

    <p
      v-else-if="errorMessage"
      class="error-message"
    >
      {{ errorMessage }}
    </p>

    <div
      v-else-if="appointments.length > 0"
      class="appointment-list"
    >
      <div
        v-for="appointment in appointments"
        :key="appointment.id"
        class="appointment-row"
      >
        <strong class="appointment-time">
          {{ appointment.time }}
        </strong>

        <div class="details">
          <strong>{{ appointment.name }}</strong>
          <span>{{ appointment.activity }}</span>
        </div>

        <span
          class="status"
          :class="appointment.status.toLowerCase().replace(/\s+/g, '-')"
        >
          {{ appointment.status }}
        </span>
      </div>
    </div>

    <p v-else class="empty-message">
      No appointments scheduled for today.
    </p>
  </section>
</template>

<style scoped>
.activity-card {
  min-width: 0;
  min-height: 184px;
  padding: 10px 12px;
  border: 1px solid #8a4143;
  border-radius: 24px;
  color: #390607;
}

.card-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

h2 {
  margin: 0;
  font: bold 24px Georgia, serif;
}

.refresh-button {
  border: 1px solid #95686a;
  border-radius: 6px;
  padding: 6px 10px;
  background: transparent;
  color: #650b18;
  font-size: 11px;
  cursor: pointer;
}

.refresh-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.appointment-list {
  display: grid;
  gap: 12px;
}

.appointment-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0 14px;
  border-bottom: 1px solid #e4caca;
  font-size: 12px;
}

.appointment-time {
  min-width: 75px;
}

.details {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.details strong {
  font-size: 14px;
}

.details span {
  color: #795b5d;
  overflow-wrap: anywhere;
}

.status {
  padding: 5px 10px;
  border-radius: 20px;
  background: #f5e6a1;
  color: #694d00;
  font-size: 10px;
  white-space: nowrap;
}

.status.confirmed,
.status.completed {
  background: #b9e0c6;
  color: #315f42;
}

.status.cancelled,
.status.rejected,
.status.no-show {
  background: #f2cccc;
  color: #9a0000;
}

.empty-message,
.error-message {
  padding: 18px 0;
  font-size: 12px;
  text-align: center;
}

.empty-message {
  color: #795b5d;
}

.error-message {
  color: #b00020;
}

@media (max-width: 480px) {
  .appointment-row {
    flex-wrap: wrap;
  }
}
</style>
