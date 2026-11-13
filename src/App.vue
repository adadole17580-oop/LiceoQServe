
<script setup>
import {
  ref,
  computed,
  onMounted,
  onUnmounted
} from 'vue'

import { supabase } from './lib/supabase.js'

import Header from './components/Header.vue'
import Sidebar from './components/Sidebar.vue'
import LoginView from './views/LoginView.vue'

import Dashboard from './pages/Dashboard.vue'
import Appointments from './pages/Appointments.vue'
import Requests from './pages/Requests.vue'
import Students from './pages/Students.vue'
import Notifications from './pages/Notifications.vue'
import History from './pages/History.vue'
import Schedule from './pages/Schedule.vue'
import Profile from './pages/Profile.vue'
import RescheduleAppointment from './pages/RescheduleAppointment.vue'

// =====================================================
// AUTHENTICATION
// =====================================================

const isLoggedIn = ref(false)
const isCheckingSession = ref(true)
const currentUser = ref(null)

const showLogoutConfirm = ref(false)

const activePage = ref('Dashboard')
const selectedAppointment = ref(null)
const appointmentsVersion = ref(0)

const requestFilter = ref('All')

// RESCHEDULE POPUP
const showRescheduleResult = ref(false)
const rescheduleResultTitle = ref('')
const rescheduleResultMessage = ref('')
const rescheduleResultType = ref('success')
const isSavingReschedule = ref(false)

let authListener = null
let appointmentNotificationChannel = null
let notificationChannelUserId = null

// =====================================================
// OSA SERVICE IDS
// =====================================================

const OSA_SERVICE_IDS = [
  '5c2ab6fc-5f24-4573-896a-f5a11ad6625e',
  '65a94572-bce2-460f-b3e8-2ed568ee7bbf',
  'e5121b34-a6d2-4370-a023-5153a73c97f8'
]

// Prevent simultaneous duplicate notification creation.
const notificationsBeingCreated = new Set()

// =====================================================
// PAGE COMPONENTS
// =====================================================

const pages = {
  Dashboard,
  Appointments,
  Students,
  Notifications,
  History,
  Schedule,
  Profile
}

const currentPage = computed(() => {
  if (activePage.value === 'RescheduleAppointment') {
    return RescheduleAppointment
  }

  return pages[activePage.value] || Dashboard
})

// =====================================================
// NAVIGATION
// =====================================================

function navigateToPage(page, filter = 'All') {
  activePage.value = page

  if (page === 'Request') {
    selectedAppointment.value = null
    requestFilter.value = filter
  } else {
    requestFilter.value = 'All'
  }
}

// =====================================================
// RESCHEDULE APPOINTMENT
// =====================================================

function openReschedule(appointment) {
  if (!appointment?.id) {
    console.error('Missing appointment ID:', appointment)
    return
  }

  selectedAppointment.value = { ...appointment }
  activePage.value = 'RescheduleAppointment'
}

