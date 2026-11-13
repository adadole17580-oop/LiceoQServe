require('dotenv').config();

const express = require('express');
const cors = require('cors');

const supabase = require('./config/supabase');
const supabaseAuth = require('./config/SupabaseAuth');

const app = express();
const PORT = process.env.PORT || 3000;

const GUIDANCE_OFFICE_ID = 'fb684d14-e64d-4df3-a739-f6b51271926b';

// ========================================
// MIDDLEWARE
// ========================================

app.use(cors());
app.use(express.json());

// ========================================
// HELPERS
// ========================================

const statusLabels = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    reschedule_requested: 'Reschedule Requested',
    checked_in: 'Checked In',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
    no_show: 'No-Show'
};

function formatDate(dateValue) {
    if (!dateValue) return null;

    const date = new Date(dateValue);

    if (isNaN(date.getTime())) return null;

    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function formatTime(dateValue) {
    if (!dateValue) return null;

    const date = new Date(dateValue);

    if (isNaN(date.getTime())) return null;

    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(date);
}

function displayStatus(status) {
    return statusLabels[status] || status || 'Not recorded';
}

/// ========================================
// GUIDANCE STAFF LOGIN
// ========================================

app.post('/api/auth/guidance-login', async(req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required.'
            });
        }

        const { data: authData, error: authError } =
        await supabaseAuth.auth.signInWithPassword({
            email: email.trim(),
            password
        });

        if (authError || !authData.user) {
            console.error(
                'SUPABASE AUTH ERROR:',
                authError ? authError.message : 'User not found'
            );

            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, full_name, university_email, role, office_id, is_active')
            .eq('id', authData.user.id)
            .maybeSingle();

        if (profileError) {
            console.error('PROFILE LOOKUP ERROR:', profileError.message);

            return res.status(500).json({
                success: false,
                message: 'Unable to verify staff profile.'
            });
        }

        if (!profile ||
            profile.role !== 'staff' ||
            profile.office_id !== GUIDANCE_OFFICE_ID ||
            profile.is_active !== true
        ) {
            return res.status(403).json({
                success: false,
                message: 'This account is not authorized for the Guidance Staff Portal.'
            });
        }

        // GET ASSIGNED OFFICE NAME FROM SUPABASE
        const { data: office, error: officeError } = await supabase
            .from('offices')
            .select('name')
            .eq('id', profile.office_id)
            .maybeSingle();

        if (officeError) {
            console.error('OFFICE LOOKUP ERROR:', officeError.message);
        }

        return res.status(200).json({
            success: true,
            message: 'Login successful!',
            user: {
                id: profile.id,
                full_name: profile.full_name,
                email: profile.university_email,
                role: profile.role,
                office_id: profile.office_id,
                office_name: office && office.name ? office.name : null,
                is_active: profile.is_active
            },
            session: authData.session
        });

    } catch (error) {
        console.error('GUIDANCE LOGIN ERROR:', error);

        return res.status(500).json({
            success: false,
            message: 'Something went wrong during login.'
        });
    }
});

// ========================================
// GUIDANCE STAFF AUTHENTICATION
// ========================================

async function requireGuidanceStaff(req, res, next) {
    try {
        const authorization = req.headers.authorization;

        if (!authorization || !authorization.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Authentication token is required.'
            });
        }

        const token = authorization.split(' ')[1];

        const { data: authData, error: authError } =
        await supabaseAuth.auth.getUser(token);

        if (authError || !authData.user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired session.'
            });
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, full_name, role, office_id, is_active')
            .eq('id', authData.user.id)
            .maybeSingle();

        if (profileError) {
            console.error('STAFF PROFILE ERROR:', profileError.message);

            return res.status(500).json({
                success: false,
                message: 'Unable to verify staff account.'
            });
        }

        if (!profile ||
            profile.role !== 'staff' ||
            profile.office_id !== GUIDANCE_OFFICE_ID ||
            profile.is_active !== true
        ) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Guidance staff only.'
            });
        }

        req.staffProfile = profile;
        next();

    } catch (error) {
        console.error('AUTH MIDDLEWARE ERROR:', error);

        return res.status(500).json({
            success: false,
            message: 'Authentication failed.'
        });
    }
}


// ========================================
// GET GUIDANCE APPOINTMENTS
// ========================================

