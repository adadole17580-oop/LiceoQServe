
<script setup>
import { ref } from 'vue'

const emit = defineEmits(['login'])

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const keepSignedIn = ref(false)
const errorMessage = ref('')
const isLoading = ref(false)

async function signIn() {
  errorMessage.value = ''

  if (!email.value.trim() || !password.value) {
    errorMessage.value =
      'Please enter your university email and password.'
    return
  }

  if (isLoading.value) return

  isLoading.value = true

  try {
    const response = await fetch(
      'http://localhost:3000/api/auth/guidance-login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email.value.trim(),
          password: password.value
        })
      }
    )

    const result = await response.json()

    if (!response.ok || !result.success) {
      errorMessage.value =
        result.message || 'Login failed. Please try again.'
      return
    }

    emit('login', {
      user: result.user,
      session: result.session,
      keepSignedIn: keepSignedIn.value
    })

  } catch (error) {
    console.error('Login error:', error)

    errorMessage.value =
      'Unable to connect to the server. Please check if the backend is running.'
  } finally {
    isLoading.value = false
  }
}

function forgotPassword() {
  errorMessage.value =
    'Please contact the Guidance Office administrator to reset your password.'
}
</script>

<template>
  <div class="login-page">
    <section class="welcome-panel">
      <div class="circle circle-top"></div>
      <div class="circle circle-bottom"></div>

      <div class="brand">LiceoQServe</div>

      <div class="welcome-copy">
        <p class="eyebrow">STAFF PORTAL</p>
        <h1>Campus services without the unnecessary wait.</h1>
        <p class="description">
          Manage queues, appointments, requests, and campus service updates in one place.
        </p>
      </div>

      <p class="tagline">QUEUE. SCHEDULE. SERVE</p>
    </section>

    <section class="form-panel">
      <div class="form-content">
        <p class="welcome-back">WELCOME BACK</p>
        <h2>Sign in to your account</h2>
        <p class="subtitle">
          Enter your service/office account details to continue.
        </p>

        <form class="login-card" @submit.prevent="signIn">
          <label for="email">University Email</label>

          <input
            id="email"
            v-model="email"
            type="email"
            placeholder="servicestaff@liceo.edu.ph"
            autocomplete="username"
            required
          />

          <label for="password">Password</label>

          <div class="password-field">
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="enter at least 8 characters"
              autocomplete="current-password"
              required
            />

            <button
              type="button"
              class="show-button"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>

          <div class="form-options">
            <label class="remember-option">
              <input
                v-model="keepSignedIn"
                type="checkbox"
              />
              <span>Keep me signed in</span>
            </label>

            <button
              type="button"
              class="forgot-button"
              @click="forgotPassword"
            >
              Forgot Password?
            </button>
          </div>

          <p v-if="errorMessage" class="error-message">
            {{ errorMessage }}
          </p>

          <button
            type="submit"
            class="sign-in-button"
            :disabled="isLoading"
          >
            {{ isLoading ? 'Signing in...' : 'Sign In' }}
          </button>
        </form>

        <p class="policy">
          By continuing, you acknowledge the university's acceptable use and data privacy policies.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.login-page {
  display: grid;
  grid-template-columns: 46.5% 53.5%;
  width: 100%;
  min-height: 100vh;
  color: #39090c;
  background: #efdfdf;
}

.welcome-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 11.5% 7%;
  overflow: hidden;
  color: #fffafa;
  background: #51090e;
}

.brand {
  z-index: 1;
  align-self: flex-start;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #d8babb;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 17px;
  font-weight: bold;
}

.welcome-copy {
  z-index: 1;
  margin-top: 28px;
}

.eyebrow {
  margin: 0 0 12px;
  color: #d8babb;
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 4px;
}

.welcome-copy h1 {
  max-width: 520px;
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(28px, 3.2vw, 43px);
  font-weight: normal;
  line-height: 1.13;
}

