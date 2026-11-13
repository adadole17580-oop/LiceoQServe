
<script setup>
import { computed, ref, watch, onMounted } from 'vue'

import AppHeader from './components/AppHeader.vue'
import AppSidebar from './components/AppSidebar.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'

import LoginView from './views/LoginView.vue'
import DashboardView from './views/DashboardView.vue'
import AppointmentsView from './views/AppointmentsView.vue'
import RescheduleView from './views/RescheduleView.vue'
import PlaceholderView from './views/PlaceholderView.vue'
import GuidanceSessionDetails from './views/GuidanceSessionDetails.vue'
import Students from './views/Students.vue'
import ScheduleView from './views/ScheduleView.vue'
import HistoryView from './views/HistoryView.vue'
import ProfileView from './views/ProfileView.vue'
import NotificationsView from './views/NotificationsView.vue'

const API_BASE_URL = 'http://localhost:3000'

const savedSession = sessionStorage.getItem('guidanceSession')

const isLoggedIn = ref(false)
const currentUser = ref(null)
const accessToken = ref('')
const isCheckingSession = ref(true)

const activePage = ref(
  sessionStorage.getItem('guidanceActivePage') || 'Dashboard'
)

watch(activePage, (page) => {
  sessionStorage.setItem('guidanceActivePage', page)
})
const activeFilter = ref('All')
const searchText = ref('')

const showDialog = ref(false)
const dialogAction = ref('')
const selectedAppointment = ref(null)
const rescheduleValues = ref(null)
const selectedGuidanceSession = ref(null)

const notesSaving = ref(false)
const notesSaveResult = ref(null)

const showLogoutDialog = ref(false)
const showSessionSuccess = ref(false)
const sessionSuccessMessage = ref('')

const appointments = ref([])
const historyRecords = ref([])

const dashboardSummary = ref({
  readyForPickup: 0,
  counselorsAvailable: 0
})

const guidanceSessions = computed(() =>
  appointments.value.map(item => ({
    ...item,
    studentName: item.student,
    sessionType: item.type,
    appointmentId: item.reference,
    notes: item.staffNotes || '',
    checkedInAt: item.checkedInAt || null,
    sessionStartedAt: item.sessionStartedAt || null,
    completedAt: item.completedAt || null
  }))
)

const today = new Date().toLocaleDateString('en-CA', {
  timeZone: 'Asia/Manila'
})

const todayAppointments = computed(() =>
  appointments.value.filter(item => item.date === today)
)

const completedCount = computed(() =>
  appointments.value.filter(
    item => String(item.status || '').toLowerCase() === 'completed'
  ).length
)


// READY FOR PICKUP FILTER SUPPORT
const visibleAppointments = computed(() => {
  const search = searchText.value.trim().toLowerCase()

  const normalizeStatus = (value) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '')

  return appointments.value.filter(item => {
    const status = normalizeStatus(item.status)
    const selected = normalizeStatus(activeFilter.value)

    const matchesFilter =
      selected === 'all' ||
      (
        selected === 'readyforpickup'
          ? status === 'reschedulerequested'
          : status === selected
      )

    const matchesSearch =
      String(item.student || '').toLowerCase().includes(search) ||
      String(item.reference || '').toLowerCase().includes(search) ||
      String(item.type || '').toLowerCase().includes(search)

    return matchesFilter && matchesSearch
  })
})


const historyAppointments = computed(() => {
  const search = searchText.value.trim().toLowerCase()

  const historyStatuses = [
    'completed',
    'cancelled',
    'no-show',
    'rejected'
  ]

  return appointments.value.filter(item => {
    const status = String(item.status || '').toLowerCase()
    const isHistoryItem = historyStatuses.includes(status)

    const matchesFilter =
      activeFilter.value === 'All' ||
      status === activeFilter.value.toLowerCase()

    const matchesSearch =
      String(item.student || '').toLowerCase().includes(search) ||
      String(item.reference || '').toLowerCase().includes(search) ||
      String(item.type || '').toLowerCase().includes(search)

    return isHistoryItem && matchesFilter && matchesSearch
  })
})

