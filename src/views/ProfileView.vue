
<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  accessToken: {
    type: String,
    default: ''
  },
  currentUser: {
    type: Object,
    default: () => ({})
  }
})

const staff = computed(() => {
  const name = props.currentUser?.full_name || 'Guidance Staff'
  const role = props.currentUser?.role
  const isActive = props.currentUser?.is_active

  return {
    name,
    initials: name.trim().split(/\s+/).slice(0, 2)
      .map(part => part.charAt(0).toUpperCase()).join(''),
    title: 'Guidance Counselor',
    employeeId: 'Not available',
    email: props.currentUser?.email || 'Not available',
   office: props.currentUser?.office_name || 'Not available',
    role: role === 'staff' ? 'Authorized Staff' : (role || 'Not available'),
    status: isActive === true
      ? 'Active'
      : isActive === false
        ? 'Inactive'
        : 'Not available'
  }
})
const showPasswordForm = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const message = ref('')
const messageType = ref('')
const isUpdating = ref(false)

const canSubmit = computed(() =>
  currentPassword.value.length > 0 &&
  newPassword.value.length > 0 &&
  confirmPassword.value.length > 0 &&
  !isUpdating.value
)

function openPasswordForm() {
  showPasswordForm.value = true
  message.value = ''
  messageType.value = ''
}

function cancelPasswordForm() {
  if (isUpdating.value) return

  showPasswordForm.value = false
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  message.value = ''
  messageType.value = ''
}

