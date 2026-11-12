
<template>
  <RouterView v-if="$route.name === 'login'" />

  <div v-else class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">LQ</span>
        <div class="brand-copy">
          <span class="brand-name">LiceoQServe</span>
          <span class="brand-subtitle">Cashier Portal</span>
        </div>
      </div>

      <div class="topbar-user">
        <div class="topbar-user-copy">
          <span class="topbar-user-name">{{ staffName }}</span>
          <span class="topbar-user-role">Authorized Staff</span>
        </div>
      </div>
    </header>

    <div class="app-body">
      <aside class="sidebar">
        <nav class="sidebar-nav" aria-label="Main navigation">
          <RouterLink to="/dashboard" class="nav-link">Dashboard</RouterLink>
          <RouterLink to="/payment-queue" class="nav-link">Payment Queue</RouterLink>
          <RouterLink to="/my-counter" class="nav-link">My Counter</RouterLink>
          <RouterLink to="/reports" class="nav-link">Reports</RouterLink>
          <RouterLink to="/profile" class="nav-link">Profile</RouterLink>
        </nav>

        <div class="sidebar-bottom">
          <div class="sidebar-footer">
            <strong>Office status</strong>

            <div v-if="loadingOfficeHours" class="office-hours-text">
              Loading office hours...
            </div>

            <template v-else-if="todaySchedule">
              <div class="office-hours-text">
                <span
                  class="status-indicator"
                  :class="{ inactive: !isOfficeOpen }"
                ></span>

                <span>
                  {{ isOfficeOpen ? 'Open' : 'Closed' }}
                  ·
                  <template v-if="!todaySchedule.is_closed">
                    {{ formatOfficeTime(todaySchedule.opening_time) }}–{{ formatOfficeTime(todaySchedule.closing_time) }}
                  </template>
                  <template v-else>
                    Closed today
                  </template>
                </span>
              </div>
            </template>

            <div v-else class="office-hours-text">
              <span class="status-indicator inactive"></span>
              Office hours unavailable
            </div>

            <small v-if="officeHoursError" class="office-error">
              Unable to load schedule
            </small>
          </div>

          <button
            class="sidebar-logout"
            type="button"
            :disabled="signingOut"
            @click="openLogoutConfirmation"
          >
            {{ signingOut ? 'LOGGING OUT...' : 'LOG OUT' }}
          </button>
        </div>
      </aside>

      <main class="main-content">
        <RouterView />
      </main>
    </div>

    <AppModal
      v-model="showLogoutConfirmation"
      title="Log Out?"
      description="Are you sure you want to log out of your LiceoQServe staff account?"
      type="warning"
      confirm-text="Yes, Log Out"
      cancel-text="Stay Logged In"
      :loading="signingOut"
      loading-text="Logging out..."
      @confirm="signOut"
    />

    <AppModal
      v-model="showLogoutError"
      title="Logout Failed"
      :description="logoutError"
      type="error"
      confirm-text="Okay"
      :show-cancel="false"
      @confirm="showLogoutError = false"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from './supabase'
import AppModal from './components/AppModal.vue'

const router = useRouter()

const TIMEZONE = 'Asia/Manila'
const DEPARTMENT = 'cashier'

const staffName = ref('Cashier Staff')

const officeHours = ref([])
const loadingOfficeHours = ref(true)
const officeHoursError = ref('')
const currentTime = ref(new Date())

const signingOut = ref(false)
const showLogoutConfirmation = ref(false)
const showLogoutError = ref(false)
const logoutError = ref('')

let officeHoursChannel = null
let clockInterval = null

function getPhilippineDay(date) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: TIMEZONE,
  }).format(date)

  const days = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  return days[weekday]
}

function getPhilippineTimeInMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const hour = Number(
    parts.find((part) => part.type === 'hour')?.value,
  )

  const minute = Number(
    parts.find((part) => part.type === 'minute')?.value,
  )

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null
  }

  return hour * 60 + minute
}

function timeToMinutes(value) {
  if (!value) return null

  const match = String(value).match(/^(\d{2}):(\d{2})/)

  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2])

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null
  }

  return hour * 60 + minute
}

const todaySchedule = computed(() => {
  const day = getPhilippineDay(currentTime.value)

  return officeHours.value.find(
    (schedule) => Number(schedule.day_of_week) === day,
  ) || null
})

