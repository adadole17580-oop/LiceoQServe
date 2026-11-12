<template>
  <div class="dashboard-page">
    <div class="dashboard-content">
      <header class="dashboard-banner">
        <p class="banner-date">{{ currentDate }}</p>
        <h1>Cashier Dashboard</h1>
        <p class="banner-subtitle">
          Review today’s workload and continue the next transaction.
        </p>
      </header>

      <section class="stats-grid">
        <article class="stat-card">
          <div class="stat-info">
            <p>Students in Queue</p>
            <h2>{{ studentsInQueue }}</h2>
            <span>Waiting for assistance today</span>
          </div>
        </article>

        <article class="stat-card">
          <div class="stat-info">
            <p>Completed Queue</p>
            <h2>{{ completedQueue }}</h2>
            <span>Students served today</span>
          </div>
        </article>
      </section>

      <section class="dashboard-panels">
        <article class="panel queue-panel">
          <div class="panel-heading">
            <div>
              <h2>Current Queue</h2>
              <p>Students currently waiting at the Cashier office</p>
            </div>
            <span class="panel-count">{{ paymentQueue.length }}</span>
          </div>

          <div v-if="loadingQueue" class="empty-state">
            Loading payment queue...
          </div>

          <div v-else-if="paymentQueue.length === 0" class="empty-state">
            No students are currently waiting in the payment queue.
          </div>

          <div v-else class="queue-list">
            <div
              v-for="student in paymentQueue"
              :key="student.id"
              class="queue-item"
            >
              <div class="student-avatar">
                {{ getInitials(student.student_name) }}
              </div>

              <div class="student-details">
                <h3>{{ student.student_name || 'Unnamed Student' }}</h3>
                <p>
                  {{ student.student_number || 'No student number' }}
                  <span v-if="student.service_name"> · {{ student.service_name }}</span>
                </p>
              </div>

              <div class="queue-item-side">
                <strong>Q-{{ String(student.queue_number).padStart(3, '0') }}</strong>
                <span class="status-badge waiting">Waiting</span>
              </div>
            </div>
          </div>
        </article>

        <article class="panel transactions-panel">
          <div class="panel-heading">
            <div>
              <h2>Recent Queue Activity</h2>
              <p>Latest queue entries for today</p>
            </div>
            <span class="panel-count">{{ recentTransactions.length }}</span>
          </div>

          <div v-if="loadingTransactions" class="empty-state">
            Loading recent queue activity...
          </div>

          <div
            v-else-if="recentTransactions.length === 0"
            class="empty-state"
          >
            No queue activity found today.
          </div>

          <div v-else class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Queue No.</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                <tr
                  v-for="ticket in recentTransactions"
                  :key="ticket.id"
                >
                  <td>
                    <div class="table-student">
                      <span class="table-avatar">
                        {{ getInitials(ticket.student_name) }}
                      </span>
                      <span>{{ ticket.student_name || 'Unnamed Student' }}</span>
                    </div>
                  </td>

                  <td class="amount-cell">
                    Q-{{ String(ticket.queue_number).padStart(3, '0') }}
                  </td>

                  <td>
                    <span
                      class="status-badge"
                      :class="getStatusClass(ticket.status)"
                    >
                      {{ formatStatus(ticket.status) }}
                    </span>
                  </td>

                  <td class="date-cell">
                    {{ formatDate(ticket.created_at) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <p v-if="errorMessage" class="dashboard-error">
        {{ errorMessage }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { supabase } from '../supabase'

const paymentQueue = ref([])
const recentTransactions = ref([])
const loadingQueue = ref(true)
const loadingTransactions = ref(true)
const staffOfficeId = ref(null)
const errorMessage = ref('')
const currentDate = ref('')

let realtimeChannel = null

const studentsInQueue = computed(() => paymentQueue.value.length)

const completedQueue = computed(() =>
  recentTransactions.value.filter(
    (ticket) => String(ticket.status || '').toLowerCase() === 'finished',
  ).length,
)

function updateCurrentDate() {
  currentDate.value = new Intl.DateTimeFormat('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date()).toUpperCase()
}

function getTodayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

async function loadStaffOffice() {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!authData?.user) throw new Error('No authenticated staff account was found.')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('office_id, role, is_active')
    .eq('id', authData.user.id)
    .single()

  if (profileError) throw profileError

  if (profile.role !== 'staff' || !profile.is_active || !profile.office_id) {
    throw new Error('Your active Cashier staff profile could not be verified.')
  }

  staffOfficeId.value = profile.office_id
}

async function loadQueueData() {
  const { start, end } = getTodayRange()

  const { data, error } = await supabase
    .from('queues')
    .select(`
      id,
      queue_number,
      status,
      created_at,
      student:profiles!queues_student_id_fkey (
        full_name,
        student_id
      ),
      service:office_services!queues_service_id_fkey (
        name,
        office_id
      )
    `)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false })

  if (error) throw error

  const officeQueues = (data || [])
    .filter((ticket) => ticket.service?.office_id === staffOfficeId.value)
    .map((ticket) => ({
      id: ticket.id,
      queue_number: ticket.queue_number,
      status: ticket.status,
      created_at: ticket.created_at,
      student_name: ticket.student?.full_name || 'Unnamed Student',
      student_number: ticket.student?.student_id || '',
      service_name: ticket.service?.name || '',
    }))

  paymentQueue.value = officeQueues
    .filter((ticket) => String(ticket.status).toLowerCase() === 'waiting')
    .sort((a, b) => a.queue_number - b.queue_number)

  recentTransactions.value = officeQueues.slice(0, 10)
}

async function loadDashboard() {
  errorMessage.value = ''
  loadingQueue.value = true
  loadingTransactions.value = true

  try {
    if (!staffOfficeId.value) await loadStaffOffice()
    await loadQueueData()
  } catch (error) {
    console.error('Error loading cashier dashboard:', error)
    errorMessage.value =
      error.message || 'Unable to load dashboard data. Please try again.'
    paymentQueue.value = []
    recentTransactions.value = []
  } finally {
    loadingQueue.value = false
    loadingTransactions.value = false
  }
}

function getInitials(name) {
  if (!name) return '?'

  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function formatStatus(status) {
  const labels = {
    waiting: 'Waiting',
    being_served: 'Being Served',
    finished: 'Finished',
    skipped: 'Skipped',
    cancelled: 'Cancelled',
  }

  const normalized = String(status || '').toLowerCase()
  return labels[normalized] || status || 'Unknown'
}

function getStatusClass(status) {
  const normalized = String(status || '').toLowerCase()

  if (normalized === 'finished') return 'completed'
  if (normalized === 'waiting') return 'waiting'
  if (normalized === 'cancelled' || normalized === 'skipped') return 'cancelled'
  return 'processing'
}

function formatDate(date) {
  if (!date) return '—'

  const parsedDate = new Date(date)
  if (Number.isNaN(parsedDate.getTime())) return '—'

  return parsedDate.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

onMounted(async () => {
  updateCurrentDate()
  await loadDashboard()

  realtimeChannel = supabase
    .channel('cashier-dashboard-queue-updates')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'queues' },
      () => loadDashboard(),
    )
    .subscribe()
})

onUnmounted(() => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
})
</script>

