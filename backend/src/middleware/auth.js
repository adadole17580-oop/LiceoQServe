import { supabase, createUserScopedClient, getAdminClient } from '../supabase.js'

export async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({
      error: 'Unauthorized: Missing or invalid Authorization header.',
    })
  }

  const parts = authHeader.trim().split(/\s+/)
  const scheme = parts[0]?.toLowerCase()
  const token = parts.slice(1).join(' ')

  if (scheme !== 'bearer' || !token) {
    return res.status(401).json({
      error: 'Unauthorized: Missing or invalid Authorization header.',
    })
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({
        error: 'Unauthorized: Invalid or expired session token.',
      })
    }

    req.user = user
    req.token = token
    req.userScopedSupabase = createUserScopedClient(token)

    const adminClient = getAdminClient()
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, full_name, student_id, role, office_id, program, year_level, is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      console.error('Error fetching user profile:', profileError)
      return res.status(500).json({
        error: 'Internal server error while loading your profile.',
      })
    }

    if (!profile) {
      console.warn(`Authenticated user ${user.id} has no profile row in public.profiles.`)
      return res.status(401).json({
        error: 'Your account profile is incomplete. Please complete registration and try again.',
      })
    }

    req.profile = profile
    next()
  } catch (err) {
    console.error('Authentication middleware error:', err)
    return res.status(500).json({
      error: 'Internal server error during authentication.',
    })
  }
}

/**
 * Middleware to enforce role-based access.
 *
 * @param {string[]} allowedRoles - Array of roles allowed (e.g. ['staff', 'admin'])
 */
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.profile || !allowedRoles.includes(req.profile.role)) {
      return res.status(403).json({
        error: `Forbidden: This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
      })
    }
    next()
  }
}

/**
 * Middleware to enforce office assignment for staff.
 * Validates that staff user's office_id matches the office required for the transaction.
 *
 * @param {Function|string} getTargetOfficeId - Function (req) => officeId or static officeId string
 */
export function requireOffice(getTargetOfficeId) {
  return (req, res, next) => {
    if (req.profile.role === 'admin') {
      return next() // Admin has cross-office authority
    }

    const targetOfficeId = typeof getTargetOfficeId === 'function'
      ? getTargetOfficeId(req)
      : getTargetOfficeId

    if (!req.profile.office_id || req.profile.office_id !== targetOfficeId) {
      return res.status(403).json({
        error: 'Forbidden: You are not authorized to manage transactions for this office.',
      })
    }
    next()
  }
}
