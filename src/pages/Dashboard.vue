
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import StatCard from '../components/StatCard.vue'
import { supabase } from '../lib/Supabase.js'

const emit = defineEmits(['navigate'])

const OSA_SERVICE_IDS = [
  '5c2ab6fc-5f24-4573-896a-f5a11ad6625e',
  '65a94572-bce2-460f-b3e8-2ed568ee7bbf',
  'e5121b34-a6d2-4370-a023-5153a73c97f8'
]

const todayAppointments = ref(0)
const pendingRequests = ref(0)
const readyForPickup = ref(0)

const appointments = ref([])

const loading = ref(true)
const errorMessage = ref('')
const currentDate = ref('')

let dashboardSubscription = null
let isFetching = false
let refreshAgain = false
let isMounted = false

const stats = computed(() => [
  {
    title: "TODAY'S APPOINTMENTS",
    count: todayAppointments.value,
    subtitle: 'View Details'
  },
  {
    title: 'PENDING REQUEST',
    count: pendingRequests.value,
    subtitle: 'View Details'
  },
  {
    title: 'READY FOR PICK UP',
    count: readyForPickup.value,
    subtitle: 'View Details'
  }
])

function handleCardClick(index) {
  if (index === 0) {
    emit('navigate', 'Appointments')
  } else if (index === 1) {
    emit('navigate', 'Request', 'Pending')
  } else if (index === 2) {
    emit('navigate', 'Appointments')
  }
}

function updateCurrentDate() {
  currentDate.value = new Date().toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Manila'
  })
}

function formatAppointmentTime(date) {
  if (!date) return 'Time not available'

  return new Date(date).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila'
  })
}

function formatAppointmentDate(date) {
  if (!date) return 'Date not available'

  return new Date(date).toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila'
  })
}

