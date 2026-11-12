
<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  request: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits([
  'save',
  'change-status',
  'close',
])

const expectedDate = ref('')
const instruction = ref('')
const showConfirmationFields = ref(false)

const isPending = computed(
  () => props.request?.databaseStatus === 'pending',
)

watch(
  () => props.request,
  (request) => {
    expectedDate.value = request?.expectedDate || ''
    instruction.value = request?.instruction || ''
    showConfirmationFields.value = false
  },
  { immediate: true },
)

function handleConfirmClick() {
  showConfirmationFields.value = true
}

function handleSave() {
  if (!props.request) return

  emit('save', {
    id: props.request.id,
    expectedDate: expectedDate.value,
    instruction: instruction.value,
  })
}

function handleCancel() {
  showConfirmationFields.value = false
  emit('change-status', 'Cancel')
}
</script>

<template>
  <section v-if="request" class="details-panel">
    <div class="details-header">
      <div>
        <p class="eyebrow">REQUEST INFORMATION</p>
        <h2>Request Details</h2>
      </div>

      <button
        type="button"
        class="close-button"
        aria-label="Close request details"
        @click="emit('close')"
      >
        ×
      </button>
    </div>

    <div class="request-info">
      <div class="info-row">
        <span>Request Number</span>
        <strong>{{ request.requestNumber }}</strong>
      </div>

      <div class="info-row">
        <span>Student Name</span>
        <strong>{{ request.studentName }}</strong>
      </div>

      <div class="info-row">
        <span>Student ID</span>
        <strong>{{ request.studentId }}</strong>
      </div>

      <div class="info-row">
        <span>Request Type</span>
        <strong>{{ request.type }}</strong>
      </div>

      <div class="info-row">
        <span>Request Date</span>
        <strong>{{ request.requestDate || 'Not available' }}</strong>
      </div>

      <div class="info-row">
        <span>Status</span>
        <strong
          class="status"
          :class="request.databaseStatus"
        >
          {{ request.status }}
        </strong>
      </div>
    </div>

    <div v-if="request.details" class="request-description">
      <h3>Request Description</h3>
      <p>{{ request.details }}</p>
    </div>

    <div
      v-if="isPending && !showConfirmationFields"
      class="action-area"
    >
      <p class="action-message">
        Review the request before confirming or cancelling it.
      </p>

      <div class="action-buttons">
        <button
          type="button"
          class="confirm-button"
          @click="handleConfirmClick"
        >
          Confirm
        </button>

        <button
          type="button"
          class="cancel-button"
          @click="handleCancel"
        >
          Cancel
        </button>
      </div>
    </div>

    <div
      v-if="isPending && showConfirmationFields"
      class="confirmation-fields"
    >
      <div class="section-heading">
        <p class="eyebrow">CONFIRM REQUEST</p>
        <h3>Request Handling Details</h3>
        <p>
          Set the expected completion date and provide any instructions.
        </p>
      </div>

      <div class="form-group">
        <label for="expectedDate">Expected Completion</label>
        <input
          id="expectedDate"
          v-model="expectedDate"
          type="date"
        />
      </div>

      <div class="form-group">
        <label for="instruction">Instruction / Notes</label>
        <textarea
          id="instruction"
          v-model="instruction"
          rows="4"
          placeholder="Enter instructions or notes for the student..."
        />
      </div>

      <div class="action-buttons">
        <button
          type="button"
          class="confirm-button"
          @click="emit('change-status', 'Confirm')"
        >
          Confirm Request
        </button>

        <button
          type="button"
          class="cancel-button"
          @click="showConfirmationFields = false"
        >
          Back
        </button>
      </div>
    </div>

    <div v-if="!isPending" class="final-status">
      <p>
        This request has already been handled.
      </p>

      <div v-if="request.expectedDate" class="info-row">
        <span>Expected Completion</span>
        <strong>{{ request.expectedDate }}</strong>
      </div>

      <div v-if="request.instruction" class="saved-notes">
        <span>Instruction / Notes</span>
        <p>{{ request.instruction }}</p>
      </div>
    </div>
  </section>

  <section v-else class="details-panel empty-details">
    <h2>No Request Selected</h2>
    <p>Select a request to view its details.</p>
  </section>
</template>

<style scoped>
.details-panel {
  padding: 22px;
  border: 1px solid #d5bdbc;
  border-radius: 12px;
  background: #f6eded;
  color: #390607;
}

.details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22px;
}

.eyebrow {
  margin: 0 0 7px;
  color: #805d5e;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.3px;
}

.details-header h2 {
  margin: 0;
  font-family: Georgia, serif;
  font-size: 21px;
}

.close-button {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 6px;
  background: #eadcda;
  color: #56090d;
  cursor: pointer;
  font-size: 21px;
}

.request-info {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 15px;
  padding: 13px 0;
  border-bottom: 1px solid #e5d4d3;
}

.info-row span {
  color: #795f60;
  font-size: 11px;
}

.info-row strong {
  max-width: 60%;
  color: #390607;
  font-size: 12px;
  text-align: right;
  overflow-wrap: anywhere;
}

.status {
  padding: 5px 9px;
  border-radius: 20px;
  background: #f2e5d0;
  color: #80500d !important;
}

.status.borrowed {
  background: #e0efdf;
  color: #28632e !important;
}

.status.cancelled,
.status.rejected {
  background: #f5dede;
  color: #9a2525 !important;
}

.request-description {
  margin-top: 20px;
  padding: 15px;
  border-radius: 8px;
  background: #fff8f7;
}

.request-description h3 {
  margin: 0 0 8px;
  font-size: 12px;
}

.request-description p {
  margin: 0;
  color: #795f60;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.action-area,
.confirmation-fields {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid #e5d4d3;
}

.action-message,
.section-heading > p:last-child {
  color: #795f60;
  font-size: 11px;
  line-height: 1.6;
}

.section-heading h3 {
  margin: 0;
  font-family: Georgia, serif;
  font-size: 18px;
}

.section-heading > p:last-child {
  margin: 8px 0 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.form-group label {
  color: #563536;
  font-size: 11px;
  font-weight: 700;
}

.form-group input,
.form-group textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 11px;
  border: 1px solid #d5bdbc;
  border-radius: 7px;
  background: #fffafa;
  color: #390607;
  font: inherit;
  font-size: 12px;
}

.form-group textarea {
  resize: vertical;
}

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.action-buttons button {
  flex: 1;
  min-width: 110px;
  padding: 12px 16px;
  border: 0;
  border-radius: 7px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}

.confirm-button {
  background: #56090d;
  color: white;
}

.cancel-button {
  background: #eadcda;
  color: #56090d;
}

.final-status {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid #e5d4d3;
}

.final-status > p {
  color: #795f60;
  font-size: 11px;
}

.saved-notes {
  margin-top: 15px;
}

.saved-notes span {
  color: #795f60;
  font-size: 11px;
}

.saved-notes p {
  margin-top: 7px;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.empty-details {
  padding: 40px 20px;
  text-align: center;
}

.empty-details p {
  color: #795f60;
  font-size: 12px;
}
</style>
