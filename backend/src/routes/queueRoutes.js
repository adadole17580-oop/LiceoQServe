import express from 'express'
import { authenticateUser, requireRole } from '../middleware/auth.js'
import { getAdminClient } from '../supabase.js'
import { formatQueueNumber } from '../utils/queueNumber.js'

const router = express.Router()

async function getServiceAndOffice(serviceId) {
  const adminClient = getAdminClient()
  const { data: service, error } = await adminClient
    .from('office_services')
    .select('id, name, office_id, service_type, is_active, offices(id, name, is_active)')
    .eq('id', serviceId)
    .single()

  if (error || !service) {
    return null
  }
  return service
}

router.get('/active', authenticateUser, async (req, res) => {
  try {
    const adminClient = getAdminClient()
    const { data: activeTickets, error } = await adminClient
      .from('queues')
      .select('id, student_id, handled_by, status, service_id, queue_number, called_at, created_at, office_services(id, name, office_id, offices(id, name))')
      .eq('student_id', req.user.id)
      .in('status', ['waiting', 'being_served'])
      .order('created_at', { ascending: false })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({
      activeTickets: activeTickets.map((ticket) => ({
        ...ticket,
        queue_number: formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name),
      })),
    })
  } catch (err) {
    console.error('Error fetching active queue:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/join', authenticateUser, async (req, res) => {
  const { serviceId, purposes } = req.body

  if (!serviceId) {
    return res.status(400).json({ error: 'Service ID is required.' })
  }

  try {
    const adminClient = getAdminClient()

    const service = await getServiceAndOffice(serviceId)
    if (!service || !service.is_active || !service.offices?.is_active) {
      return res.status(400).json({ error: 'Selected service is currently unavailable.' })
    }

    const officeName = service.offices.name

    if (officeName === 'Cashier') {
      const isTuitionService = /tuition|payment|account|balance/i.test(service.name)
      if (!isTuitionService) {
        return res.status(400).json({
          error: 'Cashier office supports tuition payment queueing only.',
        })
      }
    } else if (officeName === 'Registrar') {
    } else {
      return res.status(400).json({
        error: `${officeName} does not support queueing. Please book an appointment or submit a request instead.`,
      })
    }

    const { data: existingTickets, error: checkError } = await adminClient
      .from('queues')
      .select('id, queue_number, status, office_services!inner(office_id, name, offices(name))')
      .eq('student_id', req.user.id)
      .eq('office_services.office_id', service.office_id)
      .in('status', ['waiting', 'being_served'])

    if (checkError) {
      return res.status(500).json({ error: checkError.message })
    }

    if (existingTickets && existingTickets.length > 0) {
      const existingTicket = existingTickets[0]
      return res.status(200).json({
        message: `You already have an active ticket for the ${officeName}.`,
        ticket: {
          ...existingTicket,
          queue_number: formatQueueNumber(
            existingTicket.queue_number,
            existingTicket.office_services?.offices?.name,
          ),
          office: existingTicket.office_services?.offices?.name || officeName,
          service: existingTicket.office_services?.name || service.name,
        },
      })
    }

    const today = new Date().toISOString().slice(0, 10)

    const { count, error: countError } = await adminClient
      .from('queues')
      .select('id, office_services!inner(office_id)', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00Z`)
      .lte('created_at', `${today}T23:59:59Z`)
      .eq('office_services.office_id', service.office_id)

    if (countError) {
      console.error('Could not count today’s queue tickets:', countError)
      return res.status(500).json({ error: 'Could not generate a queue number. Please try again.' })
    }

    const sequenceNumber = (count || 0) + 1

    const { data: newTicket, error: insertError } = await adminClient
      .from('queues')
      .insert({
        student_id: req.user.id,
        service_id: service.id,
        queue_number: sequenceNumber,
        status: 'waiting',
      })
      .select('id, queue_number, status, created_at')
      .single()

    if (insertError) {
      return res.status(500).json({ error: insertError.message })
    }

    const { error: eventError } = await adminClient.from('queue_events').insert({
      queue_id: newTicket.id,
      event_type: 'joined',
    })
    if (eventError) {
      console.error('Queue ticket was created, but its join event could not be recorded:', eventError)
      return res.status(500).json({
        error: 'Your queue ticket was created, but its event could not be recorded. Retry to retrieve the existing ticket.',
      })
    }

    res.status(201).json({
      message: 'Queue number generated successfully.',
      ticket: {
        ...newTicket,
        queue_number: formatQueueNumber(newTicket.queue_number, officeName),
        office: officeName,
        service: service.name,
        purposes: purposes || [service.name],
      },
    })
  } catch (err) {
    console.error('Error joining queue:', err)
    res.status(500).json({ error: 'Internal server error while joining queue.' })
  }
})

router.post('/cancel', authenticateUser, async (req, res) => {
  const { queueId } = req.body
  if (!queueId) {
    return res.status(400).json({ error: 'Queue ID is required.' })
  }

  try {
    const adminClient = getAdminClient()

    const { data: ticket, error: fetchError } = await adminClient
      .from('queues')
      .select('id, student_id, status, queue_number, service_id, office_services(name, office_id, offices(name))')
      .eq('id', queueId)
      .single()

    if (fetchError || !ticket) {
      return res.status(404).json({ error: 'Queue ticket not found.' })
    }

    if (ticket.student_id !== req.user.id && req.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You can only cancel your own queue ticket.' })
    }

    if (!['waiting', 'being_served'].includes(ticket.status)) {
      return res.status(400).json({ error: `Cannot cancel a ticket that is already ${ticket.status}.` })
    }

    const { error: updateError } = await adminClient
      .from('queues')
      .update({
        status: 'cancelled',
        finished_at: new Date().toISOString(),
      })
      .eq('id', queueId)

    if (updateError) {
      return res.status(500).json({ error: updateError.message })
    }

    await adminClient.from('queue_events').insert({
      queue_id: queueId,
      event_type: 'cancelled',
    })

    res.json({
      message: `Queue ${formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name)} was cancelled.`,
    })
  } catch (err) {
    console.error('Error cancelling queue:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/call-next', authenticateUser, requireRole(['staff', 'admin']), async (req, res) => {
  const staffOfficeId = req.profile.office_id

  if (!staffOfficeId && req.profile.role !== 'admin') {
    return res.status(403).json({ error: 'Staff account has no office assigned.' })
  }

  try {
    const adminClient = getAdminClient()

    let servingQuery = adminClient
      .from('queues')
      .select('id, office_services!inner(office_id)')
      .eq('status', 'being_served')

    if (staffOfficeId) {
      servingQuery = servingQuery.eq('office_services.office_id', staffOfficeId)
    }

    const { data: servingTicket, error: servingError } = await servingQuery.limit(1).maybeSingle()
    if (servingError) return res.status(500).json({ error: servingError.message })
    if (servingTicket) {
      return res.status(409).json({ error: 'Finish or recall the currently serving ticket before calling another.' })
    }

    let query = adminClient
      .from('queues')
      .select('id, queue_number, student_id, status, service_id, office_services!inner(office_id, offices(name))')
      .eq('status', 'waiting')
      .order('created_at', { ascending: true })
      .limit(1)

    if (staffOfficeId) {
      query = query.eq('office_services.office_id', staffOfficeId)
    }

    const { data: tickets, error: fetchError } = await query

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message })
    }

    if (!tickets || tickets.length === 0) {
      return res.json({ message: 'No waiting tickets currently in the queue.', ticket: null })
    }

    const nextTicket = tickets[0]

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await adminClient
      .from('queues')
      .update({
        status: 'being_served',
        handled_by: req.user.id,
        called_at: now,
      })
      .eq('id', nextTicket.id)
      .eq('status', 'waiting')
      .select()
      .maybeSingle()

    if (updateError) {
      return res.status(500).json({ error: updateError.message })
    }
    if (!updated) {
      return res.status(409).json({ error: 'This waiting ticket was already called. Refresh the queue and try again.' })
    }

    await adminClient.from('queue_events').insert({
      queue_id: nextTicket.id,
      event_type: 'called',
    })

    await adminClient.from('notifications')    .insert({
      recipient_id: nextTicket.student_id,
      title: 'Your number is being served!',
      category: 'queue',
      message: `Your ticket ${formatQueueNumber(nextTicket.queue_number, nextTicket.office_services?.offices?.name)} is now being served at the counter.`,
      is_read: false,
    })

    res.json({
    message: `Ticket ${formatQueueNumber(nextTicket.queue_number, nextTicket.office_services?.offices?.name)} called.`,
    ticket: {
      ...updated,
      queue_number: formatQueueNumber(updated.queue_number, nextTicket.office_services?.offices?.name),
    },
    })
  } catch (err) {
    console.error('Error calling next ticket:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/recall', authenticateUser, requireRole(['staff', 'admin']), async (req, res) => {
  const { queueId } = req.body
  if (!queueId) return res.status(400).json({ error: 'Queue ID is required.' })

  try {
    const adminClient = getAdminClient()
    const { data: ticket, error: fetchError } = await adminClient
      .from('queues')
      .select('id, student_id, status, queue_number, office_services(office_id, offices(name))')
      .eq('id', queueId)
      .maybeSingle()

    if (fetchError) return res.status(500).json({ error: fetchError.message })
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' })
    if (ticket.status !== 'being_served') {
      return res.status(400).json({ error: 'Only a currently serving ticket can be recalled.' })
    }
    if (
      req.profile.role !== 'admin' &&
      (!req.profile.office_id || ticket.office_services?.office_id !== req.profile.office_id)
    ) {
      return res.status(403).json({ error: 'You are not authorized to recall tickets for this office.' })
    }

    const { error: notificationError } = await adminClient.from('notifications').insert({
      recipient_id: ticket.student_id,
      title: 'Your queue number is being recalled',
      category: 'queue',
      message: `Please proceed to the counter. Your ticket ${formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name)} is still being served.`,
      is_read: false,
    })

    if (notificationError) {
      return res.status(500).json({ error: notificationError.message })
    }

    return res.json({
      message: `Ticket ${formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name)} recalled.`,
    })
  } catch (err) {
    console.error('Error recalling queue ticket:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/complete', authenticateUser, requireRole(['staff', 'admin']), async (req, res) => {
  const { queueId, outcome } = req.body
  const finalStatus = outcome

  if (!queueId || !['finished', 'skipped'].includes(outcome)) {
    return res.status(400).json({ error: 'Queue ID and a valid outcome (finished or skipped) are required.' })
  }

  try {
    const adminClient = getAdminClient()

    const { data: ticket, error: fetchError } = await adminClient
      .from('queues')
      .select('id, student_id, status, queue_number, service_id, office_services(name, office_id, offices(name))')
      .eq('id', queueId)
      .single()

    if (fetchError || !ticket) {
      return res.status(404).json({ error: 'Ticket not found.' })
    }

    if (
      req.profile.role !== 'admin' &&
      (!req.profile.office_id || ticket.office_services?.office_id !== req.profile.office_id)
    ) {
      return res.status(403).json({ error: 'Forbidden: You cannot complete tickets for another office.' })
    }
    if (ticket.status !== 'being_served') {
      return res.status(400).json({ error: 'Only the currently serving ticket can be completed.' })
    }

    const now = new Date().toISOString()
    const { data: completedTicket, error: updateError } = await adminClient
      .from('queues')
      .update({
        status: finalStatus,
        finished_at: now,
      })
      .eq('id', queueId)
      .eq('status', 'being_served')
      .select('id')
      .maybeSingle()

    if (updateError) {
      return res.status(500).json({ error: updateError.message })
    }
    if (!completedTicket) {
      return res.status(409).json({ error: 'This queue ticket is no longer being served. Refresh the queue and try again.' })
    }

    await adminClient.from('queue_events').insert({
      queue_id: queueId,
      event_type: finalStatus.toLowerCase(),
    })

    if (finalStatus === 'finished') {
      const { error: historyError } = await adminClient.from('service_history').insert({
        student_id: ticket.student_id,
        service_id: ticket.service_id,
        transaction_id: ticket.id,
        transaction_type: 'Queue',
        title: `${ticket.office_services?.offices?.name || 'Campus'} Queue (${formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name)})`,
        completed_at: now,
      })

      if (historyError) {
        console.error('Failed to add completed queue ticket to history:', historyError)
      }
    }

    if (finalStatus === 'skipped') {
      return res.json({
        message: `Queue ${formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name)} was marked as skipped. Call the next ticket when ready.`,
      })
    }

    const { data: currentServingTicket, error: servingCheckError } = await adminClient
      .from('queues')
      .select('id, queue_number, office_services!inner(office_id, offices(name))')
      .eq('status', 'being_served')
      .eq('office_services.office_id', ticket.office_services?.office_id)
      .limit(1)
      .maybeSingle()

    if (servingCheckError) {
      console.error('Ticket finished, but the current serving ticket could not be verified:', servingCheckError)
      return res.status(500).json({
        error: `Ticket ${formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name)} was marked ${finalStatus}, but the next ticket could not be called.`,
      })
    }

    if (currentServingTicket) {
      return res.json({
        message: `Queue ${formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name)} marked as ${finalStatus}. Ticket ${formatQueueNumber(currentServingTicket.queue_number, ticket.office_services?.offices?.name)} is now serving.`,
      })
    }

    const { data: waitingTickets, error: nextFetchError } = await adminClient
      .from('queues')
      .select('id, student_id, queue_number, office_services!inner(office_id, offices(name))')
      .eq('status', 'waiting')
      .eq('office_services.office_id', ticket.office_services?.office_id)
      .order('created_at', { ascending: true })
      .limit(1)

    if (nextFetchError) {
      console.error('Ticket finished, but the next queue ticket could not be fetched:', nextFetchError)
      return res.status(500).json({
        error: `Ticket ${formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name)} was marked ${finalStatus}, but the next ticket could not be called.`,
      })
    }

    let nextTicket = null
    if (waitingTickets?.length) {
      const waitingTicket = waitingTickets[0]
      const { data: calledTicket, error: callError } = await adminClient
        .from('queues')
        .update({
          status: 'being_served',
          handled_by: req.user.id,
          called_at: new Date().toISOString(),
        })
        .eq('id', waitingTicket.id)
        .eq('status', 'waiting')
        .select('id, student_id, queue_number')
        .maybeSingle()

      if (callError) {
        console.error('Ticket finished, but the next queue ticket could not be advanced:', callError)
        return res.status(500).json({
          error: `Ticket ${formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name)} was marked ${finalStatus}, but the next ticket could not be called.`,
        })
      }

      if (calledTicket) {
        nextTicket = calledTicket
        const { error: nextEventError } = await adminClient.from('queue_events').insert({
          queue_id: calledTicket.id,
          event_type: 'called',
        })
        const { error: nextNotificationError } = await adminClient.from('notifications').insert({
          recipient_id: calledTicket.student_id,
          title: 'Your number is being served!',
          category: 'queue',
          message: `Your ticket ${formatQueueNumber(calledTicket.queue_number, ticket.office_services?.offices?.name)} is now being served at the counter.`,
          is_read: false,
        })

        if (nextEventError || nextNotificationError) {
          console.error('Next ticket was called, but its event or notification could not be recorded:', {
            eventError: nextEventError,
            notificationError: nextNotificationError,
          })
          return res.status(500).json({
            error: `Ticket ${formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name)} was marked ${finalStatus} and ${formatQueueNumber(calledTicket.queue_number, ticket.office_services?.offices?.name)} is serving, but the queue update could not be fully recorded.`,
          })
        }
      }
    }

    res.json({
      message: nextTicket
        ? `Queue ${formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name)} marked as ${finalStatus}. Ticket ${formatQueueNumber(nextTicket.queue_number, ticket.office_services?.offices?.name)} is now serving.`
        : `Queue ${formatQueueNumber(ticket.queue_number, ticket.office_services?.offices?.name)} marked as ${finalStatus}. No other students are waiting.`,
    })
  } catch (err) {
    console.error('Error completing queue ticket:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

export default router