// ========================================
// BACKEND API CONNECTION
// ========================================

async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }

  if (accessToken.value) {
    headers.Authorization = `Bearer ${accessToken.value}`
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  })

  const result = await response.json().catch(() => ({}))

  if (!response.ok || result.success === false) {
    throw new Error(
      result.message || `Request failed (${response.status})`
    )
  }

  return result
}

// ========================================
// LOAD APPOINTMENTS
// ========================================

async function loadAppointments() {
  try {
    const result = await apiRequest('/api/guidance/appointments')

    appointments.value =
      result.appointments ||
      result.data ||
      []

    console.log(
      'Guidance appointments loaded:',
      appointments.value
    )
  } catch (error) {
    console.error('Failed to load appointments:', error)
    alert(`Unable to load appointments: ${error.message}`)
  }
}

// ========================================
// LOAD GUIDANCE HISTORY
// ========================================

async function loadHistory() {
  try {
    const result = await apiRequest('/api/guidance/history')

    historyRecords.value =
      result.history ||
      result.data ||
      []

    console.log(
      'Guidance history loaded:',
      historyRecords.value
    )
  } catch (error) {
    console.error('Failed to load Guidance history:', error)
    alert(`Unable to load history: ${error.message}`)
  }
}

// ========================================
// LOAD DASHBOARD SUMMARY
// ========================================

async function loadDashboardSummary() {
  try {
    const result = await apiRequest('/api/guidance/dashboard')

    dashboardSummary.value = {
      readyForPickup: result.readyForPickup ?? 0,
      counselorsAvailable: result.counselorsAvailable ?? 0
    }

    console.log(
      'Dashboard summary loaded:',
      dashboardSummary.value
    )
  } catch (error) {
    console.error('Failed to load dashboard summary:', error)

    dashboardSummary.value = {
      readyForPickup: 0,
      counselorsAvailable: 0
    }
  }
}

// ========================================
// LOGIN
// ========================================

function handleLogin(payload) {
  const token = payload?.session?.access_token

  if (!token) {
    alert('Login did not return an authentication token. Please sign in again.')
    return
  }

  accessToken.value = token
  currentUser.value = payload.user || null
  isLoggedIn.value = true

  const storage = payload.keepSignedIn
    ? localStorage
    : sessionStorage

  localStorage.removeItem('guidanceSession')
  sessionStorage.removeItem('guidanceSession')

  storage.setItem('guidanceSession', JSON.stringify({
    user: payload.user,
    session: payload.session
  }))

  activePage.value = 'Dashboard'
  activeFilter.value = 'All'
  searchText.value = ''

  Promise.allSettled([
    loadAppointments(),
    loadHistory(),
    loadDashboardSummary()
  ])
}

// ========================================
// NAVIGATION
// ========================================

// Accepts both the page and an optional filter.
// Dashboard can now open Appointments with Ready for Pickup selected.
function navigate(page, filter = 'All') {
  activePage.value = page
  activeFilter.value = filter
  searchText.value = ''
}

function openNotification(notification) {
  if (notification.destination === 'Reschedule') {
    const normalizeStatus = value =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')

    const appointment = appointments.value.find(item => {
      const statuses = [
        item.status,
        item.appointment_status,
        item.appointmentStatus,
        item.request_status,
        item.requestStatus,
        item.reschedule_status,
        item.rescheduleStatus,
        item.rescheduleRequest?.status,
        item.reschedule_request?.status
      ]

      return statuses.some(status => {
        const normalized = normalizeStatus(status)

        return [
          'reschedule requested',
          'reschedule pending',
          'pending reschedule'
        ].includes(normalized)
      })
    })

    if (!appointment) {
      notification.read = true
      activePage.value = 'Appointments'
      activeFilter.value = 'All'
      searchText.value = ''

      alert(
        'No pending reschedule requests found. Please check the appointment records.'
      )
      return
    }

    notification.read = true
    selectedAppointment.value = appointment
    activePage.value = 'Reschedule'
    return
  }

  notification.read = true

  if (notification.destination === 'Appointments') {
    activePage.value = 'Appointments'
    activeFilter.value = 'Pending'
    searchText.value = ''
    return
  }

  if (notification.destination === 'Guidance Sessions') {
    activePage.value = 'Guidance Sessions'
    return
  }

  navigate(notification.destination)
}

