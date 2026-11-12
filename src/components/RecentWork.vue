
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { supabase } from '../lib/Supabase.js'

const LIBRARY_SERVICE_ID = '99a740ad-96d7-43a5-9bcc-3f9723cabd28'

const recentWorks = ref([])
const selectedWork = ref(null)
const loading = ref(false)
const errorMessage = ref('')

let realtimeChannel = null

function formatDate(value) {
  if (!value) return 'Not available'

  return new Date(value).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function statusLabel(status) {
  const labels = {
    pending: 'Pending',
    processing: 'Processing',
    ready_for_pickup: 'Ready for Pickup',
    claimed: 'Approved',
    borrowed: 'Borrowed',
    completed: 'Completed',
    returned: 'Returned',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  }

  return labels[String(status || '').toLowerCase()] || status || 'Unknown'
}

async function fetchRecentWork() {
  loading.value = true
  errorMessage.value = ''

  try {
    // Fetch Library requests
    const { data: requests, error: requestError } = await supabase
      .from('service_requests')
      .select('*')
      .eq('service_id', LIBRARY_SERVICE_ID)
      .order('submitted_at', { ascending: false })
      .limit(10)

    if (requestError) throw requestError

    // Fetch borrowed and returned books
    const { data: loans, error: loanError } = await supabase
      .from('book_loans')
      .select('*')
      .order('borrowed_at', { ascending: false })
      .limit(10)

    if (loanError) throw loanError

    // Get related book information
    const bookIds = [
      ...new Set([
        ...(requests || []).map(item => item.book_id),
        ...(loans || []).map(item => item.book_id),
      ].filter(Boolean)),
    ]

    let books = []

    if (bookIds.length) {
      const { data, error } = await supabase
        .from('library_books')
        .select('*')
        .in('id', bookIds)

      if (error) throw error
      books = data || []
    }

    const bookMap = Object.fromEntries(
      books.map(book => [book.id, book])
    )

    const requestActivities = (requests || []).map(request => {
      const book = bookMap[request.book_id]
      const bookTitle =
        book?.title ||
        request.selected_book ||
        request.title ||
        'Library Request'

      return {
        code: `REQ-${String(request.id).slice(0, 8)}`,
        name: bookTitle,
        type: request.request_type || 'Library Request',
        status: statusLabel(request.status),
        date: request.submitted_at,
        description:
          request.details ||
          'A Library service request was submitted.',
        details: {
          'Request ID': request.id,
          'Request Title': request.title || 'Not available',
          'Book': bookTitle,
          'Student ID': request.student_id || 'Not available',
          'Request Type': request.request_type || 'Not available',
          'Status': statusLabel(request.status),
          'Submitted At': formatDate(request.submitted_at),
          'Staff Notes': request.staff_notes || 'None',
        },
      }
    })

    const loanActivities = (loans || []).map(loan => {
      const book = bookMap[loan.book_id]
      const bookTitle = book?.title || 'Library Book'

      return {
        code: `LOAN-${String(loan.id).slice(0, 8)}`,
        name: bookTitle,
        type: 'Book Loan',
        status: statusLabel(loan.status),
        date: loan.borrowed_at,
        description: 'Library book loan record.',
        details: {
          'Loan ID': loan.id,
          'Book': bookTitle,
          'Student ID': loan.student_id || 'Not available',
          'Borrowed At': formatDate(loan.borrowed_at),
          'Due Date': formatDate(loan.due_at),
          'Loan Status': statusLabel(loan.status),
          'Source Request': loan.source_request_id || 'Not available',
        },
      }
    })

    recentWorks.value = [
      ...requestActivities,
      ...loanActivities,
    ]
      .sort((a, b) => {
        return new Date(b.date || 0) - new Date(a.date || 0)
      })
      .slice(0, 10)

  } catch (error) {
    console.error('Error fetching recent work:', error)
    errorMessage.value = error.message || 'Unable to load recent work.'
  } finally {
    loading.value = false
  }
}

function viewDetails(work) {
  selectedWork.value = work
}

function closeDetails() {
  selectedWork.value = null
}

onMounted(() => {
  fetchRecentWork()

  realtimeChannel = supabase
    .channel('library-recent-work')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'service_requests',
        filter: `service_id=eq.${LIBRARY_SERVICE_ID}`,
      },
      () => fetchRecentWork()
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'book_loans',
      },
      () => fetchRecentWork()
    )
    .subscribe()
})

onUnmounted(() => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
  }
})
</script>

