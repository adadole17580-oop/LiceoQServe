<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { supabase } from "../lib/supabase.js";
import "../assets/styles/queue.css";

const selectedOffice = ref("Registrar");
const selectedServiceId = ref("");
const availableServices = ref([]);
const servicesLoading = ref(false);

const activeTicket = ref(null);
const showCancelDialog = ref(false);
const historyNotice = ref("");
const errorMessage = ref("");
const loading = ref(false);

let realtimeChannel = null;
let activeTicketRefreshTimer = null
let activeTicketRefreshInProgress = false

const officeServices = computed(() => availableServices.value.filter((service) => (
  service.offices?.name === selectedOffice.value &&
  (selectedOffice.value !== "Cashier" || /tuition|payment|account|balance/i.test(service.name))
)));
const selectedService = computed(() => officeServices.value.find((service) => service.id === selectedServiceId.value));

const selectedPurposeText = computed(() => {
  if (!activeTicket.value) return "";

  return activeTicket.value.service;
});

function queueStatusLabel(status) {
  return {
    waiting: 'Waiting',
    being_served: 'Being Served',
    finished: 'Finished',
    skipped: 'Skipped',
    cancelled: 'Cancelled',
  }[status] || status;
}

function chooseOffice(office) {
  selectedOffice.value = office;
  selectedServiceId.value = availableServices.value.find((service) => (
    service.offices?.name === office &&
    (office !== "Cashier" || /tuition|payment|account|balance/i.test(service.name))
  ))?.id || "";
  historyNotice.value = "";
  errorMessage.value = "";
}

function setActiveTicket(ticket) {
  if (!ticket) return
  const ticketChanged = activeTicket.value?.id !== ticket.id
  activeTicket.value = {
    id: ticket.id,
    number: ticket.queue_number,
    office: ticket.office_services?.offices?.name || ticket.office || 'Registrar',
    service: ticket.office_services?.name || ticket.service || 'Campus Service',
    purposes: [ticket.office_services?.name || ticket.service || 'Service Concern'],
    status: ticket.status,
    calledAt: ticket.called_at,
    ...(ticket.status === 'being_served'
      ? { position: 'Now Serving!', estimatedWait: 'Please proceed to counter' }
      : {}),
  }
  if (ticketChanged) setupRealtimeSubscription(ticket.id)
}

async function loadQueueServices() {
  servicesLoading.value = true;
  try {
    const { data, error } = await supabase
      .from("office_services")
      .select("id, name, office_id, service_type, is_active, offices!inner(name, is_active)")
      .eq("is_active", true)
      .eq("offices.is_active", true)
      .in("offices.name", ["Registrar", "Cashier"])
      .order("name", { ascending: true });

    if (error) throw error;
    availableServices.value = data || [];
    if (!selectedService.value) {
      selectedServiceId.value = officeServices.value[0]?.id || "";
    }
  } catch (err) {
    console.error("Error loading queue services:", err);
    errorMessage.value = "Could not load available queue services. Please try again.";
  } finally {
    servicesLoading.value = false;
  }
}

async function fetchActiveTicket() {
  if (activeTicketRefreshInProgress) return
  activeTicketRefreshInProgress = true

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/queue/active`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    if (!res.ok) throw new Error('Could not refresh the active queue ticket.')

    const data = await res.json()
    const ticket = data.activeTickets?.[0]
    if (!ticket) {
      activeTicket.value = null
      return
    }

    setActiveTicket(ticket)
  } catch (err) {
    console.error('Error fetching active queue ticket:', err)
  } finally {
    activeTicketRefreshInProgress = false
  }
}

function setupRealtimeSubscription(ticketId) {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
  }

  realtimeChannel = supabase
    .channel(`queue-ticket-${ticketId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'queues',
        filter: `id=eq.${ticketId}`,
      },
      (payload) => {
        if (payload.new && activeTicket.value) {
          activeTicket.value.status = payload.new.status
          if (payload.new.status === 'being_served') {
            activeTicket.value.position = 'Now Serving!'
            activeTicket.value.estimatedWait = 'Please proceed to counter'
          } else if (['finished', 'skipped', 'cancelled'].includes(payload.new.status)) {
            activeTicket.value = null
            historyNotice.value = payload.new.status === 'skipped'
              ? 'Your ticket was skipped. You can rejoin at the end of the queue by requesting a new ticket.'
              : `Your ticket was ${queueStatusLabel(payload.new.status).toLowerCase()}.`
          }
        }
      }
    )
    .subscribe()
}

async function requestQueue() {
  errorMessage.value = "";
  historyNotice.value = "";

  if (!selectedService.value) {
    errorMessage.value = "Select an available service before joining the queue.";
    return;
  }

  loading.value = true;
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      errorMessage.value = "Please sign in again to join a queue.";
      return;
    }

    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/queue/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        serviceId: selectedService.value.id,
        purposes: [selectedService.value.name],
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      try {
        const { data: { session: recoverySession } } = await supabase.auth.getSession()
        if (recoverySession?.access_token) {
          const recoveryResponse = await fetch(
            `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/queue/active`,
            { headers: { Authorization: `Bearer ${recoverySession.access_token}` } },
          )
          const recoveryData = await recoveryResponse.json()
          const recoveredTicket = (recoveryData.activeTickets || []).find(
            (ticket) => ticket.office_services?.office_id === selectedService.value.office_id,
          )
          if (recoveryResponse.ok && recoveredTicket) {
            setActiveTicket(recoveredTicket)
            errorMessage.value = 'Your ticket was created, but its queue event could not be recorded. The existing ticket was recovered; it was not duplicated.'
            return
          }
        }
      } catch (recoveryError) {
        console.error('Could not recover a queue ticket after the join request failed:', recoveryError)
      }
      errorMessage.value = result.error || 'Could not join queue.'
      return
    }

    setActiveTicket(result.ticket)
  } catch (err) {
    console.error('Error joining queue:', err)
    errorMessage.value = 'Failed to generate queue ticket. Please try again.'
  } finally {
    loading.value = false;
  }
}