const isOfficeOpen = computed(() => {
  const schedule = todaySchedule.value

  if (!schedule || schedule.is_closed) return false

  const currentMinutes = getPhilippineTimeInMinutes(
    currentTime.value,
  )

  const openingMinutes = timeToMinutes(
    schedule.opening_time,
  )

  const closingMinutes = timeToMinutes(
    schedule.closing_time,
  )

  if (
    currentMinutes === null ||
    openingMinutes === null ||
    closingMinutes === null
  ) {
    return false
  }

  return (
    currentMinutes >= openingMinutes &&
    currentMinutes < closingMinutes
  )
})

function formatOfficeTime(value) {
  const minutes = timeToMinutes(value)

  if (minutes === null) return '--:--'

  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60

  const date = new Date()
  date.setUTCHours(hour, minute, 0, 0)

  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(date)
}

async function loadOfficeHours() {
  loadingOfficeHours.value = true
  officeHoursError.value = ''

  try {
    const { data, error } = await supabase
      .from('office_hours')
      .select(
        'department, day_of_week, opening_time, closing_time, is_closed, timezone',
      )
      .eq('department', DEPARTMENT)
      .order('day_of_week', { ascending: true })

    if (error) throw error

    officeHours.value = data || []

    if (officeHours.value.length === 0) {
      throw new Error('No cashier office hours were returned.')
    }
  } catch (error) {
    console.error('Unable to load cashier office hours:', error)

    officeHoursError.value =
      error.message || 'Unable to load office hours.'

    officeHours.value = []
  } finally {
    loadingOfficeHours.value = false
  }
}

async function loadStaffInformation() {
  const { data: authData, error: authError } =
    await supabase.auth.getUser()

  if (authError) throw authError

  const user = authData?.user

  if (!user) return

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, office_id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) throw profileError

  staffName.value =
    profile?.full_name ||
    user.user_metadata?.full_name ||
    user.email ||
    'Cashier Staff'
}

async function loadSidebarInformation() {
  try {
    await loadStaffInformation()
  } catch (error) {
    console.error('Unable to load staff information:', error)
  }

  await loadOfficeHours()
}

function subscribeToOfficeHours() {
  const channelName =
    `cashier-office-hours-${Date.now()}-${Math.random().toString(36).slice(2)}`

  officeHoursChannel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'office_hours',
        filter: 'department=eq.cashier',
      },
      () => {
        loadOfficeHours()
      },
    )
    .subscribe((status) => {
      console.log('Cashier office hours realtime:', status)
    })
}

function openLogoutConfirmation() {
  if (signingOut.value) return

  showLogoutConfirmation.value = true
}

async function signOut() {
  if (signingOut.value) return

  signingOut.value = true

  try {
    const { error } = await supabase.auth.signOut()

    if (error) throw error

    showLogoutConfirmation.value = false
    await router.replace('/login')
  } catch (error) {
    console.error('Unable to log out:', error)

    logoutError.value =
      error.message || 'Unable to log out. Please try again.'

    showLogoutConfirmation.value = false
    showLogoutError.value = true
  } finally {
    signingOut.value = false
  }
}

onMounted(async () => {
  await loadSidebarInformation()

  subscribeToOfficeHours()

  clockInterval = setInterval(() => {
    currentTime.value = new Date()
  }, 30000)
})

onUnmounted(() => {
  if (clockInterval) {
    clearInterval(clockInterval)
    clockInterval = null
  }

  if (officeHoursChannel) {
    supabase.removeChannel(officeHoursChannel)
    officeHoursChannel = null
  }
})
</script>

<style>
:root {
  --topbar-height: 88px;
  --sidebar-width: 220px;
}

body {
  background: #1f1f1f;
  margin: 0;
}

.app-shell {
  min-height: 100vh;
  margin: 0 auto;
  background: #e9dfdf;
  border: 1px solid #180707;
}

.topbar {
  height: var(--topbar-height);
  position: sticky;
  top: 0;
  z-index: 30;
  padding: 0 25px 0 18px;
  background: #4b1111;
  border-bottom: 2px solid #2b0909;
}

.brand {
  gap: 11px;
}

.brand-mark {
  width: 40px;
  height: 38px;
  flex-basis: 40px;
  border-radius: 8px;
  background: #652323;
  color: #d8c3c3;
  font-size: 16px;
}

.brand-copy {
  gap: 2px;
}

.brand-name {
  color: #fff8f5;
  font-size: 16px;
  letter-spacing: 0;
}

.brand-subtitle {
  color: #bda3a3;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 10px;
  font-weight: 600;
}

.topbar-user {
  gap: 0;
  text-align: right;
}

.topbar-user-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.topbar-user-name {
  max-width: 300px;
  color: #fff8f5;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.topbar-user-role {
  color: #bda3a3;
  font-size: 10px;
}

