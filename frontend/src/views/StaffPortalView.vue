<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../composables/useAuth.js'
import '../assets/styles/app.css'

const router = useRouter()
const route = useRoute()
const { currentProfile, isStaff } = useAuth()

const selectedOffice = ref(route.params.office || 'Cashier')
const offices = ['Cashier', 'Registrar', 'Library', 'Guidance', 'Office of Student Affairs']

const queueList = ref([])
const skippedQueueList = ref([])
const requestsList = ref([])
const appointmentsList = ref([])
const roomReservations = ref([])
const bookLoans = ref([])
const nowServingTicket = ref(null)

const notice = ref('')
const errorMessage = ref('')
const loading = ref(false)

const showLoanModal = ref(false)
const selectedBorrowRequest = ref(null)
const loanDueDate = ref(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
let queueRefreshTimer = null
let queueRefreshInProgress = false

function normalizeRequestStatus(status) {
  const normalized = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return normalized === 'submitted' ? 'pending' : normalized
}

function requestStatusLabel(status) {
  return {
    pending: 'Pending',
    processing: 'Processing',
    ready_for_pickup: 'Ready for Pickup',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }[status] || status
}

async function loadStaffData() {
  loading.value = true
  notice.value = ''
  errorMessage.value = ''

  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const headers = { Authorization: `Bearer ${token}` }
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

    if (['Cashier', 'Registrar'].includes(selectedOffice.value)) {
      const qRes = await fetch(`${apiUrl}/api/staff/queue-list`, { headers })
      if (qRes.ok) {
        const qData = await qRes.json()
        queueList.value = qData.tickets || []
        skippedQueueList.value = qData.skippedTickets || []
        nowServingTicket.value = queueList.value.find((t) => t.status === 'being_served') || null
      }
    } else {
      queueList.value = []
      skippedQueueList.value = []
      nowServingTicket.value = null
    }

    if (['Registrar', 'Library', 'Office of Student Affairs'].includes(selectedOffice.value)) {
      const rRes = await fetch(`${apiUrl}/api/staff/requests-list`, { headers })
      if (rRes.ok) {
        const rData = await rRes.json()
        requestsList.value = (rData.requests || []).map((request) => ({
          ...request,
          status: normalizeRequestStatus(request.status),
        }))
      }
    }

    if (['Registrar', 'Guidance', 'Office of Student Affairs', 'Library'].includes(selectedOffice.value)) {
      const aRes = await fetch(`${apiUrl}/api/staff/appointments-list`, { headers })
      if (aRes.ok) {
        const aData = await aRes.json()
        appointmentsList.value = aData.appointments || []
      }
    }

    if (selectedOffice.value === 'Library') {
      const [reservationResponse, loanResponse] = await Promise.all([
        fetch(`${apiUrl}/api/reservations/staff`, { headers }),
        fetch(`${apiUrl}/api/library/staff-loans`, { headers }),
      ])
      const [reservationData, loanData] = await Promise.all([
        reservationResponse.json(),
        loanResponse.json(),
      ])
      if (!reservationResponse.ok) {
        throw new Error(reservationData.error || 'Could not load room reservations.')
      }
      if (!loanResponse.ok) {
        throw new Error(loanData.error || 'Could not load active book loans.')
      }
      roomReservations.value = reservationData.reservations || []
      bookLoans.value = loanData.loans || []
    }
  } catch (err) {
    console.error('Error loading staff dashboard:', err)
    errorMessage.value = err.message || 'Could not load staff dashboard data.'
  } finally {
    loading.value = false
  }
}

async function refreshQueueData() {
  if (queueRefreshInProgress || !['Cashier', 'Registrar'].includes(selectedOffice.value)) return
  queueRefreshInProgress = true

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return

    const response = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/staff/queue-list`,
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    )
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not refresh the queue.')

    queueList.value = data.tickets || []
    skippedQueueList.value = data.skippedTickets || []
    nowServingTicket.value = queueList.value.find((ticket) => ticket.status === 'being_served') || null
  } catch (error) {
    console.error('Error refreshing staff queue:', error)
    errorMessage.value = error.message || 'Could not refresh the queue.'
  } finally {
    queueRefreshInProgress = false
  }
}

async function callNextTicket() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/queue/call-next`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
    })

    const data = await res.json()
    if (!res.ok) {
      errorMessage.value = data.error || 'Could not call next ticket.'
      return
    }

    notice.value = data.message
    await loadStaffData()
  } catch (err) {
    console.error('Error calling next ticket:', err)
  }
}