async function confirmCancelQueue() {
  if (!activeTicket.value) return;
  errorMessage.value = "";

  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/queue/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ queueId: activeTicket.value.id }),
    })
    const result = await response.json()
    if (!response.ok) {
      errorMessage.value = result.error || 'Could not cancel the queue ticket.'
      return
    }

    historyNotice.value = `${activeTicket.value.number} was cancelled.`;
    activeTicket.value = null;
    showCancelDialog.value = false;
  } catch (err) {
    console.error('Error cancelling queue:', err)
    errorMessage.value = 'Could not cancel the queue ticket. Please try again.';
  } finally {
    if (!errorMessage.value) showCancelDialog.value = false;
  }
}

onMounted(() => {
  loadQueueServices()
  fetchActiveTicket()
  activeTicketRefreshTimer = window.setInterval(fetchActiveTicket, 5000)
})

onUnmounted(() => {
  if (activeTicketRefreshTimer) {
    window.clearInterval(activeTicketRefreshTimer)
  }
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
  }
})
</script>

<template>
  <div class="queue-page">
    <div class="queue-heading">
      <h2>My Queue</h2>
      <p>Queues are available for active Registrar services and Cashier tuition-payment services.</p>
    </div>

    <div v-if="historyNotice" class="queue-history-notice">
      {{ historyNotice }}
      <button @click="historyNotice = ''" aria-label="Dismiss notice">×</button>
    </div>

    <div v-if="errorMessage" class="queue-history-notice" style="background: #fde8e8; color: #9b1c1c; border-color: #f8b4b4;">
      {{ errorMessage }}
      <button @click="errorMessage = ''" aria-label="Dismiss notice">×</button>
    </div>

    <section v-if="!activeTicket" class="queue-form">
      <div class="queue-field-label">Office</div>

      <div class="queue-office-switch">
        <button
          :class="{ active: selectedOffice === 'Registrar' }"
          type="button"
          @click="chooseOffice('Registrar')"
        >
          REGISTRAR
        </button>
        <button
          :class="{ active: selectedOffice === 'Cashier' }"
          type="button"
          @click="chooseOffice('Cashier')"
        >
          CASHIER
        </button>
      </div>

      <template v-if="selectedOffice === 'Registrar'">
        <label class="queue-field-label" for="registrar-service">Service</label>
      </template>

      <label v-if="selectedOffice === 'Cashier'" class="queue-field-label" for="cashier-service">Tuition payment service</label>
      <select
        :id="selectedOffice === 'Registrar' ? 'registrar-service' : 'cashier-service'"
        v-model="selectedServiceId"
        :disabled="servicesLoading || !officeServices.length"
      >
        <option value="" disabled>
          {{ servicesLoading ? 'Loading services...' : 'Select an available service' }}
        </option>
        <option v-for="service in officeServices" :key="service.id" :value="service.id">
          {{ service.name }}
        </option>
      </select>
      <p v-if="!servicesLoading && !officeServices.length" class="queue-hint">
        No active {{ selectedOffice }} queue services are currently available.
      </p>

      <button
        class="queue-primary-button"
        type="button"
        :disabled="loading || servicesLoading || !selectedService"
        @click="requestQueue"
      >
        {{ loading ? 'Generating Ticket...' : 'Get Queue Number' }}
      </button>
    </section>

    <section v-else class="queue-ticket">
      <div class="ticket-heading">
        <h3>{{ activeTicket.office.toUpperCase() }} QUEUE</h3>
        <p>{{ activeTicket.number }}</p>
        <span class="ticket-status">{{ queueStatusLabel(activeTicket.status) }}</span>
      </div>

      <div class="ticket-purpose">
        PURPOSE:
        <strong>{{ selectedPurposeText }}</strong>
      </div>

      <p class="queue-hint">Your ticket status updates automatically as staff calls and processes the queue.</p>

      <div class="ticket-footer">
        <button type="button" @click="showCancelDialog = true">
          Cancel / Leave Queue
        </button>
      </div>
    </section>

    <div
      v-if="showCancelDialog"
      class="queue-modal-overlay"
      @click.self="showCancelDialog = false"
    >
      <section
        class="queue-cancel-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
      >
        <div class="cancel-icon">!</div>
        <h3 id="cancel-title">Cancel Queue {{ activeTicket?.number }}?</h3>

        <p>
          Your place in line will be released and the transaction will be
          marked as Cancelled.
        </p>

        <div class="cancel-actions">
          <button
            class="cancel-back-button"
            type="button"
            @click="showCancelDialog = false"
          >
            Go Back
          </button>
          <button class="cancel-confirm-button" type="button" @click="confirmCancelQueue">
            Yes, Leave Queue
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
