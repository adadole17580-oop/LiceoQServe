import express from 'express'
import { authenticateUser, requireRole } from '../middleware/auth.js'
import { getAdminClient } from '../supabase.js'

const router = express.Router()

router.get('/my', authenticateUser, async (req, res) => {
  try {
    const adminClient = getAdminClient()
    const { data: requests, error } = await adminClient
      .from('service_requests')
      .select('id, request_type, title, details, status, submitted_at, completed_at, updated_at, service_id, office_services(id, name, office_id, offices(id, name))')
      .eq('student_id', req.user.id)
      .order('submitted_at', { ascending: false })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({ requests })
  } catch (err) {
    console.error('Error fetching requests:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/submit', authenticateUser, async (req, res) => {
  const { serviceId, requestType, title, details } = req.body

  if (
    !serviceId ||
    typeof requestType !== 'string' ||
    !requestType.trim()
  ) {
    return res.status(400).json({ error: 'serviceId and requestType are required.' })
  }

  try {
    const adminClient = getAdminClient()

    const { data: service, error: serviceError } = await adminClient
      .from('office_services')
      .select('id, name, is_active, office_id, offices(id, name, is_active)')
      .eq('id', serviceId)
      .single()

    if (serviceError || !service || !service.is_active || !service.offices?.is_active) {
      return res.status(404).json({ error: 'Selected service is currently unavailable.' })
    }

    const officeName = service.offices.name

    if (officeName === 'Cashier') {
      return res.status(400).json({
        error: 'Cashier office does not process document requests. Please use the tuition payment queue.',
      })
    }

    if (requestType.trim() !== service.name) {
      return res.status(400).json({
        error: 'The selected request type does not match the active office service. Refresh the form and try again.',
      })
    }

    const now = new Date().toISOString()
    const requestTitle = title?.trim() || service.name
    const requestDetails = details?.trim() || requestTitle
    const { data: priorRequest, error: duplicateCheckError } = await adminClient
      .from('service_requests')
      .select('id, request_type, title, details, status, submitted_at, completed_at, updated_at, service_id')
      .eq('student_id', req.user.id)
      .eq('service_id', service.id)
      .eq('request_type', service.name)
      .eq('title', requestTitle)
      .eq('details', requestDetails)
      .in('status', ['pending', 'processing', 'ready_for_pickup', 'Submitted', 'Processing', 'Ready for Pickup'])
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (duplicateCheckError) {
      console.error('Failed to check for a retried service request:', duplicateCheckError)
      return res.status(500).json({ error: 'Could not verify whether this request was already submitted. Please try again.' })
    }

    if (priorRequest) {
      return res.status(200).json({
        message: 'This request was already submitted and is still being processed.',
        request: priorRequest,
      })
    }

    const { data: newRequest, error: insertError } = await adminClient
      .from('service_requests')
      .insert({
        student_id: req.user.id,
        service_id: service.id,
        request_type: service.name,
        title: requestTitle,
        details: requestDetails,
        status: 'pending',
        submitted_at: now,
      })
      .select()
      .single()

    if (insertError) {
      return res.status(500).json({ error: insertError.message })
    }

    res.status(201).json({
      message: 'Your request has been submitted successfully.',
      request: {
        ...newRequest,
        office: officeName,
        service: service.name,
      },
    })
  } catch (err) {
    console.error('Error submitting request:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/cancel-own', authenticateUser, async (req, res) => {
  const { requestId } = req.body
  if (!requestId) {
    return res.status(400).json({ error: 'Request ID is required.' })
  }

  try {
    const adminClient = getAdminClient()
    const { data: updatedRequest, error } = await adminClient
      .from('service_requests')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('student_id', req.user.id)
      .eq('status', 'pending')
      .select('id, status, updated_at')
      .maybeSingle()

    if (error) {
      return res.status(500).json({ error: error.message })
    }
    if (!updatedRequest) {
      return res.status(409).json({
        error: 'This request is no longer pending or cannot be cancelled.',
      })
    }

    return res.json({
      message: 'Your request was cancelled.',
      request: updatedRequest,
    })
  } catch (err) {
    console.error('Error cancelling student request:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/update-status', authenticateUser, requireRole(['staff', 'admin']), async (req, res) => {
  const { requestId, status, remarks } = req.body
  const validStatuses = ['pending', 'processing', 'ready_for_pickup', 'completed', 'cancelled']

  if (!requestId || !validStatuses.includes(status)) {
    return res.status(400).json({
      error: `Valid requestId and status (${validStatuses.join(', ')}) required.`,
    })
  }

  try {
    const adminClient = getAdminClient()

    const { data: existingRequest, error: requestLookupError } = await adminClient
      .from('service_requests')
      .select('id, office_services!inner(office_id)')
      .eq('id', requestId)
      .maybeSingle()

    if (requestLookupError) {
      return res.status(500).json({ error: requestLookupError.message })
    }
    if (!existingRequest) {
      return res.status(404).json({ error: 'Request not found.' })
    }
    if (req.profile.role !== 'admin' && existingRequest.office_services.office_id !== req.profile.office_id) {
      return res.status(403).json({ error: 'You are not authorized to manage requests for this office.' })
    }

    const now = new Date().toISOString()
    const updateData = {
      status,
      handled_by: req.user.id,
      updated_at: now,
    }

    if (status === 'completed') {
      updateData.completed_at = now
    }

    const { data: updated, error: updateError } = await adminClient
      .from('service_requests')
      .update(updateData)
      .eq('id', requestId)
      .select('id, student_id, title, status, service_id, office_services(name, offices(name))')
      .single()

    if (updateError) {
      return res.status(500).json({ error: updateError.message })
    }

    const notificationMessages = {
      processing: `Your request for "${updated.title}" is now being processed.`,
      ready_for_pickup: `Your document "${updated.title}" is ready for pickup at the ${updated.office_services?.offices?.name || 'office'}.`,
      completed: `Your request for "${updated.title}" has been marked as completed.`,
      cancelled: `Your request for "${updated.title}" was cancelled. ${remarks || ''}`.trim(),
    }

    if (notificationMessages[status]) {
      await adminClient.from('notifications').insert({
        recipient_id: updated.student_id,
        title: `Request ${status.replaceAll('_', ' ')}`,
        category: 'request',
        message: notificationMessages[status],
        is_read: false,
      })
    }

    if (status === 'completed') {
      await adminClient.from('service_history').insert({
        student_id: updated.student_id,
        service_id: updated.service_id,
        transaction_id: updated.id,
        transaction_type: 'Request',
        title: `${updated.office_services?.offices?.name || 'Campus'} Request: ${updated.title}`,
        completed_at: now,
      })
    }

    res.json({ message: `Request status updated to ${status}.`, request: updated })
  } catch (err) {
    console.error('Error updating request status:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

export default router