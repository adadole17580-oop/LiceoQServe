<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../composables/useAuth.js'
import '../assets/styles/home.css'

const router = useRouter()
const { studentName } = useAuth()

const currentDate = computed(() => {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
})

const activeQueueTicket = ref(null)
const upcomingAppointmentsCount = ref(0)
const activeRequestsCount = ref(0)
const nextAppointments = ref([])

async function loadDashboardData() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    const userId = session.user.id

    try {
      const queueResponse = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/queue/active`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      )
      if (!queueResponse.ok) throw new Error('Could not load the active queue ticket.')
      const { activeTickets = [] } = await queueResponse.json()
      activeQueueTicket.value = activeTickets[0] || null
    } catch (error) {
      console.error('Error loading active queue ticket:', error)
    }

    const { data: appointments, count: aptCount } = await supabase
      .from('appointments')
      .select('id, scheduled_at, purpose, status, office_services(name, offices(name))', { count: 'exact' })
      .eq('student_id', userId)
      .in('status', ['pending', 'confirmed', 'reschedule_requested', 'Pending', 'Confirmed'])
      .order('scheduled_at', { ascending: true })

    upcomingAppointmentsCount.value = aptCount || 0
    if (appointments) {
      nextAppointments.value = appointments.slice(0, 2).map((a) => ({
        id: a.id,
        office: a.office_services?.offices?.name?.toUpperCase() || 'OFFICE',
        status: String(a.status || '').toLowerCase().replace(/[\s-]+/g, '_'),
        title: a.office_services?.name || a.purpose,
        date: new Date(a.scheduled_at).toLocaleString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      }))
    }

    const { count: reqCount } = await supabase
      .from('service_requests')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', userId)
      .in('status', ['pending', 'processing', 'ready_for_pickup', 'Submitted', 'Processing', 'Ready for Pickup'])

    activeRequestsCount.value = reqCount || 0
  } catch (err) {
    console.error('Error loading dashboard data:', err)
  }
}

onMounted(() => {
  loadDashboardData()
})
</script>

<template>
  <div class="home-view">
    <section class="greeting">
      <p>{{ currentDate }}</p>
      <h2>Good Day, {{ studentName }}</h2>
      <p>
        Monitor your campus transactions and know exactly what to do next.
      </p>
    </section>

    <section class="summary">
      <article style="cursor: pointer;" @click="router.push('/student/queue')">
        <p>ACTIVE QUEUE</p>
        <h2>{{ activeQueueTicket ? activeQueueTicket.queue_number : 'None' }}</h2>
        <span>{{ activeQueueTicket ? (activeQueueTicket.office_services?.offices?.name || 'In Queue') : 'No active ticket' }}</span>
      </article>

      <article style="cursor: pointer;" @click="router.push('/student/appointments')">
        <p>UPCOMING</p>
        <h2>{{ upcomingAppointmentsCount }}</h2>
        <span>Appointments</span>
      </article>

      <article style="cursor: pointer;" @click="router.push('/student/requests')">
        <p>ACTIVE REQUESTS</p>
        <h2>{{ activeRequestsCount }}</h2>
        <span>Across campus offices</span>
      </article>
    </section>

    <section class="appointments">
      <div class="section-heading">
        <h2>Next Appointments</h2>
        <button type="button" @click="router.push('/student/appointments')">
          View All
        </button>
      </div>

      <div v-if="nextAppointments.length > 0" class="appointment-grid">
        <article
          v-for="appointment in nextAppointments"
          :key="appointment.id"
          class="appointment"
        >
          <div class="appointment-top">
            <span>{{ appointment.office }}</span>

            <span
              class="status"
              :class="appointment.status.toLowerCase()"
            >
              {{ appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1).replace(/_/g, ' ') }}
            </span>
          </div>

          <h3>{{ appointment.title }}</h3>
          <p>{{ appointment.date }}</p>
        </article>
      </div>

      <div v-else style="padding: 24px; background: #fff; border-radius: 8px; border: 1px solid #ebdada; color: #7a5052;">
        No upcoming appointments scheduled.
      </div>
    </section>
  </div>
</template>