async function saveRescheduledAppointment(updatedAppointment) {
  if (isSavingReschedule.value) return

  if (!updatedAppointment?.id) {
    rescheduleResultType.value = 'error'
    rescheduleResultTitle.value = 'Appointment Not Found'
    rescheduleResultMessage.value =
      'The selected appointment ID is missing. Please return to the appointment list and try again.'

    showRescheduleResult.value = true
    return
  }

  if (!updatedAppointment.date || !updatedAppointment.time) {
    rescheduleResultType.value = 'error'
    rescheduleResultTitle.value = 'Incomplete Schedule'
    rescheduleResultMessage.value =
      'Please select a new appointment date and time.'

    showRescheduleResult.value = true
    return
  }

  isSavingReschedule.value = true

  try {
    // Convert Philippine local date and time to ISO timestamp.
    const scheduledDate = new Date(
      `${updatedAppointment.date}T${updatedAppointment.time}:00+08:00`
    )

    if (Number.isNaN(scheduledDate.getTime())) {
      throw new Error('Invalid appointment date or time.')
    }

    const newScheduledAt = scheduledDate.toISOString()

    // Update the actual appointment in Supabase.
    const { data, error } = await supabase
      .from('appointments')
      .update({
        scheduled_at: newScheduledAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', updatedAppointment.id)
      .in('service_id', OSA_SERVICE_IDS)
      .select('id, scheduled_at, status')
      .maybeSingle()

    if (error) throw error

    if (!data) {
      throw new Error(
        'The appointment was not updated. Please check your account permissions or verify that the appointment still exists.'
      )
    }

    console.log(
      'APPOINTMENT SUCCESSFULLY RESCHEDULED:',
      data
    )

    // Return to Appointments.
    selectedAppointment.value = null
    activePage.value = 'Appointments'
    appointmentsVersion.value++

    // Show custom success popup.
    rescheduleResultType.value = 'success'
    rescheduleResultTitle.value = 'Appointment Rescheduled!'
    rescheduleResultMessage.value =
      'The appointment schedule has been successfully updated.'

    showRescheduleResult.value = true

  } catch (error) {
    console.error(
      'Unable to reschedule appointment:',
      error
    )

    rescheduleResultType.value = 'error'
    rescheduleResultTitle.value = 'Reschedule Failed'
    rescheduleResultMessage.value =
      error.message || 'Unable to update the appointment. Please try again.'

    showRescheduleResult.value = true

  } finally {
    isSavingReschedule.value = false
  }
}

function closeRescheduleResult() {
  showRescheduleResult.value = false
}

function cancelReschedule() {
  if (isSavingReschedule.value) return

  selectedAppointment.value = null

  sessionStorage.removeItem('rescheduleAppointmentId')

  activePage.value = 'Appointments'
}

// =====================================================
// APPOINTMENT NOTIFICATION SYSTEM
// =====================================================

async function createAppointmentNotification(appointmentId, userId) {
  const lockKey = `${userId}:${appointmentId}`

  if (notificationsBeingCreated.has(lockKey)) {
    return
  }

  notificationsBeingCreated.add(lockKey)

  try {
    const { data: appointment, error: appointmentError } =
      await supabase
        .from('appointments')
        .select(`
          id,
          student_id,
          service_id,
          scheduled_at,
          purpose,
          status,
          student:profiles!appointments_student_id_fkey (
            full_name,
            student_id
          ),
          service:office_services!appointments_service_id_fkey (
            name
          )
        `)
        .eq('id', appointmentId)
        .in('service_id', OSA_SERVICE_IDS)
        .maybeSingle()

    if (appointmentError) throw appointmentError

    if (!appointment) return

    if (appointment.status !== 'pending') return

    const { data: existing, error: existingError } =
      await supabase
        .from('notifications')
        .select('id')
        .eq('recipient_id', userId)
        .eq('category', 'appointment')
        .eq('related_id', appointment.id)
        .limit(1)
        .maybeSingle()

    if (existingError) throw existingError

    if (existing) {
      console.log(
        'Appointment notification already exists:',
        appointment.id
      )
      return
    }

    const studentName =
      appointment.student?.full_name || 'A student'

    const serviceName =
      appointment.service?.name || 'OSA Appointment'

    const appointmentDate = appointment.scheduled_at
      ? new Date(appointment.scheduled_at).toLocaleString('en-PH', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Manila'
        })
      : 'Date not available'

    const message =
      `${studentName} submitted a new appointment for ${serviceName}. ` +
      `Appointment schedule: ${appointmentDate}.`

    const { error: insertError } = await supabase
      .from('notifications')
      .insert({
        recipient_id: userId,
        title: 'New Appointment Received',
        message,
        category: 'appointment',
        related_id: appointment.id,
        is_read: false
      })

    if (insertError) throw insertError

    console.log(
      'NEW APPOINTMENT NOTIFICATION CREATED:',
      appointment.id
    )

  } catch (error) {
    console.error(
      'APPOINTMENT NOTIFICATION ERROR:',
      error
    )

  } finally {
    notificationsBeingCreated.delete(lockKey)
  }
}

// =====================================================
// RECOVER EXISTING PENDING APPOINTMENTS
// =====================================================

async function syncExistingAppointmentNotifications(userId) {
  try {
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select('id')
      .in('service_id', OSA_SERVICE_IDS)
      .eq('status', 'pending')

    if (error) throw error

    if (!appointments || appointments.length === 0) {
      console.log('No pending OSA appointments to synchronize.')
      return
    }

    for (const appointment of appointments) {
      await createAppointmentNotification(
        appointment.id,
        userId
      )
    }

    console.log(
      'EXISTING APPOINTMENT NOTIFICATIONS SYNCHRONIZED.'
    )

  } catch (error) {
    console.error(
      'APPOINTMENT NOTIFICATION SYNC ERROR:',
      error
    )
  }
}

// =====================================================
// GLOBAL APPOINTMENT REALTIME LISTENER
// =====================================================

async function removeAppointmentNotificationSubscription() {
  if (appointmentNotificationChannel) {
    const channel = appointmentNotificationChannel

    appointmentNotificationChannel = null
    notificationChannelUserId = null

    await supabase.removeChannel(channel)
  }
}

async function subscribeToAppointmentNotifications(userId) {
  if (!userId) return

  if (
    appointmentNotificationChannel &&
    notificationChannelUserId === userId
  ) {
    return
  }

  await removeAppointmentNotificationSubscription()

  notificationChannelUserId = userId

  appointmentNotificationChannel = supabase
    .channel(`global-osa-appointments-${userId}`)

    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'appointments'
      },
      async (payload) => {
        const appointment = payload.new

        if (!OSA_SERVICE_IDS.includes(appointment.service_id)) {
          return
        }

        console.log(
          'GLOBAL NEW OSA APPOINTMENT DETECTED:',
          appointment
        )

        await createAppointmentNotification(
          appointment.id,
          userId
        )
      }
    )

    .subscribe(async (status, error) => {
      console.log(
        'GLOBAL APPOINTMENT NOTIFICATION STATUS:',
        status
      )

      if (error) {
        console.error(
          'GLOBAL APPOINTMENT SUBSCRIPTION ERROR:',
          error
        )
      }

      if (status === 'SUBSCRIBED') {
        await syncExistingAppointmentNotifications(userId)
      }
    })
}

