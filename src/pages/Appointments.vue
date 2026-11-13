
<script setup>
import {
  ref,
  computed,
  onMounted,
  onUnmounted
} from 'vue'

import { supabase } from '../lib/Supabase.js'

const emit = defineEmits(['reschedule'])

// OSA SERVICE IDS
const OSA_SERVICE_IDS = [
  '5c2ab6fc-5f24-4573-896a-f5a11ad6625e',
  '65a94572-bce2-460f-b3e8-2ed568ee7bbf',
  'e5121b34-a6d2-4370-a023-5153a73c97f8'
]

// APPOINTMENT FILTERS
const filters = [
  'All',
  'Pending',
  'Confirmed',
  'Completed',
  'Cancelled',
  'No-Show'
]

const appointments = ref([])
const selectedFilter = ref('All')

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')

const showModal = ref(false)
const selectedAppointment = ref(null)
const selectedAction = ref('')

let appointmentSubscription = null
let isFetching = false
let refreshAgain = false
let isMounted = false

// MODAL CONTENT
const modalContent = computed(() => {
  const content = {
    confirm: {
      title: 'Confirm this appointment?',
      button: 'Confirm appointment',
      tone: 'maroon'
    },
    readyForPickup: {
      title: 'Mark as Ready for Pick Up?',
      button: 'Confirm Ready for Pick Up',
      tone: 'maroon'
    },
    completed: {
      title: 'Complete this appointment?',
      button: 'Confirm completed',
      tone: 'maroon'
    },
    cancel: {
      title: 'Cancel this appointment?',
      button: 'Confirm Cancelled',
      tone: 'red'
    },
    noShow: {
      title: 'Mark as No-Show?',
      button: 'Confirm no-show',
      tone: 'red'
    }
  }

  return content[selectedAction.value] || content.confirm
})

// FILTER APPOINTMENTS
const filteredAppointments = computed(() => {
  if (selectedFilter.value === 'All') {
    return appointments.value
  }

  return appointments.value.filter(
    appointment =>
      appointment.displayStatus === selectedFilter.value
  )
})

// FORMAT STATUS
function formatStatus(status) {
  const statusMap = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    ready_for_pickup: 'Ready for Pick Up',
    reschedule_requested: 'Reschedule Requested',
    completed: 'Completed',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
    no_show: 'No-Show'
  }

  return statusMap[status] || status
}

// FORMAT DATE
function formatDate(date) {
  if (!date) return 'Date not set'

  const parsedDate = new Date(date)

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Date not set'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila'
  }).format(parsedDate)
}

// FORMAT TIME
function formatTime(time) {
  if (!time) return 'Time not set'

  const parsedDate = new Date(time)

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Time not set'
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila'
  }).format(parsedDate)
}

// STUDENT INFORMATION
function getStudentName(appointment) {
  return appointment?.student?.full_name || 'Unknown Student'
}

function getStudentNumber(appointment) {
  return appointment?.student?.student_id || 'No student number'
}

function getServiceName(appointment) {
  return appointment?.service?.name || 'Unknown Service'
}

// MAP APPOINTMENT DATA
function mapAppointment(row) {
  return {
    ...row,
    date: row.scheduled_at,
    time: row.scheduled_at,
    studentId: row.student?.student_id || 'No student number',
    displayStatus: formatStatus(row.status)
  }
}

