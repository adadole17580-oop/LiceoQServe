import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { isIP } from 'node:net'
import { supabase } from './supabase.js'
import queueRoutes from './routes/queueRoutes.js'
import reservationRoutes from './routes/reservationRoutes.js'
import libraryRoutes from './routes/libraryRoutes.js'
import appointmentRoutes from './routes/appointmentRoutes.js'
import requestRoutes from './routes/requestRoutes.js'
import staffRoutes from './routes/staffRoutes.js'
import authRoutes from './routes/authRoutes.js'
import { startGeneralPostEmailDelivery } from './utils/generalPostEmailDelivery.js'
import { startReservationNoShowScheduler } from './utils/reservationNoShowScheduler.js'

const app = express()
const port = process.env.PORT || 3000
const configuredFrontendOrigins = (process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => {
    const url = new URL(origin)
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
      throw new Error(`Invalid frontend origin in FRONTEND_URL: ${origin}`)
    }
    return url.origin
  })

function isAllowedDevelopmentOrigin(origin) {
  if (!origin || process.env.NODE_ENV === 'production') return false

  try {
    const url = new URL(origin)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.port !== '5173' ||
      url.origin !== origin
    ) {
      return false
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1') {
      return true
    }

    if (isIP(hostname) === 4) {
      const [first, second] = hostname.split('.').map(Number)
      return first === 10 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 169 && second === 254)
    }

    return isIP(hostname) === 6 && /^(fc|fd|fe[89ab])/i.test(hostname)
  } catch {
    return false
  }
}

if (process.env.NODE_ENV === 'production' && configuredFrontendOrigins.length === 0) {
  throw new Error('FRONTEND_URL must contain the allowed frontend origin(s) in production.')
}

app.use(cors({
  origin(origin, callback) {
    callback(null, Boolean(origin && (
      configuredFrontendOrigins.includes(origin) || isAllowedDevelopmentOrigin(origin)
    )))
  },
}))
app.use(express.json())

app.get('/', (_req, res) => {
  res.json({
    message: 'LiceoQServe API is running.',
  })
})

app.get('/api/health', async (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend is ready.',
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/queue', queueRoutes)
app.use('/api/reservations', reservationRoutes)
app.use('/api/library', libraryRoutes)
app.use('/api/appointments', appointmentRoutes)
app.use('/api/requests', requestRoutes)
app.use('/api/staff', staffRoutes)

startGeneralPostEmailDelivery()
startReservationNoShowScheduler()

app.listen(port, '0.0.0.0', () => {
  console.log(`LiceoQServe API listening on 0.0.0.0:${port}`)
})
