
<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  appointments: {
    type: Array,
    default: () => []
  },
  activeFilter: {
    type: String,
    default: 'All'
  },
  searchText: {
    type: String,
    default: ''
  },
  refreshing: {
    type: Boolean,
    default: false
  },
  refreshMessage: {
    type: String,
    default: ''
  },
  refreshStatus: {
    type: String,
    default: ''
  }
})

const emit = defineEmits([
  'update:active-filter',
  'update:search-text',
  'action',
  'reschedule',
  'refresh'
])

const filters = [
  'All',
  'Pending',
  'Confirmed',
  'Completed',
  'Cancelled',
  'No-show'
]

const selectedFilter = ref(props.activeFilter || 'All')

watch(
  () => props.activeFilter,
  value => {
    selectedFilter.value = value || 'All'
  }
)

function selectFilter(filter) {
  selectedFilter.value = filter
  emit('update:active-filter', filter)
}

function handleRefresh() {
  if (props.refreshing) return
  emit('refresh')
}

function formatDate(date, time) {
  if (!date) return ''

  const parsedDate = new Date(`${date}T12:00:00`)

  const dateText = parsedDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })

  if (!time) return dateText

  const timeText = String(time).trim()

  if (/AM|PM/i.test(timeText)) {
    return `${dateText} · ${timeText}`
  }

  const [hour, minute] = timeText.split(':').map(Number)

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return `${dateText} · ${timeText}`
  }

  const formattedTime =
    `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ` +
    `${hour >= 12 ? 'PM' : 'AM'}`

  return `${dateText} · ${formattedTime}`
}

function normalizeStatus(status) {
  const value = String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')

  const statusMap = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    'reschedule requested': 'Reschedule Requested',
    completed: 'Completed',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
    'no show': 'No-show'
  }

  return statusMap[value] || status || 'Pending'
}
const visibleAppointments = computed(() => {
  const search = String(props.searchText || '')
    .trim()
    .toLowerCase()

  const selected = String(selectedFilter.value || 'All')
    .trim()
    .toLowerCase()

  return props.appointments
    .map(appointment => ({
      ...appointment,
      status: normalizeStatus(appointment.status)
    }))
    .filter(appointment => {
      const matchesFilter =
        selected === 'all' ||
        appointment.status.toLowerCase() === selected

      const searchableText = [
        appointment.student,
        appointment.studentId,
        appointment.type,
        appointment.reference,
        appointment.purpose,
        appointment.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesSearch =
        !search || searchableText.includes(search)

      return matchesFilter && matchesSearch
    })
    .sort((a, b) => {
      const dateA = new Date(
        a.scheduledAt || `${a.date}T${a.time || '00:00'}`
      )

      const dateB = new Date(
        b.scheduledAt || `${b.date}T${b.time || '00:00'}`
      )

      return dateA - dateB
    })
})

function handleAction(appointment, action) {
  if (action === 'Reschedule') {
    emit('reschedule', appointment)
    return
  }

  emit('action', appointment, action)
}
</script>

<template>
  <section class="appointments-page">
    <header class="page-heading">
      <h1>Appointments</h1>
      <p>Confirm, reschedule and complete Guidance Appointments</p>
    </header>

    <nav
      class="filter-list"
      aria-label="Appointment status filters"
    >
      <button
        v-for="filter in filters"
        :key="filter"
        type="button"
        class="filter-button"
        :class="{ active: selectedFilter === filter }"
        :aria-pressed="selectedFilter === filter"
        @click="selectFilter(filter)"
      >
        {{ filter }}
      </button>

    </nav>

    <!-- REFRESH FEEDBACK -->
    <p
      v-if="refreshing"
      class="refresh-feedback loading"
      role="status"
      aria-live="polite"
    >
      Refreshing appointments...
    </p>

    <p
      v-else-if="refreshStatus === 'success'"
      class="refresh-feedback success"
      role="status"
      aria-live="polite"
    >
      ✓ Appointments updated just now.
    </p>

    <p
      v-else-if="refreshStatus === 'error' && refreshMessage"
      class="refresh-feedback error"
      role="alert"
    >
      ⚠ {{ refreshMessage }}
    </p>

    <!-- APPOINTMENT LIST -->
    <div
      v-if="visibleAppointments.length"
      class="appointment-list"
    >
      <article
        v-for="appointment in visibleAppointments"
        :key="appointment.id"
        class="appointment-card"
      >
        <div class="appointment-top">
          <p class="appointment-date">
            {{ formatDate(appointment.date, appointment.time) }}
          </p>

          <span
            class="status-badge"
            :class="appointment.status.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-')"
          >
            {{ appointment.status }}
          </span>
        </div>

        <h2>
          {{ appointment.student || 'Unknown Student' }}
          ·
          {{ appointment.type || 'Guidance Appointment' }}
        </h2>

        <p
          v-if="appointment.studentId"
          class="appointment-detail"
        >
          Student ID: {{ appointment.studentId }}
        </p>

        <p class="appointment-reference">
          {{ appointment.reference || appointment.id }}
        </p>

        <p
          v-if="appointment.purpose"
          class="appointment-purpose"
        >
          <strong>Purpose:</strong> {{ appointment.purpose }}
        </p>

        <div class="appointment-actions">
          <button
            v-if="appointment.status === 'Pending' || appointment.status === 'Reschedule Requested'"
            type="button"
            class="action-button"
            @click="handleAction(appointment, 'Confirm')"
          >
            Confirm
          </button>

          <button
            v-if="appointment.status === 'Confirmed'"
            type="button"
            class="action-button"
            @click="handleAction(appointment, 'Reschedule')"
          >
            Reschedule
          </button>

          <button
            v-if="appointment.status === 'Confirmed'"
            type="button"
            class="action-button"
            @click="handleAction(appointment, 'Complete')"
          >
            Complete
          </button>

          <button
            v-if="appointment.status !== 'Completed' && appointment.status !== 'Cancelled' && appointment.status !== 'No-show' && appointment.status !== 'Rejected'"
            type="button"
            class="action-button"
            @click="handleAction(appointment, 'Cancel')"
          >
            Cancel
          </button>

          <button
            v-if="appointment.status === 'Confirmed'"
            type="button"
            class="action-button"
            @click="handleAction(appointment, 'No-show')"
          >
            No-show
          </button>
        </div>
      </article>
    </div>

    <!-- EMPTY STATE -->
    <div v-else class="empty-state">
      <h2>No appointments found</h2>
      <p>
        There are currently no appointments matching this filter or search.
      </p>
    </div>
  </section>
</template>

<style scoped>
.appointments-page {
  width: 100%;
  min-width: 0;
  color: #39090c;
}

.page-heading {
  margin: 0 0 21px;
}

.page-heading h1 {
  margin: 0;
  color: #39090c;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 32px;
  font-weight: normal;
  line-height: 1.25;
}

.page-heading p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.filter-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin: 0 0 18px;
}

