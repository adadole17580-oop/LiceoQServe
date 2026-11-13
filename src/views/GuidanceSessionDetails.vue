
<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  appointment: {
    type: Object,
    default: () => ({})
  },
  notesSaving: {
    type: Boolean,
    default: false
  },
  notesSaveResult: {
    type: Object,
    default: null
  }
})

const emit = defineEmits([
  'back',
  'navigate',
  'session-action',
  'save-notes'
])

const notes = ref('')
const notesSaved = ref(false)
const savedAt = ref('')

const showDialog = ref(false)
const dialogAction = ref('')

const studentName = computed(() =>
  props.appointment.studentName ||
  props.appointment.student ||
  props.appointment.student_name ||
  'Student'
)

const sessionType = computed(() =>
  props.appointment.sessionType ||
  props.appointment.type ||
  props.appointment.session_type ||
  'Guidance Session'
)

const appointmentId = computed(() =>
  props.appointment.appointmentId ||
  props.appointment.reference ||
  props.appointment.appointment_id ||
  '—'
)

const formattedDate = computed(() => {
  const rawDate = props.appointment.date

  if (!rawDate) return '—'

  const date = new Date(rawDate)

  if (Number.isNaN(date.getTime())) {
    return String(rawDate)
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila'
  })
})

const appointmentTime = computed(() =>
  props.appointment.time || '—'
)

const sessionStatus = computed(() => {
  const status = String(
    props.appointment.status || 'Pending'
  )
    .toLowerCase()
    .replace(/[\_-]/g, ' ')
    .trim()

  const labels = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    approved: 'Confirmed',
    'checked in': 'Checked In',
    'in progress': 'In Progress',
    completed: 'Completed',
    'no show': 'No Show',
    cancelled: 'Cancelled',
    canceled: 'Cancelled',
    rejected: 'Rejected'
  }

  return labels[status] || props.appointment.status
})

const isCheckedIn = computed(() =>
  ['Checked In', 'In Progress', 'Completed'].includes(
    sessionStatus.value
  )
)

const isInProgress = computed(() =>
  ['In Progress', 'Completed'].includes(
    sessionStatus.value
  )
)

const isCompleted = computed(() =>
  sessionStatus.value === 'Completed'
)

const isNoShow = computed(() =>
  sessionStatus.value === 'No Show'
)

// ACTUAL TIMESTAMPS FROM DATABASE

const rawCheckedInAt = computed(() =>
  props.appointment.checkedInAt ||
  props.appointment.checked_in_at ||
  null
)

const rawSessionStartedAt = computed(() =>
  props.appointment.sessionStartedAt ||
  props.appointment.session_started_at ||
  null
)

const rawCompletedAt = computed(() =>
  props.appointment.completedAt ||
  props.appointment.sessionCompletedAt ||
  props.appointment.session_completed_at ||
  props.appointment.completed_at ||
  null
)

function formatTimestamp(value) {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila'
  })
}

const checkedInAt = computed(() =>
  formatTimestamp(rawCheckedInAt.value)
)

const sessionStartedAt = computed(() =>
  formatTimestamp(rawSessionStartedAt.value)
)

const completedAt = computed(() =>
  formatTimestamp(rawCompletedAt.value)
)

// BADGE COLORS ONLY ACTIVATE WHEN TIMESTAMP EXISTS

const hasCheckedInTime = computed(() =>
  Boolean(rawCheckedInAt.value)
)

const hasSessionStartedTime = computed(() =>
  Boolean(rawSessionStartedAt.value)
)

const hasCompletedTime = computed(() =>
  Boolean(rawCompletedAt.value)
)

function formatSavedAt(value) {
  const date = value ? new Date(value) : new Date()

  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila'
  })
}

// LOAD EXISTING NOTES

watch(
  () => props.appointment,
  (appointment, previousAppointment) => {
    notes.value =
      appointment?.staffNotes ??
      appointment?.staff_notes ??
      appointment?.notes ??
      ''

    if (appointment?.id !== previousAppointment?.id) {
      notesSaved.value = false
      savedAt.value = ''
    }
  },
  { immediate: true }
)

// SAVE NOTES SUCCESS RESULT

watch(
  () => props.notesSaveResult,
  (result) => {
    if (!result?.success) return

    const currentId = props.appointment.id

    if (
      result.appointmentId &&
      currentId &&
      String(result.appointmentId) !== String(currentId)
    ) {
      return
    }

    notesSaved.value = true
    savedAt.value = formatSavedAt(result.updatedAt)
  }
)