async function recallTicket(queueId) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/queue/recall`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ queueId }),
    })
    const data = await res.json()
    if (!res.ok) {
      errorMessage.value = data.error || 'Could not recall the ticket.'
      return
    }
    notice.value = data.message
  } catch (err) {
    console.error('Error recalling queue ticket:', err)
    errorMessage.value = 'Could not recall the ticket. Please try again.'
  }
}

async function completeTicket(queueId, outcome = 'finished') {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/queue/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ queueId, outcome }),
    })

    const data = await res.json()
    if (!res.ok) {
      errorMessage.value = data.error || 'Could not complete the ticket.'
      return
    }
    notice.value = data.message
    await loadStaffData()
  } catch (err) {
    console.error('Error completing ticket:', err)
    errorMessage.value = 'Could not complete the ticket. Please try again.'
  }
}

async function updateRequestStatus(requestId, status) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/requests/update-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ requestId, status }),
    })

    const data = await res.json()
    if (res.ok) {
      notice.value = data.message
      await loadStaffData()
    }
  } catch (err) {
    console.error('Error updating request status:', err)
  }
}

async function updateAppointmentStatus(appointmentId, status) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/appointments/update-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ appointmentId, status }),
    })

    const data = await res.json()
    if (res.ok) {
      notice.value = data.message
      await loadStaffData()
    }
  } catch (err) {
    console.error('Error updating appointment:', err)
  }
}

async function updateReservationStatus(reservationId, status) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/reservations/update-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ reservationId, status }),
    })
    const data = await res.json()
    if (!res.ok) {
      errorMessage.value = data.error || 'Could not update room reservation.'
      return
    }
    notice.value = data.message
    await loadStaffData()
  } catch (err) {
    console.error('Error updating room reservation:', err)
    errorMessage.value = 'Could not update room reservation. Please try again.'
  }
}

async function confirmIssueLoan() {
  if (!selectedBorrowRequest.value || !loanDueDate.value) return

  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/library/issue-loan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        requestId: selectedBorrowRequest.value.id,
        studentId: selectedBorrowRequest.value.student_id,
        dueDate: loanDueDate.value,
      }),
    })

    const data = await res.json()
    if (res.ok) {
      notice.value = data.message
      showLoanModal.value = false
      await loadStaffData()
    } else {
      errorMessage.value = data.error || 'Failed to issue loan.'
    }
  } catch (err) {
    console.error('Error issuing loan:', err)
  }
}

async function recordBookReturn(loanId) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/library/return-book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ loanId }),
    })

    const data = await res.json()
    if (res.ok) {
      notice.value = data.message
      await loadStaffData()
    }
  } catch (err) {
    console.error('Error recording return:', err)
  }
}

onMounted(() => {
  loadStaffData()
  queueRefreshTimer = window.setInterval(refreshQueueData, 5000)
})

onUnmounted(() => {
  if (queueRefreshTimer) window.clearInterval(queueRefreshTimer)
})
</script>

<template>
  <div style="min-height: 100vh; background: #f5eded; font-family: 'DM Sans', Arial, sans-serif;">
    <header style="background: #59080d; color: #fff; padding: 18px 32px; display: flex; justify-content: space-between; align-items: center;">
      <div style="display: flex; align-items: center; gap: 14px;">
        <div style="background: #741d23; font-weight: bold; padding: 8px 12px; border-radius: 6px; font-family: Georgia, serif;">LQ</div>
        <div>
          <h1 style="margin: 0; font-size: 20px;">LiceoQServe Staff Portal</h1>
          <p style="margin: 0; font-size: 13px; color: #e7babc;">{{ selectedOffice }} Office Management</p>
        </div>
      </div>

      <div style="display: flex; gap: 12px; align-items: center;">
        <select
          v-model="selectedOffice"
          style="padding: 8px 12px; border-radius: 6px; border: 1px solid #741d23; background: #43060a; color: #fff;"
          @change="loadStaffData"
        >
          <option v-for="o in offices" :key="o" :value="o">{{ o }}</option>
        </select>

        <button
          type="button"
          style="background: transparent; border: 1px solid #e7babc; color: #fff; padding: 8px 14px; border-radius: 6px; cursor: pointer;"
          @click="router.push('/student/home')"
        >
          Student View
        </button>
      </div>
    </header>

    <main style="max-width: 1200px; margin: 24px auto; padding: 0 20px;">
      <div v-if="notice" style="background: #e6f6eb; color: #0e5b27; padding: 12px 18px; border-radius: 8px; margin-bottom: 18px; font-weight: 500;">
        {{ notice }}
      </div>

      <div v-if="errorMessage" style="background: #fde8e8; color: #9b1c1c; padding: 12px 18px; border-radius: 8px; margin-bottom: 18px; font-weight: 500;">
        {{ errorMessage }}
      </div>

      <section v-if="['Cashier', 'Registrar'].includes(selectedOffice)" style="background: #fff; border-radius: 12px; padding: 24px; border: 1px solid #d5c4c4; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ebdada; padding-bottom: 16px; margin-bottom: 20px;">
          <div>
            <h2 style="margin: 0; color: #59080d;">{{ selectedOffice }} Queue Counter</h2>
            <p style="margin: 4px 0 0; color: #693e40; font-size: 14px;">
              {{ selectedOffice === 'Cashier' ? 'Tuition payment queue processing only' : 'Registrar queue processing' }}
            </p>
          </div>

          <button
            type="button"
            style="background: #59080d; color: #fff; padding: 12px 24px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 15px;"
            @click="callNextTicket"
          >
            CALL NEXT TICKET
          </button>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 24px;">
          <div style="background: #fcf4f4; border: 2px dashed #741d23; border-radius: 10px; padding: 20px; text-align: center;">
            <p style="margin: 0; font-size: 12px; letter-spacing: 2px; color: #741d23; font-weight: bold;">NOW SERVING</p>
            <h3 style="margin: 10px 0; font-size: 42px; color: #59080d;">{{ nowServingTicket?.queue_number || '---' }}</h3>
            <p style="margin: 0; color: #693e40; font-size: 13px;">{{ nowServingTicket ? 'At your counter' : 'Counter ready' }}</p>

            <div v-if="nowServingTicket" style="margin-top: 16px; display: flex; gap: 8px; justify-content: center;">
              <button
                type="button"
                style="background: #741d23; color: #fff; border: none; padding: 8px 14px; border-radius: 6px; font-weight: bold; cursor: pointer;"
                @click="recallTicket(nowServingTicket.id)"
              >
                Recall
              </button>
              <button
                type="button"
                style="background: #10662d; color: #fff; border: none; padding: 8px 14px; border-radius: 6px; font-weight: bold; cursor: pointer;"
                @click="completeTicket(nowServingTicket.id, 'finished')"
              >
                Finish Transaction
              </button>
              <button
                type="button"
                style="background: #9b1c1c; color: #fff; border: none; padding: 8px 14px; border-radius: 6px; font-weight: bold; cursor: pointer;"
                @click="completeTicket(nowServingTicket.id, 'skipped')"
              >
                No-Show
              </button>
            </div>
          </div>

          <div>
            <h4 style="margin: 0 0 12px; color: #43060a;">Waiting Line ({{ queueList.filter(t => t.status === 'waiting').length }})</h4>
            <div v-if="queueList.filter(t => t.status === 'waiting').length === 0" style="padding: 20px; color: #7a5052;">
              No students waiting in the queue.
            </div>
            <div v-else style="display: flex; flex-direction: column; gap: 8px;">
              <div
                v-for="ticket in queueList.filter(t => t.status === 'waiting')"
                :key="ticket.id"
                style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #faf4f4; border-radius: 6px; border: 1px solid #ebdada;"
              >
                <span style="font-weight: bold; color: #59080d; font-size: 16px;">{{ ticket.queue_number }}</span>
                <span style="font-size: 13px; color: #693e40;">{{ ticket.profiles?.full_name || 'Student' }}</span>
                <span style="font-size: 12px; color: #967f7f;">Waiting since {{ new Date(ticket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
              </div>
            </div>

            <div>
              <h4 style="margin: 0 0 12px; color: #43060a;">Skipped Tickets ({{ skippedQueueList.length }})</h4>
              <div v-if="skippedQueueList.length === 0" style="padding: 20px; color: #7a5052;">
                No skipped tickets.
              </div>
              <div v-else style="display: flex; flex-direction: column; gap: 8px;">
                <div
                  v-for="ticket in skippedQueueList"
                  :key="ticket.id"
                  style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #faf4f4; border-radius: 6px; border: 1px solid #ebdada;"
                >
                  <span style="font-weight: bold; color: #59080d; font-size: 16px;">{{ ticket.queue_number }}</span>
                  <span style="font-size: 13px; color: #693e40;">{{ ticket.profiles?.full_name || 'Student' }}</span>
                  <span style="font-size: 12px; color: #967f7f;">Skipped</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="selectedOffice === 'Library'" style="background: #fff; border-radius: 12px; padding: 24px; border: 1px solid #d5c4c4; margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; color: #59080d;">Library Book Borrowing Requests & Loans</h2>
        <p style="margin: 0 0 20px; color: #693e40; font-size: 14px;">Requirement 6: Review requests and set due dates before issuing loans.</p>

        <div style="margin-bottom: 24px;">
          <h4 style="margin: 0 0 12px; color: #43060a;">Room Reservations</h4>
          <div v-if="roomReservations.length === 0" style="padding: 16px; color: #7a5052;">No pending or confirmed room reservations.</div>
          <div v-else style="display: flex; flex-direction: column; gap: 10px;">
            <div
              v-for="reservation in roomReservations"
              :key="reservation.id"
              style="display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px; background: #faf4f4; border-radius: 8px; border: 1px solid #ebdada;"
            >
              <div>
                <strong style="color: #59080d;">{{ reservation.rooms?.name || 'Library room' }}</strong>
                <p style="margin: 4px 0; color: #693e40; font-size: 13px;">
                  {{ reservation.profiles?.full_name || 'Student' }} | {{ new Date(reservation.start_at).toLocaleString() }} - {{ new Date(reservation.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                </p>
                <p style="margin: 0; color: #967f7f; font-size: 12px;">{{ reservation.purpose }}</p>
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end;">
                <span style="font-size: 12px; background: #fde8e8; color: #9b1c1c; padding: 4px 8px; border-radius: 4px;">{{ reservation.status }}</span>
                <button
                  v-if="reservation.status === 'Pending'"
                  type="button"
                  style="background: #59080d; color: #fff; border: none; padding: 6px 10px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px;"
                  @click="updateReservationStatus(reservation.id, 'Confirmed')"
                >
                  Confirm
                </button>
                <button
                  v-if="reservation.status === 'Confirmed'"
                  type="button"
                  style="background: #10662d; color: #fff; border: none; padding: 6px 10px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px;"
                  @click="updateReservationStatus(reservation.id, 'Completed')"
                >
                  Complete
                </button>
                <button
                  type="button"
                  style="background: #9b1c1c; color: #fff; border: none; padding: 6px 10px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px;"
                  @click="updateReservationStatus(reservation.id, 'Cancelled')"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div>
            <h4 style="margin: 0 0 12px; color: #43060a;">Pending Borrowing Requests</h4>
            <div v-if="requestsList.length === 0" style="padding: 16px; color: #7a5052;">No pending borrowing requests.</div>
            <div v-else style="display: flex; flex-direction: column; gap: 10px;">
              <div
                v-for="req in requestsList"
                :key="req.id"
                style="padding: 12px; background: #faf4f4; border-radius: 8px; border: 1px solid #ebdada;"
              >
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                  <strong style="color: #59080d;">{{ req.title }}</strong>
                  <span style="font-size: 12px; background: #fde8e8; color: #9b1c1c; padding: 2px 6px; border-radius: 4px;">{{ requestStatusLabel(req.status) }}</span>
                </div>
                <p style="margin: 4px 0; font-size: 12px; color: #693e40;">{{ req.details }}</p>
                <p style="margin: 4px 0 10px; font-size: 12px; color: #967f7f;">Requested by: {{ req.profiles?.full_name || 'Student' }}</p>
                <button
                  v-if="['pending', 'processing'].includes(req.status)"
                  type="button"
                  style="background: #59080d; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px;"
                  @click="selectedBorrowRequest = req; showLoanModal = true;"
                >
                  Review & Issue Loan
                </button>
              </div>
            </div>
          </div>

          <div>
            <h4 style="margin: 0 0 12px; color: #43060a;">Active Book Loans ({{ bookLoans.length }})</h4>
            <div v-if="bookLoans.length === 0" style="padding: 16px; color: #7a5052;">No active book loans.</div>
            <div v-else style="display: flex; flex-direction: column; gap: 10px;">
              <div
                v-for="loan in bookLoans"
                :key="loan.id"
                style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #faf4f4; border-radius: 8px; border: 1px solid #ebdada;"
              >
                <div>
                  <strong style="color: #43060a; display: block;">{{ loan.library_books?.title || 'Book' }}</strong>
                  <span style="font-size: 12px; color: #693e40;">{{ loan.profiles?.full_name || 'Student' }}</span>
                  <br />
                  <span style="font-size: 12px; color: #693e40;">Due: {{ new Date(loan.due_at).toLocaleDateString() }}</span>
                </div>
                <button
                  type="button"
                  style="background: #10662d; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px;"
                  @click="recordBookReturn(loan.id)"
                >
                  Record Return
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="['Registrar', 'Office of Student Affairs'].includes(selectedOffice)" style="background: #fff; border-radius: 12px; padding: 24px; border: 1px solid #d5c4c4; margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; color: #59080d;">{{ selectedOffice }} Document & Service Requests</h2>

        <div v-if="requestsList.length === 0" style="padding: 20px; color: #7a5052;">No service requests found.</div>
        <div v-else style="display: flex; flex-direction: column; gap: 12px;">
          <div
            v-for="r in requestsList"
            :key="r.id"
            style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: #faf4f4; border-radius: 8px; border: 1px solid #ebdada;"
          >
            <div>
              <strong style="color: #59080d; font-size: 16px;">{{ r.title }}</strong>
              <p style="margin: 4px 0; font-size: 13px; color: #693e40;">Student: {{ r.profiles?.full_name || 'Student' }} ({{ r.profiles?.student_id || 'ID' }})</p>
              <p style="margin: 2px 0; font-size: 12px; color: #967f7f;">Details: {{ r.details }}</p>
            </div>

            <div style="display: flex; gap: 8px; align-items: center;">
              <span style="font-size: 12px; font-weight: bold; padding: 4px 8px; border-radius: 4px; background: #eee;">{{ requestStatusLabel(r.status) }}</span>

              <button
                v-if="r.status === 'pending'"
                type="button"
                style="background: #a58b00; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px;"
                @click="updateRequestStatus(r.id, 'processing')"
              >
                Mark Processing
              </button>

              <button
                v-if="r.status === 'processing'"
                type="button"
                style="background: #59080d; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px;"
                @click="updateRequestStatus(r.id, 'ready_for_pickup')"
              >
                Ready for Pickup
              </button>

              <button
                v-if="r.status === 'ready_for_pickup'"
                type="button"
                style="background: #10662d; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px;"
                @click="updateRequestStatus(r.id, 'completed')"
              >
                Complete
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <div
      v-if="showLoanModal"
      style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100;"
      @click.self="showLoanModal = false"
    >
      <div style="background: #fff; border-radius: 12px; padding: 24px; max-width: 450px; width: 100%;">
        <h3 style="margin-top: 0; color: #59080d;">Issue Book Loan</h3>
        <p style="font-size: 14px; color: #43060a;">Request: {{ selectedBorrowRequest?.title }}</p>

        <div style="margin: 16px 0;">
          <label style="display: block; font-weight: 600; margin-bottom: 6px;" for="loan-due">Due Date</label>
          <input
            id="loan-due"
            v-model="loanDueDate"
            type="date"
            style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ccc;"
          />
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
          <button
            type="button"
            style="background: #ccc; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer;"
            @click="showLoanModal = false"
          >
            Cancel
          </button>
          <button
            type="button"
            style="background: #59080d; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;"
            @click="confirmIssueLoan"
          >
            Confirm & Issue Loan
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