app.get('/api/guidance/appointments', requireGuidanceStaff, async(req, res) => {
    try {
        const { data: services, error: servicesError } = await supabase
            .from('office_services')
            .select('id, name')
            .eq('office_id', GUIDANCE_OFFICE_ID)
            .eq('is_active', true)
            .eq('service_type', 'appointment');

        if (servicesError) throw servicesError;

        if (!services || services.length === 0) {
            return res.json({
                success: true,
                appointments: []
            });
        }

        const serviceIds = services.map(service => service.id);

        const serviceMap = new Map(
            services.map(service => [service.id, service.name])
        );

        const { data: records, error: appointmentsError } = await supabase
            .from('appointments')
            .select(`
                id,
                student_id,
                service_id,
                scheduled_at,
                end_at,
                status,
                purpose,
                student_notes,
                staff_notes,
                handled_by,
                checked_in_at,
                session_started_at,
                session_completed_at,
                created_at
            `)
            .in('service_id', serviceIds)
            .order('scheduled_at', { ascending: true });

        if (appointmentsError) throw appointmentsError;

        const appointmentIds = (records || []).map(record => record.id);

        let historyRecords = [];

        if (appointmentIds.length > 0) {
            const { data, error } = await supabase
                .from('service_history')
                .select(`
                    transaction_id,
                    previous_status,
                    final_status,
                    performed_by,
                    created_at
                `)
                .in('transaction_id', appointmentIds)
                .order('created_at', { ascending: false });

            if (error) throw error;

            historyRecords = data || [];
        }

        const latestHistoryMap = new Map();

        for (const item of historyRecords) {
            if (!latestHistoryMap.has(item.transaction_id)) {
                latestHistoryMap.set(item.transaction_id, item);
            }
        }

        const profileIds = [
            ...new Set([
                ...(records || []).map(record => record.student_id),
                ...(records || [])
                .map(record => record.handled_by)
                .filter(Boolean),
                ...historyRecords
                .map(record => record.performed_by)
                .filter(Boolean)
            ])
        ];

        let profiles = [];

        if (profileIds.length > 0) {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, student_id')
                .in('id', profileIds);

            if (error) throw error;

            profiles = data || [];
        }

        const profileMap = new Map(
            profiles.map(profile => [profile.id, profile])
        );

        const appointments = (records || []).map(record => {
            const student = profileMap.get(record.student_id);
            const history = latestHistoryMap.get(record.id);

            let staffId = record.handled_by;

            if (history && history.performed_by) {
                staffId = history.performed_by;
            }

            const staff = staffId ? profileMap.get(staffId) : null;

            return {
                id: record.id,
                student: student ? student.full_name : 'Unknown Student',
                studentId: student ? student.student_id : 'N/A',

                type: serviceMap.get(record.service_id) || 'Guidance Appointment',

                reference: 'GDN-' + record.id.slice(0, 8).toUpperCase(),
                transactionId: 'GDN-' + record.id.slice(0, 8).toUpperCase(),

                date: formatDate(record.scheduled_at),
                time: formatTime(record.scheduled_at),
                scheduledAt: record.scheduled_at,

                status: displayStatus(record.status),
                updatedStatus: displayStatus(record.status),

                previousStatus: history ?
                    displayStatus(history.previous_status) : 'Not recorded',

                performedBy: staff ? staff.full_name : 'Not recorded',

                purpose: record.purpose,
                studentNotes: record.student_notes,
                staffNotes: record.staff_notes,

                checkedInAt: record.checked_in_at || null,
                sessionStartedAt: record.session_started_at || null,
                completedAt: record.session_completed_at || null
            };
        });

        return res.json({
            success: true,
            appointments
        });

    } catch (error) {
        console.error('GET APPOINTMENTS ERROR:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to load Guidance appointments.'
        });
    }
});

// ========================================
// GET GUIDANCE SERVICE HISTORY
// ========================================

app.get('/api/guidance/history', requireGuidanceStaff, async(req, res) => {
    try {
        const { data: services, error: servicesError } = await supabase
            .from('office_services')
            .select('id, name')
            .eq('office_id', GUIDANCE_OFFICE_ID);

        if (servicesError) throw servicesError;

        if (!services || services.length === 0) {
            return res.json({
                success: true,
                history: []
            });
        }

        const serviceIds = services.map(service => service.id);

        const serviceMap = new Map(
            services.map(service => [service.id, service.name])
        );

        const { data: records, error: historyError } = await supabase
            .from('service_history')
            .select(`
                id,
                student_id,
                service_id,
                transaction_type,
                transaction_id,
                title,
                previous_status,
                final_status,
                performed_by,
                completed_at,
                created_at
            `)
            .in('service_id', serviceIds)
            .order('created_at', { ascending: false });

        if (historyError) throw historyError;

        if (!records || records.length === 0) {
            return res.json({
                success: true,
                history: []
            });
        }

        const profileIds = [
            ...new Set([
                ...records.map(record => record.student_id),
                ...records
                .map(record => record.performed_by)
                .filter(Boolean)
            ])
        ];

        let profiles = [];

        if (profileIds.length > 0) {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, student_id')
                .in('id', profileIds);

            if (error) throw error;

            profiles = data || [];
        }

        const profileMap = new Map(
            profiles.map(profile => [profile.id, profile])
        );

        const appointmentIds = [
            ...new Set(records.map(record => record.transaction_id))
        ];

        let appointments = [];

        if (appointmentIds.length > 0) {
            const { data, error } = await supabase
                .from('appointments')
                .select(`
                    id,
                    scheduled_at,
                    purpose,
                    student_notes,
                    staff_notes
                `)
                .in('id', appointmentIds);

            if (error) throw error;

            appointments = data || [];
        }

        const appointmentMap = new Map(
            appointments.map(appointment => [appointment.id, appointment])
        );

        const history = records.map(record => {
            const student = profileMap.get(record.student_id);
            const staff = profileMap.get(record.performed_by);
            const appointment = appointmentMap.get(record.transaction_id);

            const scheduledAt = appointment ?
                appointment.scheduled_at :
                null;

            return {
                id: record.id,

                student: student ? student.full_name : 'Unknown Student',
                studentId: student ? student.student_id : 'N/A',

                service: serviceMap.get(record.service_id) || 'Guidance Service',

                type: record.transaction_type,
                transactionId: record.transaction_id,

                reference: 'GDN-' +
                    String(record.transaction_id).slice(0, 8).toUpperCase(),

                title: record.title,

                previousStatus: displayStatus(record.previous_status),
                updatedStatus: displayStatus(record.final_status),
                status: displayStatus(record.final_status),

                performedBy: staff ? staff.full_name : 'Not recorded',

                scheduledAt,
                date: formatDate(scheduledAt),
                time: formatTime(scheduledAt),

                purpose: appointment ? appointment.purpose : null,
                studentNotes: appointment ? appointment.student_notes : null,
                staffNotes: appointment ? appointment.staff_notes : null,

                completedAt: record.completed_at,
                createdAt: record.created_at
            };
        });

        return res.json({
            success: true,
            history
        });

    } catch (error) {
        console.error('GET GUIDANCE HISTORY ERROR:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to load Guidance history.'
        });
    }
});