// =====================================================
// LOGOUT
// =====================================================

function logout() {
  showLogoutConfirm.value = true
}

function cancelLogout() {
  showLogoutConfirm.value = false
}

async function confirmLogout() {
  try {
    const { error } = await supabase.auth.signOut()

    if (error) throw error

    await removeAppointmentNotificationSubscription()

    showLogoutConfirm.value = false
    isLoggedIn.value = false
    currentUser.value = null

    // Clear saved login preference.
    localStorage.removeItem('liceoqserveKeepSignedIn')
    sessionStorage.removeItem('liceoqserveSessionAllowed')

    sessionStorage.removeItem('liceoqserveLoggedIn')
    sessionStorage.removeItem('returnToAppointments')
    sessionStorage.removeItem('rescheduleAppointmentId')

    selectedAppointment.value = null
    activePage.value = 'Dashboard'
    requestFilter.value = 'All'

  } catch (error) {
    console.error('Supabase logout error:', error)

    window.alert('Unable to log out. Please try again.')
  }
}

// =====================================================
// LOGIN
// =====================================================

function handleLogin(user) {
  currentUser.value = user
  isLoggedIn.value = true
  activePage.value = 'Dashboard'
}

// =====================================================
// INITIALIZATION AND SESSION RESTORATION
// =====================================================

