
<template>
  <main class="counter-page">
    <header class="page-heading">
      <h1>My Assigned Counter</h1>
      <p>You can control only the counter assigned to your staff account.</p>
    </header>

    <div v-if="loading" class="loading-message">
      Loading counters...
    </div>

    <div v-else-if="loadError" class="error-message">
      {{ loadError }}
      <button class="counter-button" type="button" @click="loadCounters">
        Retry
      </button>
    </div>

    <section v-else class="counter-list">
      <article
        v-for="counter in counters"
        :key="counter.id"
        class="counter-card"
      >
        <div class="counter-icon">{{ counter.id }}</div>

        <div class="counter-details">
          <h2>{{ counter.name }}</h2>
          <p>{{ counter.assignedTo }}</p>
        </div>

        <div class="counter-actions">
          <span
            class="counter-status"
            :class="counter.isOpen ? 'open' : 'closed'"
          >
            {{ counter.isOpen ? 'Open' : 'Closed' }}
          </span>

          <template v-if="counter.isMine">
            <button
              v-if="counter.isOpen"
              class="counter-button close-button"
              type="button"
              :disabled="saving"
              @click="showCloseConfirmation"
            >
              Close Counter
            </button>

            <button
              v-else
              class="counter-button open-button"
              type="button"
              :disabled="saving"
              @click="showOpenConfirmation"
            >
              Open Counter
            </button>
          </template>
        </div>
      </article>

      <p v-if="counters.length === 0" class="empty-message">
        No cashier counters were found.
      </p>
    </section>

    <AppModal
      v-model="modalOpen"
      :title="modalTitle"
      :description="modalDescription"
      :type="modalType"
      :confirm-text="modalConfirmText"
      :cancel-text="modalCancelText"
      :show-cancel="modalShowCancel"
      :loading="saving"
      loading-text="Please wait..."
      :confirm-disabled="saving"
      @confirm="handleModalConfirm"
      @cancel="handleModalCancel"
    />
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase.js'
import AppModal from '../components/AppModal.vue'

const router = useRouter()

const counters = ref([])
const assignedCounterId = ref(null)

const loading = ref(true)
const saving = ref(false)
const loadError = ref('')

const modalOpen = ref(false)
const modalTitle = ref('')
const modalDescription = ref('')
const modalType = ref('info')
const modalConfirmText = ref('Okay')
const modalCancelText = ref('Go Back')
const modalShowCancel = ref(false)

let pendingAction = null

function getErrorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.'
}

function showModal({
  title,
  description,
  type = 'info',
  confirmText = 'Okay',
  cancelText = 'Go Back',
  showCancel = false,
  action = null,
}) {
  modalTitle.value = title
  modalDescription.value = description
  modalType.value = type
  modalConfirmText.value = confirmText
  modalCancelText.value = cancelText
  modalShowCancel.value = showCancel
  pendingAction = action
  modalOpen.value = true
}

function showOpenConfirmation() {
  showModal({
    title: 'Open Counter?',
    description:
      'Are you sure you want to open your assigned counter? Queue dispatch will start once your counter is open.',
    type: 'warning',
    confirmText: 'Open Counter',
    cancelText: 'Go Back',
    showCancel: true,
    action: openCounter,
  })
}

function showCloseConfirmation() {
  showModal({
    title: 'Close Counter?',
    description:
      'Are you sure you want to set your assigned counter to closed? You can open it again anytime.',
    type: 'warning',
    confirmText: 'Close Counter',
    cancelText: 'Go Back',
    showCancel: true,
    action: closeCounter,
  })
}

function handleModalCancel() {
  if (saving.value) return

  modalOpen.value = false
  pendingAction = null
}

async function handleModalConfirm() {
  if (saving.value) return

  if (pendingAction) {
    const action = pendingAction
    pendingAction = null
    await action()
    return
  }

  modalOpen.value = false
}

