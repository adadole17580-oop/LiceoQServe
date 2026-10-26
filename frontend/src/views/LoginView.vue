<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import '../assets/styles/auth.css'

const router = useRouter()
const { signIn: authSignIn } = useAuth()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const rememberMe = ref(false)
const errorMessage = ref('')
const loading = ref(false)

async function signIn() {
  errorMessage.value = ''

  if (!email.value.trim() || !password.value) {
    errorMessage.value = 'Please enter your university email and password.'
    return
  }

  if (!/^[^\s@]+@liceo\.edu\.ph$/i.test(email.value.trim())) {
    errorMessage.value = 'Please use your official @liceo.edu.ph email address.'
    return
  }

  loading.value = true
  try {
    await authSignIn(email.value, password.value)
    router.push('/student/home')
  } catch (err) {
    console.error('Sign in error:', err)
    errorMessage.value = err.message || 'Invalid university email or password.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth-page">
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
          <p class="auth-eyebrow">WELCOME BACK</p>
          <h2>Sign in to your account</h2>
          <p>Enter your student account details to continue.</p>
        </header>

        <nav class="auth-tabs" aria-label="Account pages">
          <button class="auth-tab active" type="button" aria-current="page">
            Log In
          </button>
          <button class="auth-tab" type="button" @click="router.push('/register')">
            Register
          </button>
        </nav>

        <form class="auth-card" @submit.prevent="signIn">
          <div class="form-field">
            <label for="login-email">University Email</label>
            <input
              id="login-email"
              v-model="email"
              type="email"
              placeholder="student@liceo.edu.ph"
              autocomplete="username"
              required
            />
          </div>

          <div class="form-field">
            <label for="login-password">Password</label>
            <div class="password-wrap">
              <input
                id="login-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="enter at least 8 characters"
                autocomplete="current-password"
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

          <div class="login-options">
            <label class="checkbox-label">
              <input v-model="rememberMe" type="checkbox" />
              <span>Keep me signed in</span>
            </label>

            <button
              class="text-link"
              type="button"
              @click="errorMessage = 'Password recovery will be available when backend email support is added.'"
            >
              Forgot Password?
            </button>
          </div>

          <p v-if="errorMessage" class="auth-message" role="status">
            {{ errorMessage }}
          </p>

          <button class="primary-button" type="submit" :disabled="loading">
            {{ loading ? 'Signing In...' : 'Sign In' }}
          </button>

          <p class="auth-switch">
            New to LiceoQServe?
            <button type="button" class="inline-link" @click="router.push('/register')">
              Create Account
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
