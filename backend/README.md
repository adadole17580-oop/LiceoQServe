# Backend integrations

## Student notifications

Apply `supabase_notifications_sync.sql` to the existing Supabase project before deploying the updated backend. It adds a nullable notification event key and book-loan source-request key with unique indexes, grants the existing profile fields needed for student edits, and adds relevant tables to the existing Realtime publication when needed. It does not disable RLS or replace policies. Student-facing subscriptions still depend on the existing own-record policies.

The backend keeps in-app notifications even when email is not configured. To enable email through Resend, configure these variables in the backend environment only:

- `RESEND_API_KEY`
- `EMAIL_FROM` (a sender address verified with Resend)

The recipient is read from the student's `profiles.university_email`. Delivery failures are logged and do not roll back an in-app notification. Email delivery requires live provider configuration and cannot be verified from a local build.

## Google Calendar

Google Calendar integration is not implemented. Enabling it requires a Google Cloud OAuth client, a server-side OAuth callback and token store, Calendar API access with event read/write scopes, and authorized student consent. Do not treat pending appointments as calendar events; no calendar actions currently occur.
