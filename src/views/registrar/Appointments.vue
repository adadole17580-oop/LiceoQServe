
<template>
  <div class="appointments-page">
    <div v-if="!rescheduleTarget" class="page-heading">
      <h1>Appointments</h1>
      <p>Confirm, reschedule and complete Registrar appointments.</p>
    </div>

    <!-- Reschedule page -->
    <section v-if="rescheduleTarget" class="reschedule-page">
      <h1>Reschedule Appointment</h1>
      <p class="reschedule-subtitle">
        {{ rescheduleTarget.student }} · {{ rescheduleTarget.id }}
      </p>

      <form class="reschedule-form" @submit.prevent="saveReschedule">
        <div class="current-schedule">
          Current:
          <strong>
            {{ formatDate(rescheduleTarget.date) }} at
            {{ formatTime(rescheduleTarget.time) }}
          </strong>
        </div>

        <div class="reschedule-field">
          <label for="new-date">New Date</label>
          <input
            id="new-date"
            v-model="newDate"
            type="date"
            :min="todayISO"
            required
          />
        </div>

        <div class="reschedule-field">
          <label for="new-time">New Time</label>
          <select id="new-time" v-model="newTime" required>
            <option disabled value="">Choose a time</option>
            <option v-for="time in timeSlots" :key="time" :value="time">
              {{ formatTime(time) }}
            </option>
          </select>
        </div>

        <p v-if="formError" class="form-error" role="alert">
          {{ formError }}
        </p>

        <div class="reschedule-actions">
          <button
            type="submit"
            class="action-button primary"
            :disabled="saving"
          >
            {{ saving ? 'Saving...' : 'Review Changes' }}
          </button>

          <button
            type="button"
            class="action-button secondary"
            @click="closeReschedule"
          >
            Cancel Editing
          </button>
        </div>
      </form>
    </section>

    <!-- Status filters -->
    <div v-if="!rescheduleTarget" class="status-filters">
      <button
        v-for="status in statuses"
        :key="status"
        type="button"
        class="filter-button"
        :class="{ active: activeStatus === status }"
        @click="activeStatus = status"
      >
        <span v-if="status === 'All'" class="all-icon">▦</span>
        {{ status }}
        <span v-if="status !== 'All'" class="filter-count">
          {{ countStatus(status) }}
        </span>
      </button>
    </div>

    <!-- Appointment list -->
    <section v-if="!rescheduleTarget" class="appointment-list">
      <article
        v-for="appointment in filteredAppointments"
        :key="appointment.id"
        class="appointment-card"
      >
        <div class="appointment-main">
          <div class="appointment-topline">
            <span class="appointment-id">
              {{ appointment.id }}
            </span>

            <span
              class="status-badge"
              :class="statusClass(appointment.status)"
            >
              {{ appointment.status }}
            </span>
          </div>

          <h2>{{ appointment.service }}</h2>

          <div class="appointment-details">
            <span class="detail-item">
              <span class="detail-icon">♙</span>
              {{ appointment.student }}
            </span>

            <span class="detail-item">
              <span class="detail-icon">▦</span>
              {{ formatDate(appointment.date) }}
            </span>

            <span class="detail-item">
              <span class="detail-icon">◷</span>
              {{ formatTime(appointment.time) }}
            </span>
          </div>

          <p v-if="appointment.note" class="appointment-note">
            {{ appointment.note }}
          </p>

          <div class="appointment-actions">
            <button
              v-if="appointment.status === 'Pending'"
              class="action-button primary"
              type="button"
              :disabled="saving"
              @click="updateStatus(appointment, 'confirmed')"
            >
              Confirm
            </button>

            <button
              v-if="appointment.status === 'Confirmed'"
              class="action-button primary"
              type="button"
              :disabled="saving"
              @click="updateStatus(appointment, 'completed')"
            >
              Mark Completed
            </button>

            <button
              v-if="['Pending', 'Confirmed', 'Reschedule Requested'].includes(appointment.status)"
              class="action-button secondary"
              type="button"
              :disabled="saving"
              @click="openReschedule(appointment)"
            >
              Reschedule
            </button>

            <button
              v-if="['Pending', 'Confirmed', 'Reschedule Requested'].includes(appointment.status)"
              class="action-button cancel"
              type="button"
              :disabled="saving"
              @click="openCancelConfirmation(appointment)"
            >
              Cancel
            </button>

            <!-- NO-SHOW BUTTON -->
            <button
              v-if="['Pending', 'Confirmed'].includes(appointment.status)"
              class="action-button secondary"
              type="button"
              :disabled="saving"
              @click="openNoShowConfirmation(appointment)"
            >
              No-show
            </button>
          </div>
        </div>
      </article>

      <div v-if="filteredAppointments.length === 0" class="empty-state">
        <div class="empty-symbol">▦</div>
        <h2>No appointments found</h2>
        <p>There are no appointments under this status.</p>

        <button
          type="button"
          class="action-button secondary"
          @click="activeStatus = 'All'"
        >
          View All Appointments
        </button>
      </div>
    </section>

    <!-- Reschedule confirmation dialog -->
    <div
      v-if="showRescheduleConfirmation"
      class="modal-overlay"
      @click.self="closeRescheduleConfirmation"
    >
      <section
        class="modal-card reschedule-confirm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reschedule-confirm-title"
      >
        <div class="reschedule-confirm-heading">
          <div class="reschedule-warning-icon" aria-hidden="true">
            !
          </div>

          <h2 id="reschedule-confirm-title">
            Reschedule this appointment?
          </h2>
        </div>

        <p class="reschedule-confirm-details">
          {{ rescheduleTarget?.student }}
          · {{ rescheduleTarget?.service }}
          · {{ formatDate(newDate) }} at {{ formatTime(newTime) }}
        </p>

        <p v-if="confirmationError" class="form-error" role="alert">
          {{ confirmationError }}
        </p>

        <div class="modal-actions reschedule-confirm-actions">
          <button
            type="button"
            class="action-button secondary"
            :disabled="saving"
            @click="closeRescheduleConfirmation"
          >
            Go Back
          </button>

          <button
            type="button"
            class="action-button primary"
            :disabled="saving"
            @click="confirmReschedule"
          >
            {{ saving ? 'Saving...' : 'Confirm Reschedule' }}
          </button>
        </div>
      </section>
    </div>

    <!-- Cancel confirmation dialog -->
    <div
      v-if="cancelTarget"
      class="modal-overlay"
      @click.self="closeCancelConfirmation"
    >
      <section
        class="modal-card reschedule-confirm-card cancel-confirm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-confirm-title"
      >
        <div class="reschedule-confirm-heading">
          <div class="reschedule-warning-icon" aria-hidden="true">
            !
          </div>

          <h2 id="cancel-confirm-title">
            Cancel this appointment?
          </h2>
        </div>

        <p class="reschedule-confirm-details">
          {{ cancelTarget.student }}
          · {{ cancelTarget.service }}
          · {{ formatDate(cancelTarget.date) }} at
          {{ formatTime(cancelTarget.time) }}
        </p>

        <p v-if="formError" class="form-error" role="alert">
          {{ formError }}
        </p>

        <div class="modal-actions reschedule-confirm-actions">
          <button
            type="button"
            class="action-button secondary"
            :disabled="saving"
            @click="closeCancelConfirmation"
          >
            Go Back
          </button>

          <button
            type="button"
            class="action-button primary"
            :disabled="saving"
            @click="confirmCancellation"
          >
            {{ saving ? 'Saving...' : 'Confirm Cancelled' }}
          </button>
        </div>
      </section>
    </div>

    <!-- NO-SHOW CONFIRMATION DIALOG -->
    <div
      v-if="noShowTarget"
      class="modal-overlay"
      @click.self="closeNoShowConfirmation"
    >
      <section
        class="modal-card reschedule-confirm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="no-show-confirm-title"
      >
        <div class="reschedule-confirm-heading">
          <div class="reschedule-warning-icon" aria-hidden="true">
            !
          </div>

          <h2 id="no-show-confirm-title">
            Mark this appointment as No-show?
          </h2>
        </div>

        <p class="reschedule-confirm-details">
          {{ noShowTarget.student }}
          · {{ noShowTarget.service }}
          · {{ formatDate(noShowTarget.date) }} at
          {{ formatTime(noShowTarget.time) }}
        </p>

        <p v-if="noShowError" class="form-error" role="alert">
          {{ noShowError }}
        </p>

        <div class="modal-actions reschedule-confirm-actions">
          <button
            type="button"
            class="action-button secondary"
            :disabled="saving"
            @click="closeNoShowConfirmation"
          >
            Go Back
          </button>

          <button
            type="button"
            class="action-button primary"
            :disabled="saving"
            @click="confirmNoShow"
          >
            {{ saving ? 'Saving...' : 'Confirm No-show' }}
          </button>
        </div>
      </section>
    </div>

    <!-- Action feedback -->
    <div v-if="message" class="feedback-message" role="status">
      <span>✓</span>
      {{ message }}

      <button
        type="button"
        aria-label="Dismiss"
        @click="message = ''"
      >
        ×
      </button>
    </div>

    <div v-if="loading" class="loading-message">
      Loading appointments...
    </div>

    <div v-if="loadError" class="load-error">
      {{ loadError }}

      <button type="button" @click="loadAppointments">
        Retry
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'