async function updatePassword() {
  if (isUpdating.value) return

  message.value = ''
  messageType.value = ''

  if (
    !currentPassword.value ||
    !newPassword.value ||
    !confirmPassword.value
  ) {
    message.value = 'Please fill in all password fields.'
    messageType.value = 'error'
    return
  }

  if (newPassword.value.length < 8) {
    message.value = 'New password must be at least 8 characters long.'
    messageType.value = 'error'
    return
  }

  if (currentPassword.value === newPassword.value) {
    message.value = 'New password must be different from your current password.'
    messageType.value = 'error'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    message.value = 'New password and confirmation do not match.'
    messageType.value = 'error'
    return
  }

  if (!props.accessToken) {
    message.value = 'Your session is missing. Please log in again.'
    messageType.value = 'error'
    return
  }

  isUpdating.value = true

  try {
    const response = await fetch(
      'http://localhost:3000/api/guidance/change-password',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${props.accessToken}`
        },
        body: JSON.stringify({
          currentPassword: currentPassword.value,
          newPassword: newPassword.value
        })
      }
    )

    const result = await response.json()

    if (!response.ok || !result.success) {
      message.value =
        result.message || 'Unable to change password. Please try again.'
      messageType.value = 'error'
      return
    }

    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''

    message.value = 'Password changed successfully!'
    messageType.value = 'success'

  } catch (error) {
    console.error('CHANGE PASSWORD ERROR:', error)

    message.value =
      'Unable to connect to the server. Please check if the backend is running.'
    messageType.value = 'error'
  } finally {
    isUpdating.value = false
  }
}
</script>

<template>
  <section class="profile-page">
    <header class="page-heading">
      <h1>Staff Profile</h1>
      <p>
        Staff information is managed by the university and is read-only.
      </p>
    </header>

    <div class="profile-container">
      <article class="profile-card">
        <div class="profile-banner">
          <div class="avatar">{{ staff.initials }}</div>

          <h2>{{ staff.name }}</h2>

         <p>
  {{ staff.title }}
</p>
        </div>

        <div class="profile-details">
          <div class="detail-item">
            <span>University email</span>
            <strong>{{ staff.email }}</strong>
          </div>

          <div class="detail-item">
            <span>Assigned Office</span>
            <strong>{{ staff.office }}</strong>
          </div>

          <div class="detail-item">
            <span>Role</span>
            <strong>{{ staff.role }}</strong>
          </div>

          <div class="detail-item">
            <span>Account Status</span>
            <strong>{{ staff.status }}</strong>
          </div>

          <div class="profile-actions">
            <button
              v-if="!showPasswordForm"
              class="change-password-button"
              type="button"
              @click="openPasswordForm"
            >
              Change Password
            </button>
          </div>
        </div>
      </article>

      <section v-if="showPasswordForm" class="password-panel">
        <h2>Change Password</h2>

        <form @submit.prevent="updatePassword">
          <label for="current-password">
            Current password
          </label>

          <input
            id="current-password"
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            :disabled="isUpdating"
            required
          />

          <label for="new-password">
            New password
          </label>

          <input
            id="new-password"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            minlength="8"
            :disabled="isUpdating"
            required
          />

          <label for="confirm-password">
            Confirm new password
          </label>

          <input
            id="confirm-password"
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            minlength="8"
            :disabled="isUpdating"
            required
          />

          <p
            v-if="message"
            class="form-message"
            :class="messageType"
            role="status"
          >
            {{ message }}
          </p>

          <div class="form-actions">
            <button
              class="update-button"
              type="submit"
              :disabled="!canSubmit"
            >
              {{ isUpdating ? 'Updating...' : 'Update password' }}
            </button>

            <button
              class="cancel-button"
              type="button"
              :disabled="isUpdating"
              @click="cancelPasswordForm"
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  </section>
</template>

<style scoped>
.profile-page {
  width: 100%;
  min-width: 0;
  color: #39090c;
  box-sizing: border-box;
}

.profile-page *,
.profile-page *::before,
.profile-page *::after {
  box-sizing: border-box;
}

/* PAGE HEADING */

.page-heading {
  margin-bottom: 22px;
}

.page-heading h1 {
  margin: 0;
  color: #39090c;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 34px;
  font-weight: 500;
  line-height: 1.2;
}

.page-heading p {
  margin: 4px 0 0;
  color: #39090c;
  font-size: 14px;
}

/* FULL-WIDTH PROFILE CONTENT */

.profile-container {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  max-width: none;
}

/* PROFILE CARD */

.profile-card {
  width: 100%;
  max-width: none;
  overflow: hidden;
  background: #f8eeee;
  border-radius: 24px;
}

/* MAROON PROFILE HEADER */

.profile-banner {
  min-height: 230px;
  padding: 28px 36px 32px;
  color: #fffafa;
  background: #51090e;
}

.avatar {
  display: grid;
  place-items: center;
  width: 78px;
  height: 78px;
  margin-bottom: 18px;
  color: #fffafa;
  background: #713238;
  border-radius: 19px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 30px;
  font-weight: bold;
}

.profile-banner h2 {
  margin: 0;
  color: #fffafa;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 31px;
  font-weight: 600;
  line-height: 1.25;
}

.profile-banner p {
  margin: 7px 0 0;
  color: #d6babc;
  font-size: 14px;
  line-height: 1.5;
}

/* PROFILE INFORMATION */

.profile-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 48px;
  row-gap: 27px;
  width: 100%;
  padding: 32px 36px 30px;
}

.detail-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
}

.detail-item span {
  color: #776768;
  font-size: 14px;
}

.detail-item strong {
  overflow-wrap: anywhere;
  color: #39090c;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
}

/* CHANGE PASSWORD BUTTON */

.profile-actions {
  grid-column: 1 / -1;
  margin-top: 3px;
}

.change-password-button,
.update-button {
  min-height: 41px;
  padding: 10px 18px;
  color: #fffafa;
  background: #51090e;
  border: 1px solid #51090e;
  border-radius: 8px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.change-password-button:hover,
.update-button:not(:disabled):hover {
  background: #6a151c;
}

/* PASSWORD PANEL */

.password-panel {
  width: 100%;
  max-width: none;
  margin-top: 0;
  padding: 28px 36px 30px;
  background: #f8eeee;
  border: 1px solid #c9b8b8;
  border-radius: 24px;
}

.password-panel h2 {
  margin: 0 0 22px;
  color: #39090c;
  font-size: 20px;
  font-weight: 700;
}

.password-panel form {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.password-panel label {
  margin: 0 0 7px;
  color: #39090c;
  font-size: 13px;
  font-weight: 700;
}

.password-panel input {
  display: block;
  width: 100%;
  min-height: 43px;
  margin-bottom: 17px;
  padding: 10px 13px;
  color: #39090c;
  background: #f8eeee;
  border: 1px solid #d4b5b7;
  border-radius: 9px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  outline: none;
}

.password-panel input:focus {
  border-color: #7a3036;
  box-shadow: 0 0 0 2px rgba(122, 48, 54, 0.12);
}

.password-panel input:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* FORM BUTTONS */

.form-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 11px;
  margin-top: 4px;
}

.update-button {
  min-height: 39px;
  padding: 9px 16px;
  font-size: 13px;
}

.update-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.cancel-button {
  min-height: 39px;
  padding: 9px 16px;
  color: #775f60;
  background: transparent;
  border: 1px solid #d4b5b7;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}

.cancel-button:hover:not(:disabled) {
  background: #f1e2e2;
}

.cancel-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* FORM MESSAGES */

.form-message {
  margin: 0 0 15px;
  font-size: 13px;
  line-height: 1.5;
}

.form-message.error {
  color: #a0202a;
}

.form-message.info {
  color: #665052;
}

.form-message.success {
  color: #246b3d;
}

/* TABLET */

@media (max-width: 900px) {
  .profile-banner {
    min-height: 210px;
    padding: 25px 28px;
  }

  .profile-details {
    column-gap: 25px;
    padding: 27px 28px;
  }

  .password-panel {
    padding: 25px 28px;
  }
}

/* MOBILE */

@media (max-width: 600px) {
  .page-heading h1 {
    font-size: 28px;
  }

  .page-heading p {
    font-size: 13px;
  }

  .profile-container {
    gap: 14px;
  }

  .profile-card,
  .password-panel {
    border-radius: 18px;
  }

  .profile-banner {
    min-height: auto;
    padding: 22px 20px 25px;
  }

  .avatar {
    width: 65px;
    height: 65px;
    margin-bottom: 15px;
    font-size: 25px;
  }

  .profile-banner h2 {
    font-size: 25px;
  }

  .profile-banner p {
    font-size: 12px;
  }

  .profile-details {
    grid-template-columns: 1fr;
    row-gap: 20px;
    padding: 24px 20px;
  }

  .detail-item span {
    font-size: 12px;
  }

  .detail-item strong {
    font-size: 15px;
  }

  .profile-actions {
    grid-column: auto;
  }

  .password-panel {
    padding: 22px 20px;
  }

  .password-panel h2 {
    font-size: 18px;
  }

  .password-panel input {
    min-height: 41px;
  }
}
</style>