.app-body {
  min-height: calc(100vh - var(--topbar-height));
  display: block;
}

/* SIDEBAR */
.sidebar {
  width: var(--sidebar-width);
  height: calc(100vh - var(--topbar-height));
  position: fixed;
  top: var(--topbar-height);
  left: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  padding: 15px 8px 12px;
  box-sizing: border-box;
  background: #f4eded;
  border-right: 2px solid #4b2929;
  overflow-x: hidden;
  overflow-y: auto;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* NAVIGATION BUTTONS - SLIGHTLY BIGGER */
.nav-link {
  min-height: 44px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-radius: 8px;
  color: #260d0d;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.nav-link:hover {
  background: #eadede;
  color: #4b1111;
}

.nav-link.router-link-active {
  background: #4b1111;
  color: #fff8f5;
  box-shadow: none;
}

/* SIDEBAR BOTTOM */
.sidebar-bottom {
  margin-top: auto;
  padding-top: 12px;
}

/* OFFICE STATUS - UNCHANGED */
.sidebar-footer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  margin: 0 0 10px;
  padding: 11px 12px;
  border: none;
  border-radius: 9px;
  background: #e8dada;
}

.sidebar-footer strong {
  color: #3e2929;
  font-size: 11px;
  font-weight: 700;
}

.office-hours-text {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #806e6e;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.4;
  flex-wrap: wrap;
}

.status-indicator {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: #4d8056;
}

.status-indicator.inactive {
  background: #a13a3a;
}

.office-error {
  color: #9a4545;
  font-size: 9px;
}

/* LOG OUT - UNCHANGED */
.sidebar-logout {
  width: 100%;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 8px;
  border: 1.5px solid #351414;
  border-radius: 7px;
  background: transparent;
  color: #2d1111;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-align: center;
}

.sidebar-logout:hover {
  background: #eadede;
  color: #4b1111;
}

.sidebar-logout:disabled {
  cursor: wait;
  opacity: 0.6;
}

/* MAIN CONTENT */
.main-content {
  width: calc(100% - var(--sidebar-width));
  min-height: calc(100vh - var(--topbar-height));
  margin-left: var(--sidebar-width);
  background: #e9dfdf;
}

.main-content > :first-child {
  min-height: 100%;
}

.page-footer {
  display: none;
}

/* TABLET */
@media (max-width: 850px) {
  :root {
    --topbar-height: 76px;
    --sidebar-width: 185px;
  }

  .topbar {
    padding: 0 16px;
  }

  .brand-mark {
    width: 36px;
    height: 36px;
    flex-basis: 36px;
  }

  .brand-name {
    font-size: 15px;
  }

  .topbar-user-name {
    max-width: 200px;
    font-size: 12px;
  }

  .topbar-user-role {
    font-size: 9px;
  }

  .nav-link {
    min-height: 40px;
    padding: 0 12px;
    font-size: 12px;
  }
}

/* MOBILE */
@media (max-width: 600px) {
  :root {
    --topbar-height: 76px;
    --sidebar-width: 100%;
  }

  .topbar {
    padding: 0 12px;
  }

  .brand {
    gap: 8px;
  }

  .brand-mark {
    width: 36px;
    height: 36px;
    flex-basis: 36px;
    font-size: 14px;
  }

  .brand-name {
    font-size: 14px;
  }

  .brand-subtitle {
    font-size: 9px;
  }

  .topbar-user-name {
    max-width: 135px;
    font-size: 11px;
    letter-spacing: 0;
  }

  .topbar-user-role {
    font-size: 9px;
  }

  .app-body {
    display: block;
  }

  .sidebar {
    width: 100%;
    height: auto;
    min-height: 0;
    position: relative;
    top: auto;
    left: auto;
    bottom: auto;
    padding: 8px;
    border-right: 0;
    border-bottom: 2px solid #4b2929;
    overflow: visible;
  }

  .sidebar-nav {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
  }

  .nav-link {
    min-height: 38px;
    justify-content: center;
    padding: 5px;
    font-size: 11px;
  }

  .sidebar-bottom {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin-top: 8px;
    padding-top: 0;
  }

  .sidebar-footer {
    width: 100%;
    margin: 0;
    padding: 10px 12px;
    box-sizing: border-box;
  }

  .sidebar-logout {
    width: 100%;
    min-height: 36px;
    font-size: 10px;
  }

  .main-content {
    width: 100%;
    min-height: auto;
    margin-left: 0;
  }
}
</style>
