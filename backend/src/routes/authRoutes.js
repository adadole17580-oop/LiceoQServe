import express from 'express'
import { supabase, getAdminClient, supabaseServiceRoleKey } from '../supabase.js'

const router = express.Router()

router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, studentId, program, yearLevel } = req.body || {}

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof fullName !== 'string' ||
      typeof studentId !== 'string' ||
      typeof program !== 'string' ||
      typeof yearLevel !== 'string'
    ) {
      return res.status(400).json({
        error: 'All required registration fields must be provided.',
      })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedFullName = fullName.trim()
    const normalizedStudentId = studentId.trim()
    const normalizedProgram = program.trim()
    const normalizedYearLevel = yearLevel.trim()

    if (
      !normalizedFullName ||
      !normalizedStudentId ||
      !normalizedProgram ||
      !normalizedYearLevel ||
      !/^[^\s@]+@liceo\.edu\.ph$/i.test(normalizedEmail) ||
      password.length < 8
    ) {
      return res.status(400).json({
        error: 'Provide valid registration details and an official university email.',
      })
    }

    if (!supabaseServiceRoleKey) {
      console.error('Registration is unavailable because SUPABASE_SERVICE_ROLE_KEY is not configured.')
      return res.status(503).json({
        error: 'Registration is temporarily unavailable. Please contact support.',
      })
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: normalizedFullName,
          student_id: normalizedStudentId,
          program: normalizedProgram,
          year_level: normalizedYearLevel,
          university_email: normalizedEmail,
        },
      },
    })

    if (error) {
      console.error('Supabase registration failed:', error)
      return res.status(400).json({
        error: error.message || 'Registration failed. Please try again.',
      })
    }

    let user = data?.user
    let session = data?.session

    if (!user) {
      console.error('Supabase signup returned no user.')
      return res.status(502).json({
        error: 'Supabase did not create an account. Please try again.',
      })
    }

    if (Array.isArray(user.identities) && user.identities.length === 0) {
      const { data: existingLogin, error: loginError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (loginError || !existingLogin?.user) {
        return res.status(409).json({
          error: 'An account with this email already exists. Please sign in or reset your password.',
        })
      }

      user = existingLogin.user
      session = existingLogin.session
      const metadata = user.user_metadata || {}
      if (
        metadata.full_name !== normalizedFullName ||
        metadata.student_id !== normalizedStudentId ||
        metadata.program !== normalizedProgram ||
        metadata.year_level !== normalizedYearLevel ||
        metadata.university_email !== normalizedEmail
      ) {
        return res.status(409).json({
          error: 'This email is already registered with different student information. Please sign in or contact support.',
        })
      }
    }

    const adminClient = getAdminClient()
    const registeredAt = new Date().toISOString()
    const profilePayload = {
      id: user.id,
      full_name: normalizedFullName,
      student_id: normalizedStudentId,
      university_email: normalizedEmail,
      program: normalizedProgram,
      year_level: normalizedYearLevel,
      role: 'student',
      office_id: null,
      is_active: true,
      created_at: registeredAt,
      updated_at: registeredAt,
    }

    const { data: existingProfile, error: profileLookupError } = await adminClient
      .from('profiles')
      .select('id, full_name, student_id, university_email, program, year_level, role, office_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileLookupError) {
      console.error('Failed to check profile after registration:', profileLookupError)
      return res.status(500).json({
        error: 'Your account was created, but its profile could not be verified. Please contact support.',
      })
    }

    const profileMatchesRegistration = (profile) =>
      profile &&
      profile.id === user.id &&
      profile.full_name === profilePayload.full_name &&
      profile.student_id === profilePayload.student_id &&
      profile.university_email === profilePayload.university_email &&
      profile.program === profilePayload.program &&
      profile.year_level === profilePayload.year_level &&
      profile.role === 'student' &&
      profile.office_id === null

    if (!profileMatchesRegistration(existingProfile)) {
      const { error: insertError } = await adminClient
        .from('profiles')
        .insert(profilePayload)

      if (insertError) {
        if (insertError.code === '23505') {
          const { data: retriedProfile, error: retryLookupError } = await adminClient
            .from('profiles')
            .select('id, full_name, student_id, university_email, program, year_level, role, office_id')
            .eq('id', user.id)
            .maybeSingle()

          if (!retryLookupError && profileMatchesRegistration(retriedProfile)) {
            return res.status(201).json({
              message: 'Registration successful.',
              user,
              requiresEmailConfirmation: !session,
            })
          }
        }

        console.error('Failed to create profile after registration:', insertError)
        return res.status(500).json({
          error: 'Your Auth account was created, but its profile could not be created. Please contact support before retrying.',
        })
      }
    }

    return res.status(201).json({
      message: 'Registration successful.',
      user,
      requiresEmailConfirmation: !session,
    })
  } catch (err) {
    console.error('Registration API error:', err)
    return res.status(500).json({
      error: 'Internal server error during registration.',
    })
  }
})

export default router