// CONFIRMATION DIALOG DETAILS

const dialogDetails = computed(() => {
  const dialogs = {
    'Check In': {
      title: 'Check In this Student?',
      message:
        'Confirm that the student has arrived for the scheduled session.',
      confirm: 'Confirm Check In'
    },
    'Start Session': {
      title: 'Start this Session?',
      message:
        'Are you ready to begin this counseling session?',
      confirm: 'Start Session'
    },
    'Complete Session': {
      title: 'Complete this Session?',
      message:
        'Make sure you have saved your session notes before completing this session.',
      confirm: 'Confirm completion'
    },
    'No Show': {
      title: 'Mark as No Show?',
      message:
        'Confirm that the student did not attend the scheduled appointment.',
      confirm: 'Confirm No Show'
    }
  }

  return dialogs[dialogAction.value] || dialogs['Check In']
})

function openDialog(action) {
  dialogAction.value = action
  showDialog.value = true
}

function closeDialog() {
  showDialog.value = false
}

function confirmAction() {
  const action = dialogAction.value

  emit('session-action', {
    action,
    appointment: props.appointment,
    status:
      action === 'Check In'
        ? 'Checked In'
        : action === 'Start Session'
          ? 'In Progress'
          : action === 'Complete Session'
            ? 'Completed'
            : action === 'No Show'
              ? 'No Show'
              : sessionStatus.value
  })

  showDialog.value = false
}

function saveNotes() {
  if (props.notesSaving) return

  notesSaved.value = false

  emit('save-notes', {
    appointment: props.appointment,
    notes: notes.value
  })
}
</script>

<template>
  <main class="guidance-details">
    <header class="page-header">
      <div>
        <h1>Guidance Sessions Details</h1>

        <p class="appointment-date">
          {{ formattedDate }} · {{ appointmentTime }}
        </p>
      </div>

      <button
        class="back-button"
        type="button"
        @click="emit('back')"
      >
        Back to Appointment
      </button>
    </header>

    <section class="session-card">
      <div class="session-heading">
        <div class="session-heading-text">
          <h2>Guidance Sessions Details</h2>
          <p>{{ sessionType }} · {{ appointmentId }}</p>
        </div>

        <span v-if="isNoShow" class="no-show-badge">
          No Show
        </span>
      </div>

      <!-- ACTION BUTTONS -->
      <div class="action-buttons">
        <button
          class="outline-button"
          type="button"
          :disabled="
            isCheckedIn ||
            isNoShow ||
            isCompleted ||
            !['Pending', 'Confirmed'].includes(sessionStatus)
          "
          @click="openDialog('Check In')"
        >
          Check In
        </button>

        <button
          class="outline-button"
          type="button"
          :disabled="
            !isCheckedIn ||
            isInProgress ||
            isNoShow
          "
          @click="openDialog('Start Session')"
        >
          Start Session
        </button>

        <button
          class="outline-button"
          type="button"
          :disabled="
            !isInProgress ||
            isCompleted ||
            isNoShow
          "
          @click="openDialog('Complete Session')"
        >
          Complete Session
        </button>

        <button
          class="outline-button"
          type="button"
          :disabled="
            isCheckedIn ||
            isNoShow ||
            isCompleted ||
            !['Pending', 'Confirmed'].includes(sessionStatus)
          "
          @click="openDialog('No Show')"
        >
          No Show
        </button>
      </div>

      <!-- SESSION PROGRESS -->
      <section class="progress-panel">
        <h3>Session Progress</h3>

        <div class="progress-stages">
          <!-- BLUE AFTER CHECK IN -->
          <div class="progress-stage">
            <span
              class="stage-pill"
              :class="{
                'stage-checked-in': hasCheckedInTime
              }"
            >
              Checked In
            </span>

            <div class="stage-info">
              <span>Check-In</span>
              <strong>{{ checkedInAt || '—' }}</strong>
            </div>
          </div>

          <!-- PINK AFTER START SESSION -->
          <div class="progress-stage">
            <span
              class="stage-pill"
              :class="{
                'stage-in-progress': hasSessionStartedTime
              }"
            >
              In Progress
            </span>

            <div class="stage-info">
              <span>Session Started</span>
              <strong>{{ sessionStartedAt || '—' }}</strong>
            </div>
          </div>

          <!-- GREEN AFTER COMPLETE SESSION -->
          <div class="progress-stage">
            <span
              class="stage-pill"
              :class="{
                'stage-finished': hasCompletedTime
              }"
            >
              Completed
            </span>

            <div class="stage-info">
              <span>Session Completed</span>
              <strong>{{ completedAt || '—' }}</strong>
            </div>
          </div>
        </div>

        <p
          v-if="isNoShow"
          class="no-show-message"
        >
          This appointment has been marked as No Show.
        </p>
      </section>

      <!-- SESSION NOTES -->
      <section class="notes-section">
        <label for="session-notes">
          Session Notes
        </label>

        <textarea
          id="session-notes"
          v-model="notes"
          placeholder="Type notes here..."
          rows="4"
          @input="notesSaved = false"
        ></textarea>

        <div class="save-row">
          <button
            class="save-button"
            type="button"
            :disabled="notesSaving"
            @click="saveNotes"
          >
            {{ notesSaving ? 'Saving...' : 'Save Notes' }}
          </button>

          <span class="privacy-note">
            Visible only to authorized Guidance personnel.
          </span>
        </div>

        <p class="notes-reminder">
          Save the session notes before completing
          this counseling session.
        </p>

        <div
          v-if="notesSaved"
          class="save-success"
          role="status"
          aria-live="polite"
        >
          <strong>✓ Notes saved successfully</strong>
          <span>Last Updated: {{ savedAt }}</span>
        </div>
      </section>
    </section>

    <!-- CONFIRMATION MODAL -->
    <div
      v-if="showDialog"
      class="modal-overlay"
      @click.self="closeDialog"
      @keydown.esc="closeDialog"
    >
      <section
        class="confirmation-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="dialogDetails.title"
      >
        <div class="modal-heading">

          <!-- GREEN USER CHECK ICON FOR CHECK IN -->
          <div
            v-if="dialogAction === 'Check In'"
            class="warning-icon check-in-icon"
            aria-hidden="true"
          >
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
              />
              <circle cx="9" cy="7" r="4" />
              <path d="m16 11 2 2 4-4" />
            </svg>
          </div>

