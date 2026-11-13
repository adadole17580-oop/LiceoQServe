
<template>
  <section class="students-page">

    <div class="students-heading">
      <h1>STUDENTS</h1>
      <p>Search Office of Student Affairs records by name or student ID.</p>
    </div>

    <!-- SEARCH AND REFRESH -->
    <div class="students-toolbar">
      <input
        v-model="searchQuery"
        type="search"
        class="search-input"
        placeholder="Search name or Student ID"
        aria-label="Search students"
      />

      <button
        type="button"
        class="refresh-button"
        @click="fetchStudents"
        :disabled="loading"
      >
        {{ loading ? 'Loading...' : 'Refresh' }}
      </button>
    </div>

    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>

    <!-- STUDENTS TABLE -->
    <div class="students-table-wrapper">
      <table class="students-table">
        <thead>
          <tr>
            <th>NAME</th>
            <th>STUDENT ID</th>
            <th>COURSE</th>
            <th>YEAR</th>
            <th>EMAIL / CONTACT</th>
            <th>ACTION</th>
          </tr>
        </thead>

        <tbody>
          <tr v-if="loading && students.length === 0">
            <td colspan="6" class="empty-state">
              Loading students...
            </td>
          </tr>

          <tr
            v-for="student in filteredStudents"
            :key="student.id"
          >
            <td>{{ student.name }}</td>
            <td>{{ student.studentId }}</td>
            <td>{{ student.course }}</td>
            <td>{{ student.yearLevel }}</td>

            <td>
              <div>{{ student.email }}</div>
              <div>{{ student.contact }}</div>
            </td>

            <td>
              <button
                type="button"
                class="view-details"
                @click="openDetails(student)"
              >
                View Details
              </button>
            </td>
          </tr>

          <tr v-if="!loading && filteredStudents.length === 0">
            <td colspan="6" class="empty-state">
              {{
                students.length === 0
                  ? 'No student records found.'
                  : 'No students match your search.'
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="students-footer">
      <span>
        Showing {{ filteredStudents.length }} of
        {{ students.length }} student(s)
      </span>
    </div>

    <!-- STUDENT DETAILS MODAL -->
    <div
      v-if="selectedStudent"
      class="modal-overlay"
      @click.self="closeDetails"
    >
      <section
        class="details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-details-title"
      >

        <div class="modal-top">
          <span class="eyebrow">STUDENT DETAILS</span>

          <button
            type="button"
            class="close-button"
            @click="closeDetails"
          >
            CLOSE
          </button>
        </div>

        <h2 id="student-details-title">
          {{ selectedStudent.name }}
        </h2>

        <div class="section-divider"></div>

        <!-- PERSONAL INFORMATION -->
        <h3>Personal Information</h3>

        <div class="personal-grid">

          <div class="info-item">
            <span>Full name</span>
            <strong>{{ selectedStudent.name }}</strong>
          </div>

          <div class="info-item">
            <span>Student ID</span>
            <strong>{{ selectedStudent.studentId }}</strong>
          </div>

          <div class="info-item">
            <span>Program</span>
            <strong>{{ selectedStudent.course }}</strong>
          </div>

          <div class="info-item">
            <span>Year Level</span>
            <strong>{{ selectedStudent.yearLevel }}</strong>
          </div>

          <div class="info-item">
            <span>Email</span>
            <strong>{{ selectedStudent.email }}</strong>
          </div>

          <div class="info-item">
            <span>Contact number</span>
            <strong>{{ selectedStudent.contact }}</strong>
          </div>

          <div class="info-item">
            <span>Account Status</span>
            <strong
              :class="
                selectedStudent.isActive
                  ? 'active-status'
                  : 'inactive-status'
              "
            >
              {{ selectedStudent.isActive ? 'Active' : 'Inactive' }}
            </strong>
          </div>

        </div>

        <div class="section-divider"></div>

        <!-- TRANSACTION LOADING -->
        <p
          v-if="transactionsLoading"
          class="transaction-message"
        >
          Loading student transactions...
        </p>

        <p
          v-if="transactionError"
          class="transaction-error"
        >
          {{ transactionError }}
        </p>

        <!-- CURRENT ACTIVE TRANSACTIONS -->
        <h3>Current Active Transactions</h3>

        <div
          v-if="!transactionsLoading && activeTransactions.length === 0"
          class="not-connected-message"
        >
          This student has no current active transactions.
        </div>

        <div
          v-for="transaction in activeTransactions"
          :key="transaction.id"
          class="transaction-card"
        >
          <div class="transaction-top">
            <strong>{{ transaction.serviceName }}</strong>

            <span
              class="transaction-status"
              :class="getStatusClass(transaction.status)"
            >
              {{ formatStatus(transaction.status) }}
            </span>
          </div>

          <div class="transaction-details">
            <p>
              <span>Type:</span>
              {{ transaction.type }}
            </p>

            <p>
              <span>Date:</span>
              {{ formatDate(transaction.date) }}
            </p>

            <p v-if="transaction.purpose">
              <span>Purpose:</span>
              {{ transaction.purpose }}
            </p>

            <p v-if="transaction.details">
              <span>Details:</span>
              {{ transaction.details }}
            </p>
          </div>
        </div>

        <!-- TRANSACTION HISTORY -->
        <h3 class="history-heading">Transaction History</h3>

        <div
          v-if="!transactionsLoading && historyTransactions.length === 0"
          class="not-connected-message"
        >
          No previous transaction records found.
        </div>

        <div
          v-for="transaction in historyTransactions"
          :key="transaction.id"
          class="transaction-card history-card"
        >
          <div class="transaction-top">
            <strong>{{ transaction.serviceName }}</strong>

            <span
              class="transaction-status"
              :class="getStatusClass(transaction.status)"
            >
              {{ formatStatus(transaction.status) }}
            </span>
          </div>

          <div class="transaction-details">
            <p>
              <span>Type:</span>
              {{ transaction.type }}
            </p>

            <p>
              <span>Date:</span>
              {{ formatDate(transaction.date) }}
            </p>

            <p v-if="transaction.purpose">
              <span>Purpose:</span>
              {{ transaction.purpose }}
            </p>

            <p v-if="transaction.details">
              <span>Details:</span>
              {{ transaction.details }}
            </p>
          </div>
        </div>

        <button
          type="button"
          class="transaction-refresh"
          @click="fetchTransactions(selectedStudent)"
          :disabled="transactionsLoading"
        >
          {{ transactionsLoading ? 'Loading...' : 'Refresh Transactions' }}
        </button>

      </section>
    </div>

  </section>
</template>

<script setup>
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount
} from 'vue'

import { supabase } from '../lib/Supabase.js'

const searchQuery = ref('')
const selectedStudent = ref(null)
const students = ref([])

const loading = ref(false)
const errorMessage = ref('')

const transactionsLoading = ref(false)
const transactionError = ref('')

const activeTransactions = ref([])
const historyTransactions = ref([])

let studentsChannel = null
let appointmentsChannel = null
let requestsChannel = null

// OSA SERVICE IDS
const OSA_SERVICE_IDS = [
  '5c2ab6fc-5f24-4573-896a-f5a11ad6625e',
  '65a94572-bce2-460f-b3e8-2ed568ee7bbf',
  'e5121b34-a6d2-4370-a023-5153a73c97f8'
]

// TERMINAL TRANSACTION STATUSES
const HISTORY_STATUSES = [
  'completed',
  'cancelled',
  'canceled',
  'no_show',
  'rejected',
  'declined'
]

// CONVERT DATABASE VALUES
function mapStudent(profile) {
  return {
    id: profile.id,
    studentId: profile.student_id || 'Not provided',
    name: profile.full_name || 'Not provided',
    course: profile.program || 'Not provided',
    yearLevel: profile.year_level || 'Not provided',
    email: profile.university_email || 'Not provided',
    contact: 'Not available',
    isActive: profile.is_active === true
  }
}

// FETCH STUDENTS FROM SUPABASE
async function fetchStudents() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        student_id,
        full_name,
        university_email,
        program,
        year_level,
        role,
        is_active,
        created_at
      `)
      .eq('role', 'student')
      .order('full_name', { ascending: true })

    if (error) throw error

    students.value = (data || []).map(mapStudent)

    if (selectedStudent.value) {
      const updatedStudent = students.value.find(
        student => student.id === selectedStudent.value.id
      )

      if (updatedStudent) {
        selectedStudent.value = updatedStudent
      } else {
        closeDetails()
      }
    }

  } catch (error) {
    console.error('FETCH STUDENTS ERROR:', error)

    errorMessage.value =
      error.message || 'Unable to load student records from Supabase.'

  } finally {
    loading.value = false
  }
}

// SEARCH STUDENTS
const filteredStudents = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return students.value.filter(student => {
    return [
      student.name,
      student.studentId,
      student.course,
      student.yearLevel,
      student.email
    ].some(value =>
      String(value).toLowerCase().includes(query)
    )
  })
})

// FORMAT STATUS
function formatStatus(status) {
  const labels = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    processing: 'Processing',
    in_progress: 'In Progress',
    checked_in: 'Checked In',
    ready_for_pickup: 'Ready for Pick Up',
    completed: 'Completed',
    cancelled: 'Cancelled',
    canceled: 'Cancelled',
    no_show: 'No-Show',
    rejected: 'Rejected',
    declined: 'Declined'
  }

  return labels[String(status || '').toLowerCase()] ||
    String(status || 'Unknown').replaceAll('_', ' ')
}

// STATUS CLASS
function getStatusClass(status) {
  const value = String(status || '').toLowerCase()

  if (value === 'completed') return 'status-completed'

  if (['cancelled', 'canceled', 'no_show', 'rejected', 'declined'].includes(value)) {
    return 'status-cancelled'
  }

  if (value === 'ready_for_pickup') return 'status-ready'

  if (value === 'confirmed') return 'status-confirmed'

  return 'status-pending'
}

// FORMAT DATE
function formatDate(value) {
  if (!value) return 'Not available'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Not available'
  }

  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

// GET SERVICE NAME
function getServiceName(service) {
  if (!service) return 'OSA Service'

  return (
    service.service_name ||
    service.name ||
    service.title ||
    service.service_title ||
    'OSA Service'
  )
}

// OPEN STUDENT DETAILS
async function openDetails(student) {
  selectedStudent.value = student

  activeTransactions.value = []
  historyTransactions.value = []
  transactionError.value = ''

  document.body.style.overflow = 'hidden'

  await fetchTransactions(student)
}

// FETCH APPOINTMENTS AND SERVICE REQUESTS
async function fetchTransactions(student) {
  if (!student?.id) return

  transactionsLoading.value = true
  transactionError.value = ''

  try {
    const [appointmentsResult, requestsResult] = await Promise.all([
      supabase
        .from('appointments')
        .select(`
          id,
          student_id,
          service_id,
          scheduled_at,
          status,
          purpose,
          created_at
        `)
        .eq('student_id', student.id)
        .in('service_id', OSA_SERVICE_IDS)
        .order('scheduled_at', { ascending: false }),

      supabase
        .from('service_requests')
        .select(`
          id,
          student_id,
          service_id,
          request_type,
          title,
          details,
          status,
          submitted_at,
          updated_at,
          completed_at
        `)
        .eq('student_id', student.id)
        .in('service_id', OSA_SERVICE_IDS)
        .order('submitted_at', { ascending: false })
    ])

    if (appointmentsResult.error) {
      throw appointmentsResult.error
    }

    if (requestsResult.error) {
      throw requestsResult.error
    }

    const appointments = appointmentsResult.data || []
    const requests = requestsResult.data || []

    // GET SERVICE INFORMATION
    const serviceIds = [
      ...new Set([
        ...appointments.map(item => item.service_id),
        ...requests.map(item => item.service_id)
      ].filter(Boolean))
    ]

    let serviceMap = {}

    if (serviceIds.length > 0) {
      const { data: services, error: servicesError } = await supabase
        .from('office_services')
        .select('*')
        .in('id', serviceIds)

      if (servicesError) {
        console.error('FETCH SERVICES ERROR:', servicesError)
      }

      for (const service of services || []) {
        serviceMap[service.id] = getServiceName(service)
      }
    }

    // CONVERT APPOINTMENTS
    const mappedAppointments = appointments.map(item => ({
      id: `appointment-${item.id}`,
      originalId: item.id,
      serviceId: item.service_id,
      serviceName: serviceMap[item.service_id] || 'OSA Appointment',
      type: 'Appointment',
      status: item.status,
      date: item.scheduled_at || item.created_at,
      purpose: item.purpose || '',
      details: ''
    }))

    // CONVERT SERVICE REQUESTS
    const mappedRequests = requests.map(item => ({
      id: `request-${item.id}`,
      originalId: item.id,
      serviceId: item.service_id,
      serviceName:
        serviceMap[item.service_id] ||
        item.title ||
        'OSA Service Request',
      type: item.request_type || 'Service Request',
      status: item.status,
      date: item.submitted_at,
      purpose: item.title || '',
      details: item.details || ''
    }))

    // COMBINE ALL TRANSACTIONS
    const allTransactions = [
      ...mappedAppointments,
      ...mappedRequests
    ].sort((a, b) => {
      return new Date(b.date || 0) - new Date(a.date || 0)
    })

    // SEPARATE ACTIVE AND HISTORY
    activeTransactions.value = allTransactions.filter(item => {
      const status = String(item.status || '').toLowerCase()
      return !HISTORY_STATUSES.includes(status)
    })

    historyTransactions.value = allTransactions.filter(item => {
      const status = String(item.status || '').toLowerCase()
      return HISTORY_STATUSES.includes(status)
    })

  } catch (error) {
    console.error('FETCH STUDENT TRANSACTIONS ERROR:', error)

    transactionError.value =
      error.message || 'Unable to load student transactions.'

  } finally {
    transactionsLoading.value = false
  }
}

// CLOSE STUDENT DETAILS
function closeDetails() {
  selectedStudent.value = null

  activeTransactions.value = []
  historyTransactions.value = []
  transactionError.value = ''

  document.body.style.overflow = ''
}

// ESCAPE KEY
function handleEscape(event) {
  if (event.key === 'Escape') {
    closeDetails()
  }
}

// REFRESH OPEN STUDENT TRANSACTIONS
function refreshSelectedTransactions() {
  if (selectedStudent.value && !transactionsLoading.value) {
    fetchTransactions(selectedStudent.value)
  }
}

// SUPABASE REALTIME
function subscribeToStudentChanges() {
  studentsChannel = supabase
    .channel('osa-students-profiles')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'profiles'
      },
      () => {
        fetchStudents()
      }
    )
    .subscribe()
}

function subscribeToTransactionChanges() {
  appointmentsChannel = supabase
    .channel('osa-student-appointments')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'appointments'
      },
      () => {
        refreshSelectedTransactions()
      }
    )
    .subscribe()

  requestsChannel = supabase
    .channel('osa-student-service-requests')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'service_requests'
      },
      () => {
        refreshSelectedTransactions()
      }
    )
    .subscribe()
}

// LIFECYCLE
onMounted(() => {
  fetchStudents()

  subscribeToStudentChanges()
  subscribeToTransactionChanges()

  window.addEventListener('keydown', handleEscape)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscape)

  document.body.style.overflow = ''

  if (studentsChannel) {
    supabase.removeChannel(studentsChannel)
    studentsChannel = null
  }

  if (appointmentsChannel) {
    supabase.removeChannel(appointmentsChannel)
    appointmentsChannel = null
  }

  if (requestsChannel) {
    supabase.removeChannel(requestsChannel)
    requestsChannel = null
  }
})
</script>

<style scoped>
.students-page {
  min-height: 100%;
  padding: 32px 34px;
  box-sizing: border-box;
  background: #efdfdf;
  color: #350609;
  font-family: Georgia, "Times New Roman", serif;
}

/* HEADING */
.students-heading {
  margin-bottom: 28px;
}

.students-heading h1 {
  margin: 0 0 5px;
  color: #5b090f;
  font-size: 24px;
  font-weight: 700;
}

.students-heading p {
  margin: 0;
  color: #927a7b;
  font-family: Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
}

/* TOOLBAR */
.students-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.search-input {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 40px;
  padding: 10px 14px;
  border: 1px solid #d8b6b8;
  border-radius: 7px;
  outline: none;
  background: #f8eeee;
  color: #350609;
  font-family: Arial, sans-serif;
  font-size: 12px;
  box-sizing: border-box;
}

.search-input:focus {
  border-color: #760e16;
  box-shadow: 0 0 0 2px rgb(89 8 14 / 10%);
}

.refresh-button {
  padding: 9px 15px;
  border: 1px solid #59080e;
  border-radius: 7px;
  background: #59080e;
  color: #fff;
  font-family: Arial, sans-serif;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease;
}

.refresh-button:hover:not(:disabled) {
  background: #760e16;
}

.refresh-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ERROR */
.error-message {
  margin-bottom: 15px;
  padding: 12px 14px;
  border: 1px solid #e5bfc1;
  border-radius: 7px;
  background: #f9e5e6;
  color: #8a2828;
  font-family: Arial, sans-serif;
  font-size: 12px;
}

/* TABLE */
.students-table-wrapper {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #e2c4c6;
  border-radius: 12px;
  background: #f8eeee;
  box-shadow: 0 2px 5px rgb(53 6 9 / 4%);
}

.students-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.students-table th {
  padding: 15px 12px;
  background: #bd9294;
  color: #350609;
  font-family: Arial, sans-serif;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.students-table td {
  padding: 17px 12px;
  border-bottom: 1px solid #ead4d5;
  color: #350609;
  font-family: Arial, sans-serif;
  font-size: 11px;
  line-height: 1.5;
}

.students-table tbody tr:last-child td {
  border-bottom: none;
}

.students-table tbody tr:hover {
  background: #f3e4e5;
}

/* VIEW DETAILS */
.view-details {
  padding: 4px 0;
  border: none;
  background: transparent;
  color: #59080e;
  font-family: Arial, sans-serif;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.view-details:hover {
  text-decoration: underline;
}

.empty-state {
  padding: 28px 14px !important;
  color: #927a7b !important;
  text-align: center;
}

/* FOOTER */
.students-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  color: #927a7b;
  font-family: Arial, sans-serif;
  font-size: 12px;
}

/* MODAL BACKDROP */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
  overflow-y: auto;
  background: rgb(35 20 20 / 45%);
  box-sizing: border-box;
}

/* STUDENT DETAILS PANEL */
.details-modal {
  position: relative;
  width: 100%;
  max-width: 472px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 22px 20px 20px;
  border: 1px solid #e5cecf;
  border-radius: 13px;
  background: #f8eeee;
  color: #350609;
  box-shadow: 0 10px 35px rgb(53 6 9 / 15%);
  box-sizing: border-box;
}

.modal-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 7px;
}

.eyebrow {
  color: #a18b8c;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
}

.close-button {
  flex-shrink: 0;
  padding: 3px 0 3px 10px;
  border: none;
  background: transparent;
  color: #59080e;
  font-family: Arial, sans-serif;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.close-button:hover {
  text-decoration: underline;
}

.details-modal h2 {
  margin: 0 0 4px;
  color: #350609;
  font-size: 22px;
  line-height: 1.25;
}

.details-modal h3 {
  margin: 10px 0 9px;
  color: #59080e;
  font-size: 12px;
  font-weight: 700;
}

.section-divider {
  height: 1px;
  margin: 7px 0 9px;
  background: #e8d6d7;
}

/* PERSONAL INFORMATION */
.personal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
}

.info-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.info-item span {
  color: #a18b8c;
  font-family: Arial, sans-serif;
  font-size: 9px;
}

.info-item strong {
  color: #350609;
  font-size: 10px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.active-status {
  color: #287a3a !important;
}

.inactive-status {
  color: #a02c2c !important;
}

/* TRANSACTIONS */
.transaction-message {
  margin: 8px 0;
  color: #927a7b;
  font-family: Arial, sans-serif;
  font-size: 10px;
}

.transaction-error {
  margin: 8px 0;
  padding: 10px;
  border: 1px solid #e5bfc1;
  border-radius: 6px;
  background: #f9e5e6;
  color: #8a2828;
  font-family: Arial, sans-serif;
  font-size: 10px;
  line-height: 1.5;
}

.not-connected-message {
  padding: 12px;
  border: 1px solid #e7cdcf;
  border-radius: 6px;
  background: #fff;
  color: #927a7b;
  font-family: Arial, sans-serif;
  font-size: 10px;
  line-height: 1.5;
}

.transaction-card {
  margin-bottom: 9px;
  padding: 11px 12px;
  border: 1px solid #e7cdcf;
  border-radius: 7px;
  background: #fff;
}

.transaction-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 8px;
}

.transaction-top strong {
  color: #350609;
  font-size: 11px;
  line-height: 1.4;
}

.transaction-status {
  flex-shrink: 0;
  padding: 4px 7px;
  border-radius: 20px;
  font-family: Arial, sans-serif;
  font-size: 9px;
  font-weight: 700;
}

.status-pending {
  background: #f8edcf;
  color: #8b6415;
}

.status-confirmed {
  background: #e4f0e5;
  color: #287a3a;
}

.status-ready {
  background: #eee5f5;
  color: #69418a;
}

.status-completed {
  background: #e4f0e5;
  color: #287a3a;
}

.status-cancelled {
  background: #f8e3e3;
  color: #a02c2c;
}

.transaction-details p {
  margin: 4px 0;
  color: #705b5c;
  font-family: Arial, sans-serif;
  font-size: 10px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.transaction-details p span {
  color: #a18b8c;
  font-weight: 700;
}

.details-modal .history-heading {
  margin-top: 14px;
  margin-bottom: 8px;
}

.history-card {
  background: #fcf8f8;
}

.transaction-refresh {
  width: 100%;
  margin-top: 8px;
  padding: 9px 12px;
  border: 1px solid #59080e;
  border-radius: 6px;
  background: transparent;
  color: #59080e;
  font-family: Arial, sans-serif;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.transaction-refresh:hover:not(:disabled) {
  background: #f2e1e2;
}

.transaction-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* RESPONSIVE */
@media (max-width: 600px) {
  .students-page {
    padding: 22px 15px;
  }

  .students-heading h1 {
    font-size: 20px;
  }

  .students-toolbar {
    flex-wrap: wrap;
  }

  .search-input {
    flex-basis: 100%;
  }

  .students-table th,
  .students-table td {
    padding: 12px 10px;
  }

  .modal-overlay {
    padding: 12px;
  }

  .details-modal {
    max-height: calc(100vh - 24px);
    padding: 20px 16px;
  }

  .details-modal h2 {
    font-size: 20px;
  }

  .personal-grid {
    gap: 12px;
  }
}

@media (max-width: 360px) {
  .personal-grid {
    grid-template-columns: 1fr;
  }

  .transaction-top {
    flex-direction: column;
  }
}
</style>
