
<script setup>
import { computed } from 'vue'

const props = defineProps({
  appointments: {
    type: Array,
    default: () => []
  },
  recentAppointments: {
    type: Array,
    default: () => []
  },
  completedCount: {
    type: Number,
    default: 0
  },
  counselorsAvailable: {
    type: Number,
    default: 0
  },
  readyForPickup: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['navigate'])

const todayLabel = new Date().toLocaleDateString('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'Asia/Manila'
}).toUpperCase()

const recentWork = computed(() =>
  props.recentAppointments.slice(0, 3)
)

function formatTime(time) {
  if (!time) return ''

  const timeText = String(time).trim()

  if (/AM|PM/i.test(timeText)) {
    return timeText
  }

  const [hour, minute] = timeText.split(':').map(Number)

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return timeText
  }

  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

function formatDate(date) {
  if (!date) return ''

  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}
</script>

<template>
  <div class="dashboard">
    <section class="welcome-banner">
      <p class="date-label">{{ todayLabel }}</p>
      <h1>Guidance Office Dashboard</h1>
      <p class="welcome-description">
        Review today's workload and continue the next transaction.
      </p>
    </section>

    <section class="stats-grid">
      <article class="stat-card">
        <p>TODAY'S APPOINTMENTS</p>
        <strong>{{ appointments.length }}</strong>
        <button
          type="button"
          @click="emit('navigate', 'Appointments')"
        >
          View details
        </button>
      </article>

      <article class="stat-card">
        <p>COMPLETED SESSIONS</p>
        <strong>{{ completedCount }}</strong>
        <button
          type="button"
          @click="emit('navigate', 'History')"
        >
          View details
        </button>
      </article>

      <article class="stat-card">
        <p>COUNSELORS AVAILABLE</p>
        <strong>{{ counselorsAvailable }}</strong>
        <button
          type="button"
          @click="emit('navigate', 'Guidance Sessions')"
        >
          View details
        </button>
      </article>

      <article class="stat-card">
        <p>READY FOR PICKUP</p>
        <strong>{{ readyForPickup }}</strong>
        <button
          type="button"
          @click="emit('navigate', 'Appointments', 'Ready for Pickup')"
        >
          View details
        </button>
      </article>
    </section>

    <section class="bottom-grid">
      <article class="content-card">
        <h2>Today's appointments</h2>

        <div
          v-for="appointment in appointments"
          :key="appointment.id"
          class="work-row"
        >
          <strong class="time">
            {{ formatTime(appointment.time) }}
          </strong>

          <div class="work-details">
            <strong>{{ appointment.student }}</strong>
            <small>{{ appointment.type }}</small>
          </div>

          <span
            class="status-badge"
            :class="String(appointment.status || '').toLowerCase()"
          >
            {{ appointment.status }}
          </span>
        </div>

        <p v-if="!appointments.length" class="empty-message">
          No appointments scheduled for today.
        </p>

        <button
          type="button"
          class="text-button"
          @click="emit('navigate', 'Appointments')"
        >
          View all appointments →
        </button>
      </article>

      <article class="content-card">
        <h2>Recent work</h2>

        <div
          v-for="appointment in recentWork"
          :key="appointment.id"
          class="recent-row"
        >
          <div>
            <strong>
              {{ appointment.student }} · {{ appointment.type }}
            </strong>
            <small>
              {{ appointment.reference }} · {{ formatDate(appointment.date) }}
            </small>
          </div>

          <span
            class="status-badge"
            :class="String(appointment.status || '').toLowerCase()"
          >
            {{ appointment.status }}
          </span>
        </div>

        <p v-if="!recentWork.length" class="empty-message">
          No recent work available.
        </p>

        <button
          type="button"
          class="text-button"
          @click="emit('navigate', 'History')"
        >
          View history →
        </button>
      </article>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  width: 100%;
}

.welcome-banner {
  padding: 29px 32px;
  margin-bottom: 28px;
  color: #fffafa;
  background: #51090e;
  border-radius: 15px;
}

.date-label {
  margin: 0 0 12px;
  color: #e6caca;
  font-size: 12px;
  letter-spacing: 2px;
}

.welcome-banner h1 {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(25px, 3vw, 42px);
  line-height: 1.2;
}

.welcome-description {
  margin: 8px 0 0;
  color: #e7cccc;
  font-size: 13px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 30px;
}

.stat-card {
  display: flex;
  min-height: 145px;
  flex-direction: column;
  align-items: flex-start;
  padding: 18px;
  background: #f8eeee;
  border: 1px solid #c9b8b8;
  border-radius: 14px;
  box-shadow: 0 2px 2px #0002;
}

.stat-card p {
  min-height: 28px;
  margin: 0 0 8px;
  color: #514747;
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 1px;
}

.stat-card strong {
  margin-bottom: 12px;
  color: #51090e;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 32px;
}

.stat-card button,
.text-button {
  padding: 0;
  margin-top: auto;
  color: #39090c;
  font-size: 12px;
  font-weight: bold;
  background: none;
  border: none;
  cursor: pointer;
}

.bottom-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
  padding: 0 8px;
}

.content-card {
  min-width: 0;
  padding: 19px 20px;
  background: #f8eeee;
  border: 1px solid #c9b8b8;
  border-radius: 15px;
  box-shadow: 0 2px 2px #0002;
}

.content-card h2 {
  margin: 0 0 18px;
  color: #160909;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 25px;
}

.work-row,
.recent-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0 13px;
  margin-bottom: 9px;
  border-bottom: 1px solid #d7c5c5;
}

.time {
  min-width: 85px;
  font-size: 12px;
}

.work-details,
.recent-row > div {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.work-details strong,
.recent-row strong {
  font-size: 11px;
  overflow-wrap: anywhere;
}

.work-details small,
.recent-row small {
  color: #776565;
  font-size: 10px;
}

.status-badge {
  flex-shrink: 0;
  padding: 5px 9px;
  color: #75551a;
  background: #f2e5c8;
  border-radius: 20px;
  font-size: 9px;
  font-weight: bold;
}

.status-badge.confirmed,
.status-badge.completed {
  color: #356344;
  background: #c6e4ce;
}

.status-badge.cancelled,
.status-badge.no-show {
  color: #912e36;
  background: #f3d5d7;
}

.empty-message {
  padding: 12px 0;
  color: #776565;
  font-size: 12px;
}

.text-button {
  margin-top: 12px;
}

@media (max-width: 1100px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bottom-grid {
    grid-template-columns: 1fr;
    padding: 0;
  }
}

@media (max-width: 600px) {
  .welcome-banner {
    padding: 24px 20px;
  }

  .stat-card {
    padding: 13px;
  }

  .content-card {
    padding: 16px;
  }

  .work-row,
  .recent-row {
    flex-wrap: wrap;
  }

  .time {
    min-width: 75px;
  }
}
</style>
