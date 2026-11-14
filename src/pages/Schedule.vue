
<template>
  <section class="schedule-page">

    <div class="page-heading">
      <h1>Schedule Management</h1>
      <p>Manage office hours, availability, slots and blocked dates</p>
    </div>

    <p v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </p>

    <div class="schedule-layout">

      <section class="schedule-card office-hours-card">

        <div class="schedule-card-header">
          <h2>Office Hours</h2>
        </div>

        <div
          v-for="officeHour in officeHours"
          :key="officeHour.day"
          class="office-hour-row"
        >
          <span>{{ officeHour.day }}</span>

          <strong
            :class="{ closed: officeHour.hours === 'Closed' }"
          >
            {{ officeHour.hours }}
          </strong>
        </div>

      </section>

      <section class="schedule-card block-date-card">

        <h2>Block a date or time</h2>

        <form @submit.prevent="blockDate">

          <div class="schedule-form-field">
            <input
              v-model="selectedDate"
              type="date"
              :min="today"
              aria-label="Select date"
              required
              :disabled="saving"
            />
          </div>

          <div class="schedule-form-field">
            <select
              v-model="selectedTime"
              required
              aria-label="Choose a time"
              :disabled="saving"
            >
              <option value="" disabled>
                Choose a time
              </option>

              <option
                v-for="time in timeOptions"
                :key="time.value"
                :value="time.value"
              >
                {{ time.label }}
              </option>
            </select>
          </div>

          <div class="schedule-form-field">
            <input
              v-model="reason"
              type="text"
              placeholder="Reason (optional)"
              maxlength="150"
              :disabled="saving"
            />
          </div>

          <button
            type="submit"
            class="block-button"
            :disabled="saving || !selectedDate || !selectedTime"
          >
            {{ saving ? 'Blocking...' : 'BLOCK DATE AND TIME' }}
          </button>

        </form>

      </section>

    </div>

    <section class="schedule-card blocked-section">

      <div class="blocked-header">

        <h2>Blocked Dates and Times</h2>

        <div class="blocked-header-actions">

          <span class="blocked-count">
            {{ blockedDates.length }}
            {{ blockedDates.length === 1 ? 'blocked' : 'blocked' }}
          </span>

          <button
            type="button"
            class="refresh-button"
            @click="refreshSchedules"
            :disabled="loading"
          >
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>

        </div>

      </div>

      <p v-if="loading && blockedDates.length === 0" class="empty-state">
        Loading blocked dates...
      </p>

      <div
        v-for="item in blockedDates"
        :key="item.id"
        class="blocked-date-item"
      >

        <div class="blocked-date-info">
          <strong>{{ item.dateLabel }}</strong>

          <span>{{ item.timeLabel }}</span>

          <small v-if="item.note">
            {{ item.note }}
          </small>
        </div>

        <button
          type="button"
          class="remove-button"
          :disabled="deletingId === item.id"
          @click="deleteBlockedDate(item)"
        >
          {{ deletingId === item.id ? 'Removing...' : 'Remove' }}
        </button>

      </div>

      <p
        v-if="!loading && blockedDates.length === 0"
        class="empty-state"
      >
        No blocked dates or times.
      </p>

    </section>

    <div
      v-if="showDeleteConfirm"
      class="schedule-modal-overlay"
      @click.self="cancelDelete"
    >
      <div class="schedule-confirm-modal">

        <div class="confirm-icon">!</div>

        <h2>Remove Blocked Schedule?</h2>

        <p>
          Are you sure you want to remove the blocked schedule on
          <strong>{{ selectedBlockedDate?.dateLabel }}</strong>
          ({{ selectedBlockedDate?.timeLabel }})?
        </p>

        <div class="confirm-actions">

          <button
            type="button"
            class="confirm-cancel-button"
            @click="cancelDelete"
            :disabled="deletingId !== null"
          >
            Cancel
          </button>

          <button
            type="button"
            class="confirm-remove-button"
            @click="confirmDeleteBlockedDate"
            :disabled="deletingId !== null"
          >
            {{ deletingId !== null ? 'Removing...' : 'Remove' }}
          </button>

        </div>

      </div>
    </div>

    <div
      v-if="showSuccess"
      class="schedule-success-overlay"
      @click.self="showSuccess = false"
    >
      <div class="schedule-success-modal">

        <div class="success-icon">✓</div>

        <h2>{{ successTitle }}</h2>

        <p>{{ successMessage }}</p>

        <button
          type="button"
          @click="showSuccess = false"
        >
          OK
        </button>

      </div>
    </div>

  </section>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { supabase } from '../lib/Supabase.js'
