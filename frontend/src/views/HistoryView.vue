<script setup>
import { computed, ref, onMounted } from "vue";
import { supabase } from "../lib/supabase.js";
import "../assets/styles/history.css";

const activeFilter = ref("All");
const selectedTransaction = ref(null);
const loading = ref(true);
const loadError = ref('');

const transactions = ref([]);

const filters = ["All", "Queue", "Appointment", "Request", "Reservation"];

const filteredTransactions = computed(() => {
  if (activeFilter.value === "All") return transactions.value;
  return transactions.value.filter(
    (transaction) => transaction.type === activeFilter.value
  );
});

async function fetchServiceHistory() {
  loadError.value = ''
  loading.value = true
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) throw new Error('Please sign in again to view your history.')

    const { data, error } = await supabase
      .from('service_history')
      .select('id, title, transaction_id, transaction_type, completed_at, created_at, office_services(name, offices(name))')
      .eq('student_id', session.user.id)
      .order('completed_at', { ascending: false })

    if (error) throw error
    transactions.value = (data || []).map((item) => {
      const completedDate = new Date(item.completed_at || item.created_at)
      return {
        id: item.id,
        type: item.transaction_type || 'Transaction',
        office: item.office_services?.offices?.name || 'Campus Office',
        title: item.title,
        date: completedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        time: completedDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        status: 'Completed',
        reference: item.transaction_id || item.id.slice(0, 8).toUpperCase(),
        details: `Completed transaction for ${item.title}.`,
        result: 'Transaction recorded successfully in campus service history.',
      }
    })
  } catch (err) {
    console.error('Error fetching service history:', err)
    loadError.value = err.message || 'Could not load your transaction history.'
  } finally {
    loading.value = false
  }
}

function closeDetails() {
  selectedTransaction.value = null;
}

onMounted(() => {
  fetchServiceHistory()
})
</script>

<template>
  <div class="history-page">
    <p v-if="loadError" class="history-empty" role="alert">
      {{ loadError }}
      <button type="button" @click="fetchServiceHistory">Try Again</button>
    </p>
    <p v-else-if="loading" class="history-empty" role="status">Loading your transaction history…</p>

    <header class="history-heading">
      <div>
        <h2>History</h2>
        <p>View your previous campus transactions and their details.</p>
      </div>
    </header>

    <nav class="history-filters" aria-label="Filter transaction history">
      <button
        v-for="filter in filters"
        :key="filter"
        :class="{ active: activeFilter === filter }"
        type="button"
        @click="activeFilter = filter"
      >
        {{ filter }}
      </button>
    </nav>

    <section v-if="!loading && !loadError && filteredTransactions.length" class="history-list">
      <article
        v-for="transaction in filteredTransactions"
        :key="transaction.id"
        class="history-card"
      >
        <div class="history-card-main">
          <div class="history-type-icon" aria-hidden="true">
            {{
              transaction.type === "Queue"
                ? "Q"
                : transaction.type === "Appointment"
                  ? "A"
                  : transaction.type === "Request"
                    ? "R"
                    : transaction.type === "Reservation"
                      ? "R"
                    : "B"
            }}
          </div>

          <div class="history-description">
            <p class="history-office">
              {{ transaction.office }} · {{ transaction.type }}
            </p>
            <h3>{{ transaction.title }}</h3>
            <p class="history-reference">Reference: {{ transaction.reference }}</p>
            <p class="history-date">
              {{ transaction.date }} · {{ transaction.time }}
            </p>
          </div>
        </div>

        <div class="history-card-actions">
          <span
            class="history-status"
            :class="transaction.status.toLowerCase()"
          >
            {{ transaction.status }}
          </span>

          <button
            class="history-details-button"
            type="button"
            @click="selectedTransaction = transaction"
          >
            View Details
          </button>
        </div>
      </article>
    </section>

    <section v-else-if="!loading && !loadError" class="history-empty">
      <h3>No transactions found</h3>
      <p>Your transactions will appear here once recorded.</p>
    </section>

    <div
      v-if="selectedTransaction"
      class="history-modal-overlay"
      @click.self="closeDetails"
    >
      <section
        class="history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
      >
        <div class="history-modal-heading">
          <div>
            <p class="history-modal-eyebrow">TRANSACTION DETAILS</p>
            <h3 id="history-modal-title">
              {{ selectedTransaction.title }}
            </h3>
          </div>
          <button
            class="history-close-button"
            type="button"
            aria-label="Close details"
            @click="closeDetails"
          >
            ×
          </button>
        </div>

        <div class="history-modal-status-row">
          <span
            class="history-status"
            :class="selectedTransaction.status.toLowerCase()"
          >
            {{ selectedTransaction.status }}
          </span>
          <span class="history-modal-type">{{ selectedTransaction.type }}</span>
        </div>

        <div class="history-detail-grid">
          <div>
            <span>Reference Number</span>
            <strong>{{ selectedTransaction.reference }}</strong>
          </div>
          <div>
            <span>Office</span>
            <strong>{{ selectedTransaction.office }}</strong>
          </div>
          <div>
            <span>Date</span>
            <strong>{{ selectedTransaction.date }}</strong>
          </div>
          <div>
            <span>Time</span>
            <strong>{{ selectedTransaction.time }}</strong>
          </div>
        </div>

        <div class="history-detail-notes">
          <span>Details</span>
          <p>{{ selectedTransaction.details }}</p>
        </div>

        <div class="history-detail-notes">
          <span>Result / Status Update</span>
          <p>{{ selectedTransaction.result }}</p>
        </div>

        <div class="history-modal-footer">
          <button class="history-details-button" type="button" @click="closeDetails">
            Close
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