// ========================================
// GUIDANCE DASHBOARD SUMMARY
// ========================================

app.get('/api/guidance/dashboard', requireGuidanceStaff, async(req, res) => {
    try {
        const now = new Date();
        const today = formatDate(now);

        // ------------------------------------
        // GET ACTIVE GUIDANCE APPOINTMENT SERVICES
        // ------------------------------------

        const { data: appointmentServices, error: servicesError } = await supabase
            .from('office_services')
            .select('id')
            .eq('office_id', GUIDANCE_OFFICE_ID)
            .eq('is_active', true)
            .eq('service_type', 'appointment');

        if (servicesError) throw servicesError;

        const appointmentServiceIds = (appointmentServices || [])
            .map(service => service.id);

        let todayAppointments = 0;
        let completedSessions = 0;
        let counselorsAvailable = 0;

        // ------------------------------------
        // GET APPOINTMENTS
        // ------------------------------------

        if (appointmentServiceIds.length > 0) {
            const { data: appointments, error: appointmentsError } = await supabase
                .from('appointments')
                .select('id, scheduled_at, end_at, status, handled_by')
                .in('service_id', appointmentServiceIds);

            if (appointmentsError) throw appointmentsError;

            const records = appointments || [];

            todayAppointments = records.filter(record =>
                formatDate(record.scheduled_at) === today
            ).length;

            completedSessions = records.filter(record =>
                record.status === 'completed'
            ).length;

            // ------------------------------------
            // IDENTIFY STAFF WITH ONGOING APPOINTMENTS
            // ------------------------------------

            const busyStaffIds = new Set();

            records.forEach(record => {
                if (!record.handled_by ||
                    !['pending', 'confirmed'].includes(record.status) ||
                    !record.scheduled_at
                ) {
                    return;
                }

                const startTime = new Date(record.scheduled_at);

                if (isNaN(startTime.getTime())) return;

                // If end_at is empty, assume a one-hour appointment.
                const endTime = record.end_at ?
                    new Date(record.end_at) :
                    new Date(startTime.getTime() + 60 * 60 * 1000);

                if (isNaN(endTime.getTime())) return;

                const isOngoing =
                    startTime <= now &&
                    endTime > now;

                if (isOngoing) {
                    busyStaffIds.add(record.handled_by);
                }
            });

            // ------------------------------------
            // COUNT ACTIVE GUIDANCE STAFF
            // ------------------------------------

            const { data: staff, error: staffError } = await supabase
                .from('profiles')
                .select('id')
                .eq('office_id', GUIDANCE_OFFICE_ID)
                .eq('role', 'staff')
                .eq('is_active', true);

            if (staffError) throw staffError;

            const activeStaff = staff || [];

            counselorsAvailable = activeStaff.filter(person =>
                !busyStaffIds.has(person.id)
            ).length;

        } else {
            // Still retrieve active staff if no appointment services exist.
            const { data: staff, error: staffError } = await supabase
                .from('profiles')
                .select('id')
                .eq('office_id', GUIDANCE_OFFICE_ID)
                .eq('role', 'staff')
                .eq('is_active', true);

            if (staffError) throw staffError;

            counselorsAvailable = (staff || []).length;
        }

        // ------------------------------------
        // READY FOR PICKUP
        // DOCUMENT REQUEST + REGISTRAR CLEARANCE
        // ------------------------------------

        const { data: documentServices, error: documentServicesError } = await supabase
            .from('office_services')
            .select('id')
            .in('name', [
                'Document Request',
                'Registrar Clearance'
            ])
            .eq('service_type', 'request')
            .eq('is_active', true);

        if (documentServicesError) throw documentServicesError;

        const documentServiceIds = (documentServices || [])
            .map(service => service.id);

        let serviceRequestCount = 0;

        if (documentServiceIds.length > 0) {
            const { count, error } = await supabase
                .from('service_requests')
                .select('id', { count: 'exact', head: true })
                .in('service_id', documentServiceIds)
                .eq('status', 'completed');

            if (error) throw error;

            serviceRequestCount = count || 0;
        }

        // ------------------------------------
        // REGISTRAR CLEARANCE REQUESTS
        // ------------------------------------

        const { count: registrarCount, error: registrarError } = await supabase
            .from('registrar_requests')
            .select('id', { count: 'exact', head: true })
            .eq('document_type', 'Registrar Clearance')
            .eq('status', 'completed');

        if (registrarError) throw registrarError;

        const readyForPickup =
            serviceRequestCount + (registrarCount || 0);

        // ------------------------------------
        // SEND DASHBOARD SUMMARY
        // ------------------------------------

        return res.json({
            success: true,
            todayAppointments,
            completedSessions,
            readyForPickup,
            counselorsAvailable
        });

    } catch (error) {
        console.error('GUIDANCE DASHBOARD ERROR:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });

        return res.status(500).json({
            success: false,
            message: 'Unable to load Guidance dashboard.'
        });
    }
});


// ========================================
// UPDATE GUIDANCE APPOINTMENT
// DATABASE TRIGGER HANDLES COMPLETION HISTORY
// ========================================

app.patch(
    '/api/guidance/appointments/:id/action',
    requireGuidanceStaff,
    async(req, res) => {
        try {
            const { id } = req.params;
            const { action, date, time } = req.body;

            const appointmentIdPattern =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

            if (!appointmentIdPattern.test(id)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid appointment ID.'
                });
            }

            const normalizedAction = String(action || '')
                .trim()
                .toLowerCase()
                .replace(/[_-]/g, ' ')
                .replace(/\s+/g, ' ');

            const statusActions = {
                'confirm': 'confirmed',
                'complete': 'completed',
                'complete session': 'completed',
                'cancel': 'cancelled',
                'no show': 'no_show',
                'reject': 'rejected',
                'check in': 'checked_in',
                'start session': 'in_progress'
            };

            const actionAliases = {
                'checkin': 'check in',
                'startsession': 'start session',
                'completesession': 'complete session'
            };

            const finalAction =
                actionAliases[normalizedAction] || normalizedAction;

            const actionStatus = statusActions[finalAction];

            if (finalAction !== 'reschedule' && !actionStatus) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid appointment action.'
                });
            }

            // GET CURRENT APPOINTMENT
            const { data: appointment, error: lookupError } =
            await supabase
                .from('appointments')
                .select(`
                        id,
                        student_id,
                        service_id,
                        scheduled_at,
                        status,
                        purpose,
                        checked_in_at,
                        session_started_at,
                        session_completed_at
                    `)
                .eq('id', id)
                .maybeSingle();

            if (lookupError) throw lookupError;

            if (!appointment) {
                return res.status(404).json({
                    success: false,
                    message: 'Appointment not found.'
                });
            }

            // VERIFY GUIDANCE APPOINTMENT SERVICE
            const { data: service, error: serviceError } =
            await supabase
                .from('office_services')
                .select('id, name')
                .eq('id', appointment.service_id)
                .eq('office_id', GUIDANCE_OFFICE_ID)
                .eq('service_type', 'appointment')
                .maybeSingle();

            if (serviceError) throw serviceError;

            if (!service) {
                return res.status(403).json({
                    success: false,
                    message: 'This appointment does not belong to Guidance.'
                });
            }

            const previousStatus = appointment.status;
            const actionTimestamp = new Date().toISOString();

            const updateData = {
                handled_by: req.staffProfile.id,
                updated_at: actionTimestamp
            };

            let newStatus = previousStatus;

            // ====================================
            // RESCHEDULE
            // ====================================

            if (finalAction === 'reschedule') {
                if (!date || !time) {
                    return res.status(400).json({
                        success: false,
                        message: 'New date and time are required.'
                    });
                }

                const newDate = new Date(
                    date + 'T' + time + ':00+08:00'
                );

                if (isNaN(newDate.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid reschedule date or time.'
                    });
                }

                if (newDate <= new Date()) {
                    return res.status(400).json({
                        success: false,
                        message: 'The new appointment schedule must be in the future.'
                    });
                }
                updateData.scheduled_at = newDate.toISOString();
                updateData.end_at = null;

                updateData.status = previousStatus === 'confirmed' ?
                    'confirmed' :
                    'pending';

                newStatus = updateData.status;
            }

            // ====================================
            // OTHER APPOINTMENT ACTIONS
            // ====================================
            else {
                newStatus = actionStatus;
                updateData.status = newStatus;

                // CHECK IN
                if (finalAction === 'check in') {
                    if (appointment.status === 'completed') {
                        return res.status(400).json({
                            success: false,
                            message: 'Completed appointments cannot be checked in.'
                        });
                    }

                    updateData.checked_in_at =
                        appointment.checked_in_at || actionTimestamp;
                }

                // START SESSION
                if (finalAction === 'start session') {
                    if (!appointment.checked_in_at) {
                        return res.status(400).json({
                            success: false,
                            message: 'Please check in the student first.'
                        });
                    }

                    if (appointment.session_completed_at) {
                        return res.status(400).json({
                            success: false,
                            message: 'This session has already been completed.'
                        });
                    }

                    updateData.session_started_at =
                        appointment.session_started_at || actionTimestamp;
                }

                // COMPLETE SESSION
                if (
                    finalAction === 'complete' ||
                    finalAction === 'complete session'
                ) {
                    if (!appointment.session_started_at) {
                        return res.status(400).json({
                            success: false,
                            message: 'Please start the session first.'
                        });
                    }

                    if (appointment.session_completed_at) {
                        return res.status(400).json({
                            success: false,
                            message: 'This session has already been completed.'
                        });
                    }

                    updateData.session_completed_at = actionTimestamp;
                }
            }

            // ====================================
            // UPDATE APPOINTMENT
            // ====================================

            const { data: updatedAppointment, error: updateError } =
            await supabase
                .from('appointments')
                .update(updateData)
                .eq('id', id)
                .select(`
                        id,
                        student_id,
                        service_id,
                        status,
                        scheduled_at,
                        handled_by,
                        checked_in_at,
                        session_started_at,
                        session_completed_at,
                        staff_notes,
                        updated_at
                    `)
                .single();

            if (updateError) throw updateError;

            // ====================================
            // HISTORY IS AUTOMATICALLY HANDLED
            // BY log_completed_appointment()
            // DO NOT INSERT A SECOND HISTORY ROW
            // ====================================

            return res.json({
                success: true,
                message: finalAction === 'reschedule' ?
                    'Appointment rescheduled successfully.' : finalAction === 'complete' ||
                    finalAction === 'complete session' ?
                    'Guidance session completed successfully.' : 'Appointment updated successfully.',
                appointment: updatedAppointment
            });

        } catch (error) {
            console.error('UPDATE APPOINTMENT ERROR:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });

            return res.status(500).json({
                success: false,
                message: 'Unable to update appointment.'
            });
        }
    }
);



