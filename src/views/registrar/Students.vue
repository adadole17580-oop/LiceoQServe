
<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'

const students = ref([])
const loading = ref(false)
const searchQuery = ref('')
const viewingStudent = ref(null)
const errorMessage = ref('')

const activeTransactions = ref([])
const transactionHistory = ref([])
const loadingTransactions = ref(false)

const filteredStudents = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  if (!query) return students.value

  return students.value.filter(student =>
    [
      student.fullName,
      student.studentNumber,
      student.course,
      student.yearLevel,
      student.email,
    ].some(value => String(value || '').toLowerCase().includes(query)),
  )
})

function mapStudent(profile) {
  return {
    id: profile.id,
    studentNumber: profile.student_id || '—',
    fullName: profile.full_name || 'Unnamed Student',
    course: profile.program || '—',
    yearLevel: profile.year_level || '—',
    email: profile.university_email || '—',
    status: profile.is_active ? 'Active' : 'Inactive',
    createdAt: profile.created_at || '',
  }
}

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
      .order('created_at', { ascending: false })

    if (error) throw error

    students.value = (data || []).map(mapStudent)
  } catch (error) {
    console.error('Error loading student profiles:', error)
    errorMessage.value =
      error.message || 'Unable to load student records.'
  } finally {
    loading.value = false
  }
}

async function viewStudent(student) {
  viewingStudent.value = student

  activeTransactions.value = []
  transactionHistory.value = []
  loadingTransactions.value = true

  try {
    const [requestsResult, historyResult] = await Promise.all([
      supabase
        .from('service_requests')
        .select(`
          id,
          title,
          request_type,
          status,
          submitted_at,
          expected_completion,
          office_services(name)
        `)
        .eq('student_id', student.id)
        .order('submitted_at', { ascending: false }),

      supabase
        .from('service_history')
        .select(`
          id,
          title,
          final_status,
          completed_at,
          created_at,
          previous_status,
          office_services(name)
        `)
        .eq('student_id', student.id)
        .order('created_at', { ascending: false }),
    ])

    if (requestsResult.error) {
      console.error(
        'Error loading active transactions:',
        requestsResult.error,
      )
    } else {
      activeTransactions.value = (requestsResult.data || []).filter(
        transaction => {
          const status = (transaction.status || '').toLowerCase()
          return !['completed', 'cancelled'].includes(status)
        },
      )
    }

    if (historyResult.error) {
      console.error(
        'Error loading transaction history:',
        historyResult.error,
      )
    } else {
      transactionHistory.value = historyResult.data || []
    }
  } catch (error) {
    console.error('Error loading student transactions:', error)
  } finally {
    loadingTransactions.value = false
  }
}

function closeStudentDetails() {
  viewingStudent.value = null
  activeTransactions.value = []
  transactionHistory.value = []
}