<!-- GREEN PLAY ICON FOR START SESSION -->
<div
  v-else-if="dialogAction === 'Start Session'"
  class="warning-icon start-session-icon"
  aria-hidden="true"
>
  <svg
    width="30"
    height="30"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="m10 8 6 4-6 4V8Z" />
  </svg>
</div>

<!-- INSERT COMPLETE SESSION ICON HERE -->
<div
  v-else-if="dialogAction === 'Complete Session'"
  class="warning-icon complete-session-icon"
  aria-hidden="true"
>
  <svg
    width="30"
    height="30"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path
      d="M12 2 14.5 4 17.7 4.3 19 7.2 22 9
         20.8 12 22 15 19 16.8 17.7 19.7
         14.5 20 12 22 9.5 20 6.3 19.7
         5 16.8 2 15 3.2 12 2 9 5 7.2
         6.3 4.3 9.5 4Z"
    />
    <path d="m8 12 3 3 5-6" />
  </svg>
</div>

<!-- WARNING ICON FOR NO SHOW -->
<div
  v-else
  class="warning-icon"
  aria-hidden="true"
>
  !
</div>

          <h2>{{ dialogDetails.title }}</h2>
        </div>

        <p class="modal-description">
          {{ studentName }} · {{ sessionType }} ·
          {{ formattedDate }} at {{ appointmentTime }}
        </p>

        <p class="modal-extra">
          {{ dialogDetails.message }}
        </p>

        <div class="modal-actions">
          <button
            class="cancel-button"
            type="button"
            @click="closeDialog"
          >
            Go Back
          </button>

          <button
            class="confirm-button"
            type="button"
            @click="confirmAction"
          >
            {{ dialogDetails.confirm }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
/* GREEN BADGE CHECK FOR COMPLETE SESSION */
.confirmation-modal .warning-icon.complete-session-icon {
  background-color: #e1f0e5;
  color: #287a4b;
}

.confirmation-modal .warning-icon.complete-session-icon svg {
  display: block;
  flex-shrink: 0;
  stroke: #287a4b;
}
/* START SESSION ICON */
.warning-icon.start-session-icon {
  background: #e1f0e5;
  color: #287a4b;
}

.start-session-icon svg {
  display: block;
  flex-shrink: 0;
}
* {
  box-sizing: border-box;
}

.guidance-details {
  width: 100%;
  min-width: 0;
  padding: 25px 22px;
  color: #300608;
  font-family: Arial, Helvetica, sans-serif;
}

/* HEADER */

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 29px;
}

