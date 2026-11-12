
<template>
  <main class="reports-page">
    <header class="page-header">
      <div>
        <h1>Reports</h1>
        <p>Analytics and operational performance for the last 7 days.</p>
      </div>
    </header>

    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>

    <!-- Key Performance Metrics -->
    <section class="metrics-grid">
      <article class="metric-card">
        <h2>{{ totalTickets }}</h2>
        <p>Total Tickets</p>
      </article>

      <article class="metric-card">
        <h2>{{ servedTickets }}</h2>
        <p>Completed Tickets</p>
      </article>

      <article class="metric-card">
        <h2>{{ skippedTickets }}</h2>
        <p>Skipped Tickets</p>
      </article>

      <article class="metric-card">
        <h2>{{ averageTime }}</h2>
        <p>Average Handling Time</p>
      </article>
    </section>

    <!-- Ticket Outcome Analysis -->
    <section class="report-card">
      <div class="section-header">
        <div>
          <h2>Ticket Outcome Analysis</h2>
          <p class="section-description">
            Distribution of completed and skipped tickets.
          </p>
        </div>
      </div>

      <div v-if="loading" class="empty-message">
        Loading ticket outcomes...
      </div>

      <div v-else-if="totalTickets === 0" class="empty-message">
        No ticket records found for this period.
      </div>

      <div v-else class="outcome-content">
        <div class="outcome-item">
          <div class="outcome-heading">
            <div class="outcome-label">
              <span class="legend-dot completed-dot"></span>
              <span>Completed</span>
            </div>

            <strong>{{ servedTickets }}</strong>
          </div>

          <div class="progress-track">
            <div
              class="progress-fill completed-fill"
              :style="{ width: `${completedPercentage}%` }"
            ></div>
          </div>

          <span class="outcome-percentage">
            {{ completedPercentage }}% of resolved tickets
          </span>
        </div>

        <div class="outcome-item">
          <div class="outcome-heading">
            <div class="outcome-label">
              <span class="legend-dot skipped-dot"></span>
              <span>Skipped</span>
            </div>

            <strong>{{ skippedTickets }}</strong>
          </div>

          <div class="progress-track">
            <div
              class="progress-fill skipped-fill"
              :style="{ width: `${skippedPercentage}%` }"
            ></div>
          </div>

          <span class="outcome-percentage">
            {{ skippedPercentage }}% of resolved tickets
          </span>
        </div>

        <div class="unresolved-note">
          <span>Other or unresolved tickets</span>
          <strong>{{ unresolvedTickets }}</strong>
        </div>
      </div>
    </section>

    <!-- Daily Transaction Trend -->
    <section class="report-card">
      <div class="section-header">
        <div>
          <h2>Daily Transaction Trend</h2>
          <p class="section-description">
            Number of tickets created each day over the last 7 days.
          </p>
        </div>
      </div>

      <div v-if="loading" class="empty-message">
        Loading transaction trend...
      </div>

      <div v-else-if="totalTickets === 0" class="empty-message">
        No transaction data available for this period.
      </div>

      <div v-else class="trend-chart">
        <div
          v-for="day in dailyTrend"
          :key="day.date"
          class="trend-column"
        >
          <span class="trend-count">{{ day.count }}</span>

          <div class="trend-bar-area">
            <div
              class="trend-bar"
              :style="{ height: `${day.percentage}%` }"
              :title="`${day.count} tickets`"
            ></div>
          </div>

          <span class="trend-label">{{ day.label }}</span>
        </div>
      </div>
    </section>

    <!-- Cashier Counter Performance -->
    <section class="report-card counter-card">
      <div class="section-header">
        <div>
          <h2>Cashier Counter Performance</h2>
          <p class="section-description">
            Number of completed tickets handled by each counter.
          </p>
        </div>
      </div>

      <div v-if="loading" class="empty-message">
        Loading counter performance...
      </div>

      <div
        v-else-if="counterBreakdown.length === 0"
        class="empty-message"
      >
        No completed counter activity recorded for this period.
      </div>

      <div v-else class="counter-list">
        <div
          v-for="counter in counterBreakdown"
          :key="counter.name"
          class="counter-item"
        >
          <div class="counter-heading">
            <span>{{ counter.name }}</span>
            <strong>{{ counter.count }} completed tickets</strong>
          </div>

          <div class="progress-track">
            <div
              class="progress-fill counter-fill"
              :style="{ width: `${counter.percentage}%` }"
            ></div>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup>
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
} from 'vue'