// ========================================
// SAVE GUIDANCE SESSION NOTES
// ========================================

app.patch(
    '/api/guidance/appointments/:id/notes',
    requireGuidanceStaff,
    async(req, res) => {
        try {
            const { id } = req.params;
            const { notes } = req.body;

            if (typeof notes !== 'string') {
                return res.status(400).json({
                    success: false,
                    message: 'Valid session notes are required.'
                });
            }

            const { data: appointment, error: lookupError } = await supabase
                .from('appointments')
                .select('id, service_id')
                .eq('id', id)
                .maybeSingle();

            if (lookupError) throw lookupError;

            if (!appointment) {
                return res.status(404).json({
                    success: false,
                    message: 'Appointment not found.'
                });
            }

            const { data: service, error: serviceError } = await supabase
                .from('office_services')
                .select('id')
                .eq('id', appointment.service_id)
                .eq('office_id', GUIDANCE_OFFICE_ID)
                .maybeSingle();

            if (serviceError) throw serviceError;

            if (!service) {
                return res.status(403).json({
                    success: false,
                    message: 'This appointment does not belong to Guidance.'
                });
            }

            const { data, error } = await supabase
                .from('appointments')
                .update({
                    staff_notes: notes.trim(),
                    handled_by: req.staffProfile.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select('id, staff_notes')
                .single();

            if (error) throw error;

            return res.json({
                success: true,
                message: 'Session notes saved successfully.',
                appointment: data
            });

        } catch (error) {
            console.error('SAVE GUIDANCE NOTES ERROR:', error);

            return res.status(500).json({
                success: false,
                message: 'Unable to save session notes.'
            });
        }
    }
);


/* ========================================
   GUIDANCE SCHEDULE API
======================================== */

// GET OFFICE HOURS
app.get('/api/guidance/schedule/office-hours', requireGuidanceStaff, async(req, res) => {
    try {
        const { data, error } = await supabase
            .from('guidance_office_hours')
            .select('*')
            .eq('office_id', GUIDANCE_OFFICE_ID)
            .order('day_of_week', { ascending: true });

        if (error) throw error;

        return res.json({
            success: true,
            officeHours: data || []
        });
    } catch (error) {
        console.error('GET OFFICE HOURS ERROR:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to load Guidance office hours.'
        });
    }
});


// GET BLOCKED SCHEDULES
app.get('/api/guidance/schedule/blocked', requireGuidanceStaff, async(req, res) => {
    try {
        const { data, error } = await supabase
            .from('guidance_blocked_schedules')
            .select('*')
            .eq('office_id', GUIDANCE_OFFICE_ID)
            .order('blocked_date', { ascending: true })
            .order('start_time', { ascending: true });

        if (error) throw error;

        return res.json({
            success: true,
            blockedSchedules: data || []
        });
    } catch (error) {
        console.error('GET BLOCKED SCHEDULES ERROR:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to load blocked schedules.'
        });
    }
});