// ========================================
// GUIDANCE SESSIONS
// ========================================

function openGuidanceSession(session) {
  notesSaveResult.value = null
  selectedGuidanceSession.value = session
  activePage.value = 'Guidance Sessions Details'
}

async function updateGuidanceSession(payload) {
  const appointmentId = payload.appointment?.id

  if (!appointmentId) {
    alert('Missing appointment ID.')
    return
  }

  try {
    await apiRequest(
      `/api/guidance/appointments/${appointmentId}/action`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          action: payload.action
        })
      }
    )

  await loadAppointments()

selectedGuidanceSession.value =
  guidanceSessions.value.find(
    item => String(item.id) === String(appointmentId)
  ) || selectedGuidanceSession.value

    const action = String(payload.action || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '')

    if (action === 'checkin') {
      sessionSuccessMessage.value =
        'Student checked in successfully!'
    } else if (action === 'startsession' || action === 'start') {
      sessionSuccessMessage.value =
        'Guidance session started successfully!'
    } else if (action === 'completesession' || action === 'complete') {
      sessionSuccessMessage.value =
        'Guidance session completed successfully!'
    } else {
      sessionSuccessMessage.value =
        'Session status updated successfully.'
    }

    showSessionSuccess.value = true

  } catch (error) {
    console.error('UPDATE SESSION ERROR:', error)

    alert(
      error.message || 'Unable to update session status.'
    )
  }
}
async function restoreSession() {
  try {
    const stored =
      localStorage.getItem('guidanceSession') ||
      sessionStorage.getItem('guidanceSession');

    if (!stored) return;

    const saved = JSON.parse(stored);

    if (!saved?.session?.refresh_token) {
      throw new Error('Missing refresh token');
    }

    const response = await fetch(
      `${API_BASE_URL}/api/auth/guidance-refresh`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refresh_token: saved.session.refresh_token
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('guidanceSession');
        sessionStorage.removeItem('guidanceSession');
        sessionStorage.removeItem('guidanceActivePage');
      }

      return;
    }

    const storage = localStorage.getItem('guidanceSession')
      ? localStorage
      : sessionStorage;

    storage.setItem('guidanceSession', JSON.stringify({
      user: result.user,
      session: result.session
    }));

    accessToken.value = result.session.access_token;
    currentUser.value = result.user;
    isLoggedIn.value = true;

    // Keep the previous page instead of resetting to Dashboard.
    activePage.value =
      sessionStorage.getItem('guidanceActivePage') || 'Dashboard';

    await Promise.allSettled([
      loadAppointments(),
      loadHistory(),
      loadDashboardSummary()
    ]);

  } catch (error) {
    console.error('SESSION RESTORE ERROR:', error);
  } finally {
    isCheckingSession.value = false;
  }
}

onMounted(() => {
  restoreSession()
})

// ========================================
// SAVE GUIDANCE NOTES
// ========================================

async function saveGuidanceNotes(payload) {
  const appointmentId = payload.appointment?.id

  if (!appointmentId) {
    alert('Missing appointment ID.')
    return
  }

  if (notesSaving.value) return

  notesSaving.value = true
  notesSaveResult.value = null

  try {
    const result = await apiRequest(
      `/api/guidance/appointments/${appointmentId}/notes`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          notes: payload.notes
        })
      }
    )

    notesSaveResult.value = {
      success: true,
      appointmentId,
      updatedAt:
        result.appointment?.updated_at ||
        result.appointment?.updatedAt ||
        result.updated_at ||
        result.updatedAt ||
        new Date().toISOString()
    }

    await loadAppointments()

    selectedGuidanceSession.value =
      guidanceSessions.value.find(
        item => item.id === appointmentId
      ) || selectedGuidanceSession.value

  } catch (error) {
    console.error('SAVE NOTES ERROR:', error)

    notesSaveResult.value = null

    alert(
      error.message || 'Unable to save session notes.'
    )
  } finally {
    notesSaving.value = false
  }
}

