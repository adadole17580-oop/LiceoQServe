<script setup>
import { ref, onMounted } from "vue";
import { supabase } from "../lib/supabase.js";
import "../assets/styles/profile.css";

const editing = ref(false);
const showPasswordForm = ref(false);
const notice = ref("");
const profileError = ref("");
const loading = ref(true);

const profile = ref({
  studentId: "",
  firstName: "",
  lastName: "",
  email: "",
  program: "",
  yearLevel: "",
  contactNumber: "",
});

const editedProfile = ref({ ...profile.value });

const passwordForm = ref({
  current: "",
  newPassword: "",
  confirmPassword: "",
});

const showPasswordFields = ref({
  current: false,
  newPassword: false,
  confirmPassword: false,
});

async function loadProfile() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) throw new Error('Please sign in again to load your profile.')

    const user = session.user
    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (error) throw error
    if (!profileData) throw new Error('Your account profile is incomplete. Please contact support.')

    const names = (profileData.full_name || '').split(' ')
    const firstName = names[0] || 'Student'
    const lastName = names.slice(1).join(' ') || ''

    profile.value = {
      studentId: profileData.student_id || '',
      firstName,
      lastName,
      email: user.email || '',
      program: profileData.program || '',
      yearLevel: profileData.year_level || '',
      contactNumber: user.user_metadata?.contact_number || '',
    }
    editedProfile.value = { ...profile.value }
  } catch (err) {
    console.error('Error loading profile:', err)
    profileError.value = err.message || 'Could not load your profile.'
  } finally {
    loading.value = false
  }
}

function startEditing() {
  editedProfile.value = { ...profile.value };
  editing.value = true;
  notice.value = "";
}

async function saveProfile() {
  if (!editedProfile.value.firstName.trim()) {
    notice.value = "Please complete your first name.";
    return;
  }

  try {
    const fullName = `${editedProfile.value.firstName.trim()} ${editedProfile.value.lastName.trim()}`.trim()
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.user) {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.user.id)
        .select('id')
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('Your profile could not be updated.')
    } else {
      throw new Error('Please sign in again to save profile changes.')
    }

    profile.value = { ...editedProfile.value };
    editing.value = false;
    notice.value = "Profile changes saved successfully.";
  } catch (err) {
    console.error('Error saving profile:', err)
    notice.value = err.message || "Could not save profile changes.";
  }
}

function cancelEditing() {
  editedProfile.value = { ...profile.value };
  editing.value = false;
  notice.value = "";
}

async function changePassword() {
  if (!passwordForm.value.current || !passwordForm.value.newPassword || !passwordForm.value.confirmPassword) {
    notice.value = "Please complete the current, new, and confirmation password fields.";
    return;
  }

  if (passwordForm.value.newPassword.length < 8) {
    notice.value = "Your new password must contain at least 8 characters.";
    return;
  }

  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    notice.value = "The new passwords do not match.";
    return;
  }

  if (passwordForm.value.current === passwordForm.value.newPassword) {
    notice.value = "The new password must be different from the current password.";
    return;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const { error: reauthError } = await supabase.auth.reauthenticate({
        password: passwordForm.value.current,
      })

      if (reauthError) {
        throw new Error('The current password is incorrect or your session expired.');
      }
    }

    const { error } = await supabase.auth.updateUser({
      password: passwordForm.value.newPassword,
    })

    if (error) throw error

    notice.value = "Password updated successfully.";
    passwordForm.value = {
      current: "",
      newPassword: "",
      confirmPassword: "",
    };
    showPasswordFields.value = {
      current: false,
      newPassword: false,
      confirmPassword: false,
    };
    showPasswordForm.value = false;
  } catch (err) {
    console.error('Error updating password:', err)
    notice.value = err.message || "Failed to update password.";
  }
}

function togglePasswordVisibility(field) {
  showPasswordFields.value[field] = !showPasswordFields.value[field]
}

onMounted(() => {
  loadProfile()
})
</script>

