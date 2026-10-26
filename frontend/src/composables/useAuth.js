import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase.js'

const currentUser = ref(null)
const currentProfile = ref(null)
const authInitialized = ref(false)

export function useAuth() {
  const isAuthenticated = computed(() => !!currentUser.value)
  const isStaff = computed(() => currentProfile.value?.role === 'staff' || currentProfile.value?.role === 'admin')
  const studentName = computed(() => currentProfile.value?.full_name || currentUser.value?.user_metadata?.full_name || 'STUDENT')
  const studentId = computed(() => currentProfile.value?.student_id || currentUser.value?.user_metadata?.student_id || 'ID PENDING')

  async function initAuth() {
    if (authInitialized.value) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      currentUser.value = session?.user || null

      if (session?.user) {
        await fetchProfile(session.user.id)
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        currentUser.value = session?.user || null
        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          currentProfile.value = null
        }
      })
    } catch (err) {
      console.error('Error initializing auth:', err)
    } finally {
      authInitialized.value = true
    }
  }

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (!error && data) {
        currentProfile.value = data
      }
    } catch (err) {
      console.warn('Could not fetch user profile:', err)
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) throw error

    currentUser.value = data.user
    if (data.user) {
      await fetchProfile(data.user.id)
    }
    return data
  }

  async function signUp({ email, password, fullName, studentId, program, yearLevel }) {
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        studentId: studentId.trim(),
        program,
        yearLevel,
      }),
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(payload.error || 'Could not create student account. Please try again.')
    }

    return payload
  }

  async function signOut() {
    await supabase.auth.signOut()
    currentUser.value = null
    currentProfile.value = null
  }

  return {
    currentUser,
    currentProfile,
    isAuthenticated,
    isStaff,
    studentName,
    studentId,
    initAuth,
    signIn,
    signUp,
    signOut,
  }
}