// ========================================
// APPOINTMENT ACTIONS
// ========================================

function openAction(appointment, action) {
  selectedAppointment.value = appointment
  dialogAction.value = action
  rescheduleValues.value = null
  showDialog.value = true
}

function openReschedule(appointment) {
  selectedAppointment.value = appointment
  activePage.value = 'Reschedule'
}

function reviewReschedule(values) {
  rescheduleValues.value = values
  dialogAction.value = 'Reschedule'
  showDialog.value = true
}

function formatDialogTime(time) {
  if (!time) return ''

  const [hour, minute] = time.split(':').map(Number)

  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${
    hour >= 12 ? 'PM' : 'AM'
  }`
}

function formatDialogDate(date) {
  if (!date) return ''

  return new Date(
    `${date}T12:00:00`
  ).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila'
  })
}

const dialogTitle = computed(() => {
  switch (dialogAction.value) {
    case 'Reschedule':
      return 'Reschedule this Appointment?'
    case 'Confirm':
      return 'Confirm this Appointment?'
    case 'Complete':
      return 'Complete this Appointment?'
    case 'Cancel':
      return 'Cancel this Appointment?'
    case 'No-show':
      return 'No-show this Appointment?'
    default:
      return 'Confirm this action?'
  }
})

const dialogMessage = computed(() => {
  const appointment = selectedAppointment.value

  if (!appointment) return ''

  const date =
    rescheduleValues.value?.date ||
    appointment.date

  const time =
    rescheduleValues.value?.time ||
    appointment.time

  return `${appointment.student} · ${appointment.type} · ${formatDialogDate(date)} at ${formatDialogTime(time)}`
})

const dialogConfirmText = computed(() => {
  switch (dialogAction.value) {
    case 'Reschedule':
      return 'Confirm changes'
    case 'Confirm':
      return 'Confirm appointment'
    case 'Complete':
      return 'Confirm completed'
    case 'Cancel':
      return 'Confirm cancelled'
    case 'No-show':
      return 'Confirm no-show'
    default:
      return 'Confirm'
  }
})

async function confirmAction() {
  const appointment = selectedAppointment.value

  if (!appointment) return

  try {
    const body = {
      action: dialogAction.value
    }

    if (
      dialogAction.value === 'Reschedule' &&
      rescheduleValues.value
    ) {
      body.date = rescheduleValues.value.date
      body.time = rescheduleValues.value.time
    }

    await apiRequest(
      `/api/guidance/appointments/${appointment.id}/action`,
      {
        method: 'PATCH',
        body: JSON.stringify(body)
      }
    )

    await loadAppointments()

    if (dialogAction.value === 'Reschedule') {
      activePage.value = 'Appointments'
    }

    showDialog.value = false
    selectedAppointment.value = null
    rescheduleValues.value = null
  } catch (error) {
    console.error('Appointment action failed:', error)

    alert(
      `Unable to update appointment: ${error.message}`
    )
  }
}

// ========================================
// DATE AND TIME FORMATTING
// ========================================

function formatSessionDate(date) {
  if (!date) return ''

  return new Date(
    `${date}T12:00:00`
  ).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila'
  })
}

function formatSessionTime(time) {
  if (!time) return ''

  if (/AM|PM/i.test(time)) return time

  const [hour, minute] = time.split(':').map(Number)

  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${
    hour >= 12 ? 'PM' : 'AM'
  }`
}

// ========================================
// LOGOUT
// ========================================

function logout() {
  showLogoutDialog.value = true
}

function cancelLogout() {
  showLogoutDialog.value = false
}