const statuses = [
  'All',
  'Pending',
  'Confirmed',
  'Completed',
  'Cancelled',
  'No-show',
  'Reschedule Requested'
]

function getLocalDate() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const todayISO = getLocalDate()

const activeStatus = ref('All')
const appointments = ref([])
const message = ref('')
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')

const rescheduleTarget = ref(null)
const showRescheduleConfirmation = ref(false)
const confirmationError = ref('')

const cancelTarget = ref(null)

const noShowTarget = ref(null)
const noShowError = ref('')

const newDate = ref('')
const newTime = ref('')
const formError = ref('')

const timeSlots = [
  '08:00', '08:30',
  '09:00', '09:30',
  '10:00', '10:30',
  '11:00', '11:30',
  '13:00', '13:30',
  '14:00', '14:30',
  '15:00', '15:30',
  '16:00'
]

const filteredAppointments = computed(() => {
  return appointments.value
    .filter(appointment =>
      activeStatus.value === 'All' ||
      appointment.status === activeStatus.value
    )
    .sort((a, b) =>
      `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
    )
})

function countStatus(status) {
  return appointments.value.filter(
    appointment => appointment.status === status
  ).length
}

function statusClass(status) {
  return status.toLowerCase().replace(/\s+/g, '-')
}

function displayStatus(status) {
  const statusMap = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No-show',
    reschedule_requested: 'Reschedule Requested'
  }

  return statusMap[status] || status
}

function formatDate(value) {
  if (!value) return 'No date'

  const date = new Date(value)

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatTime(value) {
  if (!value) return 'No time'

  const [hour, minute] = value.split(':').map(Number)
  const date = new Date()

  date.setHours(hour, minute, 0, 0)

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  })
}

function toLocalDateTime(value) {
  const date = new Date(value)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`
  }
}

async function loadAppointments() {
  loading.value = true
  loadError.value = ''

  try {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id,
        student_id,
        service_id,
        scheduled_at,
        end_at,
        status,
        purpose,
        student_notes,
        staff_notes,
        reschedule_requested_at,
        profiles:student_id (
          full_name
        ),
        office_services:service_id (
          name
        )
      `)
      .order('scheduled_at', { ascending: true })

    if (error) throw error

    appointments.value = (data || []).map(item => {
      const schedule = toLocalDateTime(item.scheduled_at)

      return {
        id: item.id,
        studentId: item.student_id,
        serviceId: item.service_id,
        student: item.profiles?.full_name || 'Unknown Student',
        service: item.office_services?.name || 'Unknown Service',
        date: schedule.date,
        time: schedule.time,
        status: displayStatus(item.status),
        databaseStatus: item.status,
        note: item.purpose || item.student_notes || '',
        staffNotes: item.staff_notes || ''
      }
    })
  } catch (error) {
    console.error('Error loading appointments:', error)
    loadError.value = error.message || 'Unable to load appointments.'
  } finally {
    loading.value = false
  }
}

async function updateStatus(appointment, newStatus) {
  if (saving.value) return

  saving.value = true
  loadError.value = ''

  try {
    const { error } = await supabase
      .from('appointments')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', appointment.id)

    if (error) throw error

    appointment.databaseStatus = newStatus
    appointment.status = displayStatus(newStatus)

    if (newStatus === 'confirmed') {
      message.value = `${appointment.student}'s appointment has been confirmed.`
    } else if (newStatus === 'completed') {
      message.value = `${appointment.student}'s appointment has been completed.`
    }

  } catch (error) {
    console.error('Error updating appointment:', error)
    message.value = ''
    loadError.value = error.message || 'Unable to update appointment.'
  } finally {
    saving.value = false
  }
}

