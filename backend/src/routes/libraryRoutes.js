import express from 'express'
import { authenticateUser, requireRole } from '../middleware/auth.js'
import { getAdminClient } from '../supabase.js'

const router = express.Router()

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

    const { data: newRequest, error: requestError } = await adminClient
      .from('service_requests')
      .insert({
        student_id: req.user.id,
        service_id: service.id,
        request_type: service.name,
        title: `Book Borrow Request: ${book.title}`,
        details: `Accession/ISBN: ${book.isbn || book.id}. Author: ${book.author}. Remarks: ${remarks || 'None'}`,
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
  const query = typeof req.body?.book === 'string' ? req.body.book.trim() : ''
  if (!query) {
    return res.status(400).json({ error: 'Enter the borrowed book title or ISBN.' })
  }

  try {
    const adminClient = getAdminClient()
    const { data: loans, error: loanError } = await adminClient
      .from('book_loans')
      .select('id, status, library_books(id, title, isbn)')
      .eq('student_id', req.user.id)
      .eq('status', 'Borrowed')

    if (loanError) return res.status(500).json({ error: loanError.message })

    const normalizedQuery = query.toLowerCase()
    const loan = (loans || []).find((item) => (
      item.library_books?.title?.toLowerCase() === normalizedQuery ||
      item.library_books?.isbn?.toLowerCase() === normalizedQuery
    ))

    if (!loan) {
      return res.status(404).json({ error: 'No active borrowed book matches that title or ISBN.' })
    }

    const requestTitle = `Book Return Request: ${loan.library_books.title}`
    const { data: existingRequest, error: duplicateCheckError } = await adminClient
      .from('service_requests')
      .select('id')
      .eq('student_id', req.user.id)
      .eq('title', requestTitle)
      .in('status', ['pending', 'processing', 'Submitted', 'Processing'])
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
      .eq('offices.name', 'Library')
      .eq('offices.is_active', true)
      .eq('is_active', true)
      .ilike('name', '%return%')
      .maybeSingle()

    if (serviceError) return res.status(500).json({ error: serviceError.message })
    if (!service) {
      return res.status(400).json({ error: 'The Library return-request service is not configured. Please contact Library staff.' })
    }

    const { data: request, error: insertError } = await adminClient
      .from('service_requests')
      .insert({
        student_id: req.user.id,
        service_id: service.id,
        request_type: service.name,
        title: requestTitle,
        details: `Return request for loan ${loan.id}. Book: ${loan.library_books.title}. ISBN: ${loan.library_books.isbn || 'Not listed'}.`,
        status: 'pending',
        submitted_at: new Date().toISOString(),
      })
      .select('id, title, status, submitted_at')
      .single()

    if (insertError) return res.status(500).json({ error: insertError.message })

    return res.status(201).json({
      message: `Your return request for "${loan.library_books.title}" has been submitted to the Library.`,
      request,
    })
  } catch (err) {
    console.error('Error submitting book return request:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/issue-loan', authenticateUser, requireRole(['staff', 'admin']), requireLibraryOffice, async (req, res) => {
  const { requestId, bookId, studentId, dueDate } = req.body

  if (!studentId || !dueDate) {
    return res.status(400).json({
      error: 'studentId and dueDate are required to issue a loan.',
    })
  }

  const parsedDueDate = new Date(dueDate)
  if (Number.isNaN(parsedDueDate.getTime()) || parsedDueDate <= new Date()) {
    return res.status(400).json({ error: 'Due date must be a valid date in the future.' })
  }

  try {
    const adminClient = getAdminClient()
    let resolvedBookId = bookId

    if (requestId) {
      const { data: request, error: requestError } = await adminClient
        .from('service_requests')
        .select('id, student_id, title, details, status, office_services!inner(office_id)')
        .eq('id', requestId)
        .maybeSingle()

      if (requestError) return res.status(500).json({ error: requestError.message })
      if (!request || request.student_id !== studentId || !request.title.startsWith('Book Borrow Request:')) {
        return res.status(404).json({ error: 'The matching Library book borrowing request was not found.' })
      }
      const requestStatus = String(request.status).trim().toLowerCase()
      if (!['pending', 'processing', 'submitted'].includes(requestStatus)) {
        return res.status(409).json({ error: `This borrowing request is already ${request.status}.` })
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

      const identifier = request.details?.match(/Accession\/ISBN:\s*(.+?)\.\s*Author:/i)?.[1]?.trim()
      if (!identifier) {
        return res.status(400).json({ error: 'The borrowing request does not identify a catalog book.' })
      }

      const bookQuery = adminClient
        .from('library_books')
        .select('id')
        .eq('is_active', true)
      const { data: requestedBook, error: requestedBookError } = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(identifier)
        ? await bookQuery.eq('id', identifier).maybeSingle()
        : await bookQuery.eq('isbn', identifier).maybeSingle()

      if (requestedBookError) return res.status(500).json({ error: requestedBookError.message })
      if (!requestedBook || (bookId && bookId !== requestedBook.id)) {
        return res.status(400).json({ error: 'The selected catalog book does not match this borrowing request.' })
      }
      resolvedBookId = requestedBook.id
    }

    if (!resolvedBookId) {
      return res.status(400).json({ error: 'A valid Library borrowing request or bookId is required.' })
    }

    const { data: book, error: bookError } = await adminClient
      .from('library_books')
      .select('id, title, available_copies')
      .eq('id', resolvedBookId)
      .maybeSingle()

    if (bookError) return res.status(500).json({ error: bookError.message })
    if (!book) return res.status(404).json({ error: 'Book not found in the Library catalog.' })
    if (book.available_copies <= 0) {
      return res.status(400).json({ error: 'No copies available to issue.' })
    }

    const now = new Date().toISOString()
    const { data: loan, error: loanError } = await adminClient
      .from('book_loans')
      .insert({
        student_id: studentId,
        book_id: resolvedBookId,
        status: 'Borrowed',
        borrowed_at: now,
        due_at: parsedDueDate.toISOString(),
      })
      .select()
      .single()

    if (loanError) {
      return res.status(500).json({ error: loanError.message })
    }

    await adminClient
      .from('library_books')
      .update({
        available_copies: book.available_copies - 1,
        updated_at: now,
      })
      .eq('id', resolvedBookId)

    if (requestId) {
      await adminClient
        .from('service_requests')
        .update({
          status: 'completed',
          handled_by: req.user.id,
          completed_at: now,
        })
        .eq('id', requestId)
    }

    await adminClient.from('notifications').insert({
      recipient_id: studentId,
      title: 'Book Issued',
      category: 'library',
      message: `"${book.title}" has been issued to you. Due date: ${new Date(dueDate).toLocaleDateString()}.`,
      is_read: false,
    })

    res.status(201).json({
      message: `Book loan issued for "${book.title}".`,
      loan,
    })
  } catch (err) {
    console.error('Error issuing book loan:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/return-book', authenticateUser, requireRole(['staff', 'admin']), requireLibraryOffice, async (req, res) => {
  const { loanId } = req.body

  if (!loanId) {
    return res.status(400).json({ error: 'Loan ID is required.' })
  }

  try {
    const adminClient = getAdminClient()

    const { data: loan, error: fetchError } = await adminClient
      .from('book_loans')
      .select('id, student_id, book_id, status, library_books(id, title, available_copies)')
      .eq('id', loanId)
      .single()

    if (fetchError || !loan) {
      return res.status(404).json({ error: 'Loan record not found.' })
    }

    if (loan.status === 'Returned') {
      return res.status(400).json({ error: 'Book has already been returned.' })
    }

    const now = new Date().toISOString()
    const { error: updateError } = await adminClient
      .from('book_loans')
      .update({
        status: 'Returned',
        returned_at: now,
      })
      .eq('id', loanId)

    if (updateError) {
      return res.status(500).json({ error: updateError.message })
    }

    const currentCopies = loan.library_books?.available_copies ?? 0
    await adminClient
      .from('library_books')
      .update({
        available_copies: currentCopies + 1,
        updated_at: now,
      })
      .eq('id', loan.book_id)

    await adminClient.from('service_history').insert({
      student_id: loan.student_id,
      transaction_id: loan.id,
      transaction_type: 'Book Loan',
      title: `Returned: ${loan.library_books?.title || 'Library Book'}`,
      completed_at: now,
    })

    res.json({
      message: `Book "${loan.library_books?.title}" returned successfully.`,
    })
  } catch (err) {
    console.error('Error returning book:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.get('/staff-loans', authenticateUser, requireRole(['staff', 'admin']), requireLibraryOffice, async (_req, res) => {
  try {
    const { data: loans, error } = await getAdminClient()
      .from('book_loans')
      .select('id, student_id, status, borrowed_at, due_at, returned_at, profiles(full_name, student_id), library_books(title, isbn)')
      .eq('status', 'Borrowed')
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
      .select('id, status, borrowed_at, due_at, returned_at, library_books(id, title, author, isbn)')
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