function confirmLogout() {
  showLogoutDialog.value = false

  isLoggedIn.value = false
  currentUser.value = null
  accessToken.value = ''

  appointments.value = []
  historyRecords.value = []

  dashboardSummary.value = {
    readyForPickup: 0,
    counselorsAvailable: 0
  }

  activePage.value = 'Dashboard'
  activeFilter.value = 'All'
  searchText.value = ''

  // Clear saved login session and page
  localStorage.removeItem('guidanceSession')
  sessionStorage.removeItem('guidanceSession')
  sessionStorage.removeItem('guidanceActivePage')
}

</script>

<template>
  <LoginView
  v-if="!isCheckingSession && !isLoggedIn"
  @login="handleLogin"
/>

<div v-else-if="isLoggedIn" class="app-shell">
    <AppHeader
      :staff-name="currentUser?.full_name || 'Guidance Staff'"
    />

    <div class="app-body">
      <AppSidebar
        :active-page="activePage"
        @navigate="navigate"
        @logout="logout"
      />

      <main class="main-content">
      <DashboardView
  v-if="activePage === 'Dashboard'"
  :appointments="todayAppointments"
  :recent-appointments="appointments"
  :completed-count="completedCount"
  :counselors-available="dashboardSummary.counselorsAvailable"
  @navigate="navigate"
/>

        <AppointmentsView
          v-else-if="activePage === 'Appointments'"
          :appointments="visibleAppointments"
          :active-filter="activeFilter"
          :search-text="searchText"
          @update:active-filter="activeFilter = $event"
          @update:search-text="searchText = $event"
          @action="openAction"
          @reschedule="openReschedule"
        />

        <HistoryView
          v-else-if="activePage === 'History'"
          :appointments="historyAppointments"
        />

        <ProfileView
          v-else-if="activePage === 'Profile'"
          :access-token="accessToken"
          :current-user="currentUser"
        />

        <RescheduleView
          v-else-if="activePage === 'Reschedule'"
          :appointment="selectedAppointment"
          @save="reviewReschedule"
          @cancel="navigate('Appointments')"
        />

        <!-- Notifications -->
        <NotificationsView
          v-else-if="activePage === 'Notifications'"
          :access-token="accessToken"
          @open="openNotification"
        />

        <!-- Guidance Sessions -->
        <section
          v-else-if="activePage === 'Guidance Sessions'"
          class="guidance-page"
        >
          <header class="guidance-heading">
            <div>
              <h1>Guidance Sessions</h1>
              <p>
                Select a guidance appointment before session actions
                become available.
              </p>
            </div>

            <button
              class="record-button"
              @click="navigate('Appointments')"
            >
              Record Return
            </button>
          </header>

          <div class="guidance-list">
            <article
              v-for="session in guidanceSessions"
              :key="session.id"
              class="guidance-card"
            >
              <div class="guidance-info">
                <strong>{{ session.student }}</strong>
                <span>{{ session.type }}</span>
                <small>
                  {{ formatSessionDate(session.date) }} ·
                  {{ formatSessionTime(session.time) }}
                </small>
              </div>

              <button
                class="view-session-button"
                @click="openGuidanceSession(session)"
              >
                View Appointment
              </button>
            </article>
          </div>
        </section>

        <GuidanceSessionDetails
          v-else-if="activePage === 'Guidance Sessions Details'"
          :appointment="selectedGuidanceSession"
          :notes-saving="notesSaving"
          :notes-save-result="notesSaveResult"
          @back="navigate('Guidance Sessions')"
          @navigate="navigate"
          @session-action="updateGuidanceSession"
          @save-notes="saveGuidanceNotes"
        />

        <Students
          v-else-if="activePage === 'Students'"
          :access-token="accessToken"
        />

        <ScheduleView
          v-else-if="activePage === 'Schedule'"
          :access-token="accessToken"
          @navigate="navigate"
        />

        <PlaceholderView
          v-else
          :page-title="activePage"
          @navigate="navigate"
        />
      </main>
    </div>

   <ConfirmDialog
  :visible="showDialog"
  :title="dialogTitle"
  :message="dialogMessage"
  :confirm-text="dialogConfirmText"
  :danger="['Cancel', 'No-show'].includes(dialogAction)"
  :action="dialogAction"
  @confirm="confirmAction"
  @close="showDialog = false"
