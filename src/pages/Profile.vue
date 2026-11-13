
<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../lib/Supabase.js'

const showPasswordForm = ref(false)

const currentPassword = ref('')
const newPassword = ref('')
const confirmNewPassword = ref('')
const passwordMessage = ref('')
const passwordLoading = ref(false)

const loading = ref(false)
const errorMessage = ref('')

const profile = ref({
  full_name: '',
  university_email: '',
  role: '',
  is_active: false,
  office_name: ''
})

const initials = ref('')

function getInitials(name) {
  if (!name) return 'NA'

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join('')
}

function formatRole(role) {
  if (!role) return 'Not assigned'

  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

async function fetchProfile() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data: authData, error: authError } =
      await supabase.auth.getUser()

    if (authError) throw authError

    const user = authData.user

    if (!user) {
      throw new Error('No logged-in user found.')
    }

    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        university_email,
        role,
        office_id,
        is_active
      `)
      .eq('id', user.id)
      .single()

    if (error) throw error

    let officeName = 'Not assigned'

    if (data.office_id) {
      const { data: office, error: officeError } = await supabase
        .from('offices')
        .select('name')
        .eq('id', data.office_id)
        .maybeSingle()

      if (officeError) {
        console.error('Unable to fetch office:', officeError)
      } else if (office) {
        officeName = office.name
      }
    }

    profile.value = {
      full_name: data.full_name || 'No name available',
      university_email:
        data.university_email || user.email || 'No email available',
      role: data.role || 'Not assigned',
      is_active: data.is_active,
      office_name: officeName
    }

    initials.value = getInitials(profile.value.full_name)

  } catch (error) {
    console.error('Unable to fetch profile:', error)
    errorMessage.value = error.message || 'Unable to load profile.'
  } finally {
    loading.value = false
  }
}

  async function updatePassword() {
  passwordMessage.value = ''

  if (
    !currentPassword.value ||
    !newPassword.value ||
    !confirmNewPassword.value
  ) {
    passwordMessage.value = 'Please fill in all password fields.'
    return
  }

  if (newPassword.value.length < 6) {
    passwordMessage.value = 'New password must be at least 6 characters.'
    return
  }

  if (newPassword.value !== confirmNewPassword.value) {
    passwordMessage.value = 'New passwords do not match.'
    return
  }

  if (currentPassword.value === newPassword.value) {
    passwordMessage.value =
      'New password must be different from current password.'
    return
  }

  passwordLoading.value = true

  try {
    const { data: authData, error: authError } =
      await supabase.auth.getUser()

    if (authError) throw authError

    const user = authData.user

    if (!user?.email) {
      throw new Error('Unable to identify your account.')
    }

    const { error: verifyError } =
      await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword.value
      })

    if (verifyError) {
      passwordMessage.value = 'Your current password is incorrect.'
      return
    }

    const { error: updateError } =
      await supabase.auth.updateUser({
        password: newPassword.value
      })

    if (updateError) throw updateError

    passwordMessage.value = 'Password successfully updated!'

    currentPassword.value = ''
    newPassword.value = ''
    confirmNewPassword.value = ''

  } catch (error) {
    console.error('Password update error:', error)
    passwordMessage.value =
      error.message || 'Unable to update password.'
  } finally {
    passwordLoading.value = false
  }
}

  function cancelPasswordChange() {
  showPasswordForm.value = false
  passwordMessage.value = ''
  currentPassword.value = ''
  newPassword.value = ''
  confirmNewPassword.value = ''
}

onMounted(() => {
  fetchProfile()
})
</script>

<template>
  <section class="profile-page">
    <div class="profile-content">

      <header class="profile-heading">
        <h1>STAFF PROFILE</h1>
        <p>
          Staff information is managed by the university and is read-only.
        </p>
      </header>

      <p v-if="loading" class="loading-message">
        Loading staff profile...
      </p>

      <p v-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </p>

      <article
        v-if="!loading && !errorMessage"
        class="profile-card"
      >
        <div class="profile-card-header">
          <div class="profile-avatar">
            {{ initials }}
          </div>

          <h2>{{ profile.full_name }}</h2>

          <p>
            {{ profile.office_name }} ·
            {{ formatRole(profile.role) }}
          </p>
        </div>

        <div class="profile-card-body">

          <div class="profile-details">

            <div class="detail-item">
              <span>University email</span>
              <strong>{{ profile.university_email }}</strong>
            </div>

            <div class="detail-item">
              <span>Assigned Office</span>
              <strong>{{ profile.office_name }}</strong>
            </div>

            <div class="detail-item">
              <span>Role</span>
              <strong>{{ formatRole(profile.role) }}</strong>
            </div>

            <div class="detail-item">
              <span>Account Status</span>
              <strong
                :class="
                  profile.is_active
                    ? 'active-status'
                    : 'inactive-status'
                "
              >
                {{ profile.is_active ? 'Active' : 'Inactive' }}
              </strong>
            </div>

          </div>

          <button
            v-if="!showPasswordForm"
            class="password-toggle"
            type="button"
            @click="showPasswordForm = true"
          >
            Change Password
          </button>

          <form
            v-else
            class="password-form"
            @submit.prevent="updatePassword"
          >
            <h3>Change Password</h3>

            <label for="current-password">
              Current password
            </label>

            <input
              id="current-password"
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              placeholder="Enter current password"
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
              placeholder="Enter new password"
              minlength="6"
              required
            />

            <label for="confirm-password">
              Confirm new password
            </label>

            <input
              id="confirm-password"
              v-model="confirmNewPassword"
              type="password"
              autocomplete="new-password"
              placeholder="Confirm new password"
              minlength="6"
              required
            />

            <p
              v-if="passwordMessage"
              class="password-message"
              :class="{
                'success-message':
                  passwordMessage === 'Password successfully updated!'
              }"
            >
              {{ passwordMessage }}
            </p>

            <div class="password-actions">

              <button
                class="password-toggle"
                type="submit"
                :disabled="passwordLoading"
              >
                {{
                  passwordLoading
                    ? 'Updating...'
                    : 'Update password'
                }}
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

        </div>
      </article>

    </div>
  </section>
</template>

<style scoped>
.profile-page {
  width: 100%;
  min-width: 0;
  min-height: 0;
  padding: 12px 16px;
  box-sizing: border-box;
  color: #39090c;
}

.profile-content {
  width: 100%;
  max-width: 680px;
  margin: 0 auto;
}

.profile-heading {
  width: 100%;
  margin: 0 0 14px;
  padding: 0;
  box-sizing: border-box;
  text-align: left;
}

.profile-heading h1 {
  margin: 0;
  color: #650f18;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 22px;
  font-weight: bold;
  line-height: 1.5;
  text-align: left;
}

.profile-heading p {
  margin: 6px 0 0;
  color: #987d7e;
  font-size: 13px;
  line-height: 1.4;
  text-align: left;
  font-weight: 500;
}

.profile-card {
  width: 100%;
  margin: 0;
  overflow: hidden;
  background: #f8eeee;
  border: 1px solid #ead5d6;
  border-radius: 18px;
  box-sizing: border-box;
}

.profile-card-header {
  padding: 16px 20px;
  color: #fffafa;
  background: #51090e;
}

.profile-avatar {
  display: flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  margin: 0 0 10px;
  color: #fffafa;
  background: #79353b;
  border-radius: 12px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 24px;
  font-weight: bold;
}

.profile-card-header h2 {
  margin: 0;
  color: #fffafa;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 23px;
  font-weight: bold;
  line-height: 1.25;
}

.profile-card-header p {
  margin: 6px 0 0;
  color: #f3dfe0;
  font-size: 11px;
  line-height: 1.5;
}

.profile-card-body {
  padding: 18px 20px;
}

.profile-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 20px;
  row-gap: 14px;
  margin-bottom: 18px;
}

.detail-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.detail-item span {
  color: #987d7e;
  font-size: 12px;
}

.detail-item strong {
  color: #25090b;
  font-size: 13px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.active-status {
  color: #28743a !important;
}

.inactive-status {
  color: #a21c28 !important;
}

.password-toggle,
.cancel-button {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #dfb9bb;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.password-toggle {
  color: #650f18;
  background: #f8eeee;
}

.password-toggle:hover {
  background: #efdddd;
}

.password-toggle:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.password-form {
  display: flex;
  width: 100%;
  max-width: 420px;
  flex-direction: column;
  gap: 6px;
}

.password-form h3 {
  margin: 0 0 4px;
  color: #39090c;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 18px;
}

.password-form label {
  margin-top: 4px;
  color: #39090c;
  font-size: 12px;
  font-weight: 600;
}

.password-form input {
  width: 100%;
  min-height: 34px;
  padding: 7px 10px;
  box-sizing: border-box;
  color: #39090c;
  background: #fffafa;
  border: 1px solid #d8babb;
  border-radius: 8px;
  outline-color: #650f18;
  font-size: 13px;
}

.password-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.cancel-button {
  color: #650f18;
  background: transparent;
}

.password-message {
  margin: 5px 0 0;
  color: #a21c28;
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.success-message {
  color: #28743a;
}

.loading-message,
.error-message {
  margin: 10px 0;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
}

.loading-message {
  color: #987d7e;
}

.error-message {
  color: #a21c28;
}

@media (max-width: 600px) {
  .profile-page {
    padding: 10px;
  }

  .profile-content {
    max-width: 100%;
  }

  .profile-heading {
    margin-bottom: 12px;
  }

  .profile-heading h1 {
    font-size: 20px;
  }

  .profile-heading p {
    font-size: 12px;
  }

  .profile-card {
    border-radius: 14px;
  }

  .profile-card-header {
    padding: 14px 16px;
  }

  .profile-avatar {
    width: 42px;
    height: 42px;
    margin-bottom: 8px;
    border-radius: 10px;
    font-size: 21px;
  }

  .profile-card-header h2 {
    font-size: 20px;
  }

  .profile-card-header p {
    font-size: 10px;
  }

  .profile-card-body {
    padding: 15px 16px;
  }

  .profile-details {
    column-gap: 12px;
    row-gap: 12px;
    margin-bottom: 14px;
  }

  .detail-item span {
    font-size: 11px;
  }

  .detail-item strong {
    font-size: 12px;
  }

  .password-form {
    max-width: 100%;
  }
}
</style>
