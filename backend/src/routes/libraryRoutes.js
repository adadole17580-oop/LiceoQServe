import express from 'express'
import { authenticateUser, requireRole } from '../middleware/auth.js'
import { getAdminClient } from '../supabase.js'
import { createStudentNotification } from '../utils/studentNotifications.js'

const router = express.Router()
const LIBRARY_BORROW_SERVICE_ID = '99a740ad-96d7-43a5-9bcc-3f9723cabd28'

async function requireLibraryOffice(req, res, next) {
  if (req.profile.role === 'admin') return next()

  try {
    const { data: libraryOffice, error } = await getAdminClient()
      .from('offices')
      .select('id')
      .eq('name', 'Library')
      .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })
    if (!libraryOffice || req.profile.office_id !== libraryOffice.id) {
      return res.status(403).json({ error: 'Only Library staff may manage book loans.' })
    }
    return next()
  } catch (err) {
    console.error('Error verifying Library staff office:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
}

router.get('/books', async (req, res) => {
  const { query, category } = req.query

  try {
    const adminClient = getAdminClient()
    let dbQuery = adminClient
      .from('library_books')
      .select('id, title, author, isbn, category, available_copies, total_copies, is_active')
      .eq('is_active', true)
      .gt('available_copies', 0)
      .order('title', { ascending: true })

    if (query) {
      dbQuery = dbQuery.or(`title.ilike.%${query}%,author.ilike.%${query}%,isbn.ilike.%${query}%`)
    }

    if (category) {
      dbQuery = dbQuery.eq('category', category)
    }

    const { data: books, error } = await dbQuery

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({ books })
  } catch (err) {
    console.error('Error fetching books:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/borrow-request', authenticateUser, async (req, res) => {
  const { bookId, remarks } = req.body

  if (req.profile?.role !== 'student') {
    return res.status(403).json({ error: 'Only students can submit Library book borrowing requests.' })
  }

  if (!bookId) {
    return res.status(400).json({ error: 'Book ID is required.' })
  }

  try {
    const adminClient = getAdminClient()

    const { data: book, error: bookError } = await adminClient
      .from('library_books')
      .select('id, title, author, isbn, available_copies, is_active')
      .eq('id', bookId)
      .single()

    if (bookError || !book || !book.is_active) {
      return res.status(404).json({ error: 'Book not found in library catalog.' })
    }

    if (book.available_copies <= 0) {
      return res.status(400).json({
        error: `All copies of "${book.title}" are currently on loan. Please check back later.`,
      })
    }

    const { data: service, error: serviceError } = await adminClient
      .from('office_services')
      .select('id, name, office_id, offices!inner(name)')
      .eq('id', LIBRARY_BORROW_SERVICE_ID)
      .eq('offices.name', 'Library')
      .eq('offices.is_active', true)
      .eq('is_active', true)
      .ilike('name', '%borrow%')
      .maybeSingle()

    if (serviceError) {
      return res.status(500).json({ error: serviceError.message })
    }
    if (!service) {
      return res.status(400).json({ error: 'The Library borrowing service is not configured. Please contact Library staff.' })
    }

    const requestTitle = `Book Borrow Request: ${book.title}`
    const { data: existingRequest, error: duplicateCheckError } = await adminClient
      .from('service_requests')
      .select('id, request_type, title, details, status, submitted_at')
      .eq('student_id', req.user.id)
      .eq('service_id', service.id)
      .eq('title', requestTitle)
      .in('status', ['pending', 'processing', 'ready_for_pickup', 'Submitted', 'Processing', 'Ready for Pickup'])
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (duplicateCheckError) {
      console.error('Failed to check for a duplicate Library book request:', duplicateCheckError)
      return res.status(500).json({ error: 'Could not verify whether this book was already requested. Please try again.' })
    }

    if (existingRequest) {
      return res.status(200).json({
        message: `Your request to borrow "${book.title}" is already awaiting Library staff review.`,
        request: existingRequest,
      })
    }

    const safeRemarks = typeof remarks === 'string' ? remarks.trim() : ''
    const { data: newRequest, error: requestError } = await adminClient
      .from('service_requests')
      .insert({
        student_id: req.user.id,
        service_id: service.id,
        book_id: book.id,
        request_type: service.name,
        title: requestTitle,
        details: `Accession/ISBN: ${book.isbn || book.id}. Author: ${book.author || 'Not listed'}. Remarks: ${safeRemarks || 'None'}`,
        status: 'pending',
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (requestError) {
      return res.status(500).json({ error: requestError.message })
    }

    res.status(201).json({
      message: `Your request to borrow "${book.title}" has been submitted for Library staff review.`,
      request: newRequest,
    })
  } catch (err) {
    console.error('Error submitting borrow request:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/return-request', authenticateUser, async (req, res) => {
  const { loanId } = req.body || {}
  if (!loanId) {
    return res.status(400).json({ error: 'Loan ID is required.' })
  }

  try {
    const adminClient = getAdminClient()
    const { data: loan, error: loanError } = await adminClient
      .from('book_loans')
      .select('id, book_id, student_id, status, returned_at, library_books(id, title, author, isbn)')
      .eq('id', loanId)
      .eq('student_id', req.user.id)
      .maybeSingle()

    if (loanError) return res.status(500).json({ error: loanError.message })
    if (!loan) {
      return res.status(404).json({ error: 'The selected loan was not found for this student.' })
    }
    if (String(loan.status || '').trim().toLowerCase() !== 'borrowed' || loan.returned_at) {
      return res.status(409).json({ error: 'Only an active borrowed book can be returned.' })
    }

    const { data: existingRequest, error: duplicateCheckError } = await adminClient
      .from('service_requests')
      .select('id')
      .eq('student_id', req.user.id)
      .eq('book_loan_id', loan.id)
      .in('status', ['pending', 'processing'])
      .maybeSingle()

    if (duplicateCheckError) {
      return res.status(500).json({ error: duplicateCheckError.message })
    }
    if (existingRequest) {
      return res.status(409).json({ error: 'A return request for this book is already being processed.' })
    }

    const { data: service, error: serviceError } = await adminClient
      .from('office_services')
      .select('id, name, offices!inner(name, is_active)')
      .eq('id', LIBRARY_BORROW_SERVICE_ID)
      .eq('offices.name', 'Library')
      .eq('offices.is_active', true)
      .eq('is_active', true)
      .maybeSingle()

    if (serviceError) return res.status(500).json({ error: serviceError.message })
    if (!service) {
      return res.status(400).json({ error: 'The Library return-request service is not configured. Please contact Library staff.' })
    }

    const { data: requestId, error: insertError } = await req.userScopedSupabase
      .rpc('create_library_return_request', {
        p_loan_id: loan.id,
        p_return_service_id: service.id,
      })

    if (insertError?.code === 'P0001') {
      return res.status(409).json({ error: insertError.message })
    }
    if (insertError) return res.status(500).json({ error: insertError.message })
    if (typeof requestId !== 'string' || !requestId) {
      return res.status(500).json({ error: 'The return-request RPC did not return the submitted request ID.' })
    }

    const { data: request, error: requestFetchError } = await adminClient
      .from('service_requests')
      .select('id, title, status, submitted_at')
      .eq('id', requestId)
      .maybeSingle()
    if (requestFetchError) return res.status(500).json({ error: requestFetchError.message })
    if (!request) return res.status(500).json({ error: 'The return request was created but could not be retrieved.' })

    return res.status(201).json({
      message: `Your return request for "${loan.library_books.title}" has been submitted to the Library.`,
      request,
    })
  } catch (err) {
    console.error('Error submitting book return request:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

router.get('/staff-return-requests', authenticateUser, requireRole(['staff', 'admin']), requireLibraryOffice, async (_req, res) => {
  try {
    const adminClient = getAdminClient()
    const { data: libraryOffice, error: officeError } = await adminClient
      .from('offices')
      .select('id')
      .eq('name', 'Library')
      .maybeSingle()
    if (officeError) return res.status(500).json({ error: officeError.message })
    if (!libraryOffice) return res.status(404).json({ error: 'The Library office is not configured.' })

    const { data: requests, error: requestError } = await adminClient
      .from('service_requests')
      .select('id, student_id, book_id, book_loan_id, title, details, status, submitted_at, profiles:profiles!service_requests_student_id_fkey(full_name, student_id), office_services!inner(office_id)')
      .eq('office_services.office_id', libraryOffice.id)
      .ilike('title', 'Book Return Request:%')
      .in('status', ['pending', 'processing'])
      .order('submitted_at', { ascending: true })
    if (requestError) return res.status(500).json({ error: requestError.message })

    const loanIds = [...new Set((requests || []).map((request) => request.book_loan_id).filter(Boolean))]
    let loansById = new Map()
    if (loanIds.length) {
      const { data: loans, error: loansError } = await adminClient
        .from('book_loans')
        .select('id, book_id, student_id, status, borrowed_at, due_at, returned_at, library_books(title, author, isbn)')
        .in('id', loanIds)
      if (loansError) return res.status(500).json({ error: loansError.message })
      loansById = new Map((loans || []).map((loan) => [loan.id, loan]))
    }

    return res.json({
      requests: (requests || []).map((request) => ({
        ...request,
        loan: loansById.get(request.book_loan_id) || null,
      })),
    })
  } catch (err) {
    console.error('Error fetching Library book return requests:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/reject-borrow-request', authenticateUser, requireRole(['staff', 'admin']), requireLibraryOffice, async (req, res) => {
  const { requestId } = req.body || {}
  if (!requestId) return res.status(400).json({ error: 'Request ID is required.' })

  try {
    const adminClient = getAdminClient()
    const { data: request, error: requestError } = await adminClient
      .from('service_requests')
      .select('id, student_id, title, status, updated_at, service_id, office_services!inner(office_id)')
      .eq('id', requestId)
      .maybeSingle()
    if (requestError) return res.status(500).json({ error: requestError.message })
    if (!request || !String(request.title || '').startsWith('Book Borrow Request:')) {
      return res.status(404).json({ error: 'Library borrowing request not found.' })
    }

    const { data: libraryOffice, error: officeError } = await adminClient
      .from('offices')
      .select('id')
      .eq('name', 'Library')
      .maybeSingle()
    if (officeError) return res.status(500).json({ error: officeError.message })
    if (!libraryOffice || request.office_services.office_id !== libraryOffice.id) {
      return res.status(403).json({ error: 'The borrowing request does not belong to the Library.' })
    }

    const currentStatus = String(request.status || '').trim().toLowerCase()
    if (!['pending', 'processing'].includes(currentStatus)) {
      return res.status(409).json({ error: 'Only a pending borrowing request can be rejected.' })
    }

    const updatedAt = new Date().toISOString()
    const { data: updated, error: updateError } = await adminClient
      .from('service_requests')
      .update({ status: 'rejected', handled_by: req.user.id, updated_at: updatedAt })
      .eq('id', request.id)
      .eq('status', request.status)
      .select('id, student_id, title, status, updated_at')
      .maybeSingle()
    if (updateError) return res.status(500).json({ error: updateError.message })
    if (!updated) return res.status(409).json({ error: 'This borrowing request changed. Refresh and try again.' })

    await createStudentNotification({
      adminClient,
      recipientId: updated.student_id,
      title: 'Book Request Rejected',
      category: 'library',
      message: `Your request to borrow "${updated.title.replace('Book Borrow Request: ', '')}" was rejected by Library staff.`,
      relatedId: updated.id,
      eventKey: `book-request:${updated.id}:status:rejected:${updated.updated_at}`,
      officeName: 'Library',
      transaction: updated.title,
    })
    return res.json({ message: 'The borrowing request was rejected.', request: updated })
  } catch (err) {
    console.error('Error rejecting Library book request:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/issue-loan', authenticateUser, requireRole(['staff', 'admin']), requireLibraryOffice, async (req, res) => {
  const { requestId, studentId, dueDate } = req.body || {}

  if (!requestId || !studentId || !dueDate) {
    return res.status(400).json({
      error: 'requestId, studentId, and dueDate are required to issue a loan.',
    })
  }

  const parsedDueDate = new Date(dueDate)
  if (Number.isNaN(parsedDueDate.getTime()) || parsedDueDate <= new Date()) {
    return res.status(400).json({ error: 'Due date must be a valid date in the future.' })
  }

  try {
    const adminClient = getAdminClient()
    const { data: request, error: requestError } = await adminClient
      .from('service_requests')
      .select('id, student_id, book_id, title, status, service_id, office_services!inner(office_id)')
      .eq('id', requestId)
      .maybeSingle()
    if (requestError) return res.status(500).json({ error: requestError.message })
    if (
      !request ||
      request.student_id !== studentId ||
      request.service_id !== LIBRARY_BORROW_SERVICE_ID ||
      !String(request.title || '').startsWith('Book Borrow Request:')
    ) {
      return res.status(404).json({ error: 'The matching Library book borrowing request was not found.' })
    }
    if (request.office_services?.office_id !== req.profile.office_id && req.profile.role !== 'admin') {
      return res.status(403).json({ error: 'The borrowing request does not belong to the Library.' })
    }

    const originalStatus = String(request.status || '').trim().toLowerCase()
    if (['cancelled', 'rejected'].includes(originalStatus)) {
      return res.status(409).json({ error: `This borrowing request is already ${originalStatus}.` })
    }
    if (!['pending', 'processing', 'confirmed'].includes(originalStatus)) {
      return res.status(409).json({ error: `This borrowing request is already ${request.status}.` })
    }
    if (!request.book_id) {
      return res.status(400).json({ error: 'The borrowing request does not contain its selected book ID.' })
    }

    const { data: loanId, error: approvalError } = await req.userScopedSupabase.rpc('approve_library_borrow_request', {
      p_request_id: requestId,
      p_due_at: parsedDueDate.toISOString(),
    })
    if (approvalError) {
      console.error('Library book approval RPC failed:', approvalError)
      return res.status(500).json({ error: approvalError.message })
    }
    if (typeof loanId !== 'string' || !loanId) {
      return res.status(500).json({ error: 'The approval RPC did not return the issued loan ID.' })
    }

    const loanSelection = 'id, book_id, student_id, source_request_id, status, borrowed_at, due_at, returned_at, library_books(title, author, isbn)'
    const { data: loan, error: loanError } = await adminClient
      .from('book_loans')
      .select(loanSelection)
      .eq('id', loanId)
      .eq('source_request_id', requestId)
      .maybeSingle()
    if (loanError) return res.status(500).json({ error: loanError.message })
    if (!loan || loan.student_id !== studentId || loan.book_id !== request.book_id) {
      return res.status(500).json({ error: 'The approval RPC returned a loan that does not match the borrowing request.' })
    }
    if (String(loan.status || '').trim().toLowerCase() !== 'borrowed') {
      return res.status(409).json({ error: `The linked loan is already ${loan.status}.` })
    }

    const { data: confirmedRequest, error: confirmedRequestError } = await adminClient
      .from('service_requests')
      .select('status')
      .eq('id', requestId)
      .maybeSingle()
    if (confirmedRequestError) return res.status(500).json({ error: confirmedRequestError.message })
    if (String(confirmedRequest?.status || '').trim().toLowerCase() !== 'confirmed') {
      return res.status(500).json({ error: 'The approval RPC did not confirm the borrowing request.' })
    }

    const bookTitle = loan.library_books?.title || request.title.replace('Book Borrow Request: ', '')
    await createStudentNotification({
      adminClient,
      recipientId: studentId,
      title: 'Book Issued',
      category: 'library',
      message: `"${bookTitle}" has been issued to you. Due date: ${new Date(loan.due_at).toLocaleDateString()}.`,
      relatedId: loan.id,
      eventKey: `book-loan:${loan.id}:issued`,
      officeName: 'Library',
      transaction: `Library book loan: ${bookTitle}`,
    })

    return res.status(200).json({
      message: `Book loan confirmed for "${bookTitle}".`,
      loan,
      requestStatus: 'confirmed',
    })
  } catch (err) {
    console.error('Error issuing book loan:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/return-book', authenticateUser, requireRole(['staff', 'admin']), requireLibraryOffice, async (req, res) => {
  const { requestId } = req.body || {}
  if (!requestId) return res.status(400).json({ error: 'Return request ID is required.' })

  try {
    const adminClient = getAdminClient()
    const { data: request, error: requestError } = await adminClient
      .from('service_requests')
      .select('id, student_id, book_id, book_loan_id, title, status, updated_at, service_id, office_services!inner(office_id)')
      .eq('id', requestId)
      .maybeSingle()
    if (requestError) return res.status(500).json({ error: requestError.message })
    if (!request || !String(request.title || '').startsWith('Book Return Request:') || !request.book_loan_id) {
      return res.status(404).json({ error: 'The linked Library return request was not found.' })
    }

    const { data: libraryOffice, error: officeError } = await adminClient
      .from('offices')
      .select('id')
      .eq('name', 'Library')
      .maybeSingle()
    if (officeError) return res.status(500).json({ error: officeError.message })
    if (!libraryOffice || request.office_services.office_id !== libraryOffice.id) {
      return res.status(403).json({ error: 'The return request does not belong to the Library.' })
    }

    if (String(request.status || '').trim().toLowerCase() === 'completed') {
      return res.json({ message: 'This return request has already been completed.' })
    }
    if (!['pending', 'processing'].includes(String(request.status || '').trim().toLowerCase())) {
      return res.status(409).json({ error: `This return request is already ${request.status}.` })
    }

    const { data: loan, error: loanError } = await adminClient
      .from('book_loans')
      .select('id, student_id, book_id, status, returned_at, library_books(title)')
      .eq('id', request.book_loan_id)
      .maybeSingle()
    if (loanError) return res.status(500).json({ error: loanError.message })
    if (!loan || loan.student_id !== request.student_id || loan.book_id !== request.book_id) {
      return res.status(409).json({ error: 'The return request is not linked to the student’s matching loan.' })
    }

    const loanStatus = String(loan.status || '').trim().toLowerCase()
    if (!['borrowed', 'returned'].includes(loanStatus)) {
      return res.status(409).json({ error: `This loan is already ${loan.status} and cannot be returned again.` })
    }

    const claimTime = new Date().toISOString()
    const { data: claimedRequest, error: claimError } = await adminClient
      .from('service_requests')
      .update({ status: 'processing', handled_by: req.user.id, updated_at: claimTime })
      .eq('id', request.id)
      .eq('status', request.status)
      .eq('updated_at', request.updated_at)
      .select('id')
      .maybeSingle()
    if (claimError) return res.status(500).json({ error: claimError.message })
    if (!claimedRequest) {
      const { data: latestRequest, error: latestError } = await adminClient
        .from('service_requests')
        .select('status')
        .eq('id', request.id)
        .maybeSingle()
      if (latestError) return res.status(500).json({ error: latestError.message })
      if (String(latestRequest?.status || '').trim().toLowerCase() === 'completed') {
        return res.json({ message: 'This return request has already been completed.' })
      }
      return res.status(409).json({ error: 'This return request is being handled by another staff member. Refresh and try again.' })
    }

    const { data: newlyCompleted, error: returnError } = await req.userScopedSupabase.rpc('confirm_library_book_return', {
      p_return_request_id: request.id,
    })
    if (returnError) {
      const { error: restoreError } = await adminClient
        .from('service_requests')
        .update({ status: request.status, updated_at: new Date().toISOString() })
        .eq('id', request.id)
        .eq('status', 'processing')
        .eq('updated_at', claimTime)
      if (restoreError) console.error('Could not restore a failed Library return request:', restoreError)
      console.error('Library book return RPC failed:', returnError)
      return res.status(500).json({ error: returnError.message })
    }
    if (typeof newlyCompleted !== 'boolean') {
      return res.status(500).json({ error: 'The return RPC did not report its completion result.' })
    }

    const { data: returnedLoan, error: returnedLoanError } = await adminClient
      .from('book_loans')
      .select('id, student_id, book_id, status, returned_at, library_books(title)')
      .eq('id', loan.id)
      .maybeSingle()
    if (returnedLoanError) return res.status(500).json({ error: returnedLoanError.message })
    if (String(returnedLoan?.status || '').trim().toLowerCase() !== 'returned') {
      return res.status(500).json({ error: 'The Library return operation did not mark the loan as returned.' })
    }

    const { data: completedRequest, error: completeError } = await adminClient
      .from('service_requests')
      .select('status, updated_at')
      .eq('id', request.id)
      .maybeSingle()
    if (completeError) return res.status(500).json({ error: completeError.message })
    if (String(completedRequest?.status || '').trim().toLowerCase() !== 'completed') {
      return res.status(500).json({ error: 'The return RPC did not complete the return request.' })
    }

    if (newlyCompleted) {
      const bookTitle = returnedLoan.library_books?.title || 'Library Book'
      await createStudentNotification({
        adminClient,
        recipientId: request.student_id,
        title: 'Book Return Confirmed',
        category: 'library',
        message: `Library staff confirmed receipt of "${bookTitle}". The loan is now returned.`,
        relatedId: request.id,
        eventKey: `book-return-request:${request.id}:completed:${completedRequest.updated_at}`,
        officeName: 'Library',
        transaction: `Library book return: ${bookTitle}`,
      })

    }

    return res.json({
      message: `Library staff confirmed receipt of "${returnedLoan.library_books?.title || 'the book'}".`,
      requestStatus: 'completed',
      loanStatus: 'returned',
    })
  } catch (err) {
    console.error('Error confirming Library book return:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/reject-return-request', authenticateUser, requireRole(['staff', 'admin']), requireLibraryOffice, async (req, res) => {
  const { requestId } = req.body || {}
  if (!requestId) return res.status(400).json({ error: 'Return request ID is required.' })

  try {
    const adminClient = getAdminClient()
    const { data: request, error: requestError } = await adminClient
      .from('service_requests')
      .select('id, student_id, title, status, updated_at, office_services!inner(office_id)')
      .eq('id', requestId)
      .maybeSingle()
    if (requestError) return res.status(500).json({ error: requestError.message })
    if (!request || !String(request.title || '').startsWith('Book Return Request:')) {
      return res.status(404).json({ error: 'Library return request not found.' })
    }

    const { data: libraryOffice, error: officeError } = await adminClient
      .from('offices')
      .select('id')
      .eq('name', 'Library')
      .maybeSingle()
    if (officeError) return res.status(500).json({ error: officeError.message })
    if (!libraryOffice || request.office_services.office_id !== libraryOffice.id) {
      return res.status(403).json({ error: 'The return request does not belong to the Library.' })
    }
    if (String(request.status || '').trim().toLowerCase() !== 'pending') {
      return res.status(409).json({ error: 'Only a pending return request can be rejected.' })
    }

    const updatedAt = new Date().toISOString()
    const { data: updated, error: updateError } = await adminClient
      .from('service_requests')
      .update({ status: 'rejected', handled_by: req.user.id, updated_at: updatedAt })
      .eq('id', request.id)
      .eq('status', request.status)
      .eq('updated_at', request.updated_at)
      .select('id, student_id, title, status, updated_at')
      .maybeSingle()
    if (updateError) return res.status(500).json({ error: updateError.message })
    if (!updated) return res.status(409).json({ error: 'This return request changed. Refresh and try again.' })

    await createStudentNotification({
      adminClient,
      recipientId: updated.student_id,
      title: 'Book Return Request Rejected',
      category: 'library',
      message: `The Library could not confirm the return request for "${updated.title.replace('Book Return Request: ', '')}". The loan remains active until the book is physically received.`,
      relatedId: updated.id,
      eventKey: `book-return-request:${updated.id}:rejected:${updated.updated_at}`,
      officeName: 'Library',
      transaction: updated.title,
    })
    return res.json({ message: 'The return request was rejected. The book loan remains active.' })
  } catch (err) {
    console.error('Error rejecting Library book return request:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

router.get('/staff-loans', authenticateUser, requireRole(['staff', 'admin']), requireLibraryOffice, async (_req, res) => {
  try {
    const { data: loans, error } = await getAdminClient()
      .from('book_loans')
      .select('id, student_id, book_id, source_request_id, status, borrowed_at, due_at, returned_at, profiles(full_name, student_id), library_books(title, isbn)')
      .eq('status', 'borrowed')
      .order('due_at', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ loans })
  } catch (err) {
    console.error('Error fetching Library staff loans:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

router.get('/my-loans', authenticateUser, async (req, res) => {
  try {
    const adminClient = getAdminClient()
    const { data: loans, error } = await adminClient
      .from('book_loans')
      .select('id, book_id, source_request_id, status, borrowed_at, due_at, returned_at, library_books(id, title, author, isbn)')
      .eq('student_id', req.user.id)
      .order('borrowed_at', { ascending: false })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({ loans })
  } catch (err) {
    console.error('Error fetching student loans:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

export default router