# CLET Go-Live Countdown

Live countdown to the CLET Release 1 go-live, with a read-only readiness dashboard for viewers,
an admin screen for tracking all 252 workplan systems, and a daily 18:00 Accra reminder email. Built to the *CLET Go-Live Countdown:
Development Plan* (8 Oct 2026).

- **Frontend**: React + TypeScript (Vite). `/` is the countdown, `/admin` the settings, `/admin/login` sign-in.
- **API**: Node.js + Express, PostgreSQL. Local admin accounts (bcrypt, HTTP-only session cookie).
- **Reminder**: `node-cron` at 18:00 Africa/Accra inside the API process, sent through SMTP.

## Run locally

Requires Node 20+ and PostgreSQL.

```sh
npm install
cp .env.example .env            # set DATABASE_URL if not postgres://localhost:5432/golive
createdb golive
npm run migrate
npm run admin:create -- you@example.org "Your Name"   # prompts for a password (12+ chars)
npm run dev                     # API on :3000, frontend on http://localhost:5173
```

With `SMTP_HOST` empty, reminder emails are printed to the API console instead of sent.

## Tests

```sh
createdb golive_test            # once; wiped and re-migrated on every run
npm test
```

- `src/shared/calc.test.ts`: the section 4 calculation rules and the section 12 unit-test list,
  including the worked check (8 Oct 20:00 GMT → 6 days 14 hours, 0.9 weeks, 5 working days).
- `src/server/reminder-message.test.ts`: reminder content for status, no-date and "is live" cases.
- `src/server/api.test.ts`: viewers get 401 on admin endpoints, validation rules, audit entries,
  sign-out, and the 6th failed sign-in in 15 minutes being blocked. Set `TEST_DATABASE_URL` to use
  a different database.

## Build and deploy

```sh
npm run build                   # dist/client (static) + dist/server (bundled API)
npm start                       # serves both on $PORT; runs migrations at start-up
```

Or build the container: `docker build -t clet-golive .` and run it with the environment variables
from `.env.example`. Set `NODE_ENV=production` behind HTTPS so the session cookie is `Secure`.

Run **one** instance with the reminder enabled. On staging, set `REMINDER_CRON_ENABLED=false` (or
leave the recipients empty) so the team does not get duplicate emails.

## Deploy to Render

`render.yaml` is a Render Blueprint: one web service (API, built frontend and reminder job) and a
PostgreSQL database, both in Frankfurt.

1. In Render, choose **New > Blueprint** and pick this GitHub repository.
2. Fill in `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters). On every start that admin is
   created if missing, or its password reset to match `ADMIN_PASSWORD`; change the value in
   Render to change the password. Leave the SMTP values empty to log reminders instead of
   sending them.
3. Apply. Migrations run on start-up, including `007_release1_snapshot.sql`, so the new database
   starts with the Release 1 go-live decisions and readiness statuses.
4. Share `https://<service>.onrender.com` with the team; admins sign in at `/admin/login`.

On the free plans the service sleeps after 15 minutes without traffic (the first visit then takes
about a minute, and the 18:00 reminder only runs while it is awake), and the free database expires
after 30 days. Use a paid instance and database for anything the team relies on.

## Admin accounts

```sh
npm run admin:create -- name@example.org "Full Name"     # create, or reset password
npm run admin:create -- name@example.org --deactivate    # remove access and end their sessions
```

In production, run the bundled script: `node dist/server/create-admin.js …` with the same arguments.

## How it behaves

- The browser fetches `GET /api/countdown` on load, every 60 seconds and when the tab becomes
  visible again, and redraws the timer every second from the current clock, so it is correct after
  a device sleeps. If the API is unreachable the page keeps counting from its last loaded data
  (also kept in `localStorage`) and says the figures may be out of date.
- Working days count Monday to Friday from today up to, not including, the go-live date, less
  configured holidays. Weeks left are rounded down to one decimal place.
- A cluster is flagged in the reminder as needing attention when it is at 0% or 20+ percentage
  points behind overall readiness (`WELL_BEHIND_POINTS` in `src/shared/calc.ts`).
- After go-live the page counts up "days since go-live". The first 18:00 run after go-live sends a
  final "Phase 1 is live" message and sets `reminder_final_sent`; later runs do nothing. Changing the
  go-live date re-arms it.
- Failed sends retry 3 times, 5 minutes apart. A day missed while the server was down is not sent
  late.
- Every settings and system change is written to `audit_log` with the changed fields before and
  after; the latest 100 appear under "Change history" on `/admin`.

## Systems and readiness

- All 252 systems from the 252 Systems Workplan (phases 1A to 4B, clusters C1 to C13) are seeded by
  migrations 002 and 006. Each has a readiness status (not ready, in progress, ready, live), a
  go-live decision (yes, no, TBD) and notes, edited on `/admin` in a table or a drag-and-drop board.
- A system counts towards the countdown if it is set to "yes", or if it is in one of the phases
  chosen under Settings and not set to "no". Readiness percentages count ready or live systems.
- The public `GET /api/countdown` returns each system's code, name, cluster, phase, status and
  go-live decision; never notes, recipients or admin details.

## Project layout

```
src/shared/      calculation rules and validation, used by both browser and server
src/client/      React app (pages/Countdown, pages/Login, pages/Admin)
src/server/      Express app, auth, data access, reminder job, migrations, CLI scripts
```

## Open items from the plan

- **CLET IAM**: sign-in uses local accounts. If IAM becomes available, replace `verifyCredentials`
  and the login route in `src/server/auth.ts` / `app.ts`; sessions and `requireAdmin` stay as they are.
- Admin names, reminder recipients and public holidays are entered on `/admin`
  once decided; none are hard-coded. The go-live date is seeded as 15 Oct 2026 10:00 GMT.