<template>
  <section class="activity-card">
    <div class="card-heading">
      <h2>Recent Work</h2>

      <button
        type="button"
        class="refresh-button"
        @click="fetchRecentWork"
        :disabled="loading"
      >
        {{ loading ? 'Loading...' : 'Refresh' }}
      </button>
    </div>

    <div v-if="loading && recentWorks.length === 0" class="empty-message">
      Loading recent activities...
    </div>

    <p v-else-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </p>

    <template v-else>
      <div
        v-for="work in recentWorks"
        :key="work.code"
        class="work-row"
      >
        <div class="details">
          <strong>{{ work.name }} · {{ work.type }}</strong>
          <span>{{ work.code }}</span>
          <span>{{ formatDate(work.date) }}</span>
        </div>

        <span class="status">{{ work.status }}</span>

        <button
          type="button"
          class="view-button"
          @click="viewDetails(work)"
        >
          View Details
        </button>
      </div>

      <p v-if="recentWorks.length === 0" class="empty-message">
        No recent work available.
      </p>
    </template>

    <!-- DETAILS MODAL -->
    <div
      v-if="selectedWork"
      class="modal-overlay"
      @click.self="closeDetails"
      @keydown.esc="closeDetails"
    >
      <section
        class="details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="details-title"
      >
        <header class="modal-header">
          <div>
            <p class="eyebrow">LIBRARY DASHBOARD</p>
            <h3 id="details-title">Work Details</h3>
          </div>

          <button
            type="button"
            class="close-button"
            aria-label="Close details"
            @click="closeDetails"
          >
            ×
          </button>
        </header>

        <div class="work-summary">
          <div class="document-icon">▤</div>

          <div class="summary-text">
            <strong>{{ selectedWork.name }}</strong>
            <span>{{ selectedWork.type }}</span>
            <span>Reference: {{ selectedWork.code }}</span>
          </div>

          <span class="status">{{ selectedWork.status }}</span>
        </div>

        <p class="description">
          {{ selectedWork.description }}
        </p>

        <h4>Request Information</h4>

        <div class="details-table">
          <div
            v-for="(value, label) in selectedWork.details"
            :key="label"
            class="detail-row"
          >
            <span class="detail-label">{{ label }}</span>
            <strong class="detail-value">{{ value }}</strong>
          </div>
        </div>

        <footer class="modal-footer">
          <button
            type="button"
            class="close-modal-button"
            @click="closeDetails"
          >
            Close
          </button>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.activity-card {
  min-width: 0;
  min-height: 184px;
  padding: 10px 12px;
  border: 1px solid #8a4143;
  border-radius: 24px;
  color: #390607;
}

.card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

h2 {
  margin: 0;
  font: bold 24px Georgia, serif;
}

.refresh-button {
  padding: 6px 10px;
  border: 1px solid #570910;
  border-radius: 6px;
  background: white;
  color: #570910;
  font-size: 11px;
  cursor: pointer;
}

.refresh-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.work-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 0 14px;
  border-bottom: 1px solid #e4caca;
  font-size: 12px;
}

.work-row + .work-row {
  padding-top: 12px;
}

.details {
  display: flex;
  flex: 1;
  min-width: 100px;
  flex-direction: column;
  gap: 3px;
}

.details strong {
  font-size: 14px;
  overflow-wrap: anywhere;
}

.details span {
  color: #725456;
  font-size: 11px;
}

.status {
  padding: 4px 12px;
  border-radius: 20px;
  background: #eee08b;
  color: #665a1a;
  font-size: 10px;
  white-space: nowrap;
}

.view-button,
.close-modal-button {
  padding: 7px 11px;
  border: 1px solid #570910;
  border-radius: 6px;
  background: #570910;
  color: #fff7f5;
  font-size: 11px;
  cursor: pointer;
}

.view-button:hover,
.close-modal-button:hover {
  background: #74121b;
}

.modal-overlay {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  padding: 18px;
  background: rgb(25 10 10 / 48%);
}

.details-modal {
  width: min(100%, 560px);
  max-height: 90vh;
  overflow-y: auto;
  padding: 22px;
  border: 1px solid #d9babb;
  border-radius: 16px;
  background: #fff7f4;
  box-shadow: 0 15px 45px rgb(40 0 0 / 20%);
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ead6d6;
}

.eyebrow {
  margin: 0 0 5px;
  color: #896567;
  font-size: 9px;
  letter-spacing: 1.3px;
}

.modal-header h3 {
  margin: 0;
  color: #390607;
  font: 24px Georgia, serif;
}

.close-button {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: #f0dddd;
  color: #570910;
  font-size: 24px;
  cursor: pointer;
}

.work-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
}

.document-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: #ead0d1;
  color: #570910;
  font-size: 25px;
}

.summary-text {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.summary-text strong {
  overflow-wrap: anywhere;
  color: #390607;
  font-size: 14px;
}

.summary-text span {
  color: #795b5d;
  font-size: 11px;
}

.description {
  margin: 18px 0;
  color: #624749;
  font-size: 12px;
  line-height: 1.6;
}

.details-modal h4 {
  margin: 0 0 10px;
  color: #390607;
  font-size: 13px;
}

.details-table {
  overflow: hidden;
  border: 1px solid #e2c9ca;
  border-radius: 9px;
}

.detail-row {
  display: grid;
  grid-template-columns: minmax(115px, 0.8fr) minmax(0, 1.2fr);
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid #ead9d9;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-label {
  color: #795b5d;
  font-size: 11px;
}

.detail-value {
  overflow-wrap: anywhere;
  color: #390607;
  font-size: 11px;
  font-weight: 600;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}

.empty-message {
  padding: 18px 0;
  color: #795b5d;
  font-size: 12px;
  text-align: center;
}

.error-message {
  padding: 14px;
  border-radius: 8px;
  background: #fbe4e4;
  color: #9b1c1c;
  font-size: 12px;
}

@media (max-width: 480px) {
  .details-modal {
    padding: 16px;
  }

  .work-summary {
    flex-wrap: wrap;
  }

  .detail-row {
    grid-template-columns: 1fr;
    gap: 5px;
  }

  .work-row {
    align-items: flex-start;
  }
}
</style>