onMounted(async () => {
  // Listen for authentication changes.
  const { data } = supabase.auth.onAuthStateChange(
    (event, session) => {

      // Ignore initial session event.
      // Session restoration is checked manually below.
      if (event === 'INITIAL_SESSION' || isCheckingSession.value) {
        return
      }

      currentUser.value = session?.user ?? null
      isLoggedIn.value = Boolean(session?.user)

      if (session?.user) {
        setTimeout(() => {
          subscribeToAppointmentNotifications(
            session.user.id
          )
        }, 0)

      } else {
        removeAppointmentNotificationSubscription()

        activePage.value = 'Dashboard'
        selectedAppointment.value = null
        requestFilter.value = 'All'
      }
    }
  )

  authListener = data.subscription

  try {
    // Get the existing Supabase session.
    const { data: sessionData, error } =
      await supabase.auth.getSession()

    if (error) throw error

    // Check the user's Keep me signed in preference.
    const savedSessionPreference =
      localStorage.getItem('liceoqserveKeepSignedIn') === 'true'

    // Session allowed only for the current browser tab.
    const currentTabSession =
      sessionStorage.getItem('liceoqserveSessionAllowed') === 'true'

    const hasPermissionToRestore =
      savedSessionPreference || currentTabSession

    const existingSession = sessionData.session

    if (existingSession && !hasPermissionToRestore) {
      // No saved preference: clear the old session.
      await supabase.auth.signOut()

      await removeAppointmentNotificationSubscription()

      currentUser.value = null
      isLoggedIn.value = false

    } else if (existingSession) {
      // Restore the session.
      currentUser.value = existingSession.user
      isLoggedIn.value = true

      await subscribeToAppointmentNotifications(
        existingSession.user.id
      )

    } else {
      currentUser.value = null
      isLoggedIn.value = false
    }

    // Return to Appointments if requested.
    const requestPage =
      sessionStorage.getItem('returnToAppointments')

    if (requestPage === 'true' && isLoggedIn.value) {
      activePage.value = 'Appointments'

      sessionStorage.removeItem('returnToAppointments')
    }

  } catch (error) {
    console.error(
      'Unable to restore Supabase session:',
      error
    )

    isLoggedIn.value = false
    currentUser.value = null

  } finally {
    isCheckingSession.value = false
  }
})

// =====================================================
// CLEANUP
// =====================================================

onUnmounted(() => {
  authListener?.unsubscribe()

  removeAppointmentNotificationSubscription()
})
</script>

<template>
  <!-- SESSION CHECKING -->
  <div v-if="isCheckingSession" class="loading-screen">
    <div class="loading-content">
      <div class="loading-spinner"></div>
      <p>Checking your session...</p>
    </div>
  </div>

  <!-- LOGIN PAGE -->
  <LoginView
    v-else-if="!isLoggedIn"
    @login="handleLogin"
  />

  <!-- MAIN APPLICATION -->
  <div v-else class="app-shell">
    <Header />

    <div class="app-layout">
      <Sidebar
        :active-page="
          activePage === 'RescheduleAppointment'
            ? 'Appointments'
            : activePage
        "
        @navigate="navigateToPage"
        @logout="logout"
      />

      <main class="main-content">
        <Appointments
          v-if="activePage === 'Appointments'"
          :key="appointmentsVersion"
          @reschedule="openReschedule"
        />

        <Requests
          v-else-if="activePage === 'Request'"
          :initial-filter="requestFilter"
        />

        <RescheduleAppointment
          v-else-if="activePage === 'RescheduleAppointment'"
          :appointment="selectedAppointment"
          :saving="isSavingReschedule"
          @save="saveRescheduledAppointment"
          @cancel="cancelReschedule"
        />

        <component
          :is="currentPage"
          v-else
          @navigate="navigateToPage"
        />
      </main>
    </div>

    <!-- LOGOUT CONFIRMATION -->
    <div
      v-if="showLogoutConfirm"
      class="logout-overlay"
      @click.self="cancelLogout"
    >
      <section
        class="logout-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-title"
      >
        <div class="logout-heading">
          <div class="logout-icon">!</div>
          <h2 id="logout-title">Log Out QueueLess?</h2>
        </div>

        <p>You will return to the login screen.</p>

        <div class="logout-actions">
          <button
            type="button"
            class="logout-cancel"
            @click="cancelLogout"
          >
            Go Back
          </button>

          <button
            type="button"
            class="logout-confirm"
            @click="confirmLogout"
          >
            Yes, Log Out
          </button>
        </div>
      </section>
    </div>

    <!-- RESCHEDULE RESULT POPUP -->
    <Teleport to="body">
      <div
        v-if="showRescheduleResult"
        class="reschedule-result-overlay"
        @click.self="closeRescheduleResult"
      >
        <section
          class="reschedule-result-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="reschedule-result-title"
        >
          <div
            class="reschedule-result-icon"
            :class="rescheduleResultType"
          >
            {{ rescheduleResultType === 'success' ? '✓' : '!' }}
          </div>

          <h2 id="reschedule-result-title">
            {{ rescheduleResultTitle }}
          </h2>

          <p>{{ rescheduleResultMessage }}</p>

          <button
            type="button"
            @click="closeRescheduleResult"
          >
            OK
          </button>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  min-height: 100%;
  margin: 0;
}