/>

    <Teleport to="body">
      <div
        v-if="showLogoutDialog"
        class="logout-overlay"
        @click.self="cancelLogout"
      >
        <section
          class="logout-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-title"
        >
          <div class="logout-modal-heading">
            <div
              class="logout-icon"
              aria-hidden="true"
            >
              !
            </div>

            <h2 id="logout-title">
              Log Out of LiceoQServe?
            </h2>
          </div>

          <p class="logout-message">
            You will return to the login screen.
          </p>

          <div class="logout-actions">
            <button
              class="logout-cancel"
              type="button"
              @click="cancelLogout"
            >
              Go Back
            </button>

            <button
              class="logout-confirm"
              type="button"
              @click="confirmLogout"
            >
              Log Out
            </button>
          </div>
        </section>
      </div>
    </Teleport>
    <!-- GUIDANCE SESSION SUCCESS POPUP -->
<Teleport to="body">
  <div
    v-if="showSessionSuccess"
    class="session-success-overlay"
  >
    <section
      class="session-success-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-success-title"
    >
      <div class="session-success-heading">
        <div class="session-success-icon">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="m7 12 3 3 7-7" />
          </svg>
        </div>

        <h2 id="session-success-title">
          Success!
        </h2>
      </div>

      <p>{{ sessionSuccessMessage }}</p>

      <div class="session-success-actions">
        <button
          type="button"
          @click="showSessionSuccess = false"
        >
          OK
        </button>
      </div>
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
  min-width: 320px;
  min-height: 100%;
  margin: 0;
  padding: 0;
}

body {
  min-height: 100vh;
  font-family: Arial, Helvetica, sans-serif;
  color: #39090c;
  background: #efdfdf;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: default;
  opacity: 0.45;
}

.app-shell {
  width: 100%;
  min-height: 100vh;
  margin: 0;
  padding: 0;
  background: #efdfdf;
}

.app-body {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  width: 100%;
  min-height: calc(100vh - 89px);
  margin: 0;
  padding: 0;
  gap: 0;
}

.main-content {
  min-width: 0;
  padding: 25px 24px;
  overflow-x: hidden;
  background: #efdfdf;
}

.page-heading {
  margin-bottom: 22px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 15px;
  margin-bottom: 25px;
}

.stat-card,
.panel,
.appointment-card,
.reschedule-panel {
  background: #f8eeee;
  border: 1px solid #c9b8b8;
  border-radius: 12px;
}

.stat-card {
  padding: 20px;
}

.stat-card strong {
  display: block;
  margin: 10px 0;
  font-size: 30px;
}

.appointment-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 15px 0;
  border-top: 1px solid #eadada;
}

.status-badge {
  display: inline-block;
  padding: 6px 10px;
  font-size: 11px;
  border-radius: 20px;
  background: #f2e5c8;
  color: #75551a;
}

.status-badge.confirmed,
.status-badge.completed {
  background: #c6e4ce;
  color: #356344;
}

.status-badge.cancelled,
.status-badge.no-show {
  background: #f3d5d7;
  color: #912e36;
}

.status-badge.pending {
  background: #f2e5c8;
  color: #75551a;
}

/* Shared buttons */

.primary-button,
.outline-button {
  padding: 10px 14px;
  border-radius: 7px;
  cursor: pointer;
}

.primary-button {
  color: white;
  background: #650f18;
  border: 1px solid #650f18;
}

.outline-button {
  color: #650f18;
  background: #fffafa;
  border: 1px solid #d7b9bb;
}

/* Guidance Sessions */

.guidance-page {
  width: 100%;
  min-width: 0;
}

.guidance-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 18px;
}

.guidance-heading h1 {
  margin: 0;
  color: #39090c;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 29px;
  font-weight: normal;
}

.guidance-heading p {
  margin: 4px 0 0;
  font-size: 12px;
}

.record-button {
  padding: 8px 13px;
  color: #fffafa;
  background: #51090e;
  border: 1px solid #51090e;
  border-radius: 6px;
  font-size: 11px;
}