import './Schedule.css'

const officeHours = ref([
  { day: 'Sunday', hours: 'Closed' },
  { day: 'Monday', hours: '9:00 AM - 5:00 PM' },
  { day: 'Tuesday', hours: '9:00 AM - 5:00 PM' },
  { day: 'Wednesday', hours: '9:00 AM - 5:00 PM' },
  { day: 'Thursday', hours: '9:00 AM - 5:00 PM' },
  { day: 'Friday', hours: '9:00 AM - 5:00 PM' },
  { day: 'Saturday', hours: '9:00 AM - 12:00 PM' }
])

function getLocalDate() {
  const date = new Date()

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const today = getLocalDate()

const selectedDate = ref('')
const selectedTime = ref('')
const reason = ref('')

const timeOptions = [
  {
    label: 'All Day',
    value: 'all-day'
  },
  {
    label: '9:00 AM - 10:00 AM',
    value: '09:00|10:00'
  },
  {
    label: '10:00 AM - 11:00 AM',
    value: '10:00|11:00'
  },
  {
    label: '11:00 AM - 12:00 NN',
    value: '11:00|12:00'
  },
  {
    label: '12:00 NN - 1:00 PM',
    value: '12:00|13:00'
  },
  {
    label: '1:00 PM - 2:00 PM',
    value: '13:00|14:00'
  },
  {
    label: '2:00 PM - 3:00 PM',
    value: '14:00|15:00'
  },
  {
    label: '3:00 PM - 4:00 PM',
    value: '15:00|16:00'
  },
  {
    label: '4:00 PM - 5:00 PM',
    value: '16:00|17:00'
  }
]

const blockedDates = ref([])

const loading = ref(false)
const saving = ref(false)
const deletingId = ref(null)

const errorMessage = ref('')

const showSuccess = ref(false)
const successTitle = ref('')
const successMessage = ref('')

const showDeleteConfirm = ref(false)
const selectedBlockedDate = ref(null)

let officeId = null
let scheduleChannel = null

function formatDate(dateString) {
  if (!dateString) return ''

  const [year, month, day] = dateString.split('-')

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day)
  )

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatTime(timeString) {
  if (!timeString) return ''

  const [hour, minute] = timeString.split(':')

  const date = new Date()
  date.setHours(Number(hour), Number(minute), 0, 0)

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  })
}

function showSuccessMessage(title, message) {
  successTitle.value = title
  successMessage.value = message
  showSuccess.value = true
}

async function getStaffOffice() {
  const { data: authData, error: authError } =
    await supabase.auth.getUser()

  if (authError) throw authError

  const user = authData.user

  if (!user) {
    throw new Error('Please log in first.')
  }

  const { data: profile, error: profileError } =
    await supabase
      .from('profiles')
      .select('id, role, office_id')
      .eq('id', user.id)
      .single()

  if (profileError) throw profileError

  if (!profile.office_id) {
    throw new Error('Your account is not assigned to an office.')
  }

  if (!['staff', 'admin'].includes(profile.role)) {
    throw new Error('Only office staff can manage schedules.')
  }

  officeId = profile.office_id
}

async function fetchSchedules() {
  if (!officeId) return

  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
      .from('office_schedules')
      .select('*')
      .eq('office_id', officeId)
      .not('effective_date', 'is', null)
      .order('effective_date', {
        ascending: true
      })

    if (error) throw error

    blockedDates.value = (data || []).map(item => {

      let timeLabel = 'All Day'

      if (item.opens_at && item.closes_at) {
        timeLabel =
          `${formatTime(item.opens_at)} - ${formatTime(item.closes_at)}`
      }

      return {
        id: item.id,
        date: item.effective_date,
        dateLabel: formatDate(item.effective_date),
        timeLabel,
        note: item.note || ''
      }
    })

  } catch (error) {
    console.error('Unable to fetch schedules:', error)

    errorMessage.value =
      error.message || 'Unable to load schedules.'

  } finally {
    loading.value = false
  }
}

