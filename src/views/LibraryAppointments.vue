
<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'

import AppointmentFilters from '../components/AppointmentFilters.vue'
import AppointmentTable from '../components/AppointmentTable.vue'
import AppointmentConfirmationModal from '../components/AppointmentConfirmationModal.vue'
import RescheduleAppointmentModal from '../components/RescheduleAppointmentModal.vue'
import RescheduleReviewModal from '../components/RescheduleReviewModal.vue'
import { supabase } from '../lib/Supabase.js'

const LIBRARY_OFFICE_ID = '68828efd-4e49-4312-b4c5-3945793b0e10'
const DEFAULT_APPOINTMENT_DURATION = 30 * 60 * 1000

const search = ref('')
const status = ref('All')
const appointments = ref([])
const isLoading = ref(true)
const errorMessage = ref('')

const libraryServiceIds = ref([])
const serviceNames = ref({})

let appointmentChannel = null
let serviceChannel = null

const showConfirmation = ref(false)
const selectedAppointment = ref(null)
const selectedAction = ref('confirm')
const processing = ref(false)

const showReschedule = ref(false)
const showRescheduleReview = ref(false)
const rescheduleAppointmentData = ref(null)
const rescheduleDate = ref('')
const rescheduleTime = ref('')

function formatDate(value) {
  if (!value) return 'Not available'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  })
}

function formatTime(value) {
  if (!value) return 'Not available'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

function formatStatus(value) {
  const statuses = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    completed: 'Completed',
    no_show: 'No-show',
    reschedule_requested: 'Reschedule Requested',
  }

  return statuses[value?.toLowerCase()] || value || 'Pending'
}

async function loadLibraryServices() {
  const { data, error } = await supabase
    .from('office_services')
    .select('id, name, service_type, is_active')
    .eq('office_id', LIBRARY_OFFICE_ID)

  if (error) throw error

  const services = data || []

  libraryServiceIds.value = services.map(service => service.id)

  serviceNames.value = Object.fromEntries(
    services.map(service => [service.id, service.name]),
  )
}

