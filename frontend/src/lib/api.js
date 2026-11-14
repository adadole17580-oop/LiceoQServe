import { supabase } from './supabase.js'

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()

export const API_BASE_URL = (
  configuredApiUrl || `${window.location.protocol}//${window.location.hostname}:3000`
).replace(/\/+$/, '')

export async function apiRequest(path, options = {}) {
  const { data, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) {
    throw new Error(`Could not read your sign-in session: ${sessionError.message}`)
  }

  const token = data.session?.access_token
  if (!token) throw new Error('Your session has expired. Please sign in again.')

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Could not reach the backend at ${API_BASE_URL}. Check that it is running and accessible from this device, and that CORS and network settings allow this origin.`,
      )
    }
    throw error
  }

  const responseText = await response.text()
  let payload = null
  if (responseText) {
    try {
      payload = JSON.parse(responseText)
    } catch {
      throw new Error(`Backend returned an invalid response (HTTP ${response.status}).`)
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Backend returned HTTP ${response.status}.`)
  }
  return payload
}