/* CANCEL FUNCTIONS */

function openCancelConfirmation(appointment) {
  formError.value = ''
  cancelTarget.value = appointment
}

function closeCancelConfirmation() {
  if (saving.value) return

  cancelTarget.value = null
  formError.value = ''
}

async function confirmCancellation() {
  if (!cancelTarget.value || saving.value) return

  saving.value = true
  formError.value = ''

  const appointment = cancelTarget.value

  try {
    const { error } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', appointment.id)

    if (error) throw error

    appointment.databaseStatus = 'cancelled'
    appointment.status = 'Cancelled'

    message.value = `${appointment.id} has been cancelled.`

    cancelTarget.value = null
    formError.value = ''
  } catch (error) {
    console.error('Error cancelling appointment:', error)
    formError.value = error.message || 'Unable to cancel appointment.'
  } finally {
    saving.value = false
  }
}

/* NO-SHOW FUNCTIONS */

function openNoShowConfirmation(appointment) {
  noShowError.value = ''
  noShowTarget.value = appointment
}

function closeNoShowConfirmation() {
  if (saving.value) return

  noShowTarget.value = null
  noShowError.value = ''
}

async function confirmNoShow() {
  if (!noShowTarget.value || saving.value) return

  saving.value = true
  noShowError.value = ''

  const appointment = noShowTarget.value

  try {
    const { error } = await supabase
      .from('appointments')
      .update({
        status: 'no_show',
        updated_at: new Date().toISOString()
      })
      .eq('id', appointment.id)

    if (error) throw error

    appointment.databaseStatus = 'no_show'
    appointment.status = 'No-show'

    message.value =
      `${appointment.student}'s appointment has been marked as No-show.`

    noShowTarget.value = null
    noShowError.value = ''
  } catch (error) {
    console.error('Error marking appointment as No-show:', error)

    noShowError.value =
      error.message || 'Unable to mark appointment as No-show.'
  } finally {
    saving.value = false
  }
}