function formatStatus(status) {
  if (!status) return 'Pending'

  return status
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function statusClass(status) {
  const normalized = (status || '').toLowerCase()

  if (normalized === 'processing') return 'processing'

  if (
    normalized === 'ready_for_pickup' ||
    normalized === 'claimed' ||
    normalized === 'completed'
  ) {
    return 'confirmed'
  }

  if (
    normalized === 'cancelled' ||
    normalized === 'rejected' ||
    normalized === 'no_show'
  ) {
    return 'rejected'
  }

  return 'pending'
}

async function fetchTodayAppointments() {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id,
      student_id,
      service_id,
      scheduled_at,
      created_at,
      status,
      purpose
    `)
    .in('service_id', OSA_SERVICE_IDS)
    .not(
      'status',
      'in',
      '("cancelled","completed","no_show","rejected")'
    )
    .order('created_at', { ascending: false })

  if (error) throw error

  const appointmentData = data || []

  const studentIds = [
    ...new Set(
      appointmentData
        .map(item => item.student_id)
        .filter(Boolean)
    )
  ]

  let profiles = []

  if (studentIds.length > 0) {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, student_id')
      .in('id', studentIds)

    if (profileError) throw profileError

    profiles = profileData || []
  }

  const profileMap = new Map(
    profiles.map(profile => [profile.id, profile])
  )

  appointments.value = appointmentData.map(item => {
    const profile = profileMap.get(item.student_id)

    return {
      ...item,
      studentName: profile?.full_name || 'Unknown Student',
      studentNumber: profile?.student_id || 'Not available'
    }
  })

  todayAppointments.value = appointments.value.length

  console.log('OSA APPOINTMENTS:', appointments.value)
}

async function fetchPendingRequests() {
  const { count, error } = await supabase
    .from('service_requests')
    .select('*', {
      count: 'exact',
      head: true
    })
    .in('service_id', OSA_SERVICE_IDS)
    .eq('status', 'pending')

  if (error) throw error

  pendingRequests.value = count ?? 0
}

async function fetchReadyForPickup() {
  const { count, error } = await supabase
    .from('appointments')
    .select('*', {
      count: 'exact',
      head: true
    })
    .in('service_id', OSA_SERVICE_IDS)
    .eq('status', 'ready_for_pickup')

  if (error) throw error

  readyForPickup.value = count ?? 0

  console.log('READY FOR PICK UP APPOINTMENTS:', readyForPickup.value)
}

async function fetchDashboardData() {
  if (!isMounted) return

  if (isFetching) {
    refreshAgain = true
    return
  }

  isFetching = true

  try {
    do {
      refreshAgain = false

      try {
        await Promise.all([
          fetchTodayAppointments(),
          fetchPendingRequests(),
          fetchReadyForPickup()
        ])

        errorMessage.value = ''

        console.log('OSA DASHBOARD COUNTS:', {
          todayAppointments: todayAppointments.value,
          pendingRequests: pendingRequests.value,
          readyForPickup: readyForPickup.value
        })

      } catch (error) {
        console.error('Dashboard fetch error:', error)

        errorMessage.value =
          error.message || 'Unable to load dashboard data.'
      }

    } while (refreshAgain && isMounted)

  } finally {
    isFetching = false
    loading.value = false

    if (refreshAgain && isMounted) {
      fetchDashboardData()
    }
  }
}

function subscribeToDashboardChanges() {
  dashboardSubscription = supabase
    .channel('osa-dashboard-realtime')

    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'appointments'
      },
      (payload) => {
        console.log(
          'APPOINTMENT DATABASE CHANGE:',
          payload.eventType
        )

        fetchDashboardData()
      }
    )

    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'service_requests'
      },
      (payload) => {
        console.log(
          'SERVICE REQUEST DATABASE CHANGE:',
          payload.eventType
        )

        fetchDashboardData()
      }
    )

    .subscribe((status, error) => {
      console.log('OSA REALTIME STATUS:', status)

      if (error) {
        console.error('Realtime subscription error:', error)
      }

      if (status === 'SUBSCRIBED') {
        fetchDashboardData()
      }
    })
}

onMounted(() => {
  isMounted = true

  updateCurrentDate()

  fetchDashboardData()

  subscribeToDashboardChanges()
})

onUnmounted(() => {
  isMounted = false

  if (dashboardSubscription) {
    supabase.removeChannel(dashboardSubscription)
    dashboardSubscription = null
  }
})
</script>

<template>
  <section class="page-container dashboard-page">

    <div class="welcome-banner">
      <span class="dashboard-date">
        {{ currentDate }}
      </span>

      <h2>Office of Student Affairs DASHBOARD</h2>

      <p>
        Review today's workload and continue the next transaction.
      </p>
    </div>

    <div class="stats-grid">
      <div
        v-for="(stat, index) in stats"
        :key="stat.title"
      >
        <StatCard
          v-bind="stat"
          @click="handleCardClick(index)"
        />
      </div>
    </div>

    <div class="dashboard-grid">
      <section class="panel dashboard-panel">

        <div class="dashboard-panel-header">
          <h3>TODAY'S APPOINTMENTS</h3>
        </div>

        <div
          v-if="loading"
          class="record-row"
        >
          <div class="record-info">
            <span>Loading appointments...</span>
          </div>
        </div>

        <div
          v-else-if="errorMessage"
          class="record-row"
        >
          <div class="record-info">
            <strong>Unable to load dashboard</strong>
            <span>{{ errorMessage }}</span>
          </div>
        </div>

        <div
          v-else-if="appointments.length === 0"
          class="record-row"
        >
          <div class="record-info">
            <strong>No appointments available</strong>
            <span>
              New OSA appointments will appear here.
            </span>
          </div>
        </div>

        <div
          v-else
          v-for="item in appointments"
          :key="item.id"
          class="record-row"
        >
          <div class="record-time">
            {{ formatAppointmentTime(item.scheduled_at) }}
          </div>

          <div class="record-info">
            <strong>{{ item.studentName }}</strong>

            <span>
              {{ item.purpose || 'Appointment' }}
            </span>

            <small>
              Student ID: {{ item.studentNumber }}
            </small>

            <small>
              Appointment Date:
              {{ formatAppointmentDate(item.scheduled_at) }}
            </small>
          </div>

          <span
            :class="[
              'status-badge',
              statusClass(item.status)
            ]"
          >
            {{ formatStatus(item.status) }}
          </span>
        </div>

      </section>
    </div>

  </section>
</template>