// ADD BLOCKED SCHEDULE
app.post('/api/guidance/schedule/blocked', requireGuidanceStaff, async(req, res) => {
    try {
        const {
            blocked_date,
            start_time,
            end_time,
            is_all_day,
            reason
        } = req.body;

        if (!blocked_date || !/^\d{4}-\d{2}-\d{2}$/.test(blocked_date)) {
            return res.status(400).json({
                success: false,
                message: 'A valid blocked date is required.'
            });
        }

        const allDay = is_all_day === true;

        if (!allDay) {
            if (!start_time || !end_time || end_time <= start_time) {
                return res.status(400).json({
                    success: false,
                    message: 'A valid start and end time are required.'
                });
            }

            if (start_time < '09:00' || end_time > '17:00') {
                return res.status(400).json({
                    success: false,
                    message: 'Blocked time must be within Guidance office hours (9 AM–5 PM).'
                });
            }
        }

        const { data: existing, error: checkError } = await supabase
            .from('guidance_blocked_schedules')
            .select('id, start_time, end_time, is_all_day')
            .eq('office_id', GUIDANCE_OFFICE_ID)
            .eq('blocked_date', blocked_date);

        if (checkError) throw checkError;

        const overlaps = (existing || []).some(item => {
            if (allDay || item.is_all_day) return true;

            return start_time < item.end_time &&
                end_time > item.start_time;
        });

        if (overlaps) {
            return res.status(409).json({
                success: false,
                message: 'This date or time overlaps an existing blocked schedule.'
            });
        }

        const { data, error } = await supabase
            .from('guidance_blocked_schedules')
            .insert({
                office_id: GUIDANCE_OFFICE_ID,
                blocked_date,
                start_time: allDay ? null : start_time,
                end_time: allDay ? null : end_time,
                is_all_day: allDay,
                reason: (typeof reason === 'string' && reason.trim() !== '') ? reason.trim() : 'Unavailable',
                created_by: req.staffProfile.id
            })
            .select()
            .single();

        if (error) throw error;

        return res.status(201).json({
            success: true,
            message: 'Schedule blocked successfully.',
            blockedSchedule: data
        });

    } catch (error) {
        console.error('ADD BLOCKED SCHEDULE ERROR:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to block this schedule.'
        });
    }
});