/* RESCHEDULE FUNCTIONS */

function openReschedule(appointment) {
  rescheduleTarget.value = appointment

  newDate.value = ''
  newTime.value = ''
  formError.value = ''
}

function closeReschedule() {
  if (saving.value) return

  showRescheduleConfirmation.value = false
  confirmationError.value = ''
  rescheduleTarget.value = null
  newDate.value = ''
  newTime.value = ''
  formError.value = ''
}

function saveReschedule() {
  if (!rescheduleTarget.value || !newDate.value || !newTime.value) {
    formError.value = 'Please choose an appointment date and time.'
    return
  }

  if (newDate.value < todayISO) {
    formError.value = 'Please select today or a future date.'
    return
  }

  const appointment = rescheduleTarget.value

  const conflict = appointments.value.some(item =>
    item.id !== appointment.id &&
    item.date === newDate.value &&
    item.time === newTime.value &&
    ['Confirmed', 'Pending'].includes(item.status)
  )

  if (conflict) {
    formError.value =
      'That time is already assigned to another active appointment.'
    return
  }

  formError.value = ''
  confirmationError.value = ''
  showRescheduleConfirmation.value = true
}

function closeRescheduleConfirmation() {
  if (saving.value) return

  showRescheduleConfirmation.value = false
  confirmationError.value = ''
}