// FETCH ALL OSA APPOINTMENTS
async function loadAppointments() {
  if (!isMounted) return

  if (isFetching) {
    refreshAgain = true
    return
  }

  isFetching = true

  try {
    do {
      refreshAgain = false

      loading.value = appointments.value.length === 0
      errorMessage.value = ''

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
          handled_by,
          reschedule_requested_at,
          created_at,
          updated_at,
          student:profiles!appointments_student_id_fkey (
            id,
            student_id,
            full_name,
            university_email,
            program,
            year_level
          ),
          service:office_services!appointments_service_id_fkey (
            id,
            name,
            description,
            service_type,
            office_id
          )
        `)
        .in('service_id', OSA_SERVICE_IDS)
        .order('scheduled_at', { ascending: true })

      if (error) throw error

      appointments.value = (data || []).map(mapAppointment)

      console.log(
        'OSA APPOINTMENTS UPDATED:',
        appointments.value
      )

    } while (refreshAgain && isMounted)

  } catch (error) {
    console.error('Error loading OSA appointments:', error)

    errorMessage.value =
      error.message || 'Unable to load appointments from Supabase.'

  } finally {
    isFetching = false
    loading.value = false
  }
}

// OPEN ACTION MODAL
function openModal(appointment, action) {
  selectedAppointment.value = appointment
  selectedAction.value = action
  showModal.value = true
}

// CLOSE ACTION MODAL
function closeModal() {
  if (saving.value) return

  showModal.value = false
  selectedAppointment.value = null
  selectedAction.value = ''
}

// UPDATE APPOINTMENT STATUS
async function confirmAction() {
  if (!selectedAppointment.value || saving.value) return

  const statusMap = {
    confirm: 'confirmed',
    readyForPickup: 'ready_for_pickup',
    completed: 'completed',
    cancel: 'cancelled',
    noShow: 'no_show'
  }

  const newStatus = statusMap[selectedAction.value]

  if (!newStatus) return

  saving.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
      .from('appointments')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedAppointment.value.id)
      .in('service_id', OSA_SERVICE_IDS)
      .select('id')
      .maybeSingle()

    if (error) throw error

    if (!data) {
      throw new Error(
        'Appointment was not updated. Please check your office permissions.'
      )
    }

    showModal.value = false
    selectedAppointment.value = null
    selectedAction.value = ''

    await loadAppointments()

  } catch (error) {
    console.error('Error updating appointment:', error)

    errorMessage.value =
      error.message || 'Unable to update appointment. Please try again.'

  } finally {
    saving.value = false
  }
}

// SEND APPOINTMENT TO RESCHEDULE PAGE
function rescheduleAppointment(appointment) {
  if (!appointment?.id) {
    console.error('Cannot reschedule appointment without an ID.')
    return
  }

  emit('reschedule', {
    ...appointment,
    date: appointment.scheduled_at,
    time: appointment.scheduled_at,
    student: getStudentName(appointment),
    studentId: getStudentNumber(appointment),
    service: getServiceName(appointment),
    status: appointment.displayStatus
  })
}

// SUPABASE REALTIME SUBSCRIPTION
function subscribeToAppointments() {
  if (appointmentSubscription) return

  appointmentSubscription = supabase
    .channel('osa-appointments-realtime')

    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'appointments'
      },
      (payload) => {
        console.log(
          'OSA appointment database change:',
          payload.eventType
        )

        loadAppointments()
      }
    )

    .subscribe((status, error) => {
      console.log(
        'OSA appointment realtime status:',
        status
      )

      if (error) {
        console.error(
          'OSA appointment realtime error:',
          error
        )
      }

      if (status === 'SUBSCRIBED') {
        loadAppointments()
      }
    })
}

// INITIALIZATION
onMounted(() => {
  isMounted = true

  subscribeToAppointments()
  loadAppointments()
})

// CLEANUP
onUnmounted(() => {
  isMounted = false

  if (appointmentSubscription) {
    supabase.removeChannel(appointmentSubscription)
    appointmentSubscription = null
  }
})
</script>

<template>
  <section class="appointments-page">

    <!-- PAGE HEADING -->
    <header class="appointments-heading">
      <div>
        <h1>APPOINTMENTS</h1>
        <p>
          Confirm, reschedule and complete Office of Student Affairs appointments.
        </p>
      </div>
    </header>

    <!-- APPOINTMENT FILTERS -->
    <nav class="appointment-filters">

      <button
        v-for="filter in filters"
        :key="filter"
        type="button"
        class="filter-button"
        :class="{ active: selectedFilter === filter }"
        @click="selectedFilter = filter"
      >
        {{ filter }}
      </button>

      <button
        type="button"
        class="refresh-button"
        :disabled="loading"
        @click="loadAppointments"
      >
        {{ loading ? 'Loading...' : 'Refresh' }}
      </button>

    </nav>

    <!-- ERROR -->
    <div v-if="errorMessage" class="error-state">
      <p>{{ errorMessage }}</p>

      <button
        type="button"
        class="retry-button"
        @click="loadAppointments"
      >
        Try Again
      </button>
    </div>

    <!-- LOADING -->
    <div
      v-else-if="loading && appointments.length === 0"
      class="empty-state"
    >
      Loading appointments from Supabase...
    </div>

    <!-- APPOINTMENT LIST -->
    <div v-else class="appointment-list">

      <article
        v-for="appointment in filteredAppointments"
        :key="appointment.id"
        class="appointment-card"
      >

        <!-- DATE AND TIME -->
        <div class="appointment-date">
          <span>
            {{ formatDate(appointment.scheduled_at) }}
          </span>

          <span>
            {{ formatTime(appointment.scheduled_at) }}
          </span>
        </div>

        <!-- STUDENT AND SERVICE -->
        <h2 class="appointment-title">
          {{ getStudentName(appointment) }} ·
          {{ getServiceName(appointment) }}
        </h2>

        <!-- REFERENCE AND STATUS -->
        <div class="appointment-reference-row">

          <p class="appointment-reference">
            {{ getStudentNumber(appointment) }} ·
            {{ appointment.id }}
          </p>

          <div class="appointment-status">
            <span
              class="status-badge"
              :class="appointment.displayStatus.toLowerCase().replace(/[^a-z]+/g, '-')"
            >
              {{ appointment.displayStatus }}
            </span>
          </div>

        </div>

        <!-- PURPOSE -->
        <p
          v-if="appointment.purpose"
          class="appointment-purpose"
        >
          Purpose: {{ appointment.purpose }}
        </p>

        <!-- ACTION BUTTONS -->
        <div class="appointment-actions">

          <!-- 1. CONFIRM: ONLY DARK MAROON BUTTON -->
          <button
            v-if="appointment.status === 'pending'"
            type="button"
            class="action-button primary-action"
            @click="openModal(appointment, 'confirm')"
          >
            Confirm
          </button>

          <!-- 2. RESCHEDULE -->
          <button
            v-if="['pending', 'confirmed'].includes(appointment.status)"
            type="button"
            class="action-button"
            @click="rescheduleAppointment(appointment)"
          >
            Reschedule
          </button>

          <!-- 3. MARK COMPLETED -->
          <button
            v-if="['pending', 'confirmed'].includes(appointment.status)"
            type="button"
            class="action-button"
            @click="openModal(appointment, 'completed')"
          >
            Mark Completed
          </button>

          <!-- 4. READY FOR PICK UP: NORMAL BUTTON -->
          <button
            v-if="['pending', 'confirmed'].includes(appointment.status)"
            type="button"
            class="action-button"
            @click="openModal(appointment, 'readyForPickup')"
          >
            Ready for Pick Up
          </button>

          <!-- 5. CANCEL -->
          <button
            v-if="['pending', 'confirmed'].includes(appointment.status)"
            type="button"
            class="action-button"
            @click="openModal(appointment, 'cancel')"
          >
            Cancel
          </button>

          <!-- 6. NO SHOW -->
          <button
            v-if="['pending', 'confirmed'].includes(appointment.status)"
            type="button"
            class="action-button"
            @click="openModal(appointment, 'noShow')"
          >
            No-Show
          </button>

        </div>

      </article>

      <!-- EMPTY -->
      <div
        v-if="filteredAppointments.length === 0"
        class="empty-state"
      >
        No appointments found for this status.
      </div>

    </div>

    <!-- ACTION MODAL -->
    <Teleport to="body">
      <div
        v-if="showModal && selectedAppointment"
        class="modal-overlay"
        @click.self="closeModal"
        @keydown.esc="closeModal"
      >

        <section
          class="action-modal"
          role="dialog"
          aria-modal="true"
          :aria-label="modalContent.title"
        >

          <div class="modal-heading">

            <div class="warning-icon" aria-hidden="true">
              <span>!</span>
            </div>

            <h2>{{ modalContent.title }}</h2>

          </div>

          <p class="modal-description">
            {{ getStudentName(selectedAppointment) }} ·
            {{ getServiceName(selectedAppointment) }} ·
            {{ formatDate(selectedAppointment.scheduled_at) }} at
            {{ formatTime(selectedAppointment.scheduled_at) }}
          </p>

          <div class="modal-actions">

            <button
              type="button"
              class="modal-button modal-back-button"
              :disabled="saving"
              @click="closeModal"
            >
              Go Back
            </button>

            <button
              type="button"
              class="modal-button modal-confirm-button"
              :class="`tone-${modalContent.tone}`"
              :disabled="saving"
              @click="confirmAction"
            >
              {{ saving ? 'Saving...' : modalContent.button }}
            </button>

          </div>

        </section>

      </div>
    </Teleport>

  </section>
</template>

<style scoped>
.appointments-page {
  width: 100%;
  min-height: 100%;
  color: #35080b;
}

/* PAGE HEADING */
.appointments-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  margin: 23px 8px 28px;
}

.appointments-heading h1 {
  margin: 0;
  color: #59080e;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 22px;
  font-weight: 700;
}

.appointments-heading p {
  margin: 7px 0 0;
  color: #927879;
  font-family: Arial, sans-serif;
  font-size: 13px;
  line-height: 1.5;
}

/* FILTERS */
.appointment-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin: 0 28px 12px;
}

.filter-button,
.refresh-button,
.retry-button {
  padding: 8px 13px;
  border: 1px solid #7a252b;
  border-radius: 20px;
  background: transparent;
  color: #39090d;
  font-family: Arial, sans-serif;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.filter-button {
  min-height: 33px;
  padding: 7px 14px;
  white-space: nowrap;
}

.filter-button:hover,
.filter-button.active {
  background: #59080e;
  color: #ffffff;
}

.refresh-button {
  min-height: 33px;
  margin-left: auto;
  padding: 7px 14px;
  white-space: nowrap;
  flex-shrink: 0;
}

.refresh-button:hover,
.retry-button:hover {
  background: #59080e;
  color: white;
}

.refresh-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* APPOINTMENT LIST */
.appointment-list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding: 0 15px 25px;
}

.appointment-card {
  width: 100%;
  max-width: 600px;
  padding: 14px 16px 17px;
  border: 1px solid #e2c6c7;
  border-radius: 14px;
  background: #f8eeee;
}

/* DATE AND TIME */
.appointment-date {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 6px;
  color: #a18485;
  font-family: Arial, sans-serif;
  font-size: 10px;
  text-transform: uppercase;
}

/* STUDENT AND SERVICE */
.appointment-title {
  margin: 0 0 8px;
  color: #321014;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 12px;
  font-weight: 700;
}

/* REFERENCE AND STATUS ALIGNMENT */
.appointment-reference-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.appointment-reference {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: #a18485;
  font-family: Arial, sans-serif;
  font-size: 10px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

/* STATUS BADGE */
.appointment-status {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 11px;
  border-radius: 12px;
  background: #ead5d6;
  color: #59080e;
  font-family: Arial, sans-serif;
  font-size: 9px;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
}

.status-badge.pending {
  background: #f5df80;
  color: #765500;
}

.status-badge.confirmed,
.status-badge.completed,
.status-badge.ready-for-pick-up {
  background: #d8ead9;
  color: #285b31;
}

.status-badge.cancelled,
.status-badge.no-show,
.status-badge.rejected {
  background: #f3dada;
  color: #a20f19;
}

.status-badge.reschedule-requested {
  background: #f7e8c8;
  color: #805515;
}

/* PURPOSE */
.appointment-purpose {
  margin: 9px 0 0;
  color: #76595b;
  font-family: Arial, sans-serif;
  font-size: 11px;
  overflow-wrap: anywhere;
}

/* ACTION BUTTONS */
.appointment-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 17px;
}

.action-button {
  min-height: 21px;
  padding: 4px 8px;
  border: 1px solid #7c363b;
  border-radius: 12px;
  background: transparent;
  color: #39090d;
  font-family: Arial, sans-serif;
  font-size: 9px;
  white-space: nowrap;
  cursor: pointer;
}

.action-button:hover {
  background: #ead5d6;
}

.primary-action {
  background: #59080e;
  color: #ffffff;
}

.primary-action:hover {
  background: #760d15;
  color: #ffffff;
}

/* EMPTY AND ERROR */
.empty-state,
.error-state {
  width: 100%;
  max-width: 600px;
  padding: 30px 20px;
  border: 1px solid #e2c6c7;
  border-radius: 12px;
  color: #927879;
  font-family: Arial, sans-serif;
  font-size: 13px;
  text-align: center;
}

.error-state {
  border-color: #e8baba;
  background: #fff5f5;
  color: #a20f19;
}

.error-state p {
  overflow-wrap: anywhere;
}

/* ACTION MODAL */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  padding: 20px;
  background: rgb(25 12 13 / 42%);
}

.action-modal {
  width: 100%;
  max-width: 400px;
  padding: 16px;
  border: 1px solid #ead9da;
  border-radius: 13px;
  background: #f8eeee;
  box-shadow: 0 12px 35px rgb(0 0 0 / 12%);
}

.modal-heading {
  display: flex;
  align-items: center;
  gap: 17px;
}

.warning-icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 62px;
  height: 50px;
  border-radius: 11px;
  background: #a77b7f;
  color: #ffffff;
}

.warning-icon span {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #650c14;
  font-family: Arial, sans-serif;
  font-size: 23px;
  font-weight: 700;
  line-height: 1;
}

.modal-heading h2 {
  margin: 0;
  color: #35080b;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 21px;
  font-weight: 700;
  line-height: 1.35;
}

.modal-description {
  margin: 18px 16px 26px;
  color: #351a1c;
  font-family: Arial, sans-serif;
  font-size: 15px;
  letter-spacing: 0.3px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.modal-actions {
  display: flex;
  gap: 7px;
  width: 100%;
}

.modal-button {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 37px;
  padding: 8px 10px;
  border: 1px solid #6e3d40;
  border-radius: 13px;
  font-family: Arial, sans-serif;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  cursor: pointer;
}

.modal-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-back-button {
  background: transparent;
  color: #35080b;
}

.modal-back-button:hover {
  background: #efdfdf;
}

.modal-confirm-button.tone-maroon {
  border-color: #59080e;
  background: #59080e;
  color: #ffffff;
}

.modal-confirm-button.tone-maroon:hover {
  background: #760d15;
}

.modal-confirm-button.tone-red {
  border-color: #d00000;
  background: #d00000;
  color: #ffffff;
}

.modal-confirm-button.tone-red:hover {
  background: #b90000;
}

/* RESPONSIVE */
@media (max-width: 700px) {
  .appointments-heading {
    margin: 15px 0 22px;
  }

  .appointment-filters {
    gap: 7px;
    margin: 0 0 22px;
  }

  .appointment-list {
    padding: 0 0 20px;
  }

  .appointment-card {
    max-width: 100%;
  }
}

@media (max-width: 420px) {
  .appointments-heading {
    align-items: flex-start;
  }

  .appointment-filters {
    align-items: center;
  }

  .refresh-button {
    flex-shrink: 0;
  }

  .filter-button {
    padding: 7px 10px;
    font-size: 11px;
  }

  .appointment-reference-row {
    gap: 7px;
  }

  .appointment-reference {
    font-size: 9px;
  }

  .status-badge {
    padding: 5px 8px;
    font-size: 8px;
  }

  .action-modal {
    padding: 14px;
  }

  .modal-heading {
    gap: 11px;
  }

  .warning-icon {
    width: 48px;
    height: 45px;
  }

  .modal-heading h2 {
    font-size: 18px;
  }

  .modal-description {
    margin: 18px 5px 22px;
    font-size: 13px;
  }

  .modal-button {
    padding: 8px 6px;
    font-size: 10px;
  }
}
</style>