function formatDate(date) {
  if (!date) return '—'

  return new Date(date).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(date) {
  if (!date) return 'Date unavailable'

  return new Date(date).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getTransactionOffice(transaction) {
  const office = transaction.office_services

  if (Array.isArray(office)) {
    return office[0]?.name || 'Office'
  }

  return office?.name || 'Office'
}

function getTransactionTitle(transaction) {
  return (
    transaction.title ||
    transaction.request_type ||
    'Student Transaction'
  )
}

function formatStatus(status) {
  if (!status) return 'Pending'

  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('')
}

onMounted(fetchStudents)
</script>

<template>
  <section class="students-page">
    <section class="page-heading">
      <h1>Students</h1>
      <p>Search Registrar records by name or student ID.</p>
    </section>

    <!-- Search -->
    <div class="search-container">
      <span class="search-icon">⌕</span>

      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search name or Student ID"
        aria-label="Search students by name or student ID"
      />

      <button
        v-if="searchQuery"
        class="clear-search"
        type="button"
        aria-label="Clear search"
        @click="searchQuery = ''"
      >
        ×
      </button>
    </div>

    <!-- Student Records -->
    <section class="students-table-container">
      <div class="table-scroll">
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
            <tr v-if="loading">
              <td colspan="6" class="message-cell">
                Loading student records...
              </td>
            </tr>

            <tr v-else-if="errorMessage">
              <td colspan="6" class="message-cell error-message">
                {{ errorMessage }}
                <button type="button" @click="fetchStudents">
                  Try again
                </button>
              </td>
            </tr>

            <tr v-else-if="filteredStudents.length === 0">
              <td colspan="6" class="message-cell">
                {{
                  students.length
                    ? 'No matching student records found.'
                    : 'No student records available.'
                }}
              </td>
            </tr>

            <tr
              v-for="student in filteredStudents"
              :key="student.id"
            >
              <td class="student-name">
                {{ student.fullName }}
              </td>

              <td>{{ student.studentNumber }}</td>
              <td>{{ student.course }}</td>
              <td>{{ student.yearLevel }}</td>

              <td class="email-cell">
                {{ student.email }}
              </td>

              <td>
                <button
                  class="view-details-button"
                  type="button"
                  @click="viewStudent(student)"
                >
                  View Details
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Student Details Modal -->
    <Transition name="modal">
      <div
        v-if="viewingStudent"
        class="modal-overlay"
        @click.self="closeStudentDetails"
        @keydown.esc="closeStudentDetails"
      >
        <section
          class="student-details-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-details-title"
        >
          <!-- Modal Header -->
          <div class="modal-header">
            <span id="student-details-title">
              STUDENT DETAILS
            </span>

            <button
              class="close-button"
              type="button"
              @click="closeStudentDetails"
            >
              Close
            </button>
          </div>

          <!-- Student Name -->
          <div class="student-profile">
            <h3>{{ viewingStudent.fullName }}</h3>
          </div>

          <!-- Personal Information -->
          <section class="details-section">
            <h4>Personal Information</h4>

            <div class="personal-info-grid">
              <div class="detail-field">
                <span>Full name</span>
                <strong>{{ viewingStudent.fullName }}</strong>
              </div>

              <div class="detail-field">
                <span>Student ID</span>
                <strong>{{ viewingStudent.studentNumber }}</strong>
              </div>

              <div class="detail-field">
                <span>Program</span>
                <strong>{{ viewingStudent.course }}</strong>
              </div>

              <div class="detail-field">
                <span>Year level</span>
                <strong>{{ viewingStudent.yearLevel }}</strong>
              </div>

              <div class="detail-field">
                <span>Email</span>
                <strong>{{ viewingStudent.email }}</strong>
              </div>

              <div class="detail-field">
                <span>Contact number</span>
                <strong>Not available</strong>
              </div>
            </div>
          </section>

          <!-- Current Active Transactions -->
          <section class="transactions-section">
            <h4>Current Active Transactions</h4>

            <div v-if="loadingTransactions" class="transaction-message">
              Loading transactions...
            </div>

            <template v-else>
              <div
                v-if="activeTransactions.length"
                class="transaction-list"
              >
                <article
                  v-for="transaction in activeTransactions"
                  :key="transaction.id"
                  class="active-transaction-card"
                >
                  <div class="transaction-main">
                    <strong>
                      {{ getTransactionOffice(transaction) }}
                      —
                      {{ getTransactionTitle(transaction) }}
                    </strong>

                    <span
                      class="transaction-status"
                      :class="transaction.status?.toLowerCase().replace(/\s+/g, '-')"
                    >
                      {{ formatStatus(transaction.status) }}
                    </span>
                  </div>
                </article>
              </div>

              <p v-else class="empty-transactions">
                No current active transactions.
              </p>
            </template>
          </section>

          <!-- Transaction History -->
          <section class="transactions-section history-section">
            <h4>Transaction History</h4>

            <div v-if="loadingTransactions" class="transaction-message">
              Loading transaction history...
            </div>

            <template v-else>
              <div
                v-if="transactionHistory.length"
                class="transaction-list"
              >
                <article
                  v-for="transaction in transactionHistory"
                  :key="transaction.id"
                  class="history-transaction-card"
                >
                  <strong>
                    {{ getTransactionOffice(transaction) }}
                    —
                    {{ transaction.title || 'Student Transaction' }}
                  </strong>

                  <span>
                    {{ formatStatus(transaction.final_status) }}
                  </span>

                  <small>
                    {{ formatDateTime(transaction.completed_at || transaction.created_at) }}
                  </small>
                </article>
              </div>

              <p v-else class="empty-transactions history-empty">
                No previous transaction records.
              </p>
            </template>
          </section>
        </section>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.students-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 3px 2px 24px;
  color: #351c20;
}

.page-heading {
  margin-bottom: 22px;
  padding: 0;
}

.page-heading h1 {
  margin: 0 0 8px;
  color: #50070e;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 30px;
  font-weight: 500;
}

.page-heading p {
  margin: 0;
  color: #887477;
  font-size: 15px;
  line-height: 1.5;
}

.search-container {
  display: flex;
  align-items: center;
  width: 100%;
  height: 38px;
  margin-bottom: 18px;
  padding: 0 11px;
  gap: 9px;
  background: #f8eeee;
  border: 1px solid #eadcda;
  border-radius: 7px;
}

.search-icon {
  color: #7a4a50;
  font-size: 20px;
  line-height: 1;
}

.search-container input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  color: #451c23;
  background: transparent;
  border: none;
  outline: none;
  font-size: 11px;
}

.search-container input::placeholder {
  color: #9a8586;
}

