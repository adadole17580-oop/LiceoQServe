import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Missing Supabase environment variables in backend/.env')
}

export const supabaseUrl = process.env.SUPABASE_URL
export const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
export const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

/**
 * Creates a Supabase client scoped to the authenticated user's JWT.
 * Any operations executed with this client will execute under the user's RLS context.
 *
 * @param {string} token - The Bearer JWT token from the client
 */
export function createUserScopedClient(token) {
  return createClient(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export function getAdminClient() {
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in the backend environment. Privileged admin operations are disabled.')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}