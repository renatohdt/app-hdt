# Hora do Treino

MVP full-stack fitness app built with Next.js, Tailwind CSS, and Supabase.

## Features

- Multi-step quiz for lead capture
- Supabase Auth for common users
- Separate admin login at `/admin/login`
- User dashboard with workout cards, profile, and article recommendations
- Protected admin pages for exercises, users, metrics, and errors

## Setup

1. Copy `.env.example` to `.env.local`
2. Fill in your Supabase URL, anon key, service role key, and OpenAI key
3. For the admin MVP fallback, also set:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `ADMIN_SESSION_SECRET` (recommended)
4. Run the SQL in `supabase/schema.sql`
5. Install dependencies with `npm install`
6. Start the app with `npm run dev`

## Admin access

The admin flow is separate from the common user flow:

- common user login: `/login`
- admin login: `/admin/login`

The current MVP admin flow works in this priority order:

1. If `ADMIN_EMAIL` and `ADMIN_PASSWORD` are configured, `/admin/login` validates them on the server and creates an admin session cookie.
2. If those envs are not configured, the app falls back to Supabase Auth plus `users.role = 'admin'`.

## Notes

- Quiz answers are stored in `public.user_answers.answers`
- Workout generation uses the OpenAI backend flow plus validation/caching
- Admin access never validates credentials in the client