async function confirmReschedule() {
  if (
    !rescheduleTarget.value ||
    !newDate.value ||
    !newTime.value ||
    saving.value
  ) {
    return
  }

  saving.value = true
  confirmationError.value = ''

  const appointment = rescheduleTarget.value

  try {
    const scheduledAt = new Date(
      `${newDate.value}T${newTime.value}:00`
    )

    const endAt = new Date(
      scheduledAt.getTime() + 30 * 60 * 1000
    )

    const { error } = await supabase
      .from('appointments')
      .update({
        scheduled_at: scheduledAt.toISOString(),
        end_at: endAt.toISOString(),
        status: 'reschedule_requested',
        reschedule_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', appointment.id)

    if (error) throw error

    appointment.date = newDate.value
    appointment.time = newTime.value
    appointment.databaseStatus = 'reschedule_requested'
    appointment.status = 'Reschedule Requested'

    showRescheduleConfirmation.value = false

    message.value =
      `${appointment.student}'s appointment schedule has been updated.`

    rescheduleTarget.value = null
    newDate.value = ''
    newTime.value = ''
    formError.value = ''
    confirmationError.value = ''
  } catch (error) {
    console.error('Error rescheduling appointment:', error)

    confirmationError.value =
      error.message || 'Unable to reschedule appointment.'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadAppointments()
})
</script>

<style scoped>
/* BASE TYPOGRAPHY */

.appointments-page {
  padding: 3px 2px 24px;
  color: #4c2026;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
}

/* RESCHEDULE PAGE */

.reschedule-page {
  width: 100%;
  color: #4c2026;
}

.reschedule-page > h1 {
  margin: 0;
  color: #50070e;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 22px;
  font-weight: 500;
  line-height: 1.25;
}

.reschedule-subtitle {
  margin: 4px 0 24px;
  color: #4c2026;
  font-size: 11px;
}

.reschedule-form {
  box-sizing: border-box;
  width: calc(100% - 28px);
  max-width: none;
  margin: 0 auto;
  padding: 24px 22px 18px;
  border: 1px solid #8b555b;
  border-radius: 7px;
  background: #f8eeee;
  box-shadow: 0 0 0 2px #e4c9cc;
}

.current-schedule {
  margin-bottom: 22px;
  padding: 15px 13px;
  border-radius: 7px;
  background: #d8b8b8;
  color: #321014;
  font-size: 14px;
}

.reschedule-field {
  margin-top: 14px;
}

.reschedule-field label {
  display: block;
  margin-bottom: 10px;
  color: #4c2026;
  font-size: 13px;
  font-weight: 700;
}

.reschedule-field input,
.reschedule-field select {
  box-sizing: border-box;
  width: 100%;
  min-height: 40px;
  padding: 9px 13px;
  border: 1px solid #a66e75;
  border-radius: 7px;
  background: #f8eeee;
  color: #4c2026;
  font-family: inherit;
  font-size: 13px;
  outline-color: #650b18;
  cursor: pointer;
}

.reschedule-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 11px;
  margin-top: 15px;
}

.reschedule-actions .action-button {
  min-width: 155px;
  min-height: 39px;
}

.reschedule-actions .action-button.primary {
  background: #a77d80;
}

.reschedule-actions .action-button.primary:hover {
  background: #90666a;
}

.reschedule-actions .action-button.secondary {
  border-color: #a66e75;
  background: transparent;
}

@media (max-width: 600px) {
  .reschedule-form {
    width: 100%;
    padding: 18px 15px;
  }

  .reschedule-actions {
    flex-direction: column;
  }

  .reschedule-actions .action-button {
    width: 100%;
  }
}

/* PAGE HEADING */

.page-heading {
  margin: 0 0 22px;
}

.page-heading h1 {
  margin: 0;
  color: #50070e;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 30px;
  font-weight: 500;
  line-height: 1.2;
}

.page-heading p {
  margin: 7px 0 0;
  color: #887477;
  font-size: 15px;
  line-height: 1.5;
}

/* STATUS FILTERS */

.status-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  margin-bottom: 19px;
}

.filter-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: 22px;
  background: #fff;
  color: #75565b;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.filter-button:hover {
  border-color: #e6cdd0;
  background: #f8eeee;
}

.filter-button.active {
  background: #650b18;
  color: #fff;
}