<style scoped>
.dashboard-page {
  min-height: calc(100vh - 124px);
  padding: 43px 25px 42px;
  background: #e9dfdf;
  color: #321515;
}

.dashboard-content {
  width: 100%;
  max-width: 1500px;
  margin: 0 auto;
}

.dashboard-banner {
  min-height: 192px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: 0 0 26px;
  padding: 30px 55px;
  border-radius: 19px;
  background: #4b1111;
  color: #fff8f5;
}

.banner-date {
  margin: 0 0 12px;
  color: #c8b1b1;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 3px;
}

.dashboard-banner h1 {
  margin: 0;
  color: #fff8f5;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(32px, 4vw, 50px);
  font-weight: 700;
  line-height: 1.15;
}

.banner-subtitle {
  margin: 5px 0 0;
  color: #c9b2b2;
  font-size: 16px;
  font-weight: 600;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin: 0 10px 28px;
}

.stat-card {
  min-height: 145px;
  display: flex;
  align-items: center;
  padding: 25px 31px;
  border: 2px solid #bdb4b4;
  border-radius: 19px;
  background: #f6f0f0;
  box-shadow: 0 2px 2px rgb(54 22 22 / 15%);
}

.stat-info p {
  margin: 0 0 9px;
  color: #655858;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

.stat-info h2 {
  margin: 0;
  color: #4b1111;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 42px;
  line-height: 1.1;
}

.stat-info span {
  display: block;
  margin-top: 5px;
  color: #8f7e7e;
  font-size: 12px;
}

.dashboard-panels {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 22px;
  margin: 0 10px;
}

.panel {
  min-width: 0;
  padding: 23px 27px;
  border: 2px solid #bdb4b4;
  border-radius: 18px;
  background: #f6f0f0;
  box-shadow: 0 2px 2px rgb(54 22 22 / 13%);
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 18px;
}

.panel-heading h2 {
  margin: 0;
  color: #160b0b;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 25px;
  font-weight: 700;
}

.panel-heading p {
  margin: 4px 0 0;
  color: #927f7f;
  font-size: 12px;
}

.panel-count {
  min-width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  padding: 0 9px;
  border-radius: 20px;
  background: #eadada;
  color: #4b1111;
  font-size: 13px;
  font-weight: 700;
}

.empty-state {
  padding: 20px 0;
  color: #927f7f;
  font-size: 13px;
}

.queue-list {
  display: flex;
  flex-direction: column;
}

.queue-item {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 13px 0;
  border-bottom: 1px solid #cfc2c2;
}

.queue-item:last-child {
  border-bottom: 0;
}

.student-avatar,
.table-avatar {
  width: 39px;
  height: 39px;
  display: grid;
  place-items: center;
  flex: 0 0 39px;
  border-radius: 50%;
  background: #eadada;
  color: #4b1111;
  font-size: 12px;
  font-weight: 700;
}

.student-details {
  min-width: 0;
  flex: 1;
}

.student-details h3 {
  margin: 0 0 3px;
  color: #3d2020;
  font-size: 14px;
  font-weight: 700;
}

.student-details p {
  margin: 0;
  color: #927f7f;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.queue-item-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}

.queue-item-side strong {
  color: #5a3333;
  font-size: 12px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 5px 9px;
  border-radius: 20px;
  background: #eee1d0;
  color: #87652e;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.status-badge.completed {
  background: #dce9dd;
  color: #47714e;
}

.status-badge.cancelled {
  background: #f1dddd;
  color: #9a4545;
}

.status-badge.processing {
  background: #e4e0ed;
  color: #65558a;
}

.table-wrapper {
  width: 100%;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

th {
  padding: 12px 10px;
  border-bottom: 1px solid #cfc2c2;
  color: #786666;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  white-space: nowrap;
}

td {
  padding: 13px 10px;
  border-bottom: 1px solid #e0d6d6;
  color: #513939;
  font-size: 12px;
  white-space: nowrap;
}

tbody tr:last-child td {
  border-bottom: 0;
}

.table-student {
  display: flex;
  align-items: center;
  gap: 9px;
}

.table-avatar {
  width: 30px;
  height: 30px;
  flex-basis: 30px;
  font-size: 10px;
}

.amount-cell {
  color: #4b1111;
  font-weight: 700;
}

.date-cell {
  color: #927f7f;
}

.dashboard-error {
  margin: 18px 10px 0;
  padding: 12px 15px;
  border: 1px solid #e4bcbc;
  border-radius: 8px;
  background: #fff0f0;
  color: #8b3038;
  font-size: 13px;
}

@media (max-width: 950px) {
  .dashboard-page {
    padding: 28px 20px;
  }

  .dashboard-banner {
    min-height: 165px;
    padding: 28px 32px;
  }

  .stats-grid {
    gap: 12px;
    margin-right: 0;
    margin-left: 0;
  }

  .stat-card {
    padding: 20px;
  }

  .dashboard-panels {
    margin: 0;
  }
}

@media (max-width: 650px) {
  .dashboard-page {
    padding: 20px 13px 28px;
  }

  .dashboard-banner {
    min-height: 155px;
    padding: 24px 21px;
    border-radius: 14px;
  }

  .banner-date {
    font-size: 11px;
    letter-spacing: 2px;
  }

  .dashboard-banner h1 {
    font-size: 31px;
  }

  .banner-subtitle {
    font-size: 12px;
    line-height: 1.5;
  }

  .stats-grid {
    grid-template-columns: 1fr;
    margin-bottom: 20px;
  }

  .stat-card {
    min-height: 105px;
    padding: 17px 20px;
  }

  .stat-info h2 {
    font-size: 34px;
  }

  .panel {
    padding: 18px 15px;
  }

  .panel-heading h2 {
    font-size: 21px;
  }

  .queue-item {
    gap: 9px;
  }

  .student-details h3 {
    font-size: 12px;
  }

  .student-details p {
    font-size: 10px;
  }
}

.dashboard-page {
  min-height: calc(100vh - 88px);
  padding: 28px 25px 30px;
}

.dashboard-banner {
  min-height: 145px;
  margin-bottom: 20px;
  padding: 22px 42px;
  border-radius: 15px;
}

.banner-date {
  margin-bottom: 7px;
  font-size: 12px;
  letter-spacing: 2px;
}

.dashboard-banner h1 {
  font-size: 38px;
}

.banner-subtitle {
  margin-top: 3px;
  font-size: 13px;
}

.stats-grid {
  gap: 15px;
  margin: 0 10px 20px;
}

.stat-card {
  min-height: 115px;
  padding: 18px 23px;
  border-radius: 15px;
}

.stat-info p {
  margin-bottom: 6px;
  font-size: 12px;
}

.stat-info h2 {
  font-size: 34px;
}

.stat-info span {
  font-size: 11px;
}

.dashboard-panels {
  gap: 17px;
}

.panel {
  padding: 19px 23px;
  border-radius: 15px;
}

.panel-heading {
  margin-bottom: 13px;
}

.panel-heading h2 {
  font-size: 21px;
}

.queue-item {
  padding: 10px 0;
}

@media (max-width: 650px) {
  .dashboard-page {
    padding: 17px 13px 24px;
  }

  .dashboard-banner {
    min-height: 130px;
    padding: 20px;
  }

  .dashboard-banner h1 {
    font-size: 29px;
  }
}
</style>