.page-header h1,
.session-heading h2 {
  margin: 0;
  color: #300608;
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 500;
  line-height: 1.15;
}

.page-header h1 {
  font-size: clamp(25px, 2.6vw, 32px);
}

.appointment-date {
  margin: 3px 0 0;
  font-size: 14px;
}

/* MAIN BUTTONS */

.back-button,
.save-button,
.confirm-button {
  border: 1px solid #51090e;
  border-radius: 7px;
  background: #51090e;
  color: #fffafa;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.back-button {
  flex-shrink: 0;
  padding: 8px 19px;
}

.back-button:hover,
.save-button:hover:not(:disabled),
.confirm-button:hover {
  border-color: #390609;
  background: #390609;
  box-shadow: 0 3px 8px rgba(57, 6, 9, 0.24);
  transform: translateY(-1px);
}

/* SESSION CARD */

.session-card {
  width: 100%;
  padding: 25px 27px 13px;
  border: 1px solid #965d60;
  border-radius: 8px;
  background: #f8eeee;
}

.session-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.session-heading-text {
  min-width: 0;
}

.session-heading h2 {
  font-size: clamp(24px, 2.6vw, 30px);
}

.session-heading p {
  margin: 0 0 6px;
  color: #4d292b;
  font-size: 13px;
}

.no-show-badge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  min-width: 92px;
  padding: 5px 14px;
  border-radius: 7px;
  background: #f0c9cb;
  color: #8b0008;
  font-size: 11px;
  font-weight: 600;
}

/* ACTION BUTTONS */

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 16px;
}

.outline-button {
  min-height: 35px;
  padding: 7px 15px;
  border: 1px solid #8b4b50;
  border-radius: 7px;
  background: #f8eeee;
  color: #300608;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 2px 4px rgba(81, 9, 14, 0.05);
  cursor: pointer;
  transition:
    color 0.2s ease,
    background 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.outline-button:hover:not(:disabled) {
  border-color: #51090e;
  background: #51090e;
  color: #fffafa;
  box-shadow: 0 3px 8px rgba(81, 9, 14, 0.25);
  transform: translateY(-1px);
}

.outline-button:active:not(:disabled) {
  transform: translateY(0);
}

.outline-button:disabled {
  border-color: #d6bfc1;
  background: #f0e3e4;
  color: #9c8587;
  box-shadow: none;
  cursor: not-allowed;
}

/* SESSION PROGRESS PANEL */

.progress-panel {
  margin: 0 1px 16px;
  padding: 13px 16px 12px;
  border-radius: 8px;
  background: #f3e9ca;
}

.progress-panel h3 {
  margin: 0 0 9px;
  color: #35100b;
  font-size: 14px;
  font-weight: 700;
}

.progress-stages {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 15px;
}

.progress-stage {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
}

/* DEFAULT: GREY / NEUTRAL */

.stage-pill {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 105px;
  min-height: 30px;
  padding: 5px 12px;
  border: 1px solid #bd9997;
  border-radius: 8px;
  background: #f7eee1;
  color: #300608;
  font-size: 11px;
  text-align: center;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

/* CHECKED IN: SOFT BLUE */

.stage-pill.stage-checked-in {
  border-color: #8cb6df;
  background: #dceaf8;
  color: #245b8a;
}

/* IN PROGRESS: ORIGINAL PINK */

.stage-pill.stage-in-progress {
  border-color: #c58d8c;
  background: #f0c9c3;
  color: #39090c;
}

/* COMPLETED: GREEN */

.stage-pill.stage-finished {
  border-color: #83c89b;
  background: #c7e8d0;
  color: #22683b;
}

/* TIMESTAMPS */

.stage-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 10px 0 0 4px;
  font-size: 11px;
}

.stage-info span {
  color: #513332;
}

.stage-info strong {
  color: #300608;
  font-size: 12px;
  font-weight: 700;
}

.no-show-message {
  margin: 12px 0 0;
  color: #7b3024;
  font-size: 12px;
}

/* NOTES */

.notes-section {
  padding: 0 1px;
}

.notes-section label {
  display: block;
  margin-bottom: 7px;
  color: #300608;
  font-size: 14px;
  font-weight: 700;
}

.notes-section textarea {
  display: block;
  width: 100%;
  min-height: 76px;
  padding: 12px 14px;
  border: 1px solid #965d60;
  border-radius: 8px;
  outline: none;
  background: #f8eeee;
  color: #300608;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.notes-section textarea::placeholder {
  color: #9c7e80;
  font-size: 13px;
  font-weight: 600;
}

.notes-section textarea:focus {
  border-color: #51090e;
  box-shadow: 0 0 0 3px rgba(81, 9, 14, 0.09);
}

.save-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}

