
<script setup>
import { ref } from 'vue'
import { supabase } from '../lib/supabase.js'

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const keepMeSignedIn = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const emit = defineEmits(['login'])

async function signIn() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!email.value.trim() || !password.value) {
    errorMessage.value = 'Please enter your university email and password.'
    return
  }

  isLoading.value = true

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value
    })

    if (error) throw error

    if (!data.user) {
      throw new Error('Unable to sign in. Please try again.')
    }

    // Save the selected session preference.
    if (keepMeSignedIn.value) {
      localStorage.setItem('liceoqserveKeepSignedIn', 'true')
      sessionStorage.removeItem('liceoqserveSessionAllowed')
    } else {
      localStorage.removeItem('liceoqserveKeepSignedIn')
      sessionStorage.setItem('liceoqserveSessionAllowed', 'true')
    }

    emit('login', data.user)

  } catch (error) {
    console.error('Sign in error:', error)
    errorMessage.value =
      error.message || 'Unable to sign in. Please try again.'
  } finally {
    isLoading.value = false
  }
}

async function forgotPassword() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!email.value.trim()) {
    errorMessage.value =
      'Please enter your university email first.'
    return
  }

  isLoading.value = true

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.value.trim()
    )

    if (error) throw error

    successMessage.value =
      'Password reset instructions have been sent to your email. Please check your inbox.'

  } catch (error) {
    console.error('Password reset error:', error)
    errorMessage.value =
      error.message || 'Unable to send the password reset email.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <main class="login-page">

    <!-- LEFT PANEL -->
    <section class="login-brand-panel">
      <div class="brand-content">

        <div class="brand-logo">
          LiceoQServe
        </div>

        <p class="brand-label">STAFF PORTAL</p>

        <h1>
          Campus services without
          <br />
          the unnecessary wait.
        </h1>

        <p class="brand-description">
          Manage queues, appointments, requests, and campus service
          updates in one place.
        </p>

      </div>

      <div class="brand-footer">
        QUEUE. SCHEDULE. SERVE
      </div>

      <div class="decorative-circle circle-top"></div>
      <div class="decorative-circle circle-bottom"></div>
    </section>

    <!-- RIGHT PANEL -->
    <section class="login-form-panel">
      <div class="login-content">

        <div class="login-heading">
          <p class="welcome-label">WELCOME BACK</p>

          <h2>Sign in to your account</h2>

          <p class="login-subtitle">
            Enter your service/office account details to continue.
          </p>
        </div>

        <form class="login-card" @submit.prevent="signIn">

          <!-- EMAIL -->
          <div class="form-group">
            <label for="email">University Email</label>

            <input
              id="email"
              v-model="email"
              type="email"
              placeholder="Enter your university email"
              autocomplete="username"
              required
            />
          </div>

          <!-- PASSWORD -->
          <div class="form-group">
            <label for="password">Password</label>

            <div class="password-wrapper">
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Enter your password"
                autocomplete="current-password"
                required
              />

              <button
                type="button"
                class="password-toggle"
                @click="showPassword = !showPassword"
              >
                {{ showPassword ? 'Hide' : 'Show' }}
              </button>
            </div>
          </div>

          <!-- LOGIN OPTIONS -->
          <div class="login-options">

            <label class="remember-option">
              <input
                v-model="keepMeSignedIn"
                type="checkbox"
              />
              <span>Keep me signed in</span>
            </label>

            <button
              type="button"
              class="forgot-password"
              @click="forgotPassword"
              :disabled="isLoading"
            >
              Forgot Password?
            </button>

          </div>

          <!-- MESSAGES -->
          <p v-if="errorMessage" class="error-message">
            {{ errorMessage }}
          </p>

          <p v-if="successMessage" class="success-message">
            {{ successMessage }}
          </p>

          <!-- SIGN IN BUTTON -->
          <button
            type="submit"
            class="sign-in-button"
            :disabled="isLoading"
          >
            {{ isLoading ? 'Signing In...' : 'Sign In' }}
          </button>

        </form>

        <p class="privacy-note">
          By continuing, you acknowledge the university's acceptable
          use and data privacy policies.
        </p>

      </div>
    </section>

  </main>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.login-page {
  display: grid;
  grid-template-columns: 46.8% 53.2%;
  min-height: 100vh;
  width: 100%;
  font-family: Arial, sans-serif;
  color: #39090c;
  background: #efdfdf;
}

/* LEFT PANEL */

.login-brand-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100vh;
  padding: 65px 5.5%;
  overflow: hidden;
  color: #fff6f3;
  background: #50090e;
}

.brand-content,
.brand-footer {
  position: relative;
  z-index: 2;
}

.brand-logo {
  display: inline-block;
  padding: 10px 13px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 17px;
  font-weight: bold;
  font-style: italic;
}

