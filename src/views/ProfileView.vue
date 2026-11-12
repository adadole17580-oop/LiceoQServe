
<template>
  <div class="profile-page">
    <header class="page-heading">
      <div>
        <span class="eyebrow">CASHIER WORKSPACE</span>
        <h1>Staff Profile</h1>
        <p>Your university-managed details are read-only. You can update your contact number and password.</p>
      </div>
      <span class="account-badge" :class="{ 'inactive-badge': profile.is_active === false }">
        <span class="active-dot"></span>
        {{ profile.is_active === false ? 'Inactive account' : 'Authorized Staff' }}
      </span>
    </header>

    <div v-if="loading" class="loading-state">
      <span class="spinner"></span>
      <p>Loading your staff profile...</p>
    </div>

    <template v-else>
      <section class="profile-card">
        <div class="profile-banner">
          <div class="profile-identity">
            <div class="profile-avatar">{{ initials(profile.full_name) }}</div>
            <div class="identity-copy">
              <span class="staff-label">UNIVERSITY STAFF</span>
              <h2>{{ profile.full_name || 'Cashier Staff' }}</h2>
              <p>
                {{ displayRole }}
                <span class="identity-separator">·</span>
                {{ profile.employee_id || 'Employee ID not assigned' }}
              </p>
            </div>
          </div>
          <span class="banner-status" :class="{ 'banner-status-inactive': profile.is_active === false }">
            <span class="banner-status-dot"></span>
            {{ profile.is_active === false ? 'Inactive' : 'Active' }}
          </span>
        </div>

        <div class="profile-content">
          <div class="section-heading">
            <div>
              <h3>Personal Information</h3>
              <p>Your account details registered in the university system.</p>
            </div>
            <span class="readonly-label">
              <span>▣</span> University-managed details
            </span>
          </div>

          <div class="information-grid">
            <div class="information-item">
              <span class="information-icon">✉</span>
              <div>
                <span class="field-label">University Email</span>
                <strong>{{ profile.email || 'Not available' }}</strong>
              </div>
            </div>

            <div class="information-item">
              <span class="information-icon">♙</span>
              <div>
                <span class="field-label">Account Role</span>
                <strong>{{ displayRole }}</strong>
              </div>
            </div>

            <div class="information-item">
              <span class="information-icon">✓</span>
              <div>
                <span class="field-label">Account Status</span>
                <strong class="account-status-text" :class="{ inactive: profile.is_active === false }">
                  {{ profile.is_active === false ? 'Inactive' : 'Active' }}
                </strong>
              </div>
            </div>

            <div class="information-item contact-item">
              <span class="information-icon">☎</span>
              <div class="contact-content">
                <span class="field-label">Contact Number</span>

                <template v-if="!editingContact">
                  <strong>{{ profile.contact_number || 'Not provided' }}</strong>
                  <button class="text-button" type="button" @click="startContactEdit">
                    {{ profile.contact_number ? 'Edit' : 'Add contact number' }}
                  </button>
                </template>

                <template v-else>
                  <input
                    v-model="contactNumberDraft"
                    class="contact-edit-input"
                    type="tel"
                    maxlength="30"
                    autocomplete="tel"
                    placeholder="Enter your contact number"
                    @keydown.enter.prevent="saveContactNumber"
                  />
                  <div class="contact-actions">
                    <button
                      class="text-button"
                      type="button"
                      :disabled="savingContact"
                      @click="saveContactNumber"
                    >
                      Save
                    </button>
                    <button
                      class="text-button cancel-button"
                      type="button"
                      :disabled="savingContact"
                      @click="cancelContactEdit"
                    >
                      Cancel
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <div class="office-note">
            <span class="office-note-icon">i</span>
            <p>Your university-managed details are read-only. You can update your contact number and password.</p>
          </div>
        </div>

        <div class="profile-footer">
          <div class="footer-copy">
            <strong>Account Security</strong>
            <p>Keep your password private and update it when necessary.</p>
          </div>
          <button class="primary-button" type="button" @click="openPasswordForm">
            <span>⌑</span> Change Password
          </button>
        </div>
      </section>

      <section class="security-note">
        <div class="security-icon">♧</div>
        <div>
          <h3>Protect your staff account</h3>
          <p>Always sign out when using a shared computer. Never share your login credentials with students or other unauthorized users.</p>
        </div>
      </section>
    </template>

    <!-- Shared modal for password form -->
    <AppModal
      v-model="showPasswordModal"
      title="Change Password"
      description="Enter your current password and choose a new password for your staff account."
      type="security"
      :show-cancel="true"
      cancel-text="Cancel"
      confirm-text="Update Password"
      :loading="changingPassword"
      loading-text="Updating..."
      :confirm-disabled="!passwordValid || changingPassword"
      @confirm="changePassword"
      @cancel="closePasswordForm"
    >
      <form class="password-form" @submit.prevent="changePassword">
        <label>
          <span>Current password</span>
          <div class="password-input">
            <input
              v-model="currentPassword"
              :type="showCurrentPassword ? 'text' : 'password'"
              placeholder="Enter your current password"
              autocomplete="current-password"
              required
            />
            <button type="button" @click="showCurrentPassword = !showCurrentPassword">
              {{ showCurrentPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
        </label>

        <label>
          <span>New password</span>
          <div class="password-input">
            <input
              v-model="newPassword"
              :type="showNewPassword ? 'text' : 'password'"
              placeholder="Enter your new password"
              autocomplete="new-password"
              minlength="8"
              required
            />
            <button type="button" @click="showNewPassword = !showNewPassword">
              {{ showNewPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
        </label>

        <label>
          <span>Confirm new password</span>
          <div class="password-input">
            <input
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              placeholder="Re-enter your new password"
              autocomplete="new-password"
              minlength="8"
              required
            />
            <button type="button" @click="showConfirmPassword = !showConfirmPassword">
              {{ showConfirmPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
        </label>

        <ul class="password-rules">
          <li :class="{ valid: newPassword.length >= 8 }">
            <span>{{ newPassword.length >= 8 ? '✓' : '○' }}</span>
            At least 8 characters
          </li>
          <li :class="{ valid: passwordsMatch }">
            <span>{{ passwordsMatch ? '✓' : '○' }}</span>
            New passwords match
          </li>
        </ul>

        <p v-if="passwordError" class="form-error">{{ passwordError }}</p>
      </form>
    </AppModal>

    <!-- Shared modal for contact number confirmation -->
    <AppModal
      v-model="showContactConfirmation"
      title="Save Contact Number?"
      description="Do you want to save this contact number to your staff profile?"
      type="warning"
      confirm-text="Save Contact"
      cancel-text="Go Back"
      :show-cancel="true"
      :loading="savingContact"
      :confirm-disabled="savingContact"
      @confirm="confirmSaveContact"
      @cancel="cancelContactConfirmation"
    />

    <!-- Shared modal for success and errors -->
    <AppModal
      v-model="feedbackModalOpen"
      :title="feedbackTitle"
      :description="feedbackDescription"
      :type="feedbackType"
      confirm-text="Okay"
      :show-cancel="false"
      @confirm="feedbackModalOpen = false"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../supabase.js'
import AppModal from '../components/AppModal.vue'

const loading = ref(true)

const profile = ref({
  full_name: '',
  email: '',
  role: '',
  contact_number: '',
  employee_id: '',
  is_active: true,
})

const editingContact = ref(false)
const contactNumberDraft = ref('')
const savingContact = ref(false)
const showContactConfirmation = ref(false)

const showPasswordModal = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)
const changingPassword = ref(false)
const passwordError = ref('')

const feedbackModalOpen = ref(false)
const feedbackTitle = ref('')
const feedbackDescription = ref('')
const feedbackType = ref('info')

const displayRole = computed(() => {
  const role = String(profile.value.role || '').trim()
  if (!role) return 'Cashier Staff'

  return role
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
})

const passwordsMatch = computed(
  () => newPassword.value.length > 0 &&
    newPassword.value === confirmPassword.value
)

const passwordValid = computed(
  () => currentPassword.value.length > 0 &&
    newPassword.value.length >= 8 &&
    passwordsMatch.value &&
    newPassword.value !== currentPassword.value
)

function initials(name) {
  return String(name || 'Cashier Staff')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function showFeedback(title, description, type = 'info') {
  feedbackTitle.value = title
  feedbackDescription.value = description
  feedbackType.value = type
  feedbackModalOpen.value = true
}

async function loadProfile() {
  loading.value = true

  try {
    const { data: authResult, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError

    const authUser = authResult?.user
    if (!authUser) {
      throw new Error('No authenticated user was found. Please sign in again.')
    }

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        university_email,
        role,
        office_id,
        is_active,
        contact_number
      `)
      .eq('id', authUser.id)
      .maybeSingle()

    if (profileError) throw profileError

    if (!profileRow) {
      throw new Error('Your staff profile could not be found. Please contact the administrator.')
    }

    profile.value = {
      full_name: profileRow.full_name || '',
      email: profileRow.university_email || authUser.email || '',
      role: profileRow.role || '',
      contact_number: profileRow.contact_number || '',
      employee_id: '',
      is_active: profileRow.is_active,
    }

    contactNumberDraft.value = profile.value.contact_number

    if (String(profileRow.role || '').toLowerCase() !== 'staff') {
      showFeedback(
        'Account Role Notice',
        'Your profile is loaded, but your account role is not staff. Please contact the administrator.',
        'warning'
      )
    }
  } catch (error) {
    console.error('Unable to load staff profile:', error)
    showFeedback(
      'Unable to Load Profile',
      error.message || 'Unable to load your profile.',
      'error'
    )
  } finally {
    loading.value = false
  }
}

function startContactEdit() {
  contactNumberDraft.value = profile.value.contact_number || ''
  editingContact.value = true
}

function cancelContactEdit() {
  if (savingContact.value) return
  contactNumberDraft.value = profile.value.contact_number || ''
  editingContact.value = false
}

function saveContactNumber() {
  if (savingContact.value) return

  const cleanedNumber = contactNumberDraft.value.trim()

  if (cleanedNumber === (profile.value.contact_number || '')) {
    editingContact.value = false
    return
  }

  showContactConfirmation.value = true
}

function cancelContactConfirmation() {
  if (savingContact.value) return
  showContactConfirmation.value = false
}

async function confirmSaveContact() {
  if (savingContact.value) return

  savingContact.value = true

  try {
    const cleanedNumber = contactNumberDraft.value.trim()

    const { error } = await supabase.rpc('update_my_contact_number', {
      p_contact_number: cleanedNumber || null,
    })

    if (error) throw error

    profile.value.contact_number = cleanedNumber
    contactNumberDraft.value = cleanedNumber
    editingContact.value = false
    showContactConfirmation.value = false

    showFeedback(
      'Contact Number Updated',
      'Your contact number has been updated successfully.',
      'success'
    )
  } catch (error) {
    console.error('Unable to update contact number:', error)

    showContactConfirmation.value = false

    showFeedback(
      'Unable to Update Contact Number',
      error.message || 'Unable to update your contact number.',
      'error'
    )
  } finally {
    savingContact.value = false
  }
}

function openPasswordForm() {
  passwordError.value = ''
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  showCurrentPassword.value = false
  showNewPassword.value = false
  showConfirmPassword.value = false
  showPasswordModal.value = true
}

function closePasswordForm() {
  if (changingPassword.value) return

  showPasswordModal.value = false
  passwordError.value = ''
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
}

async function changePassword() {
  if (changingPassword.value) return

  passwordError.value = ''

  if (!currentPassword.value) {
    passwordError.value = 'Please enter your current password.'
    return
  }

  if (newPassword.value.length < 8) {
    passwordError.value = 'Your new password must contain at least 8 characters.'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = 'The new passwords do not match.'
    return
  }

  if (currentPassword.value === newPassword.value) {
    passwordError.value = 'Your new password must be different from your current password.'
    return
  }

  changingPassword.value = true

  try {
    const { data: authResult, error: authError } = await supabase.auth.getUser()

    if (authError) throw authError

    const authUser = authResult?.user

    if (!authUser?.email) {
      throw new Error('Unable to verify your account email. Please sign in again.')
    }

    // Verify the current password by re-authenticating the user.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: authUser.email,
      password: currentPassword.value,
    })

    if (verifyError) {
      throw new Error('Your current password is incorrect.')
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword.value,
    })

    if (updateError) throw updateError

    showPasswordModal.value = false
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''

    showFeedback(
      'Password Updated',
      'Your staff account password has been updated successfully.',
      'success'
    )
  } catch (error) {
    console.error('Unable to change password:', error)

    passwordError.value =
      error.message || 'Unable to update your password. Please try again.'
  } finally {
    changingPassword.value = false
  }
}

onMounted(loadProfile)
</script>

<style scoped>
.profile-page {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 28px;
  color: #392d2d;
  font-family: 'Inter', sans-serif;
}

.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 25px;
}

.eyebrow {
  color: #8d3d40;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.8px;
}

.page-heading h1 {
  margin: 7px 0 8px;
  color: #4c080b;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(28px, 3vw, 36px);
}

.page-heading p {
  margin: 0;
  color: #897777;
  font-size: 13px;
  line-height: 1.6;
}

.account-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 12px;
  border: 1px solid #d9e9d9;
  border-radius: 25px;
  background: #f1f8f1;
  color: #397347;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.account-badge.inactive-badge {
  border-color: #ecd5d2;
  background: #fff4f2;
  color: #a14137;
}

.active-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.profile-card {
  overflow: hidden;
  border: 1px solid #e6d7d7;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 5px 20px rgba(63, 12, 16, 0.045);
}

.profile-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 30px 32px;
  background: linear-gradient(120deg, #4c080b, #711c21);
}

.profile-identity {
  display: flex;
  align-items: center;
  gap: 20px;
  min-width: 0;
}

.profile-avatar {
  display: grid;
  flex: 0 0 76px;
  width: 76px;
  height: 76px;
  place-items: center;
  border: 3px solid rgba(255, 255, 255, 0.35);
  border-radius: 50%;
  background: #f4e5e5;
  color: #5c1115;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 29px;
  font-weight: 700;
}

.identity-copy {
  min-width: 0;
}

.staff-label {
  color: #e2bfc1;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.8px;
}

.identity-copy h2 {
  margin: 8px 0;
  overflow-wrap: anywhere;
  color: #fff;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(23px, 3vw, 31px);
  line-height: 1.2;
}

.identity-copy p {
  margin: 0;
  color: #e8d1d1;
  font-size: 12px;
}

.identity-separator {
  padding: 0 5px;
  color: #c59b9d;
}

.banner-status {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 7px;
  padding: 8px 11px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.banner-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #9bdaa3;
}

.banner-status-inactive .banner-status-dot {
  background: #f1a49a;
}

.profile-content {
  padding: 29px 32px;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 25px;
}

.section-heading h3 {
  margin: 0 0 7px;
  color: #4c080b;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 21px;
}

.section-heading p {
  margin: 0;
  color: #897777;
  font-size: 12px;
  line-height: 1.6;
}

.readonly-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid #e9dede;
  border-radius: 7px;
  color: #8d7777;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.information-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 32px;
}

.information-item {
  display: flex;
  align-items: center;
  gap: 13px;
  min-width: 0;
  min-height: 89px;
  border-bottom: 1px solid #f0e7e7;
}

.information-icon {
  display: grid;
  flex: 0 0 39px;
  width: 39px;
  height: 39px;
  place-items: center;
  border-radius: 10px;
  background: #f8eeee;
  color: #6a171b;
  font-size: 18px;
}

.information-item > div {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.field-label {
  color: #948080;
  font-size: 10px;
  font-weight: 600;
}

.information-item strong {
  overflow-wrap: anywhere;
  color: #493737;
  font-size: 12px;
  font-weight: 700;
}

.information-item .account-status-text {
  color: #397347;
}

.information-item .account-status-text.inactive {
  color: #a14137;
}

.office-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 24px;
  padding: 14px;
  border: 1px solid #eadede;
  border-radius: 9px;
  background: #fffafa;
}

.office-note-icon {
  display: grid;
  flex: 0 0 19px;
  width: 19px;
  height: 19px;
  place-items: center;
  border-radius: 50%;
  background: #f1e0e1;
  color: #6a171b;
  font-size: 11px;
  font-weight: 800;
}

.office-note p {
  margin: 0;
  color: #826e6e;
  font-size: 11px;
  line-height: 1.7;
}

.profile-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 23px 32px;
  border-top: 1px solid #eee4e4;
  background: #fffdfd;
}

.footer-copy strong {
  color: #4c080b;
  font-size: 12px;
}

.footer-copy p {
  margin: 6px 0 0;
  color: #897777;
  font-size: 11px;
  line-height: 1.6;
}

.primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 41px;
  padding: 10px 15px;
  border: 1px solid #4c080b;
  border-radius: 8px;
  background: #4c080b;
  color: #fff;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  transition: background 0.15s ease;
  cursor: pointer;
}

.primary-button:hover:not(:disabled) {
  background: #68151a;
}

.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.primary-button span {
  font-size: 16px;
}

.security-note {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-top: 20px;
  padding: 20px;
  border: 1px solid #eadede;
  border-radius: 12px;
  background: #fff;
}

.security-icon {
  display: grid;
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 10px;
  background: #f8eeee;
  color: #6a171b;
  font-size: 19px;
}

.security-note h3 {
  margin: 1px 0 7px;
  color: #4c080b;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 16px;
}

.security-note p {
  max-width: 750px;
  margin: 0;
  color: #897777;
  font-size: 11px;
  line-height: 1.7;
}

.loading-state {
  display: flex;
  min-height: 300px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #897777;
  font-size: 12px;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #eadede;
  border-top-color: #6a171b;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.password-form {
  display: flex;
  flex-direction: column;
  gap: 17px;
  padding-top: 5px;
}

.password-form label {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.password-form label > span {
  color: #6e5b5b;
  font-size: 11px;
  font-weight: 700;
}

.password-input {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 10px;
  border: 1px solid #e2d3d3;
  border-radius: 8px;
  background: #fffdfd;
}

.password-input:focus-within {
  border-color: #8d3d40;
  box-shadow: 0 0 0 3px rgba(76, 8, 11, 0.07);
}

.password-input input {
  width: 100%;
  min-width: 0;
  height: 42px;
  padding: 10px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #392d2d;
  font-family: inherit;
  font-size: 12px;
}

.password-input button {
  border: 0;
  background: transparent;
  color: #6a171b;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.password-rules {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: -2px 0 0;
  padding: 0;
  list-style: none;
  color: #9a8787;
  font-size: 10px;
}

.password-rules li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.password-rules li.valid {
  color: #397347;
}

.password-rules li span {
  font-size: 13px;
}

.form-error {
  margin: -4px 0 0;
  color: #a32920;
  font-size: 11px;
  line-height: 1.6;
}

.contact-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.contact-edit-input {
  width: 100%;
  max-width: 280px;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid #d8caca;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  color: inherit;
  background: #fff;
}

.contact-edit-input:focus {
  outline: 2px solid #8b2525;
  outline-offset: 1px;
}

.contact-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.text-button {
  border: none;
  padding: 0;
  background: transparent;
  color: #8b2525;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.text-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.contact-actions .cancel-button {
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #777;
  font: inherit;
  font-size: 11px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 750px) {
  .profile-page {
    padding: 17px 13px;
  }

  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .profile-banner {
    align-items: flex-start;
    flex-direction: column;
    padding: 25px 20px;
  }

  .profile-identity {
    align-items: flex-start;
    gap: 15px;
  }

  .profile-avatar {
    flex-basis: 65px;
    width: 65px;
    height: 65px;
    font-size: 23px;
  }

  .profile-content {
    padding: 23px 20px;
  }

  .section-heading {
    flex-direction: column;
  }

  .information-grid {
    grid-template-columns: 1fr;
  }

  .profile-footer {
    align-items: flex-start;
    flex-direction: column;
    padding: 21px 20px;
  }

  .profile-footer .primary-button {
    width: 100%;
  }

  .security-note {
    padding: 16px;
  }
}

@media (max-width: 420px) {
  .profile-identity {
    flex-direction: column;
  }

  .identity-copy h2 {
    font-size: 25px;
  }
}
</style>