.guidance-list {
  width: 100%;
  overflow: hidden;
  background: #f8eeee;
  border: 1px solid #bda0a1;
  border-radius: 12px;
}

.guidance-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  padding: 15px 12px;
  background: #f8eeee;
}

.guidance-card + .guidance-card {
  border-top: 1px solid #bda0a1;
}

.guidance-card:first-child {
  background: #dfc1c2;
}

.guidance-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.guidance-info strong {
  font-size: 13px;
}

.guidance-info span,
.guidance-info small {
  font-size: 10px;
}

.guidance-info small {
  color: #594545;
}

.view-session-button {
  flex-shrink: 0;
  padding: 6px 9px;
  color: #51090e;
  background: transparent;
  border: 0;
  font-size: 10px;
  font-weight: bold;
}

.view-session-button:hover {
  text-decoration: underline;
}

/* Logout confirmation */

.logout-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(25, 12, 13, 0.38);
}

.logout-modal {
  width: 100%;
  max-width: 475px;
  padding: 22px 20px 24px;
  color: #39090c;
  background: #f8eeee;
  border-radius: 17px;
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.15);
}

.logout-modal-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logout-icon {
  display: flex;
  flex: 0 0 64px;
  width: 64px;
  height: 64px;
  align-items: center;
  justify-content: center;
  color: #fffafa;
  background: #b18487;
  border-radius: 12px;
  font-size: 30px;
  font-weight: bold;
}

.logout-modal-heading h2 {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 27px;
  font-weight: normal;
}

.logout-message {
  margin: 24px 14px;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;
}

.logout-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 26px;
}

.logout-actions button {
  min-width: 127px;
  padding: 12px 18px;
  border-radius: 15px;
  font-size: 14px;
  font-weight: 600;
}

.logout-cancel {
  color: #39090c;
  background: transparent;
  border: 1px solid #51090e;
}

.logout-confirm {
  color: #fffafa;
  background: #51090e;
  border: 1px solid #51090e;
}

.logout-cancel:hover {
  background: #ead6d7;
}

.logout-confirm:hover {
  background: #710f18;
}

@media (max-width: 1100px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .app-body {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .main-content {
    padding: 20px 16px;
  }

  .notification-list {
    padding: 0;
  }
}

@media (max-width: 600px) {
  .app-body {
    grid-template-columns: 1fr;
  }

  .main-content {
    padding: 14px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .notifications-heading h1,
  .guidance-heading h1 {
    font-size: 25px;
  }

  .notification-card {
    gap: 8px;
    padding: 14px 10px;
  }

  .notification-content h2 {
    font-size: 14px;
  }

  .notification-open {
    padding: 5px;
    font-size: 12px;
  }

  .guidance-card {
    align-items: flex-start;
    gap: 8px;
    padding: 13px 10px;
  }

  .view-session-button {
    max-width: 105px;
    white-space: normal;
    text-align: right;
  }

  .logout-modal-heading h2 {
    font-size: 21px;
  }

  .logout-message {
    margin: 20px 0;
    font-size: 15px;
  }

  .logout-actions button {
    min-width: 0;
    flex: 1;
  }
}
/* GUIDANCE SESSION SUCCESS POPUP */

.session-success-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(29, 15, 16, 0.42);
}

.session-success-modal {
  width: 100%;
  max-width: 410px;
  padding: 24px;
  border-radius: 15px;
  background: #fffafa;
  box-shadow: 0 14px 42px rgba(31, 5, 7, 0.18);
  color: #300608;
}

.session-success-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.session-success-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 12px;
  background: #e1f0e5;
  color: #287a4b;
}

.session-success-heading h2 {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 25px;
  font-weight: 500;
}

.session-success-modal p {
  margin: 18px 0;
  font-size: 14px;
}

.session-success-actions {
  display: flex;
  justify-content: flex-end;
}

.session-success-actions button {
  padding: 10px 27px;
  border: none;
  border-radius: 9px;
  background: #51090e;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

.session-success-actions button:hover {
  background: #390609;
}
</style>