// DELETE BLOCKED SCHEDULE
app.delete('/api/guidance/schedule/blocked/:id', requireGuidanceStaff, async(req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('guidance_blocked_schedules')
            .delete()
            .eq('id', id)
            .eq('office_id', GUIDANCE_OFFICE_ID)
            .select('id')
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Blocked schedule not found.'
            });
        }

        return res.json({
            success: true,
            message: 'Blocked schedule removed successfully.'
        });

    } catch (error) {
        console.error('DELETE BLOCKED SCHEDULE ERROR:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to remove blocked schedule.'
        });
    }
});


// ========================================
// HOME ROUTE
// ========================================

app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to LiceoQServe Backend!',
        status: 'OK'
    });
});

// ========================================
// HEALTH CHECK
// ========================================

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Backend is working properly!'
    });
});

// ========================================
// SUPABASE CONNECTION TEST
// ========================================

app.get('/api/supabase-test', async(req, res) => {
    try {
        const response = await fetch(
            process.env.SUPABASE_URL + '/rest/v1/', {
                headers: {
                    apikey: process.env.SUPABASE_SECRET_KEY
                }
            }
        );

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                message: 'Supabase connection returned an error.',
                status: response.status
            });
        }

        return res.json({
            success: true,
            message: 'Successfully connected to Supabase!'
        });

    } catch (error) {
        console.error('SUPABASE TEST ERROR:', error.message);

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// ========================================
// GET ALL GUIDANCE STUDENTS
// APPOINTMENTS + SERVICE REQUESTS + HISTORY
// ========================================

app.get('/api/guidance/students', requireGuidanceStaff, async(req, res) => {
    try {
        // 1. GET ALL ACTIVE STUDENT PROFILES
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select(`
                id,
                student_id,
                full_name,
                university_email,
                program,
                year_level,
                contact_number
            `)
            .eq('role', 'student')
            .eq('is_active', true)
            .order('full_name', { ascending: true });

        if (profileError) throw profileError;

        // 2. GET ALL GUIDANCE SERVICES
        const { data: services, error: serviceError } = await supabase
            .from('office_services')
            .select('id, name, service_type')
            .eq('office_id', GUIDANCE_OFFICE_ID);

        if (serviceError) throw serviceError;

        const serviceIds = (services || []).map(service => service.id);

        const serviceNames = Object.fromEntries(
            (services || []).map(service => [service.id, service.name])
        );

        let appointments = [];
        let requests = [];
        let history = [];

        // 3. GET GUIDANCE APPOINTMENTS
        if (serviceIds.length > 0) {
            const { data, error } = await supabase
                .from('appointments')
                .select(`
                    id,
                    student_id,
                    service_id,
                    status,
                    scheduled_at,
                    purpose
                `)
                .in('service_id', serviceIds);

            if (error) throw error;

            appointments = data || [];

            // 4. GET GUIDANCE SERVICE REQUESTS
            const { data: requestData, error: requestError } = await supabase
                .from('service_requests')
                .select(`
                    id,
                    student_id,
                    service_id,
                    title,
                    status,
                    submitted_at,
                    updated_at,
                    completed_at
                `)
                .in('service_id', serviceIds);

            if (requestError) throw requestError;

            requests = requestData || [];

            // 5. GET GUIDANCE TRANSACTION HISTORY
            const { data: historyData, error: historyError } = await supabase
                .from('service_history')
                .select(`
                    id,
                    student_id,
                    service_id,
                    transaction_type,
                    transaction_id,
                    title,
                    final_status,
                    completed_at,
                    created_at
                `)
                .in('service_id', serviceIds)
                .order('created_at', { ascending: false });

            if (historyError) throw historyError;

            history = historyData || [];
        }

        // 6. FORMAT STUDENT RECORDS
        const students = (profiles || []).map(student => {

            // STUDENT APPOINTMENTS
            const studentAppointments = appointments.filter(
                item => item.student_id === student.id
            );

            // STUDENT SERVICE REQUESTS
            const studentRequests = requests.filter(
                item => item.student_id === student.id
            );

            // ACTIVE APPOINTMENTS
            const activeAppointments = studentAppointments
                .filter(item => {
                    const status = String(item.status || '').toLowerCase();

                    return ![
                        'completed',
                        'cancelled',
                        'rejected',
                        'no_show',
                        'no-show'
                    ].includes(status);
                })
                .map(item => ({
                    id: item.id,
                    type: 'appointment',
                    title: `Guidance — ${serviceNames[item.service_id] || 'Appointment'}`,
                    status: displayStatus(item.status),
                    date: item.scheduled_at
                }));

            // ACTIVE SERVICE REQUESTS
            const activeRequests = studentRequests
                .filter(item => {
                    const status = String(item.status || '').toLowerCase();

                    return ![
                        'completed',
                        'cancelled',
                        'rejected',
                        'no_show',
                        'no-show'
                    ].includes(status);
                })
                .map(item => ({
                    id: item.id,
                    type: 'request',
                    title: item.title || serviceNames[item.service_id] || 'Guidance Request',
                    status: displayStatus(item.status),
                    date: item.submitted_at
                }));

            // COMBINE ACTIVE TRANSACTIONS
            const activeTransactions = [
                ...activeAppointments,
                ...activeRequests
            ].sort((a, b) =>
                new Date(b.date || 0) - new Date(a.date || 0)
            );

            // 7. GET EXISTING HISTORY RECORDS
            const studentHistory = history
                .filter(item => item.student_id === student.id)
                .map(item => ({
                    id: item.id,
                    transactionId: item.transaction_id,
                    title: item.title ||
                        serviceNames[item.service_id] ||
                        'Guidance Transaction',
                    date: item.completed_at || item.created_at,
                    status: displayStatus(item.final_status)
                }));

            // TRACK HISTORY TRANSACTION IDS TO AVOID DUPLICATES
            const recordedTransactionIds = new Set(
                studentHistory.map(item => item.transactionId)
            );

            // 8. ADD COMPLETED REQUESTS WITHOUT HISTORY RECORDS
            const completedRequests = studentRequests
                .filter(item => {
                    const status = String(item.status || '').toLowerCase();

                    return status === 'completed' &&
                        !recordedTransactionIds.has(item.id);
                })
                .map(item => ({
                    id: item.id,
                    transactionId: item.id,
                    title: item.title ||
                        serviceNames[item.service_id] ||
                        'Guidance Request',
                    date: item.completed_at ||
                        item.updated_at ||
                        item.submitted_at,
                    status: 'Completed'
                }));

            const transactionHistory = [
                ...studentHistory,
                ...completedRequests
            ].sort((a, b) =>
                new Date(b.date || 0) - new Date(a.date || 0)
            );

            // 9. RETURN STUDENT INFORMATION
            return {
                id: student.id,
                name: student.full_name || 'N/A',
                studentId: student.student_id || 'N/A',
                course: student.program || 'N/A',
                year: student.year_level || 'N/A',
                email: student.university_email || 'N/A',
                contact: student.contact_number || 'N/A',
                activeTransactions,
                history: transactionHistory
            };
        });

        return res.status(200).json({
            success: true,
            students
        });

    } catch (error) {
        console.error('GET GUIDANCE STUDENTS ERROR:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });

        return res.status(500).json({
            success: false,
            message: 'Failed to load Guidance students.'
        });
    }
});


/* ========================================
   GUIDANCE NOTIFICATIONS
======================================== */

// GET ALL NOTIFICATIONS FOR LOGGED-IN GUIDANCE STAFF
app.get(
    '/api/guidance/notifications',
    requireGuidanceStaff,
    async(req, res) => {
        try {
            const staffId = req.staffProfile.id;

            const { data, error } = await supabase
                .from('notifications')
                .select(`
                    id,
                    recipient_id,
                    title,
                    message,
                    category,
                    related_id,
                    is_read,
                    created_at,
                    event_key
                `)
                .eq('recipient_id', staffId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            return res.status(200).json({
                success: true,
                notifications: data || []
            });

        } catch (error) {
            console.error('GET GUIDANCE NOTIFICATIONS ERROR:', error);

            return res.status(500).json({
                success: false,
                message: 'Unable to load notifications.'
            });
        }
    }
);


// MARK ONE NOTIFICATION AS READ
app.patch(
    '/api/guidance/notifications/:id/read',
    requireGuidanceStaff,
    async(req, res) => {
        try {
            const staffId = req.staffProfile.id;
            const notificationId = req.params.id;

            const { data, error } = await supabase
                .from('notifications')
                .update({
                    is_read: true
                })
                .eq('id', notificationId)
                .eq('recipient_id', staffId)
                .select('id, title, is_read')
                .maybeSingle();

            if (error) throw error;

            if (!data) {
                return res.status(404).json({
                    success: false,
                    message: 'Notification not found.'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Notification marked as read.',
                notification: data
            });

        } catch (error) {
            console.error('MARK NOTIFICATION READ ERROR:', error);

            return res.status(500).json({
                success: false,
                message: 'Unable to update notification.'
            });
        }
    }
);


// MARK ALL NOTIFICATIONS AS READ
app.patch(
    '/api/guidance/notifications/read-all',
    requireGuidanceStaff,
    async(req, res) => {
        try {
            const staffId = req.staffProfile.id;

            console.log('MARK ALL READ REQUEST:', staffId);

            const { data, error } = await supabase
                .from('notifications')
                .update({
                    is_read: true
                })
                .eq('recipient_id', staffId)
                .eq('is_read', false)
                .select('id, title, is_read');

            if (error) throw error;

            console.log('UPDATED NOTIFICATIONS:', data);

            return res.status(200).json({
                success: true,
                message: 'All notifications marked as read.',
                updatedCount: data ? data.length : 0,
                notifications: data || []
            });

        } catch (error) {
            console.error('MARK ALL NOTIFICATIONS READ ERROR:', error);

            return res.status(500).json({
                success: false,
                message: 'Unable to mark all notifications as read.'
            });
        }
    }
);
// ========================================
// CHANGE GUIDANCE STAFF PASSWORD
// ========================================

app.patch(
    '/api/guidance/change-password',
    requireGuidanceStaff,
    async(req, res) => {
        try {
            const { currentPassword, newPassword } = req.body || {};

            if (
                typeof currentPassword !== 'string' ||
                typeof newPassword !== 'string' ||
                !currentPassword ||
                !newPassword
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Current and new passwords are required.'
                });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: 'New password must contain at least 8 characters.'
                });
            }

            if (currentPassword === newPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'New password must be different from the current password.'
                });
            }

            // Identify the authenticated user from their Bearer token.
            const token = req.headers.authorization.slice(7);

            const { data: userData, error: userError } =
            await supabaseAuth.auth.getUser(token);

            if (userError || !userData.user || !userData.user.email) {
                return res.status(401).json({
                    success: false,
                    message: 'Unable to verify your account.'
                });
            }
            const authenticatedUser = userData.user;

            // Use a separate temporary client to verify the
            // current password without changing the shared session.
            const { createClient } = require('@supabase/supabase-js');

            const verificationClient = createClient(
                process.env.SUPABASE_URL,
                process.env.SUPABASE_PUBLISHABLE_KEY, {
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false,
                        detectSessionInUrl: false
                    }
                }
            );

            const { data: verification, error: verificationError } =
            await verificationClient.auth.signInWithPassword({
                email: authenticatedUser.email,
                password: currentPassword
            });

            if (
                verificationError ||
                !verification.user ||
                verification.user.id !== authenticatedUser.id
            ) {
                return res.status(401).json({
                    success: false,
                    message: 'Current password is incorrect.'
                });
            }
            // Update the authenticated account only.
            // This client is scoped to the newly verified session.
            const { error: updateError } =
            await verificationClient.auth.updateUser({
                password: newPassword
            });

            if (updateError) {
                console.error(
                    'CHANGE PASSWORD ERROR:',
                    updateError.message
                );

                return res.status(400).json({
                    success: false,
                    message: 'Unable to update password. Please try again.'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Password changed successfully.'
            });

        } catch (error) {
            console.error('CHANGE PASSWORD ERROR:', error.message);

            return res.status(500).json({
                success: false,
                message: 'Unable to change password.'
            });
        }
    }
);

// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {
    console.log('LiceoQServe backend running on port ' + PORT);
});
n