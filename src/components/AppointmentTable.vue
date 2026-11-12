
<script setup>
defineProps({
  appointments: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits([
  'view',
  'confirm',
  'complete',
  'cancel',
  'reschedule',
])

function statusClass(status) {
  return String(status || '').toLowerCase().replace(/\s+/g, '-')
}
</script>

<template>
  <div class="appointment-list">
    <article
      v-for="item in appointments"
      :key="item.appointmentId || item.id"
      class="appointment-card"
    >
      <div class="card-top">
        <span class="appointment-date">
          {{ item.date }} · {{ item.time }}
        </span>

        <span class="status-badge" :class="statusClass(item.status)">
          {{ item.status }}
        </span>
      </div>

      <h3>{{ item.student }} · {{ item.purpose }}</h3>
      <p class="appointment-id">{{ item.id }}</p>

      <div class="actions">
        <template v-if="['Pending', 'Reschedule Requested'].includes(item.status)">
          <button type="button" @click="emit('reschedule', item)">
            Reschedule
          </button>

          <button type="button" @click="emit('confirm', item)">
            Confirm
          </button>

          <button type="button" @click="emit('cancel', item)">
            Cancel
          </button>
        </template>

        <template v-else-if="item.status === 'Confirmed'">
          <button type="button" @click="emit('reschedule', item)">
            Reschedule
          </button>

          <button type="button" @click="emit('complete', item)">
            Complete
          </button>

          <button type="button" @click="emit('cancel', item)">
            Cancel
          </button>
        </template>

        <button type="button" @click="emit('view', item)">
          View
        </button>
      </div>
    </article>

    <p v-if="appointments.length === 0" class="empty">
      No appointments found.
    </p>
  </div>
</template>

<style scoped>
.appointment-list {
  display: grid;
  gap: 14px;
}

.appointment-card {
  padding: 14px;
  border: 1px solid #b98b8c;
  border-radius: 14px;
  background: #fff8f7;
  color: #390607;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.appointment-date {
  font-size: 11px;
  color: #765456;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 20px;
  background: #eee0e0;
  font-size: 10px;
}

.status-badge.confirmed {
  background: #b9dfc6;
  color: #245637;
}

.status-badge.pending {
  background: #f5e6a1;
  color: #694d00;
}

.status-badge.completed {
  background: #d9dfe9;
  color: #21496e;
}

.status-badge.cancelled {
  background: #f2cccc;
  color: #9a0000;
}

.appointment-card h3 {
  margin: 8px 0 4px;
  font: 17px Georgia, serif;
}

.appointment-id {
  margin: 0 0 12px;
  font-size: 11px;
  color: #765456;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.actions button {
  padding: 8px 12px;
  border: 1px solid #95686a;
  border-radius: 8px;
  background: transparent;
  color: #56090d;
  font-size: 12px;
  cursor: pointer;
}

.actions button:hover {
  background: #f1e2e1;
}

.empty {
  padding: 28px;
  text-align: center;
  color: #765456;
}
</style>