.save-button {
  min-width: 135px;
  min-height: 44px;
  padding: 10px 20px;
  border-radius: 7px;
  font-size: 14px;
  box-shadow: 0 2px 5px rgba(81, 9, 14, 0.12);
}

.save-button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.privacy-note {
  color: #3c2021;
  font-size: 11px;
}

.notes-reminder {
  margin: 9px 0 0;
  color: #4d411d;
  font-size: 11px;
  line-height: 1.5;
}

/* SAVE NOTES SUCCESS */

.save-success {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 16px;
  padding: 11px 14px;
  border: 1px solid #a5d2b1;
  border-radius: 7px;
  background: #b8dfc2;
  color: #163f20;
  font-size: 12px;
}

.save-success strong {
  font-weight: 700;
}

.save-success span {
  font-size: 11px;
}

/* MODAL */

.modal-overlay {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(29, 15, 16, 0.42);
}

.confirmation-modal {
  width: 100%;
  max-width: 480px;
  padding: 23px 22px 24px;
  border: 1px solid #e9d8d9;
  border-radius: 16px;
  background: #f8eeee;
  box-shadow: 0 14px 42px rgba(31, 5, 7, 0.18);
  animation: modal-enter 0.18s ease-out;
}

.modal-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.warning-icon {
  display: flex;
  width: 62px;
  height: 62px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 13px;
  background: #a9787b;
  color: #51090e;
  font-size: 31px;
  font-weight: 700;
}

/* NEW: GREEN USER CHECK ICON FOR CHECK IN */

.warning-icon.check-in-icon {
  background: #e1f0e5;
  color: #287a4b;
}

.check-in-icon svg {
  display: block;
  flex-shrink: 0;
}

.modal-heading h2 {
  margin: 0;
  color: #300608;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(20px, 3vw, 27px);
  font-weight: 500;
  line-height: 1.25;
}

.modal-description {
  margin: 19px 0 0;
  color: #452326;
  font-size: 14px;
  line-height: 1.6;
}

.modal-extra {
  margin: 9px 0 0;
  color: #705658;
  font-size: 12px;
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 22px;
}

.cancel-button {
  min-height: 42px;
  padding: 9px 18px;
  border: 1px solid #8b4b50;
  border-radius: 20px;
  background: #f8eeee;
  color: #300608;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.cancel-button:hover {
  background: #eedfe0;
}

.confirm-button {
  min-height: 42px;
  padding: 9px 20px;
  border-radius: 20px;
  font-size: 13px;
}

@keyframes modal-enter {
  from {
    opacity: 0;
    transform: translateY(7px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* RESPONSIVE */

@media (max-width: 700px) {
  .guidance-details {
    padding: 20px 14px;
  }

  .page-header {
    align-items: flex-start;
    flex-direction: column;
    margin-bottom: 20px;
  }

  .back-button {
    align-self: flex-start;
  }

  .session-card {
    padding: 19px 15px 14px;
  }

  .action-buttons {
    gap: 7px;
  }

  .outline-button {
    padding: 8px 10px;
    font-size: 12px;
  }

  .progress-panel {
    padding: 12px 10px;
  }

  .progress-stages {
    gap: 7px;
  }

  .stage-pill {
    min-width: 0;
    width: 100%;
    padding: 5px 4px;
    font-size: 10px;
  }

  .stage-info {
    margin-left: 1px;
    font-size: 10px;
  }

  .stage-info strong {
    font-size: 11px;
  }
}

@media (max-width: 420px) {
  .session-heading {
    align-items: flex-start;
  }

  .session-heading h2 {
    font-size: 23px;
  }

  .no-show-badge {
    min-width: auto;
    padding: 5px 9px;
  }

  .progress-stages {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .progress-stage {
    display: grid;
    grid-template-columns: minmax(100px, 0.8fr) 1fr;
    align-items: center;
    gap: 10px;
  }

  .stage-info {
    margin: 0;
  }

  .save-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .confirmation-modal {
    padding: 19px 16px;
  }

  .warning-icon {
    width: 48px;
    height: 48px;
    font-size: 25px;
  }

  .modal-actions {
    flex-direction: column-reverse;
  }

  .modal-actions button {
    width: 100%;
  }
}
</style>