async function loadAppointments() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    await loadLibraryServices()

    if (libraryServiceIds.value.length === 0) {
      appointments.value = []
      return
    }

    const { data: appointmentRecords, error } = await supabase
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
        created_at,
        updated_at
      `)
      .in('service_id', libraryServiceIds.value)
      .order('scheduled_at', { ascending: false })

    if (error) throw error

    const records = appointmentRecords || []

    const studentIds = [
      ...new Set(records.map(item => item.student_id).filter(Boolean)),
    ]

    let profiles = []

    if (studentIds.length > 0) {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', studentIds)

      if (profileError) throw profileError

      profiles = data || []
    }

    const profileMap = new Map(
      profiles.map(item => [item.id, item.full_name]),
    )

    appointments.value = records.map(item => {
      const serviceName =
        serviceNames.value[item.service_id] || 'Library Service'

      return {
        id: `LIB-${String(item.id).slice(0, 8).toUpperCase()}`,
        appointmentId: item.id,
        student: profileMap.get(item.student_id) || 'Student',
        purpose: item.purpose || serviceName,
        resourceName: serviceName,
        date: formatDate(item.scheduled_at),
        time: formatTime(item.scheduled_at),
        status: formatStatus(item.status),
        scheduledAt: item.scheduled_at,
        startAt: item.scheduled_at,
        endAt: item.end_at,
        studentId: item.student_id,
        serviceId: item.service_id,
        studentNotes: item.student_notes,
        staffNotes: item.staff_notes,
        handledBy: item.handled_by,
      }
    })
  } catch (error) {
    console.error('Error loading Library appointments:', error)
    errorMessage.value =
      error.message || 'Unable to load Library appointments.'
  } finally {
    isLoading.value = false
  }
}

const pendingCount = computed(
  () => appointments.value.filter(a => a.status === 'Pending').length,
)

const confirmedCount = computed(
  () => appointments.value.filter(a => a.status === 'Confirmed').length,
)

const filteredAppointments = computed(() => {
  const term = search.value.trim().toLowerCase()

  return appointments.value.filter(item => {
    const matchesSearch =
      item.student.toLowerCase().includes(term) ||
      item.id.toLowerCase().includes(term) ||
      item.purpose.toLowerCase().includes(term) ||
      item.resourceName.toLowerCase().includes(term)

    const matchesStatus =
      status.value === 'All' || item.status === status.value

    return matchesSearch && matchesStatus
  })
})

async function updateAppointment(appointmentId, changes) {
  const updateData = {
    ...changes,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('appointments')
    .update(updateData)
    .eq('id', appointmentId)
    .in('service_id', libraryServiceIds.value)
    .select('id')
    .maybeSingle()

  if (error) throw error

  if (!data) {
    throw new Error(
      'No appointment was updated. Check the appointment ID and Supabase UPDATE RLS policy.',
    )
  }

  await loadAppointments()
}

function openConfirmation(appointment, action) {
  if (processing.value) return

  selectedAppointment.value = appointment
  selectedAction.value = action
  showConfirmation.value = true
}

function closeConfirmation() {
  if (processing.value) return

  showConfirmation.value = false
  selectedAppointment.value = null
}

async function confirmAction(action) {
  if (processing.value || !selectedAppointment.value) return

  const newStatus = {
    confirm: 'confirmed',
    complete: 'completed',
    cancel: 'cancelled',
    'no-show': 'no_show',
  }[action]

  if (!newStatus) {
    window.alert('Invalid appointment action.')
    return
  }

  processing.value = true

  try {
    await updateAppointment(
      selectedAppointment.value.appointmentId,
      { status: newStatus },
    )

    showConfirmation.value = false
    selectedAppointment.value = null

    window.alert(
      `Appointment successfully ${
        action === 'confirm'
          ? 'approved'
          : action === 'complete'
            ? 'completed'
            : action === 'cancel'
              ? 'cancelled'
              : 'marked as no-show'
      }!`,
    )
  } catch (error) {
    console.error('Error updating appointment:', error)
    window.alert(error.message || 'Unable to update appointment.')
  } finally {
    processing.value = false
  }
}

function rescheduleAppointment(appointment) {
  rescheduleAppointmentData.value = appointment
  rescheduleDate.value = ''
  rescheduleTime.value = ''
  showRescheduleReview.value = false
  showReschedule.value = true
}

function reviewReschedule(changes) {
  rescheduleAppointmentData.value = changes.appointment
  rescheduleDate.value = changes.date
  rescheduleTime.value = changes.time

  showReschedule.value = false
  showRescheduleReview.value = true
}

function closeReschedule() {
  showReschedule.value = false
  showRescheduleReview.value = false
  rescheduleAppointmentData.value = null
  rescheduleDate.value = ''
  rescheduleTime.value = ''
}

function closeRescheduleReview() {
  showRescheduleReview.value = false
  showReschedule.value = true
}

function createNewSchedule(dateValue, timeValue) {
  const [year, month, day] = dateValue.split('-').map(Number)

  const timeMatch = timeValue.match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
  )

  if (!timeMatch) {
    throw new Error('Invalid appointment time.')
  }

  let hours = Number(timeMatch[1])
  const minutes = Number(timeMatch[2])
  const period = timeMatch[3].toUpperCase()

  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0

  const date = new Date(year, month - 1, day, hours, minutes, 0, 0)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error('Invalid appointment date.')
  }

  return date
}

async function confirmReschedule() {
  const appointment = rescheduleAppointmentData.value

  if (!appointment || !rescheduleDate.value || !rescheduleTime.value) {
    window.alert('Please select a new date and time.')
    return
  }

  try {
    const newStart = createNewSchedule(
      rescheduleDate.value,
      rescheduleTime.value,
    )

    if (newStart <= new Date()) {
      window.alert('Please select a future date and time.')
      return
    }

    const oldStart = new Date(appointment.scheduledAt)
    const oldEnd = appointment.endAt
      ? new Date(appointment.endAt)
      : null

    let duration = DEFAULT_APPOINTMENT_DURATION

    if (Number.isFinite(oldStart.getTime()) && oldEnd) {
      const originalDuration = oldEnd.getTime() - oldStart.getTime()

      if (Number.isFinite(originalDuration) && originalDuration > 0) {
        duration = originalDuration
      }
    }

    const newEnd = new Date(newStart.getTime() + duration)

    await updateAppointment(appointment.appointmentId, {
      scheduled_at: newStart.toISOString(),
      end_at: newEnd.toISOString(),
      status: 'pending',
    })

    closeReschedule()
    window.alert('Appointment successfully rescheduled.')
  } catch (error) {
    console.error('Error rescheduling appointment:', error)
    window.alert(error.message || 'Unable to reschedule appointment.')
  }
}

function viewAppointment(appointment) {
  window.alert(
    `Appointment: ${appointment.id}\n` +
    `Student: ${appointment.student}\n` +
    `Purpose: ${appointment.purpose}\n` +
    `Service: ${appointment.resourceName}\n` +
    `Date: ${appointment.date}\n` +
    `Time: ${appointment.time}\n` +
    `Status: ${appointment.status}\n` +
    `Student Notes: ${appointment.studentNotes || 'None'}\n` +
    `Staff Notes: ${appointment.staffNotes || 'None'}`,
  )
}

onMounted(() => {
  loadAppointments()

  appointmentChannel = supabase
    .channel('library-appointments-realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'appointments',
      },
      () => loadAppointments(),
    )
    .subscribe()

  serviceChannel = supabase
    .channel('library-services-realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'office_services',
        filter: `office_id=eq.${LIBRARY_OFFICE_ID}`,
      },
      () => loadAppointments(),
    )
    .subscribe()
})

onUnmounted(() => {
  if (appointmentChannel) {
    supabase.removeChannel(appointmentChannel)
    appointmentChannel = null
  }

  if (serviceChannel) {
    supabase.removeChannel(serviceChannel)
    serviceChannel = null
  }
})
</script>

<template>
  <main class="appointments-page">
    <header class="page-heading">
      <div>
        <p class="eyebrow">LIBRARY PORTAL / APPOINTMENTS</p>
        <h1>Appointments</h1>
        <p>Confirm, reschedule and complete Library Appointments</p>
      </div>

      <span class="total">
        {{ filteredAppointments.length }} appointments
      </span>
    </header>

    <section class="summary">
      <article>
        <span>Total Appointments</span>
        <strong>{{ appointments.length }}</strong>
      </article>

      <article>
        <span>Pending</span>
        <strong>{{ pendingCount }}</strong>
      </article>

      <article>
        <span>Confirmed</span>
        <strong>{{ confirmedCount }}</strong>
      </article>
    </section>

    <section class="records">
      <h2>Appointment Records</h2>

      <AppointmentFilters
        v-model:search="search"
        v-model:status="status"
      />

      <p v-if="isLoading" class="message">
        Loading Library appointments...
      </p>

      <p v-else-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </p>

      <p v-else-if="appointments.length === 0" class="message">
        No Library appointments found.
      </p>

      <p v-else-if="filteredAppointments.length === 0" class="message">
        No appointments match your search or selected filter.
      </p>

      <AppointmentTable
        v-if="!isLoading && !errorMessage && filteredAppointments.length > 0"
        :appointments="filteredAppointments"
        @view="viewAppointment"
        @confirm="openConfirmation($event, 'confirm')"
        @complete="openConfirmation($event, 'complete')"
        @cancel="openConfirmation($event, 'cancel')"
        @reschedule="rescheduleAppointment"
      />
    </section>

    <AppointmentConfirmationModal
      :show="showConfirmation"
      :action="selectedAction"
      :appointment="selectedAppointment || {}"
      :processing="processing"
      @close="closeConfirmation"
      @confirm="confirmAction"
    />

    <RescheduleAppointmentModal
      :show="showReschedule"
      :appointment="rescheduleAppointmentData || {}"
      @close="closeReschedule"
      @review="reviewReschedule"
    />

    <RescheduleReviewModal
      :show="showRescheduleReview"
      :appointment="rescheduleAppointmentData || {}"
      :new-date="rescheduleDate"
      :new-time="rescheduleTime"
      @close="closeRescheduleReview"
      @confirm="confirmReschedule"
    />
  </main>
</template>

<style scoped>
.appointments-page {
  min-width: 0;
  padding: 24px;
  color: #390607;
}

.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #765456;
  font-size: 11px;
  letter-spacing: 1px;
}

h1 {
  margin: 0 0 8px;
  font: 30px Georgia, serif;
}

.page-heading p:last-child {
  margin: 0;
  font-size: 13px;
}

.total {
  padding: 9px 14px;
  border-radius: 20px;
  background: #f1e2e1;
  font-size: 12px;
}

.summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.summary article {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  border: 1px solid #b98b8c;
  border-radius: 14px;
  background: #f8eeee;
}

.summary span {
  font-size: 12px;
  color: #765456;
}

.summary strong {
  font: bold 28px Georgia, serif;
}

.records {
  padding: 20px;
  border: 1px solid #b98b8c;
  border-radius: 16px;
  background: #f8eeee;
}

.records h2 {
  margin: 0 0 18px;
  font: 23px Georgia, serif;
}

.message {
  margin: 24px 0;
  color: #765456;
  font-size: 13px;
  text-align: center;
}

.error-message {
  margin: 24px 0;
  color: #b00020;
  font-size: 13px;
  text-align: center;
}

@media (max-width: 700px) {
  .appointments-page {
    padding: 16px;
  }

  .summary {
    grid-template-columns: 1fr;
  }

  .records {
    padding: 12px;
  }
}
</style>
