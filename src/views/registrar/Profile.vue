
<template>
  <main class="main-content">
    <div class="page-heading">
      <h2>Staff Profile</h2>
      <p>Staff information is managed by the university and is read-only.</p>
    </div>

    <section class="profile-card">
      <div class="profile-banner">
        <div class="avatar">{{ initials }}</div>
        <h3>{{ staff.name }}</h3>
        <p class="employee-info">
          {{ staff.position }} · Employee ID: {{ staff.employeeId }}
        </p>
      </div>

      <div class="profile-details">
        <div class="detail-item">
          <span>University email</span>
          <strong>{{ staff.email }}</strong>
        </div>

        <div class="detail-item">
          <span>Assigned office</span>
          <strong>{{ staff.office }}</strong>
        </div>

        <div class="detail-item">
          <span>Role</span>
          <strong>{{ staff.role }}</strong>
        </div>

        <div class="detail-item">
          <span>Account status</span>
          <strong>{{ staff.status }}</strong>
        </div>

        <div class="profile-actions">
          <button
            class="change-button"
            type="button"
            @click="showPasswordForm = !showPasswordForm"
          >
            {{ showPasswordForm ? 'Cancel password change' : 'Change password' }}
          </button>
        </div>
      </div>
    </section>

    <section v-if="showPasswordForm" class="password-card">
      <div class="password-heading">
        <h3>Change Password</h3>
        <p>Check the current password and make sure both new passwords match.</p>
      </div>

      <form class="password-form" @submit.prevent="updatePassword">
        <div class="form-field">
          <label for="current-password">Current password</label>
          <input
            id="current-password"
            v-model="passwords.current"
            type="password"
            autocomplete="current-password"
            required
          />
        </div>

        <div class="form-field">
          <label for="new-password">New password</label>
          <input
            id="new-password"
            v-model="passwords.new"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </div>

        <div class="form-field">
          <label for="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            v-model="passwords.confirm"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </div>

        <p v-if="passwordMessage" class="form-message">
          {{ passwordMessage }}
        </p>

        <div class="form-actions">
          <button
            class="update-button"
            type="submit"
            :disabled="isUpdatingPassword"
          >
            {{ isUpdatingPassword ? 'Updating...' : 'Update password' }}
          </button>

          <button
            class="cancel-button"
            type="button"
            @click="cancelPasswordChange"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>

    <Teleport to="body">
      <div
        v-if="showLogoutModal"
        class="modal-overlay"
        @click.self="showLogoutModal = false"
      >
        <section
          class="logout-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-title"
        >
          <div class="warning-icon">
            <span>!</span>
          </div>

          <h3 id="logout-title">Log out of LiceoQServe?</h3>
          <p>You will return to the role selection screen.</p>

          <div class="modal-actions">
            <button
              class="go-back-btn"
              type="button"
              @click="showLogoutModal = false"
            >
              Go Back
            </button>

            <button
              class="confirm-logout-btn"
              type="button"
              :disabled="isLoggingOut"
              @click="confirmLogout"
            >
              {{ isLoggingOut ? 'Logging out...' : 'Yes, log out' }}
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import { computed, reactive, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../../lib/supabase'

const router = useRouter()

const staff = ref({
  name: '',
  position: 'Staff',
  employeeId: 'Not available',
  email: '',
  office: 'Loading...',
  role: 'Staff',
  status: 'Loading...',
})

const initials = computed(() =>
  staff.value.name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
)

const showPasswordForm = ref(false)
const passwordMessage = ref('')
const isUpdatingPassword = ref(false)

const passwords = reactive({
  current: '',
  new: '',
  confirm: '',
})

const showLogoutModal = ref(false)
const isLoggingOut = ref(false)

async function loadStaffProfile() {
  const { data: authData, error: authError } =
    await supabase.auth.getUser()

  if (authError || !authData.user) {
    staff.value.status = 'Not signed in'
    return
  }

  const user = authData.user

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      employee_id,
      full_name,
      university_email,
      role,
      is_active,
      office_id,
      offices (
        name
      )
    `)
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Error loading staff profile:', error.message)

    staff.value.name = user.user_metadata?.full_name || 'Staff'
    staff.value.email = user.email || ''
    staff.value.status = 'Unable to load'
    staff.value.office = 'Not available'

    return
  }

  staff.value = {
    name: data.full_name || 'Staff',
    position: data.offices?.name || 'Staff',
    employeeId: data.employee_id || 'Not available',
    email: data.university_email || user.email || 'Not available',
    office: data.offices?.name || 'Not assigned',
    role: data.role || 'Staff',
    status: data.is_active ? 'Active' : 'Inactive',
  }
}

function cancelPasswordChange() {
  showPasswordForm.value = false
  passwordMessage.value = ''
  passwords.current = ''
  passwords.new = ''
  passwords.confirm = ''
}

async function updatePassword() {
  passwordMessage.value = ''

  if (passwords.new !== passwords.confirm) {
    passwordMessage.value = 'New passwords do not match.'
    return
  }

  if (passwords.new.length < 8) {
    passwordMessage.value = 'Password must be at least 8 characters.'
    return
  }

  if (passwords.current === passwords.new) {
    passwordMessage.value =
      'Your new password must be different from your current password.'
    return
  }

  isUpdatingPassword.value = true

  try {
    const { data: authData, error: authError } =
      await supabase.auth.getUser()

    if (authError || !authData.user?.email) {
      passwordMessage.value =
        'Unable to verify your account. Please sign in again.'
      return
    }

    const { error: verifyError } =
      await supabase.auth.signInWithPassword({
        email: authData.user.email,
        password: passwords.current,
      })

    if (verifyError) {
      passwordMessage.value = 'Your current password is incorrect.'
      return
    }

    const { error: updateError } =
      await supabase.auth.updateUser({
        password: passwords.new,
      })

    if (updateError) {
      passwordMessage.value = updateError.message
      return
    }

    cancelPasswordChange()
    passwordMessage.value = 'Password updated successfully.'
  } catch (error) {
    passwordMessage.value =
      error.message || 'Unable to update password.'
  } finally {
    isUpdatingPassword.value = false
  }
}

function openLogoutModal() {
  showLogoutModal.value = true
}

function handleEscape(event) {
  if (event.key === 'Escape') {
    showLogoutModal.value = false
  }
}

onMounted(() => {
  loadStaffProfile()

  window.addEventListener('open-logout-modal', openLogoutModal)
  window.addEventListener('keydown', handleEscape)
})

onBeforeUnmount(() => {
  window.removeEventListener('open-logout-modal', openLogoutModal)
  window.removeEventListener('keydown', handleEscape)
})

async function confirmLogout() {
  isLoggingOut.value = true

  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('Logout error:', error.message)
    isLoggingOut.value = false
    return
  }

  localStorage.removeItem('token')
  localStorage.removeItem('user')
  sessionStorage.clear()

  showLogoutModal.value = false
  await router.push('/')
}
</script>

<style scoped>
* {
  box-sizing: border-box;
}

.main-content {
  width: 100%;
  min-width: 0;
  min-height: 100%;
  padding: 3px 2px 24px;
  color: #351819;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
}

.page-heading {
  margin-bottom: 22px;
}

.page-heading h2 {
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

.profile-card {
  width: 100%;
  overflow: hidden;
  border: 1px solid #cfb8b9;
  border-radius: 19px;
  background: #f7eeee;
}

.profile-banner {
  padding: 25px 19px 13px;
  background: #51070d;
  color: #fff7f6;
}

.avatar {
  display: flex;
  width: 39px;
  height: 33px;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  border-radius: 6px;
  background: #70232a;
  color: #f4dfe0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 13px;
  font-weight: 600;
}

.profile-banner h3 {
  margin: 0 0 5px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 14px;
}

.employee-info {
  margin: 0;
  color: #c79598;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}

.profile-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24px;
  row-gap: 25px;
  padding: 11px 19px 10px;
}

.detail-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.detail-item span {
  color: #8a7072;
  font-size: 12px;
}

.detail-item strong {
  color: #310c0f;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.profile-actions {
  grid-column: 1 / -1;
  margin-top: -11px;
}

.change-button,
.cancel-button {
  min-height: 22px;
  padding: 4px 9px;
  border: 1px solid #d8bfc1;
  border-radius: 6px;
  background: transparent;
  color: #765d60;
  font-size: 9px;
  cursor: pointer;
}

.password-card {
  margin-top: 16px;
  overflow: hidden;
  border: 1px solid #d9bfc1;
  border-radius: 14px;
  background: #f8eeee;
}

.password-heading {
  padding: 13px 19px 8px;
}

.password-heading h3 {
  margin: 0 0 5px;
  font-size: 12px;
}

.password-heading p {
  margin: 0;
  color: #856b6e;
  font-size: 10px;
}

.password-form {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 0 19px 13px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-field label {
  font-size: 10px;
  font-weight: 600;
}

.form-field input {
  width: 100%;
  min-height: 27px;
  padding: 5px 9px;
  border: 1px solid #dfc8ca;
  border-radius: 7px;
  outline: none;
  background: #f9f0f0;
  color: #351819;
  font-size: 11px;
}

.form-message {
  margin: 0;
  color: #a52230;
  font-size: 11px;
}

.form-actions {
  display: flex;
  gap: 6px;
}

.update-button {
  min-height: 25px;
  padding: 5px 11px;
  border: 1px solid #51070d;
  border-radius: 6px;
  background: #51070d;
  color: white;
  font-size: 10px;
  cursor: pointer;
}

.update-button:disabled,
.confirm-logout-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgb(0, 0, 0, 0.38);
}

.logout-modal {
  width: 294px;
  max-width: 100%;
  padding: 11px 12px 18px;
  border-radius: 10px;
  background: #f8eeee;
  box-shadow: 0 8px 28px rgb(0 0 0 / 12%);
}

.warning-icon {
  display: flex;
  width: 46px;
  height: 36px;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
  border-radius: 8px;
  background: #a8797d;
}

.warning-icon span {
  display: flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #51070d;
  color: #f8eeee;
  font-size: 17px;
  font-weight: 800;
}

.logout-modal h3 {
  margin: 0 0 5px 19px;
  color: #35090d;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 17px;
  font-weight: 500;
}

.logout-modal > p {
  margin: 0 0 16px 19px;
  color: #351819;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  padding-right: 1px;
}

.go-back-btn,
.confirm-logout-btn {
  min-height: 28px;
  padding: 6px 15px;
  border-radius: 10px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10px;
  cursor: pointer;
}

.go-back-btn {
  border: 1px solid #8a6265;
  background: transparent;
  color: #35090d;
}

.go-back-btn:hover {
  background: #eedfe0;
}

.confirm-logout-btn {
  border: 1px solid #51070d;
  background: #51070d;
  color: #fff7f6;
}

.confirm-logout-btn:hover {
  background: #6b111a;
}

@media (max-width: 600px) {
  .profile-banner {
    padding: 20px 15px 13px;
  }

  .profile-details {
    column-gap: 12px;
    row-gap: 22px;
    padding: 12px 15px;
  }

  .employee-info {
    font-size: 12px;
  }

  .detail-item strong,
  .detail-item span {
    font-size: 11px;
  }

  .password-heading,
  .password-form {
    padding-right: 14px;
    padding-left: 14px;
  }
}
</style>