import { supabase } from '../supabase'

const queues = ref([])
const loading = ref(false)
const errorMessage = ref('')

let realtimeChannel = null
let isMounted = true
let loadRequestId = 0

// Build a local date key without UTC date shifting.
function getLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

// Get the last 7 days, including today.
function getReportRange() {
  const now = new Date()

  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  )

  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 6,
  )

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

// Standardize queue status values.
function normalizeStatus(value) {
  const status = String(value || '')
    .trim()
    .toLowerCase()

  if (
    ['finished', 'completed', 'complete', 'served'].includes(status)
  ) {
    return 'Completed'
  }

  if (status === 'skipped') {
    return 'Skipped'
  }

  if (
    ['serving', 'being served', 'in progress'].includes(status)
  ) {
    return 'Serving'
  }

  if (
    ['waiting', 'pending', 'queued'].includes(status)
  ) {
    return 'Waiting'
  }

  return 'Other'
}

// Format average handling time.
function formatAverageTime(minutes) {
  if (minutes === null || !Number.isFinite(minutes)) {
    return '—'
  }

  const totalSeconds = Math.round(minutes * 60)

  const hours = Math.floor(totalSeconds / 3600)

  const remainingMinutes = Math.floor(
    (totalSeconds % 3600) / 60,
  )

  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`
  }

  if (remainingMinutes > 0) {
    return `${remainingMinutes}m ${seconds}s`
  }

  return `${seconds}s`
}

// Key performance metrics.
const totalTickets = computed(() => queues.value.length)

const servedTickets = computed(() =>
  queues.value.filter(
    (ticket) => normalizeStatus(ticket.status) === 'Completed',
  ).length,
)

const skippedTickets = computed(() =>
  queues.value.filter(
    (ticket) => normalizeStatus(ticket.status) === 'Skipped',
  ).length,
)

const unresolvedTickets = computed(() =>
  queues.value.filter((ticket) => {
    const status = normalizeStatus(ticket.status)

    return status !== 'Completed' && status !== 'Skipped'
  }).length,
)

// Ticket outcome percentages are based on resolved tickets only.
const resolvedTickets = computed(
  () => servedTickets.value + skippedTickets.value,
)

const completedPercentage = computed(() => {
  if (!resolvedTickets.value) return 0

  return Math.round(
    (servedTickets.value / resolvedTickets.value) * 100,
  )
})

const skippedPercentage = computed(() => {
  if (!resolvedTickets.value) return 0

  return Math.round(
    (skippedTickets.value / resolvedTickets.value) * 100,
  )
})

// Average handling time from Student Arrived to ticket completion.
const averageTime = computed(() => {
  const completedTickets = queues.value.filter((ticket) => {
    if (normalizeStatus(ticket.status) !== 'Completed') {
      return false
    }

    if (
      !ticket.arrival_confirmed_at ||
      !ticket.finished_at
    ) {
      return false
    }

    const arrivedAt = new Date(
      ticket.arrival_confirmed_at,
    ).getTime()

    const finishedAt = new Date(
      ticket.finished_at,
    ).getTime()

    return (
      Number.isFinite(arrivedAt) &&
      Number.isFinite(finishedAt) &&
      finishedAt >= arrivedAt
    )
  })

  if (completedTickets.length === 0) {
    return '—'
  }

  const totalMinutes = completedTickets.reduce(
    (total, ticket) => {
      const arrivedAt = new Date(
        ticket.arrival_confirmed_at,
      ).getTime()

      const finishedAt = new Date(
        ticket.finished_at,
      ).getTime()

      return total + (finishedAt - arrivedAt) / 60000
    },
    0,
  )

  return formatAverageTime(
    totalMinutes / completedTickets.length,
  )
})

// Daily transaction trend for the last 7 days.
const dailyTrend = computed(() => {
  const days = []
  const now = new Date()

  for (let i = 6; i >= 0; i--) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - i,
    )

    const dateKey = getLocalDateKey(date)

    const count = queues.value.filter((ticket) => {
      if (!ticket.created_at) return false

      const createdAt = new Date(ticket.created_at)

      return getLocalDateKey(createdAt) === dateKey
    }).length

    days.push({
      date: dateKey,
      label: date.toLocaleDateString('en-US', {
        weekday: 'short',
      }),
      count,
    })
  }

  const maxCount = Math.max(
    ...days.map((day) => day.count),
    1,
  )

  return days.map((day) => ({
    ...day,
    percentage: day.count
      ? Math.max(8, (day.count / maxCount) * 100)
      : 0,
  }))
})

// Completed tickets handled by each cashier counter.
const counterBreakdown = computed(() => {
  const counters = new Map()

  for (const ticket of queues.value) {
    if (normalizeStatus(ticket.status) !== 'Completed') {
      continue
    }

    const name =
      String(ticket.counter_name || '').trim() || 'Unassigned'

    counters.set(
      name,
      (counters.get(name) || 0) + 1,
    )
  }

  const total = [...counters.values()].reduce(
    (sum, count) => sum + count,
    0,
  )

  return [...counters.entries()]
    .map(([name, count]) => ({
      name,
      count,
      percentage: total
        ? Math.round((count / total) * 100)
        : 0,
    }))
    .sort((a, b) => b.count - a.count)
})

// Load queue records for the last 7 days.
async function loadReports() {
  if (!isMounted) return

  const requestId = ++loadRequestId

  loading.value = true
  errorMessage.value = ''

  try {
    const { start, end } = getReportRange()

    const { data, error } = await supabase
      .from('queues')
      .select(`
        id,
        counter_name,
        status,
        created_at,
        arrival_confirmed_at,
        finished_at
      `)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    if (!isMounted || requestId !== loadRequestId) {
      return
    }

    queues.value = data || []
  } catch (error) {
    console.error(
      'Failed to load Reports from Supabase:',
      error,
    )

    if (!isMounted || requestId !== loadRequestId) {
      return
    }

    errorMessage.value =
      error?.message ||
      'Unable to load reports. Please check your Supabase connection and permissions.'
  } finally {
    if (isMounted && requestId === loadRequestId) {
      loading.value = false
    }
  }
}

// Initial load and realtime subscription.
// Register every callback before subscribing.
onMounted(async () => {
  if (!isMounted) return

  realtimeChannel = supabase
    .channel('reports-queue-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'queues',
      },
      () => {
        loadReports()
      },
    )

  realtimeChannel.subscribe((status, error) => {
    if (error) {
      console.error('Reports Realtime Error:', error)
    }

    if (status === 'CHANNEL_ERROR') {
      console.error(
        'Unable to subscribe to queue changes in Supabase.',
      )
    }
  })

  await loadReports()
})

// Clean up realtime subscription.
onUnmounted(() => {
  isMounted = false
  loadRequestId++

  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
})
</script>

<style scoped>
.reports-page {
  min-height: 100%;
  padding: 30px 34px;
  background: #f0e6e6;
  color: #461313;
  font-family: 'Playfair Display', Georgia, serif;
}

.page-header {
  margin-bottom: 31px;
}

.page-header h1 {
  margin: 0;
  color: #501414;
  font-family: inherit;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.3;
}

.page-header p {
  margin: 4px 0 0;
  color: #907e7e;
  font-size: 14px;
  line-height: 1.5;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.metric-card {
  min-height: 135px;
  padding: 24px 26px;
  background: #f6f0f0;
  border: 1px solid #c9bebe;
  border-radius: 19px;
  box-shadow: 0 2px 2px rgb(54 22 22 / 25%);
}

.metric-card h2 {
  margin: 0 0 5px;
  color: #501414;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 34px;
  font-weight: 700;
  line-height: 1.2;
}

.metric-card p {
  margin: 0;
  color: #a08e8e;
  font-size: 15px;
}

.report-card {
  margin-bottom: 25px;
  padding: 25px 28px 30px;
  background: #f6f0f0;
  border: 1px solid #c9bebe;
  border-radius: 19px;
  box-shadow: 0 2px 2px rgb(54 22 22 / 22%);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 26px;
}

.report-card h2 {
  margin: 0 0 5px;
  color: #501414;
  font-family: inherit;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.4;
}

.section-description {
  margin: 0;
  color: #a08e8e;
  font-size: 13px;
  line-height: 1.5;
}

.empty-message {
  padding: 18px 0;
  color: #907e7e;
  font-size: 14px;
}

.outcome-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.outcome-item {
  min-width: 0;
}

.outcome-heading,
.outcome-label {
  display: flex;
  align-items: center;
}

.outcome-heading {
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 9px;
  color: #897777;
  font-size: 14px;
}

.outcome-label {
  gap: 9px;
}

.outcome-heading strong {
  color: #501414;
  font-size: 15px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
}

.completed-dot {
  background: #63866b;
}

.skipped-dot {
  background: #a75b5b;
}

.progress-track {
  width: 100%;
  height: 13px;
  overflow: hidden;
  background: #eadcdc;
  border-radius: 20px;
}

.progress-fill {
  height: 100%;
  border-radius: 20px;
  transition: width 0.25s ease;
}

.completed-fill {
  background: #63866b;
}

.skipped-fill {
  background: #a75b5b;
}

.outcome-percentage {
  display: block;
  margin-top: 6px;
  color: #a08e8e;
  font-size: 12px;
}

.unresolved-note {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 17px;
  border-top: 1px solid #e5d8d8;
  color: #897777;
  font-size: 13px;
}

.unresolved-note strong {
  color: #501414;
}

.trend-chart {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 15px;
  min-height: 220px;
  padding-top: 10px;
}

.trend-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}

.trend-count {
  margin-bottom: 8px;
  color: #806d6d;
  font-size: 13px;
  font-weight: 600;
}

.trend-bar-area {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  height: 145px;
  padding: 0 8px;
  border-bottom: 1px solid #d9caca;
}

.trend-bar {
  width: 100%;
  max-width: 48px;
  min-height: 0;
  background: #501414;
  border-radius: 7px 7px 0 0;
  transition: height 0.25s ease;
}

.trend-label {
  margin-top: 10px;
  color: #907e7e;
  font-size: 12px;
}

.counter-list {
  display: flex;
  flex-direction: column;
  gap: 23px;
}

.counter-item {
  min-width: 0;
}

.counter-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
  color: #897777;
  font-size: 14px;
}

.counter-heading strong {
  flex-shrink: 0;
  color: #501414;
  font-size: 13px;
  font-weight: 600;
  text-align: right;
}

.counter-fill {
  background: #501414;
}

.error-message {
  margin-bottom: 20px;
  padding: 13px 15px;
  color: #8b3038;
  background: #fff0f0;
  border: 1px solid #efcccc;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 1000px) {
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .reports-page {
    padding: 22px 16px;
  }

  .metrics-grid {
    gap: 12px;
    margin-bottom: 24px;
  }

  .metric-card {
    min-height: 112px;
    padding: 19px 16px;
    border-radius: 14px;
  }

  .metric-card h2 {
    font-size: 29px;
  }

  .metric-card p {
    font-size: 13px;
  }

  .report-card {
    padding: 21px 17px 25px;
    border-radius: 14px;
  }

  .report-card h2 {
    font-size: 19px;
  }

  .trend-chart {
    gap: 7px;
    min-height: 190px;
  }

  .trend-bar-area {
    height: 120px;
    padding: 0 4px;
  }

  .trend-label {
    font-size: 11px;
  }

  .counter-heading {
    font-size: 13px;
  }

  .counter-heading strong {
    font-size: 12px;
  }
}
</style>
