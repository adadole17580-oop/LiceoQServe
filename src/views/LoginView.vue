
<template>
  <main class="login-page">
    <section class="login-brand-panel">
      <div class="decorative-circle circle-top"></div>
      <div class="decorative-circle circle-bottom"></div>

      <div class="brand-content">
        <div class="login-brand-name">LiceoQServe</div>

        <div class="brand-message">
          <div class="brand-eyebrow">STAFF PORTAL</div>
          <h1>Campus services without the unnecessary wait.</h1>
          <p>
            Manage queues, appointments, requests, and campus service
            updates in one place.
          </p>
        </div>
      </div>

      <div class="brand-footer">QUEUE. SCHEDULE. SERVE</div>
    </section>

    <section class="login-form-panel">
      <div class="login-content">
        <header class="login-heading">
          <div class="welcome-label">WELCOME BACK</div>
          <h2>Sign in to your account</h2>
          <p>Enter your service/office account details to continue.</p>
        </header>

        <form class="login-card" @submit.prevent="signIn">
          <div class="form-group">
            <label for="email">University Email</label>
            <input
              id="email"
              v-model.trim="email"
              type="email"
              placeholder="servicestaff@liceo.edu.ph"
              autocomplete="username"
              required
              :disabled="loading"
            />
          </div>

          <div class="form-group password-group">
            <label for="password">Password</label>

            <div class="password-input-wrapper">
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Enter your password"
                autocomplete="current-password"
                required
                :disabled="loading"
              />

              <button
                class="show-password-button"
                type="button"
                @click="showPassword = !showPassword"
                :disabled="loading"
              >
                {{ showPassword ? 'Hide' : 'Show' }}
              </button>
            </div>
          </div>

          <div class="login-options">
            <label class="remember-option">
              <input v-model="rememberMe" type="checkbox" :disabled="loading" />
              <span>Keep me signed in</span>
            </label>

            <button
              class="forgot-button"
              type="button"
              @click="sendPasswordReset"
              :disabled="loading || sendingReset"
            >
              {{ sendingReset ? 'Sending...' : 'Forgot Password?' }}
            </button>
          </div>

          <button
            class="sign-in-button"
            type="submit"
            :disabled="loading || !email || !password"
          >
            {{ loading ? 'Signing In...' : 'Sign In' }}
          </button>
        </form>

        <p class="login-disclaimer">
          By continuing, you acknowledge the university's acceptable use
          and data privacy policies.
        </p>
      </div>
    </section>

    <AppModal
      v-model="modalOpen"
      :title="modalTitle"
      :message="modalMessage"
      :type="modalType"
      confirm-text="Okay"
      :show-cancel="false"
      @confirm="closeModal"
    />
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase'
import AppModal from '../components/AppModal.vue'

const router = useRouter()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const rememberMe = ref(true)
const loading = ref(false)
const sendingReset = ref(false)

const modalOpen = ref(false)
const modalTitle = ref('')
const modalMessage = ref('')
const modalType = ref('error')

function showModal(title, message, type = 'error') {
  modalTitle.value = title
  modalMessage.value = message
  modalType.value = type
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
}

async function signIn() {
  if (loading.value) return

  loading.value = true

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })

    if (error) throw error

    if (!data.user) {
      throw new Error('Unable to verify your account. Please try again.')
    }

    await router.replace('/dashboard')
  } catch (error) {
    console.error('Login failed:', error)

    showModal(
      'Sign In Failed',
      error.message === 'Invalid login credentials'
        ? 'Incorrect email or password. Please try again.'
        : error.message || 'Unable to sign in. Please try again.',
      'error',
    )
  } finally {
    loading.value = false
  }
}

async function sendPasswordReset() {
  if (sendingReset.value) return

  if (!email.value) {
    showModal(
      'Email Required',
      'Please enter your university email first.',
      'warning',
    )
    return
  }

  sendingReset.value = true

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.value,
      {
        redirectTo: `${window.location.origin}/login`,
      },
    )

    if (error) throw error

    showModal(
      'Password Reset Email Sent',
      'If an account exists for this email, a password reset link will be sent.',
      'success',
    )
  } catch (error) {
    console.error('Password reset failed:', error)

    showModal(
      'Password Reset Failed',
      error.message || 'Unable to send the password reset email.',
      'error',
    )
  } finally {
    sendingReset.value = false
  }
}
</script>

<style scoped>
.login-page {
  display: grid;
  grid-template-columns: 46.5% 53.5%;
  width: 100%;
  min-height: 100vh;
  overflow: hidden;
  background: #eadfe0;
  color: #392d2d;
  font-family: 'Inter', sans-serif;
}

.login-brand-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100vh;
  overflow: hidden;
  padding: 0 7%;
  background: #4c080b;
  color: #fffaf8;
}

.decorative-circle {
  position: absolute;
  width: 390px;
  height: 390px;
  border: 1.5px solid #a18b28;
  border-radius: 50%;
  pointer-events: none;
}

.circle-top {
  top: -155px;
  right: -120px;
}

.circle-bottom {
  bottom: -175px;
  left: -105px;
}

.brand-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  padding-top: 25px;
}