<template>
  <div class="profile-page">
    <p v-if="profileError" class="profile-notice" role="alert">{{ profileError }}</p>
    <p v-else-if="loading" class="profile-notice" role="status">Loading your profile…</p>

    <header class="profile-heading">
      <div>
        <h2>My Profile</h2>
        <p>View your student information and manage your account settings.</p>
      </div>

      <button
        v-if="!editing"
        class="profile-primary"
        type="button"
        @click="startEditing"
      >
        Edit Profile
      </button>
    </header>

    <div v-if="notice" class="profile-notice" role="status">
      <span>{{ notice }}</span>
      <button type="button" @click="notice = ''" aria-label="Dismiss notice">×</button>
    </div>

    <section class="profile-card">
      <div class="profile-banner">
        <div class="profile-avatar">
          {{ profile.firstName.charAt(0) }}{{ profile.lastName ? profile.lastName.charAt(0) : '' }}
        </div>
        <div>
          <h3>{{ profile.firstName }} {{ profile.lastName }}</h3>
          <p>{{ profile.studentId }}</p>
        </div>
      </div>

      <form v-if="editing" class="profile-form" @submit.prevent="saveProfile">
        <h3>Personal Information</h3>

        <div class="profile-grid">
          <label>
            First Name
            <input v-model="editedProfile.firstName" required />
          </label>

          <label>
            Last Name
            <input v-model="editedProfile.lastName" />
          </label>

          <label>
            Email Address
            <input v-model="editedProfile.email" type="email" disabled style="opacity: 0.7; cursor: not-allowed;" />
          </label>

          <label>
            Contact Number
            <input v-model="editedProfile.contactNumber" type="tel" />
          </label>
        </div>

        <p class="profile-readonly-note">
          Student ID, email, program, and year level are managed by university administration.
        </p>

        <div class="profile-actions">
          <button type="button" class="profile-outline" @click="cancelEditing">
            Cancel
          </button>
          <button type="submit" class="profile-primary">
            Save Changes
          </button>
        </div>
      </form>

      <div v-else class="profile-information">
        <h3>Student Information</h3>

        <div class="profile-grid">
          <div class="profile-field">
            <span>First Name</span>
            <strong>{{ profile.firstName }}</strong>
          </div>

          <div class="profile-field">
            <span>Last Name</span>
            <strong>{{ profile.lastName || '—' }}</strong>
          </div>

          <div class="profile-field">
            <span>Student ID</span>
            <strong>{{ profile.studentId }}</strong>
          </div>

          <div class="profile-field">
            <span>Email Address</span>
            <strong>{{ profile.email }}</strong>
          </div>

          <div class="profile-field">
            <span>Program</span>
            <strong>{{ profile.program }}</strong>
          </div>

          <div class="profile-field">
            <span>Year Level</span>
            <strong>{{ profile.yearLevel }}</strong>
          </div>

          <div class="profile-field">
            <span>Contact Number</span>
            <strong>{{ profile.contactNumber || 'Not provided' }}</strong>
          </div>
        </div>
      </div>
    </section>

    <section class="profile-card profile-account-card">
      <div class="profile-account-heading">
        <div>
          <h3>Account Security</h3>
          <p>Manage your password and account access.</p>
        </div>

        <button
          class="profile-outline"
          type="button"
          @click="showPasswordForm = !showPasswordForm"
        >
          {{ showPasswordForm ? "Close" : "Change Password" }}
        </button>
      </div>

      <form
        v-if="showPasswordForm"
        class="profile-form password-form"
        @submit.prevent="changePassword"
      >
        <label>
          Current Password
          <div class="password-input-wrap">
            <input
              v-model="passwordForm.current"
              :type="showPasswordFields.current ? 'text' : 'password'"
              autocomplete="current-password"
              required
            />
            <button
              class="password-toggle"
              type="button"
              :aria-label="showPasswordFields.current ? 'Hide current password' : 'Show current password'"
              @click="togglePasswordVisibility('current')"
            >
              {{ showPasswordFields.current ? 'Hide' : 'Show' }}
            </button>
          </div>
        </label>

        <label>
          New Password
          <div class="password-input-wrap">
            <input
              v-model="passwordForm.newPassword"
              :type="showPasswordFields.newPassword ? 'text' : 'password'"
              autocomplete="new-password"
              minlength="8"
              required
            />
            <button
              class="password-toggle"
              type="button"
              :aria-label="showPasswordFields.newPassword ? 'Hide new password' : 'Show new password'"
              @click="togglePasswordVisibility('newPassword')"
            >
              {{ showPasswordFields.newPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
        </label>

        <label>
          Confirm New Password
          <div class="password-input-wrap">
            <input
              v-model="passwordForm.confirmPassword"
              :type="showPasswordFields.confirmPassword ? 'text' : 'password'"
              autocomplete="new-password"
              minlength="8"
              required
            />
            <button
              class="password-toggle"
              type="button"
              :aria-label="showPasswordFields.confirmPassword ? 'Hide confirm password' : 'Show confirm password'"
              @click="togglePasswordVisibility('confirmPassword')"
            >
              {{ showPasswordFields.confirmPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
        </label>

        <button class="profile-primary" type="submit">
          Update Password
        </button>
      </form>

      <div v-else class="profile-security-row">
        <div>
          <strong>Password</strong>
          <p>For your security, your password is encrypted and never displayed.</p>
        </div>
        <span class="profile-security-label">Protected</span>
      </div>
    </section>
  </div>
</template>
