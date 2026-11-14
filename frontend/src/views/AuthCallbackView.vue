<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import '../assets/styles/auth.css'

const route = useRoute()
const router = useRouter()
const message = ref('Verifying your Google identity…')
const errorMessage = ref('')
const completed = ref(false)

function matchesStudentEmail(email, studentId) {
  const emailMatch = String(email || '').toLowerCase().match(/(\d{5})@liceo\.edu\.ph$/)
  const studentIdDigits = String(studentId || '').replace(/\D/g, '')
  return emailMatch && studentIdDigits.length >= 5 && emailMatch[1] === studentIdDigits.slice(-5)
}

async function rejectAndUnlink(identity, reason) {
  const { error } = await supabase.auth.unlinkIdentity(identity)
  if (error) {
    throw new Error(`${reason} The Google identity could not be safely unlinked. Contact support before using Google Sign-In.`)
  }
  throw new Error(reason)
}

onMounted(async () => {
  const expectedUserId = sessionStorage.getItem('lq-google-link-user-id')
  sessionStorage.removeItem('lq-google-link-user-id')

  try {
    if (route.query.flow !== 'google-link') {
      throw new Error('This callback is only available for Google linking from an existing student account.')
    }
    if (route.query.error || !expectedUserId) {
      throw new Error('Google account linking was cancelled or could not be verified. No student profile was created.')
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user || user.id !== expectedUserId) {
      throw new Error('The signed-in account changed during Google linking. Sign in to your student account and try again.')
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, student_id, university_email')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile || profile.role !== 'student') {
      throw new Error('Google can only be linked to an existing student profile. No profile was created.')
    }

    const googleIdentity = user.identities?.find((identity) => identity.provider === 'google')
    if (!googleIdentity) {
      throw new Error('Google did not return a linked identity. No profile was created.')
    }

    const googleEmail = String(googleIdentity.identity_data?.email || '').trim().toLowerCase()
    const profileEmail = String(profile.university_email || '').trim().toLowerCase()
    const verified = googleIdentity.identity_data?.email_verified === true
    const approvedDomain = googleEmail.endsWith('@liceo.edu.ph')
    const matchesProfile = googleEmail === profileEmail
      && matchesStudentEmail(googleEmail, profile.student_id)

    if (!verified || !approvedDomain || !matchesProfile) {
      await rejectAndUnlink(
        googleIdentity,
        'The verified Google email must match the existing Liceo student profile and Student ID suffix.',
      )
    }

    message.value = 'Google is now linked to your existing student account.'
    completed.value = true
  } catch (error) {
    console.error('Google identity callback verification failed:', error)
    errorMessage.value = error.message || 'Google account linking could not be verified.'
  }
})
</script>

<template>
  <main class="auth-page">
    <section class="auth-main">
      <div class="auth-content">
        <section class="auth-card" role="status" aria-live="polite">
          <h2>{{ completed ? 'Google Account Linked' : errorMessage ? 'Google Linking Not Complete' : 'Verifying Google Account' }}</h2>
          <p v-if="errorMessage" class="auth-message" role="alert">{{ errorMessage }}</p>
          <p v-else>{{ message }}</p>
          <button
            v-if="completed"
            class="primary-button primary-action-button"
            type="button"
            @click="router.replace('/student/profile')"
          >
            Continue to Student Portal
          </button>
          <button
            v-else-if="errorMessage"
            class="primary-button primary-action-button"
            type="button"
            @click="router.replace('/')"
          >
            Return to Sign In
          </button>
        </section>
      </div>
    </section>
  </main>
</template>
