<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import '../assets/styles/auth.css'

const router = useRouter()
const { signUp: authSignUp } = useAuth()

const fullName = ref('')
const studentId = ref('')
const program = ref('')
const yearLevel = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const agreed = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const loading = ref(false)

async function register() {
  errorMessage.value = ''
  successMessage.value = ''

  if (
    !fullName.value.trim() ||
    !studentId.value.trim() ||
    !program.value ||
    !yearLevel.value ||
    !email.value.trim() ||
    !password.value ||
    !confirmPassword.value
  ) {
    errorMessage.value = 'Please complete all required fields.'
    return
  }

  if (!/^[^\s@]+@liceo\.edu\.ph$/i.test(email.value.trim())) {
    errorMessage.value = 'Please use your official @liceo.edu.ph email address.'
    return
  }

  if (password.value.length < 8) {
    errorMessage.value = 'Your password must contain at least 8 characters.'
    return
  }

  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Your passwords do not match.'
    return
  }

  if (!agreed.value) {
    errorMessage.value = 'Please confirm that your information is accurate.'
    return
  }

  loading.value = true
  try {
    const result = await authSignUp({
      email: email.value,
      password: password.value,
      fullName: fullName.value,
      studentId: studentId.value,
      program: program.value,
      yearLevel: yearLevel.value,
    })
    successMessage.value = result.requiresEmailConfirmation
      ? 'Account created. Check your university email to confirm your address before logging in.'
      : 'Account created successfully! You can now log in.'
    setTimeout(() => {
      router.push('/')
    }, 1800)
  } catch (err) {
    console.error('Registration error:', err)
    errorMessage.value = err.message || 'Could not create student account. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth-page register-page">
    <section class="auth-brand">
      <div class="brand-circle brand-circle-top"></div>
      <div class="brand-circle brand-circle-bottom"></div>

      <div class="brand-content">
        <div class="brand-logo">LiceoQServe</div>
        <p class="brand-eyebrow">STUDENT PORTAL</p>
        <h1>Campus services without the unnecessary wait.</h1>
        <p class="brand-description">
          Manage queues, appointments, requests, and campus service
          updates in one place.
        </p>
      </div>

      <p class="brand-footer">QUEUE. SCHEDULE. SERVE</p>
    </section>

    <section class="auth-main">
      <div class="auth-content">
        <header class="auth-heading">
          <p class="auth-eyebrow">STUDENT REGISTRATION</p>
          <h2>Create your student account</h2>
          <p>Use your official university information. All fields are required.</p>
        </header>

        <nav class="auth-tabs" aria-label="Account pages">
          <button class="auth-tab" type="button" @click="router.push('/')">
            Log In
          </button>
          <button class="auth-tab active" type="button" aria-current="page">
            Register
          </button>
        </nav>

        <form class="auth-card register-card" @submit.prevent="register">
          <div class="register-grid">
            <div class="form-field">
              <label for="full-name">Full Name</label>
              <input
                id="full-name"
                v-model="fullName"
                type="text"
                placeholder="Angel Dadole"
                autocomplete="name"
                required
              />
            </div>

            <div class="form-field">
              <label for="student-id">Student ID Number</label>
              <input
                id="student-id"
                v-model="studentId"
                type="text"
                placeholder="20240017360"
                required
              />
            </div>

            <div class="form-field">
              <label for="program">Program</label>
              <select id="program" v-model="program" required>
                <option value="" disabled>Select Program</option>
                <option value="BSIT">BS Information Technology</option>
                <option value="BLIS">BS Library and Information Science</option>
                <option value="BSCS">BS Computer Science</option>
                <option value="BSIS">BS Information Systems</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div class="form-field">
              <label for="year-level">Year Level</label>
              <select id="year-level" v-model="yearLevel" required>
                <option value="" disabled>Select year</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
                <option value="5th Year">5th Year</option>
              </select>
            </div>

            <div class="form-field full-width">
              <label for="register-email">University Email</label>
              <input
                id="register-email"
                v-model="email"
                type="email"
                placeholder="student@liceo.edu.ph"
                autocomplete="email"
                required
              />
              <small>Use your official @liceo.edu.ph email address.</small>
            </div>

            <div class="form-field">
              <label for="register-password">Password</label>
              <div class="password-wrap">
                <input
                  id="register-password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="enter at least 8 characters"
                  autocomplete="new-password"
                  minlength="8"
                  required
                />
                <button
                  class="show-password"
                  type="button"
                  @click="showPassword = !showPassword"
                >
                  {{ showPassword ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>

            <div class="form-field">
              <label for="confirm-password">Confirm Password</label>
              <input
                id="confirm-password"
                v-model="confirmPassword"
                type="password"
                placeholder="confirm / repeat password"
                autocomplete="new-password"
                required
              />
            </div>
          </div>

          <label class="checkbox-label agreement-label">
            <input v-model="agreed" type="checkbox" />
            <span>
              I confirm that the information above is accurate and agree
              to use LiceoQServe responsibly.
            </span>
          </label>

          <p v-if="errorMessage" class="auth-message" role="status">
            {{ errorMessage }}
          </p>

          <p v-if="successMessage" class="auth-message success-message" role="status" style="color: #10662d; background: #e6f6eb; padding: 10px; border-radius: 6px; font-weight: 500;">
            {{ successMessage }}
          </p>

          <button class="primary-button" type="submit" :disabled="loading">
            {{ loading ? 'Creating Account...' : 'Create Account' }}
          </button>

          <p class="auth-switch">
            Already Registered?
            <button type="button" class="inline-link" @click="router.push('/')">
              Log In
            </button>
          </p>
        </form>

        <p class="privacy-note">
          By continuing, you acknowledge the university's acceptable use
          and data privacy policies.
        </p>
      </div>
    </section>
  </main>
</template>