.all-icon {
  font-size: 15px;
}

.filter-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 19px;
  height: 19px;
  padding: 0 4px;
  border-radius: 12px;
  background: #f2e2e3;
  color: #650b18;
  font-size: 11px;
}

.filter-button.active .filter-count {
  background: #fff;
  color: #650b18;
}

/* APPOINTMENT LIST */

.appointment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.appointment-card {
  overflow: hidden;
  border: 1px solid #e6cdd0;
  border-radius: 12px;
  background: #f9f0f0;
  box-shadow: 0 2px 6px rgb(80 7 14 / 3%);
}

.appointment-main {
  padding: 16px 18px;
}

.appointment-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 9px;
}

.appointment-id {
  color: #8b6268;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 18px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.status-badge.pending {
  background: #f6e9b9;
  color: #876818;
}

.status-badge.confirmed {
  background: #dcefe2;
  color: #367653;
}

.status-badge.completed {
  background: #e6e2e2;
  color: #62595a;
}

.status-badge.cancelled {
  background: #f4dfe1;
  color: #a33240;
}

.status-badge.no-show {
  background: #f1e3d7;
  color: #895334;
}

.status-badge.reschedule-requested {
  background: #e8e1f4;
  color: #654a91;
}

.appointment-main h2 {
  margin: 0 0 12px;
  color: #50070e;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
}

.appointment-details {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px 20px;
}

.detail-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #765e62;
  font-size: 13px;
}

.detail-icon {
  color: #8c535b;
  font-size: 15px;
}

.appointment-note {
  margin: 12px 0 0;
  color: #927d81;
  font-size: 13px;
  line-height: 1.5;
}

.appointment-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 15px;
  padding-top: 13px;
  border-top: 1px solid #ead6d8;
}

/* BUTTONS */

.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 8px 13px;
  border: 1px solid transparent;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

.action-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-button.primary {
  background: #650b18;
  color: #fff;
}

.action-button.primary:hover {
  background: #4c0711;
}

.action-button.secondary {
  border-color: #d9b9be;
  background: #fff;
  color: #650b18;
}

.action-button.secondary:hover {
  background: #f3e3e5;
}

.action-button.cancel {
  border-color: #e7c7cb;
  background: #fff;
  color: #a33240;
}

.action-button.cancel:hover {
  background: #f9e7e9;
}

/* EMPTY STATE */

.empty-state {
  padding: 38px 20px;
  border: 1px solid #e6cdd0;
  border-radius: 12px;
  background: #f9f0f0;
  text-align: center;
}

.empty-symbol {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin: 0 auto 13px;
  border-radius: 50%;
  background: #f0dcdf;
  color: #650b18;
  font-size: 22px;
}

.empty-state h2 {
  margin: 0 0 8px;
  color: #50070e;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 20px;
  font-weight: 600;
}

.empty-state p {
  margin: 0 0 16px;
  color: #887477;
  font-size: 14px;
  line-height: 1.5;
}

/* MODALS */

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgb(35 10 13 / 48%);
}

.modal-card {
  width: 100%;
  max-width: 440px;
  padding: 24px;
  border: 1px solid #e6cdd0;
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 18px 55px rgb(0 0 0 / 18%);
}

.modal-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.modal-eyebrow {
  display: block;
  margin-bottom: 8px;
  color: #8c5a60;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.3px;
}

.modal-heading h2 {
  margin: 0;
  color: #50070e;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
}

.close-button {
  border: 0;
  background: transparent;
  color: #887477;
  font-size: 25px;
  cursor: pointer;
}

.modal-description {
  margin: 15px 0;
  color: #887477;
  font-size: 14px;
  line-height: 1.6;
}

.modal-description strong {
  color: #50070e;
}

.modal-card form label {
  display: block;
  margin: 15px 0 7px;
  color: #59353a;
  font-size: 14px;
  font-weight: 700;
}

.modal-card input,
.modal-card select {
  box-sizing: border-box;
  width: 100%;
  padding: 11px;
  border: 1px solid #e2cbd0;
  border-radius: 7px;
  background: #fff;
  color: #4c2026;
  font-family: inherit;
  font-size: 14px;
  outline-color: #9b515a;
}

