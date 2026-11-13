
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

const excludedStatuses = [
  'cancelled',
  'rejected',
  'completed',
  'no_show'
]

// FORMAT DATE
function formatDate(value) {
  if (!value) return 'Date unavailable'

  return new Date(value).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
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

// FETCH UPCOMING APPOINTMENTS
async function fetchUpcomingAppointments() {
  if (loading.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    const now = new Date().toISOString()

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
      .gte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })

    if (error) throw error

    // EXCLUDE CANCELLED, REJECTED, COMPLETED AND NO-SHOW
    const upcomingRecords = (records || []).filter(item => {
      const status = String(item.status || '').toLowerCase()
      return !excludedStatuses.includes(status)
    })

    // GET STUDENT IDS
    const studentIds = [
      ...new Set(
        upcomingRecords
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

    // DISPLAY UPCOMING APPOINTMENTS
    appointments.value = upcomingRecords.map(item => ({
      id: item.id,
      name: profileMap.get(item.student_id) || 'Unknown Student',
      activity: item.purpose || 'Library Appointment',
      date: formatDate(item.scheduled_at),
      time: formatTime(item.scheduled_at),
      status: formatStatus(item.status)
    }))

  } catch (error) {
    console.error('Upcoming appointments error:', error)
    errorMessage.value = error.message || 'Unable to load appointments.'
  } finally {
    loading.value = false
  }
}

// REALTIME REFRESH
function scheduleRefresh() {
  clearTimeout(refreshTimeout)

  refreshTimeout = setTimeout(() => {
    fetchUpcomingAppointments()
  }, 500)
}

// SUBSCRIBE TO APPOINTMENT CHANGES
function subscribeToAppointments() {
  realtimeChannel = supabase
    .channel('library-upcoming-appointments')
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
  await fetchUpcomingAppointments()
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
      <div>
        <h2>Upcoming Appointments</h2>
        <p class="subtitle">
          View scheduled Library appointments.
        </p>
      </div>

      <button
        type="button"
        class="refresh-button"
        @click="fetchUpcomingAppointments"
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
        <div class="date-time">
          <strong class="appointment-date">
            {{ appointment.date }}
          </strong>

          <span class="appointment-time">
            {{ appointment.time }}
          </span>
        </div>

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
      No upcoming appointments found.
    </p>

  </section>
</template>

<style scoped>
.activity-card {
  width: 100%;
  min-width: 0;
  min-height: 184px;
  padding: 12px;
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

.subtitle {
  margin: 5px 0 0;
  color: #795b5d;
  font-size: 11px;
}

.refresh-button {
  flex-shrink: 0;
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
  gap: 12px;
  padding: 10px 0 14px;
  border-bottom: 1px solid #e4caca;
  font-size: 12px;
}

.date-time {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 105px;
}

.appointment-date {
  color: #650b18;
}

.appointment-time {
  color: #795b5d;
  font-size: 11px;
}

.details {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.details strong {
  font-size: 13px;
}

.details span {
  color: #795b5d;
  overflow-wrap: anywhere;
}

.status {
  flex-shrink: 0;
  padding: 5px 10px;
  border-radius: 20px;
  background: #f5e6a1;
  color: #694d00;
  font-size: 10px;
  white-space: nowrap;
}

.status.confirmed {
  background: #b9e0c6;
  color: #315f42;
}

.status.reschedule-requested {
  background: #dce4fa;
  color: #354d85;
}

.empty-message,
.error-message {
  padding: 25px 0;
  font-size: 12px;
  text-align: center;
}

.empty-message {
  color: #795b5d;
}

.error-message {
  color: #b00020;
  overflow-wrap: anywhere;
}

@media (max-width: 600px) {
  .card-heading {
    align-items: flex-start;
  }

  h2 {
    font-size: 20px;
  }

  .appointment-row {
    flex-wrap: wrap;
  }

  .date-time {
    min-width: 90px;
  }
}
</style>
