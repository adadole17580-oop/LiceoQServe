import { getAdminClient } from '../supabase.js'
import { createStudentNotification } from './studentNotifications.js'

const sweepIntervalMs = 60 * 1000
let sweepInProgress = false
let schedulerTimer = null

function formatManilaDateTime(value) {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))
}

async function notifyNoShow(adminClient, reservation) {
  const roomName = reservation.rooms?.name || 'Discussion Room'
  await createStudentNotification({
    adminClient,
    recipientId: reservation.student_id,
    title: 'Room Reservation No Show',
    category: 'reservation',
    message: `Your reservation for ${roomName} ending at ${formatManilaDateTime(reservation.end_at)} was marked No Show. If you attended, contact Library staff to correct the status.`,
    relatedId: reservation.id,
    eventKey: `reservation:${reservation.id}:status:No Show:${reservation.updated_at}`,
    officeName: 'Library',
    transaction: `Room reservation for ${roomName}`,
  })
}

async function checkOverdueLibraryReservations() {
  if (sweepInProgress) return
  sweepInProgress = true

  const now = new Date()
  const cutoff = now.toISOString()
  const notificationAttempts = new Set()
  try {
    const adminClient = getAdminClient()
    // Staff marking a reservation completed is the existing attendance record.
    const { data: overdueReservations, error: queryError } = await adminClient
      .from('reservations')
      .select('id')
      .eq('status', 'confirmed')
      .not('room_id', 'is', null)
      .lt('end_at', cutoff)

    if (queryError) throw queryError

    for (const reservation of overdueReservations || []) {
      const { data: updated, error: updateError } = await adminClient
        .from('reservations')
        .update({
          status: 'no_show',
          updated_at: now.toISOString(),
        })
        .eq('id', reservation.id)
        .eq('status', 'confirmed')
        .not('room_id', 'is', null)
        .lt('end_at', cutoff)
        .select('id, student_id, end_at, updated_at, rooms(name)')
        .maybeSingle()

      if (updateError) {
        console.error('Could not mark overdue Library reservation as No Show:', updateError)
      } else if (updated) {
        console.info(`Marked overdue Library room reservation ${updated.id} as No Show.`)
        notificationAttempts.add(updated.id)
        try {
          await notifyNoShow(adminClient, updated)
        } catch (error) {
          console.error(`Could not notify the student for No Show reservation ${updated.id}:`, error)
        }
      }
    }

    const { data: noShowReservations, error: noShowError } = await adminClient
      .from('reservations')
      .select('id, student_id, room_id, end_at, updated_at, rooms(name)')
      .eq('status', 'no_show')
      .not('room_id', 'is', null)
      .lt('end_at', cutoff)

    if (noShowError) throw noShowError

    for (const reservation of noShowReservations || []) {
      if (notificationAttempts.has(reservation.id)) continue
      try {
        await notifyNoShow(adminClient, reservation)
      } catch (error) {
        console.error(`Could not notify the student for No Show reservation ${reservation.id}:`, error)
      }
    }
  } catch (error) {
    console.error('Library room reservation No Show sweep failed:', error)
  } finally {
    sweepInProgress = false
  }
}

export function startReservationNoShowScheduler() {
  if (schedulerTimer) return schedulerTimer

  schedulerTimer = setInterval(() => {
    void checkOverdueLibraryReservations()
  }, sweepIntervalMs)
  schedulerTimer.unref()
  void checkOverdueLibraryReservations()

  return schedulerTimer
}