/* RESCHEDULE CONFIRMATION POPUP */

.reschedule-confirm-card {
  box-sizing: border-box;
  width: 100%;
  max-width: 378px;
  padding: 15px 15px 23px;
  border: none;
  border-radius: 12px;
  background: #fbf0f0;
  box-shadow: 0 12px 35px rgb(35 10 13 / 15%);
}

.reschedule-confirm-heading {
  display: flex;
  align-items: center;
  gap: 14px;
}

.reschedule-warning-icon {
  display: flex;
  flex: 0 0 58px;
  width: 58px;
  height: 47px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: #b17f84;
  color: #650b18;
  font-family: Arial, sans-serif;
  font-size: 27px;
  font-weight: 700;
}

.reschedule-confirm-heading h2 {
  margin: 0;
  color: #390607;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 20px;
  font-weight: 500;
  line-height: 1.3;
}

.reschedule-confirm-details {
  margin: 27px 20px 22px;
  color: #321014;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: 0.2px;
}

.reschedule-confirm-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  margin: 0;
}

.reschedule-confirm-actions .action-button {
  min-height: 35px;
  padding: 8px 19px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
}

.reschedule-confirm-actions .action-button.secondary {
  min-width: 88px;
  border: 1px solid #70464a;
  background: transparent;
  color: #390607;
}

.reschedule-confirm-actions .action-button.primary {
  min-width: 165px;
  border: 1px solid #56090d;
  background: #56090d;
  color: #fff;
}

.reschedule-confirm-actions .action-button.primary:hover {
  background: #720f15;
}

.reschedule-confirm-actions .action-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* CANCEL CONFIRMATION POPUP */

.cancel-confirm-card {
  max-width: 378px;
}

.cancel-confirm-card .reschedule-confirm-details {
  margin: 27px 20px 22px;
  overflow-wrap: anywhere;
}

.cancel-confirm-card .modal-actions {
  margin-top: 0;
}

.cancel-confirm-card .form-error {
  margin: 0 0 16px;
}

/* ERROR MESSAGES */

.form-error,
.load-error {
  margin: 12px 0 0;
  padding: 10px;
  border-radius: 6px;
  background: #fbe9ea;
  color: #a33240;
  font-size: 13px;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 23px;
}

/* FEEDBACK MESSAGE */

.feedback-message {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 1100;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(400px, calc(100vw - 44px));
  padding: 13px 15px;
  border: 1px solid #d5e6d9;
  border-left: 4px solid #367653;
  border-radius: 8px;
  background: #fff;
  color: #345b42;
  box-shadow: 0 7px 24px rgb(45 20 24 / 12%);
  font-size: 14px;
}

.feedback-message > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #e1f0e6;
}

.feedback-message button {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: #66806d;
  font-size: 20px;
  cursor: pointer;
}

.loading-message {
  padding: 20px;
  color: #887477;
  text-align: center;
}

.load-error button {
  margin-left: 8px;
  border: 0;
  background: transparent;
  color: #650b18;
  font-weight: 700;
  cursor: pointer;
}

/* RESPONSIVE */

@media (max-width: 520px) {
  .reschedule-confirm-card {
    max-width: 100%;
    padding: 17px;
  }

  .reschedule-confirm-heading h2 {
    font-size: 18px;
  }

  .reschedule-confirm-details {
    margin: 22px 5px;
  }

  .reschedule-confirm-actions {
    flex-wrap: wrap;
  }
}

@media (max-width: 600px) {
  .page-heading h1 {
    font-size: 25px;
  }

  .page-heading p {
    font-size: 14px;
  }

  .status-filters {
    gap: 6px;
  }

  .filter-button {
    padding: 7px 10px;
    font-size: 12px;
  }

  .appointment-main {
    padding: 14px;
  }

  .appointment-main h2 {
    font-size: 18px;
  }

  .appointment-details {
    flex-direction: column;
    align-items: flex-start;
    gap: 9px;
  }

  .modal-card {
    padding: 19px;
  }

  .modal-heading h2 {
    font-size: 21px;
  }
}
</style>