async function refreshSchedules() {
  await fetchSchedules()
}

async function blockDate() {
  if (!selectedDate.value || !selectedTime.value || !officeId) {
    return
  }

  if (selectedDate.value < today) {
    errorMessage.value = 'Please select today or a future date.'
    return
  }

  const [opensAt, closesAt] =
    selectedTime.value === 'all-day'
      ? [null, null]
      : selectedTime.value.split('|')

  const { data: existing, error: checkError } = await supabase
    .from('office_schedules')
    .select('id, opens_at, closes_at, is_closed')
    .eq('office_id', officeId)
    .eq('effective_date', selectedDate.value)

  if (checkError) {
    errorMessage.value = checkError.message
    return
  }

  const alreadyBlocked = (existing || []).some(item => {

    if (
      selectedTime.value === 'all-day' ||
      (!item.opens_at && !item.closes_at)
    ) {
      return true
    }

    return (
      opensAt < item.closes_at &&
      closesAt > item.opens_at
    )
  })

  if (alreadyBlocked) {
    errorMessage.value =
      'This date or time is already blocked or overlaps an existing block.'
    return
  }

  saving.value = true
  errorMessage.value = ''

  try {
    const { error } = await supabase
      .from('office_schedules')
      .insert({
        office_id: officeId,
        day_of_week: null,
        opens_at: opensAt,
        closes_at: closesAt,
        is_closed: selectedTime.value === 'all-day',
        effective_date: selectedDate.value,
        note: reason.value.trim() || null
      })

    if (error) throw error

    const blockedDate = formatDate(selectedDate.value)

    const blockedTime = selectedTime.value === 'all-day'
      ? 'All Day'
      : `${formatTime(opensAt)} - ${formatTime(closesAt)}`

    selectedDate.value = ''
    selectedTime.value = ''
    reason.value = ''

    await fetchSchedules()

    showSuccessMessage(
      'Schedule Blocked!',
      `${blockedDate} (${blockedTime}) has been successfully blocked.`
    )

  } catch (error) {
    console.error('Unable to block date:', error)

    errorMessage.value =
      error.message || 'Unable to block date or time.'

  } finally {
    saving.value = false
  }
}

function deleteBlockedDate(item) {
  if (deletingId.value !== null) return

  selectedBlockedDate.value = item
  showDeleteConfirm.value = true
}

function cancelDelete() {
  if (deletingId.value !== null) return

  showDeleteConfirm.value = false
  selectedBlockedDate.value = null
}

async function confirmDeleteBlockedDate() {
  const item = selectedBlockedDate.value

  if (!item || !officeId || deletingId.value !== null) {
    return
  }

  deletingId.value = item.id
  errorMessage.value = ''

  try {
    const { error } = await supabase
      .from('office_schedules')
      .delete()
      .eq('id', item.id)
      .eq('office_id', officeId)

    if (error) throw error

    showDeleteConfirm.value = false
    selectedBlockedDate.value = null

    await fetchSchedules()

  } catch (error) {
    console.error('Unable to remove blocked schedule:', error)

    errorMessage.value =
      error.message || 'Unable to remove blocked schedule.'

  } finally {
    deletingId.value = null
  }
}

function subscribeToSchedules() {
  if (!officeId) return

  scheduleChannel = supabase
    .channel(`office-schedules-${officeId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'office_schedules',
        filter: `office_id=eq.${officeId}`
      },
      () => {
        fetchSchedules()
      }
    )
    .subscribe()
}

onMounted(async () => {
  try {
    await getStaffOffice()
    await fetchSchedules()
    subscribeToSchedules()

  } catch (error) {
    console.error('Schedule initialization error:', error)

    errorMessage.value =
      error.message || 'Unable to initialize schedule.'
  }
})

onUnmounted(async () => {
  if (scheduleChannel) {
    await supabase.removeChannel(scheduleChannel)
  }
})
</script>