async function loadCounters() {
  loading.value = true
  loadError.value = ''

  try {
    const { data, error } = await supabase.rpc('cashier_get_counters')

    if (error) throw error

    counters.value = (data || []).map((counter) => ({
      id: counter.counter_name,
      name: `Counter ${counter.counter_name.substring(1)}`,
      assignedTo: counter.is_mine
        ? 'Assigned to you'
        : counter.assigned_to === 'Unassigned'
          ? 'Unassigned'
          : `Assigned to ${counter.assigned_to}`,
      isOpen: counter.is_open,
      isMine: counter.is_mine,
      hasCurrentQueue: counter.has_current_queue,
    }))

    const assignedCounter = counters.value.find(
      (counter) => counter.isMine
    )

    assignedCounterId.value = assignedCounter?.id || null
  } catch (error) {
    console.error('Load counters error:', error)
    loadError.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function openCounter() {
  if (!assignedCounterId.value || saving.value) return

  saving.value = true

  try {
    const { data, error } = await supabase.rpc(
      'cashier_set_counter_open',
      {
        p_counter_name: assignedCounterId.value,
        p_is_open: true,
      }
    )

    if (error) throw error

    if (!data?.success) {
      throw new Error(data?.message || 'Unable to open counter.')
    }

    // Counter successfully opened.
    // Redirect the cashier to the Payment Queue.
    modalOpen.value = false

    await router.replace('/payment-queue')
  } catch (error) {
    console.error('Open counter error:', error)

    showModal({
      title: 'Unable to Open Counter',
      description: getErrorMessage(error),
      type: 'error',
      confirmText: 'Okay',
    })
  } finally {
    saving.value = false
  }
}

async function closeCounter() {
  if (!assignedCounterId.value || saving.value) return

  saving.value = true

  try {
    const { data, error } = await supabase.rpc(
      'cashier_set_counter_open',
      {
        p_counter_name: assignedCounterId.value,
        p_is_open: false,
      }
    )

    if (error) throw error

    if (!data?.success) {
      throw new Error(data?.message || 'Unable to close counter.')
    }

    await loadCounters()

    if (loadError.value) {
      throw new Error(loadError.value)
    }

    showModal({
      title: 'Counter Closed',
      description: 'Your assigned counter has been successfully closed.',
      type: 'success',
      confirmText: 'Okay',
    })
  } catch (error) {
    console.error('Close counter error:', error)

    showModal({
      title: 'Unable to Close Counter',
      description: getErrorMessage(error),
      type: 'error',
      confirmText: 'Okay',
    })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadCounters()
})
</script>

<style scoped>
.counter-page {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  padding: 26px 28px;
  background: #eee3e3;
  color: #3d2528;
}

.page-heading {
  margin-bottom: 27px;
}

.page-heading h1 {
  margin: 0;
  color: #51262d;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 26px;
  font-weight: 700;
}

.page-heading p {
  margin: 3px 0 0;
  color: #8c777a;
  font-size: 12px;
}

.counter-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 100%;
}

.counter-card {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 70px;
  padding: 10px 14px;
  border: 1px solid #d9cccc;
  border-radius: 11px;
  background: #faf6f6;
  box-shadow: 0 2px 4px rgb(50 20 25 / 8%);
}

.counter-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  margin-right: 13px;
  border-radius: 8px;
  background: #64151a;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.counter-details {
  flex: 1;
  min-width: 0;
}

.counter-details h2 {
  margin: 0 0 3px;
  color: #39272a;
  font-size: 13px;
  font-weight: 700;
}

.counter-details p {
  margin: 0;
  color: #8b797b;
  font-size: 11px;
}

.counter-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  gap: 8px;
  margin-left: 12px;
}

.counter-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 46px;
  padding: 5px 9px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
}

.counter-status.open {
  background: #fff3d9;
  color: #98712b;
}

.counter-status.closed {
  background: #f2dddd;
  color: #98575b;
}

.counter-button {
  min-height: 29px;
  padding: 0 10px;
  border: 1px solid #dfd1d1;
  border-radius: 6px;
  background: #fffafa;
  color: #51262d;
  font-family: inherit;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}

.counter-button:hover {
  background: #f3e8e8;
}

.counter-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.open-button {
  border-color: #64151a;
  background: #64151a;
  color: #fff;
}

.open-button:hover {
  background: #4d1015;
}

.loading-message,
.empty-message,
.error-message {
  padding: 18px;
  border: 1px solid #d9cccc;
  border-radius: 11px;
  background: #faf6f6;
  color: #8b797b;
  font-size: 12px;
}

.error-message {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #98575b;
}

@media (max-width: 650px) {
  .counter-page {
    padding: 20px 14px;
  }

  .counter-card {
    flex-wrap: wrap;
    gap: 9px;
    padding: 12px;
  }

  .counter-details {
    flex-basis: calc(100% - 55px);
  }

  .counter-actions {
    width: 100%;
    margin-left: 0;
  }

  .page-heading h1 {
    font-size: 23px;
  }
}
</style>