.description {
  max-width: 390px;
  margin-top: 20px;
  color: #d8babb;
  font-size: 12px;
  line-height: 1.5;
}

.tagline {
  z-index: 1;
  margin: auto 0 0;
  color: #d8babb;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 17px;
  font-weight: bold;
  text-align: center;
}

.circle {
  position: absolute;
  width: 420px;
  height: 420px;
  border: 1px solid #b4a000;
  border-radius: 50%;
  pointer-events: none;
}

.circle-top {
  top: -190px;
  right: -145px;
  background: rgba(255, 255, 255, 0.035);
}

.circle-bottom {
  bottom: -155px;
  left: -125px;
  background: rgba(255, 255, 255, 0.035);
}

.form-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 100vh;
  padding: 45px 6%;
  background: #efdfdf;
}

.form-content {
  width: 100%;
  max-width: 570px;
}

.welcome-back {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 4px;
}

.form-content h2 {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(29px, 3vw, 38px);
  font-weight: normal;
  line-height: 1.15;
}

.subtitle {
  margin: 6px 0 50px;
  font-size: 12px;
}

.login-card {
  display: flex;
  flex-direction: column;
  padding: 26px 24px 30px;
  background: #fff;
  border: 1px solid #650f18;
  border-radius: 9px;
  box-shadow: 0 3px 5px rgba(57, 9, 12, 0.18);
}

.login-card > label {
  margin-bottom: 11px;
  font-size: 11px;
  font-weight: bold;
}

.login-card > input,
.password-field input {
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 0 13px;
  color: #39090c;
  background: white;
  border: 1px solid #8e6d6f;
  border-radius: 7px;
  outline: none;
  font-size: 11px;
}

.login-card > input {
  margin-bottom: 22px;
}

.login-card input:focus {
  border-color: #650f18;
  box-shadow: 0 0 0 2px rgba(101, 15, 24, 0.1);
}

.login-card input::placeholder {
  color: #987f80;
}

.password-field {
  display: flex;
  align-items: center;
  height: 36px;
  border: 1px solid #8e6d6f;
  border-radius: 7px;
}

.password-field:focus-within {
  border-color: #650f18;
}

.password-field input {
  flex: 1;
  height: 34px;
  border: 0;
  box-shadow: none;
}

.show-button {
  flex-shrink: 0;
  padding: 8px 12px;
  color: #b00009;
  background: transparent;
  border: 0;
  font-size: 10px;
  cursor: pointer;
}

.form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  margin-bottom: 30px;
}

.remember-option {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
}

.remember-option input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: #650f18;
}

.forgot-button {
  padding: 0;
  color: #b00009;
  background: transparent;
  border: 0;
  font-size: 10px;
  cursor: pointer;
}

.forgot-button:hover {
  text-decoration: underline;
}

.sign-in-button {
  width: 100%;
  min-height: 36px;
  color: white;
  background: #650f18;
  border: 1px solid #650f18;
  border-radius: 14px;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
}

.sign-in-button:hover:not(:disabled) {
  background: #7b1721;
}

.sign-in-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.error-message {
  margin: -18px 0 14px;
  color: #b00009;
  font-size: 11px;
}

.policy {
  margin: 25px 0 0;
  font-size: 10px;
  line-height: 1.5;
  text-align: center;
}

@media (max-width: 750px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .welcome-panel {
    min-height: 280px;
    padding: 28px 24px;
  }

  .welcome-copy {
    margin-top: 20px;
  }

  .welcome-copy h1 {
    font-size: 30px;
  }

  .description {
    margin-top: 12px;
  }

  .tagline {
    margin-top: 28px;
    font-size: 14px;
  }

  .circle {
    width: 260px;
    height: 260px;
  }

  .form-panel {
    min-height: auto;
    padding: 36px 20px;
  }

  .subtitle {
    margin-bottom: 28px;
  }

  .login-card {
    padding: 24px 18px;
  }
}
</style>