.login-brand-name {
  display: inline-flex;
  align-self: flex-start;
  margin-bottom: 29px;
  padding: 8px 11px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.045);
  color: #e8c9ca;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 16px;
  font-weight: 700;
}

.brand-message {
  max-width: 510px;
}

.brand-eyebrow {
  margin-bottom: 10px;
  color: #d8b6b7;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 3px;
}

.brand-message h1 {
  margin: 0;
  color: #fffaf8;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(27px, 3.4vw, 39px);
  font-weight: 600;
  line-height: 1.18;
}

.brand-message p {
  max-width: 390px;
  margin: 20px 0 0;
  color: #d4b6b7;
  font-size: 12px;
  line-height: 1.7;
}

.brand-footer {
  position: relative;
  z-index: 1;
  padding: 0 0 45px;
  color: #e5c4c5;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 16px;
  font-weight: 700;
  text-align: center;
}

.login-form-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 100vh;
  padding: 55px 7%;
  background: #eadfe0;
}

.login-content {
  width: 100%;
  max-width: 490px;
}

.login-heading {
  margin-bottom: 49px;
}

.welcome-label {
  margin-bottom: 7px;
  color: #5d4a4b;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2.7px;
}

.login-heading h2 {
  margin: 0 0 5px;
  color: #390c0e;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(27px, 3vw, 35px);
  font-weight: 600;
  line-height: 1.2;
}

.login-heading p {
  margin: 0;
  color: #493b3b;
  font-size: 11px;
  line-height: 1.6;
}

.login-card {
  width: 100%;
  padding: 27px 24px 25px;
  border: 1.5px solid #4c080b;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 3px 5px rgba(49, 12, 14, 0.22);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.form-group label {
  color: #4b3435;
  font-size: 11px;
  font-weight: 700;
}

.form-group input {
  width: 100%;
  height: 37px;
  padding: 0 12px;
  border: 1px solid #927e7e;
  border-radius: 8px;
  outline: none;
  background: #fff;
  color: #392d2d;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
}

.form-group input::placeholder {
  color: #a08e8e;
}

.form-group input:focus {
  border-color: #4c080b;
  box-shadow: 0 0 0 3px rgba(76, 8, 11, 0.09);
}

.form-group input:disabled {
  background: #f8f4f4;
  cursor: not-allowed;
}

.password-group {
  margin-bottom: 11px;
}

.password-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.password-input-wrapper input {
  padding-right: 55px;
}

.show-password-button {
  position: absolute;
  right: 10px;
  padding: 5px 2px;
  border: 0;
  background: transparent;
  color: #9b3034;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}

.show-password-button:hover {
  color: #4c080b;
}

.login-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 29px;
}

.remember-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #5f4c4c;
  font-size: 9px;
  cursor: pointer;
}

.remember-option input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: #4c080b;
}

.forgot-button {
  padding: 3px 0;
  border: 0;
  background: transparent;
  color: #a12e32;
  font-family: 'Inter', sans-serif;
  font-size: 9px;
  cursor: pointer;
}

.forgot-button:hover {
  color: #4c080b;
  text-decoration: underline;
}

.sign-in-button {
  width: 100%;
  min-height: 35px;
  border: 1px solid #4c080b;
  border-radius: 25px;
  background: #4c080b;
  color: #fffaf8;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
}

.sign-in-button:hover:not(:disabled) {
  background: #681519;
  transform: translateY(-1px);
}

.sign-in-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.login-disclaimer {
  margin: 23px 0 0;
  color: #6e5a5b;
  font-size: 9px;
  line-height: 1.7;
  text-align: center;
}

@media (max-width: 850px) {
  .login-page {
    grid-template-columns: 42% 58%;
  }

  .brand-message h1 {
    font-size: 29px;
  }
}

@media (max-width: 650px) {
  .login-page {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    overflow: visible;
  }

  .login-brand-panel {
    min-height: 265px;
    padding: 28px 25px 0;
  }

  .brand-content {
    padding-top: 0;
  }

  .login-brand-name {
    margin-bottom: 20px;
    font-size: 14px;
  }

  .brand-eyebrow {
    margin-bottom: 7px;
    font-size: 9px;
  }

  .brand-message h1 {
    font-size: 27px;
  }

  .brand-message p {
    margin-top: 10px;
    font-size: 11px;
  }

  .brand-footer {
    padding: 20px 0;
    font-size: 13px;
  }

  .decorative-circle {
    width: 250px;
    height: 250px;
  }

  .circle-top {
    top: -145px;
    right: -100px;
  }

  .circle-bottom {
    bottom: -170px;
    left: -100px;
  }

  .login-form-panel {
    flex: 1;
    min-height: auto;
    padding: 42px 22px 50px;
  }

  .login-heading {
    margin-bottom: 30px;
  }

  .login-heading h2 {
    font-size: 29px;
  }

  .login-card {
    padding: 25px 20px;
  }
}

@media (max-width: 380px) {
  .login-brand-panel {
    min-height: 245px;
  }

  .brand-message h1 {
    font-size: 24px;
  }

  .login-form-panel {
    padding-right: 16px;
    padding-left: 16px;
  }

  .login-options {
    align-items: flex-start;
  }
}
</style>