.filter-button {
  min-width: 86px;
  height: 39px;
  padding: 0 16px;
  color: #39090c;
  background: #f8eeee;
  border: 1px solid #85474b;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease;
}

.filter-button:hover {
  background: #ead5d6;
}

.filter-button.active {
  color: #fffafa;
  background: #650f18;
  border-color: #650f18;
}

/* REFRESH BUTTON */
.refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 110px;
  height: 39px;
  padding: 0 16px;
  margin-left: auto;
  color: #650f18;
  background: #f8eeee;
  border: 1px solid #85474b;
  border-radius: 9px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease;
}

.refresh-button:hover:not(:disabled) {
  background: #ead5d6;
}

.refresh-button:disabled {
  opacity: 0.7;
  cursor: wait;
}

.refresh-icon {
  flex-shrink: 0;
}

.refresh-icon.spinning {
  animation: refresh-spin 0.8s linear infinite;
}

@keyframes refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

/* REFRESH FEEDBACK */
.refresh-feedback {
  margin: -8px 0 16px;
  padding: 10px 13px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}

.refresh-feedback.loading {
  color: #650f18;
  background: #f5e6e7;
  border: 1px solid #d7b9bb;
}

.refresh-feedback.success {
  color: #356344;
  background: #e5f3e9;
  border: 1px solid #bce2ca;
}

.refresh-feedback.error {
  color: #b42332;
  background: #fce8e8;
  border: 1px solid #e5b2b5;
}

.appointment-list {
  display: grid;
  gap: 13px;
  width: 100%;
}

.appointment-card {
  position: relative;
  width: 100%;
  min-width: 0;
  padding: 13px 16px 14px;
  background: #f8eeee;
  border: 1px solid #704649;
  border-radius: 19px;
}

.appointment-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.appointment-date {
  margin: 0;
  color: #382426;
  font-size: 11px;
  line-height: 1.5;
}

.status-badge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  min-width: 87px;
  min-height: 18px;
  padding: 3px 10px;
  color: #75551a;
  background: #f2e5c8;
  border-radius: 20px;
  font-size: 10px;
  line-height: 1.2;
}

.status-badge.confirmed,
.status-badge.completed {
  color: #356344;
  background: #bce2ca;
}

.status-badge.cancelled,
.status-badge.no-show,
.status-badge.rejected {
  color: #912e36;
  background: #f3d5d7;
}

.status-badge.pending,
.status-badge.reschedule-requested {
  color: #75551a;
  background: #f2e5c8;
}

.appointment-card h2 {
  margin: 1px 0 3px;
  color: #20090a;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 19px;
  font-weight: normal;
  line-height: 1.4;
}

.appointment-detail {
  margin: 3px 0;
  color: #594545;
  font-size: 12px;
}

.appointment-reference {
  margin: 0 0 12px 4px;
  color: #382426;
  font-size: 11px;
  line-height: 1.4;
}

.appointment-purpose {
  margin: 0 0 12px;
  color: #594545;
  font-size: 12px;
  line-height: 1.5;
}

.appointment-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 110px;
  height: 39px;
  padding: 0 13px;
  color: #39090c;
  background: transparent;
  border: 1px solid #85474b;
  border-radius: 9px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease;
}

.action-button:hover {
  background: #ead5d6;
}

.empty-state {
  display: flex;
  min-height: 149px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 20px;
  color: #775f60;
  background: #f8eeee;
  border: 1px solid #d7b9bb;
  border-radius: 19px;
  text-align: center;
}

.empty-state h2 {
  margin: 0 0 8px;
  color: #39090c;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 25px;
  font-weight: normal;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
}

@media (max-width: 700px) {
  .page-heading h1 {
    font-size: 28px;
  }

  .filter-list {
    gap: 6px;
  }

  .filter-button {
    min-width: 0;
    height: 36px;
    padding: 0 13px;
    font-size: 12px;
  }

  .refresh-button {
    height: 36px;
    padding: 0 12px;
    font-size: 12px;
  }

  .appointment-card {
    padding: 13px;
  }

  .appointment-card h2 {
    font-size: 17px;
  }

  .action-button {
    min-width: 0;
    height: 37px;
    padding: 0 11px;
    font-size: 12px;
  }
}

@media (max-width: 420px) {
  .appointment-top {
    align-items: flex-start;
    flex-direction: column;
    gap: 7px;
  }

  .appointment-actions {
    gap: 7px;
  }

  .action-button {
    flex: 1 1 calc(50% - 7px);
  }

  .refresh-button {
    margin-left: auto;
  }
}
</style>