.brand-label {
  margin: 28px 0 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 4px;
}

.brand-content h1 {
  max-width: 540px;
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(30px, 3.3vw, 44px);
  font-weight: 400;
  line-height: 1.13;
}

.brand-description {
  max-width: 410px;
  margin-top: 22px;
  color: #d9bfc0;
  font-size: 13px;
  line-height: 1.7;
}

.brand-footer {
  align-self: center;
  margin-bottom: 0;
  color: #e6cccc;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 17px;
  font-weight: bold;
}

.decorative-circle {
  position: absolute;
  z-index: 1;
  width: 430px;
  height: 430px;
  border: 1px solid rgba(190, 139, 32, 0.65);
  border-radius: 50%;
  pointer-events: none;
}

.circle-top {
  top: -205px;
  right: -155px;
}

.circle-bottom {
  bottom: -220px;
  left: -145px;
}

/* RIGHT PANEL */

.login-form-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 45px 8%;
  background: #efdfdf;
}

.login-content {
  width: 100%;
  max-width: 570px;
}

.login-heading {
  margin-bottom: 48px;
}

.welcome-label {
  margin: 0 0 8px;
  color: #806667;
  font-size: 11px;
  letter-spacing: 4px;
  font-weight: 700;
}

.login-heading h2 {
  margin: 0 0 8px;
  color: #350609;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(29px, 3.2vw, 39px);
  font-weight: 400;
  line-height: 1.15;
}

.login-subtitle {
  margin: 0;
  color: #4c292b;
  font-size: 12px;
}

/* LOGIN CARD */

.login-card {
  width: 100%;
  padding: 26px 24px 29px;
  border: 1px solid #956d70;
  border-radius: 10px;
  background: #fffdfd;
  box-shadow: 0 4px 7px rgba(47, 13, 15, 0.12);
}

.form-group {
  margin-bottom: 22px;
}

.form-group label {
  display: block;
  margin-bottom: 10px;
  color: #39090c;
  font-size: 11px;
  font-weight: 700;
}

.form-group input {
  width: 100%;
  height: 37px;
  padding: 0 13px;
  border: 1px solid #b8a5a6;
  border-radius: 7px;
  outline: none;
  background: #fff;
  color: #3c2021;
  font-family: Arial, sans-serif;
  font-size: 11px;
}

.form-group input:focus {
  border-color: #650f18;
  box-shadow: 0 0 0 2px rgba(101, 15, 24, 0.08);
}

.password-wrapper {
  position: relative;
}

.password-wrapper input {
  padding-right: 55px;
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  padding: 4px 0;
  border: none;
  background: transparent;
  color: #8b2029;
  font-size: 10px;
  cursor: pointer;
}

/* OPTIONS */

.login-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: -9px;
  margin-bottom: 14px;
}

.remember-option {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #4e292b;
  font-size: 10px;
  cursor: pointer;
}

.remember-option input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #650f18;
  cursor: pointer;
}

.forgot-password {
  padding: 0;
  border: none;
  background: transparent;
  color: #8b2029;
  font-size: 10px;
  cursor: pointer;
}

.forgot-password:hover,
.password-toggle:hover {
  text-decoration: underline;
}

/* MESSAGES */

.error-message,
.success-message {
  margin: 0 0 12px;
  font-size: 11px;
  line-height: 1.5;
}

.error-message {
  color: #a12a32;
}

.success-message {
  color: #397a49;
}

/* BUTTON */

.sign-in-button {
  width: 100%;
  height: 37px;
  margin-top: 0;
  border: none;
  border-radius: 18px;
  background: #650f18;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease;
}

.sign-in-button:hover {
  background: #7a1721;
}

.sign-in-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* PRIVACY NOTE */

.privacy-note {
  margin: 27px 0 0;
  color: #4d292b;
  text-align: center;
  font-size: 10px;
  line-height: 1.6;
}

/* RESPONSIVE */

@media (max-width: 850px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-brand-panel {
    min-height: 300px;
    padding: 35px 7%;
  }

  .brand-content h1 {
    font-size: 34px;
  }

  .brand-description {
    margin-top: 12px;
  }

  .brand-footer {
    margin-top: 35px;
  }

  .login-form-panel {
    min-height: auto;
    padding: 55px 7%;
  }

  .login-heading {
    margin-bottom: 30px;
  }
}

@media (max-width: 480px) {
  .login-brand-panel {
    min-height: 270px;
  }

  .brand-content h1 {
    font-size: 29px;
  }

  .brand-label {
    letter-spacing: 3px;
  }

  .login-form-panel {
    padding: 40px 20px;
  }

  .login-heading h2 {
    font-size: 29px;
  }

  .login-card {
    padding: 23px 18px;
  }
}
</style>