body {
  background: #efdfdf;
}

.app-shell {
  min-height: 100vh;
  padding: 7px;
  background: #211e1e;
}

.app-layout {
  display: flex;
  min-height: calc(100vh - 101px);
}

.main-content {
  flex: 1;
  min-width: 0;
  min-height: calc(100vh - 101px);
  background: #efdfdf;
}

/* LOADING SCREEN */

.loading-screen {
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  background: #efdfdf;
  color: #51090e;
  font-family: Arial, sans-serif;
}

.loading-content {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 14px;
}

.loading-content p {
  margin: 0;
  font-size: 14px;
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 4px solid #e5cfd0;
  border-top-color: #650f18;
  border-radius: 50%;
  animation: loading-spin 0.8s linear infinite;
}

@keyframes loading-spin {
  to {
    transform: rotate(360deg);
  }
}

/* LOGOUT POPUP */

.logout-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(20, 12, 12, 0.48);
}

.logout-dialog {
  width: 100%;
  max-width: 480px;
  padding: 28px;
  color: #39090c;
  background: #f8eeee;
  border: 1px solid #ead5d6;
  border-radius: 17px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.2);
}

.logout-heading {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logout-icon {
  display: flex;
  flex: 0 0 56px;
  width: 56px;
  height: 56px;
  align-items: center;
  justify-content: center;
  color: #fffafa;
  background: #79353b;
  border-radius: 12px;
  font-size: 30px;
  font-weight: 700;
}

.logout-heading h2 {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 25px;
}

.logout-dialog > p {
  margin: 30px 0;
  color: #806667;
  font-size: 15px;
  line-height: 1.5;
}

.logout-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}

.logout-actions button {
  min-height: 46px;
  padding: 0 17px;
  border: 1px solid #79353b;
  border-radius: 9px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.logout-cancel {
  color: #51090e;
  background: transparent;
}

.logout-confirm {
  color: #fffafa;
  background: #51090e;
}

.logout-confirm:hover {
  background: #650f18;
}

.logout-cancel:hover {
  background: #efdfdf;
}

/* RESCHEDULE RESULT POPUP */

.reschedule-result-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(20, 12, 12, 0.55);
}

.reschedule-result-dialog {
  width: 100%;
  max-width: 420px;
  padding: 28px;
  border: 1px solid #ead5d6;
  border-radius: 16px;
  background: #f8eeee;
  color: #350609;
  text-align: center;
  box-shadow: 0 15px 45px rgba(0, 0, 0, 0.22);
  font-family: Georgia, 'Times New Roman', serif;
}

.reschedule-result-icon {
  display: flex;
  width: 55px;
  height: 55px;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  border-radius: 50%;
  color: white;
  font: 700 30px Arial, sans-serif;
}

.reschedule-result-icon.success {
  background: #397a49;
}

.reschedule-result-icon.error {
  background: #a51f2a;
}

.reschedule-result-dialog h2 {
  margin: 0 0 12px;
  color: #59080e;
  font-size: 22px;
}

.reschedule-result-dialog p {
  margin: 0 0 24px;
  color: #806667;
  font: 13px/1.6 Arial, sans-serif;
}

.reschedule-result-dialog button {
  min-width: 100px;
  min-height: 38px;
  padding: 8px 22px;
  border: 1px solid #59080e;
  border-radius: 7px;
  background: #59080e;
  color: white;
  font-weight: 700;
  cursor: pointer;
}

.reschedule-result-dialog button:hover {
  background: #760e16;
}

@media (max-width: 600px) {
  .logout-dialog {
    padding: 22px;
  }

  .logout-heading h2 {
    font-size: 21px;
  }

  .logout-actions {
    flex-direction: column-reverse;
  }

  .logout-actions button {
    width: 100%;
  }
}
</style>