.clear-search {
  color: #75464d;
  background: transparent;
  border: none;
  font-size: 19px;
  cursor: pointer;
}

.students-table-container {
  width: 100%;
  overflow: hidden;
  background: #f9eeee;
  border: 1px solid #e7d7d5;
  border-radius: 9px;
}

.table-scroll {
  width: 100%;
  overflow-x: auto;
}

.students-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.students-table thead {
  background: #f5e5e5;
}

.students-table th {
  padding: 13px 11px;
  color: #5c2830;
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
  border-bottom: 1px solid #e7d7d5;
}

.students-table td {
  padding: 13px 11px;
  color: #554346;
  font-size: 10px;
  border-bottom: 1px solid #eadedd;
}

.students-table tbody tr:last-child td {
  border-bottom: none;
}

.student-name {
  color: #4a2028 !important;
  font-weight: 600;
  white-space: nowrap;
}

.email-cell {
  min-width: 145px;
  overflow-wrap: anywhere;
}

.view-details-button {
  padding: 4px 0;
  color: #64202c;
  background: transparent;
  border: none;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.view-details-button:hover {
  color: #9a3547;
  text-decoration: underline;
}

.message-cell {
  padding: 28px 15px !important;
  color: #806d70 !important;
  text-align: center;
}

.error-message {
  color: #9a3547 !important;
}

.error-message button {
  display: block;
  margin: 9px auto 0;
  padding: 6px 12px;
  color: #fff;
  background: #64101b;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}

/* Modal Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(30, 7, 11, 0.42);
  backdrop-filter: blur(1px);
}

/* Student Details Modal */
.student-details-modal {
  width: 100%;
  max-width: 470px;
  max-height: 88vh;
  overflow-y: auto;
  padding: 17px 19px 20px;
  background: #f8eeee;
  border: 1px solid #e8d8d8;
  border-radius: 11px;
  box-shadow: 0 15px 45px rgba(35, 8, 13, 0.22);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.modal-header span {
  color: #6a3b40;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.close-button {
  padding: 3px 0;
  color: #70575a;
  background: transparent;
  border: none;
  font-size: 10px;
  cursor: pointer;
}

.close-button:hover {
  color: #650b18;
  text-decoration: underline;
}

.student-profile {
  margin-bottom: 20px;
}

.student-profile h3 {
  margin: 0;
  color: #3d171d;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 20px;
  font-weight: 600;
}

.details-section,
.transactions-section {
  margin-top: 17px;
}

.details-section h4,
.transactions-section h4 {
  margin: 0 0 12px;
  color: #4e1720;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 14px;
  font-weight: 700;
}

/* Personal Information */
.personal-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 24px;
  row-gap: 13px;
}

.detail-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.detail-field span {
  color: #887477;
  font-size: 9px;
}

.detail-field strong {
  color: #45252a;
  font-size: 10px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

/* Current Active Transactions */
.transaction-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.active-transaction-card {
  padding: 12px 11px;
  background: #efd9dc;
  border: 1px solid #ecd2d5;
  border-radius: 7px;
}

.transaction-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.transaction-main strong {
  color: #543139;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.5;
}

.transaction-status {
  flex-shrink: 0;
  color: #75434b;
  font-size: 9px;
  font-weight: 600;
}

/* Transaction History */
.history-section {
  margin-top: 21px;
}

.history-transaction-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 11px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid #dfc9cb;
  border-radius: 7px;
}

.history-transaction-card strong {
  color: #503038;
  font-size: 10px;
  font-weight: 600;
}

.history-transaction-card span {
  color: #77565c;
  font-size: 9px;
}

.history-transaction-card small {
  color: #927c80;
  font-size: 8px;
}

.transaction-message,
.empty-transactions {
  margin: 0;
  padding: 12px;
  color: #90777b;
  background: #f3e5e6;
  border-radius: 7px;
  font-size: 10px;
  text-align: center;
}

/* Transaction History Empty State */
.history-section .history-empty {
  color: #90777b;
  background: transparent;
  border: 1px solid #dfc9cb;
  border-radius: 7px;
}

/* Modal Animation */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .student-details-modal,
.modal-leave-active .student-details-modal {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .student-details-modal,
.modal-leave-to .student-details-modal {
  transform: translateY(10px) scale(0.98);
}

@media (max-width: 700px) {
  .page-heading h1 {
    font-size: 25px;
  }

  .page-heading p {
    font-size: 14px;
  }

  .students-table {
    min-width: 680px;
  }

  .student-details-modal {
    max-width: 420px;
    padding: 16px;
  }
}

@media (max-width: 420px) {
  .personal-info-grid {
    grid-template-columns: 1fr;
    row-gap: 11px;
  }

  .transaction-main {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }
}
</style>
