import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { supabase } from './supabase.js'
import queueRoutes from './routes/queueRoutes.js'
import reservationRoutes from './routes/reservationRoutes.js'
import libraryRoutes from './routes/libraryRoutes.js'
import appointmentRoutes from './routes/appointmentRoutes.js'
import requestRoutes from './routes/requestRoutes.js'
import staffRoutes from './routes/staffRoutes.js'
import authRoutes from './routes/authRoutes.js'

const app = express()
const port = process.env.PORT || 3000

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

app.listen(port, () => {
  console.log(`LiceoQServe API running at http://localhost:${port}`)
})
