# ReachInbox Email Scheduler

Schedule email campaigns that send at the right time, survive restarts, never double-send,
and respect per-sender hourly limits. Scheduling uses **BullMQ delayed jobs only — no cron**.

- **Backend:** Express + TypeScript + Prisma (Postgres) + BullMQ (Redis) + Nodemailer (Ethereal SMTP) + Elasticsearch
- **Frontend:** Next.js (App Router) + Tailwind + NextAuth (Google)

## Setup

```bash
docker compose up -d                       # postgres, redis (AOF on), elasticsearch

cd backend
cp .env.example .env                       # fill GOOGLE_CLIENT_ID, SLACK_*, BULL_BOARD_PASS
npm install
npx prisma migrate dev --name init
npm run seed                               # creates 2 distinct Ethereal sender accounts
                                           # (npm run seed -- --reset replaces them; restart the backend after)
npm run dev                                # API + worker on :4000

cd ../frontend
cp .env.local.example .env.local           # NEXTAUTH_SECRET, GOOGLE_CLIENT_ID/SECRET
npm install
npm run dev                                # http://localhost:3000
```

**Google OAuth:** create a Web OAuth client; authorized redirect URI
`http://localhost:3000/api/auth/callback/google`. Use the same client ID in both `.env` files.

**Slack (optional):** see [Not configured for demo](#not-configured-for-demo).

**Bull Board:** http://localhost:4000/admin/queues (HTTP basic auth: `BULL_BOARD_USER` / `BULL_BOARD_PASS`).

Use `sample-recipients.csv` in the compose modal for a quick demo (4 unique emails detected).

## How it works

| Concern | Mechanism |
|---|---|
| Scheduling | Each email is a BullMQ job with `delay = scheduledAt - now`, stored in Redis (AOF persistence). |
| No double send | Job id `email-{id}` dedupes adds; worker atomically claims `scheduled → sending` before sending, so only one worker can ever send a given email. |
| Restarts | On boot, `reconcile()` (runs once, not on a timer) resets stale `sending` rows and re-adds every `scheduled` email; existing job ids are ignored. |
| Hourly limit | Redis counter `rl:{sender}:{UTC hour}` via atomic INCR. Over the limit → email rescheduled to the next hour via `moveToDelayed` + `DelayedError` (never failed). Limit = min(campaign limit, `MAX_EMAILS_PER_HOUR_PER_SENDER`). |
| Throughput | Worker `concurrency = WORKER_CONCURRENCY`, queue-wide limiter of 1 job per `MIN_DELAY_BETWEEN_SENDS_MS`. |
| Slack alert | Once per sender per hour (`SET NX`), to the campaign owner's connected webhook. |
| Search | Emails indexed in Elasticsearch; search returns ids, rows are loaded fresh from Postgres. ES failures are logged, never fatal. |

## Trade-offs

- **1-hour sessions.** The backend verifies Google ID tokens, which expire after 1 hour. There is no
  refresh-token flow: the NextAuth session lasts 1 hour, and any 401 from the API signs the user out
  and returns them to the login page. A production version would refresh tokens or issue its own session.
- **Crash between SMTP send and DB update.** If the process dies after the SMTP server accepted the
  email but before it is marked `sent`, the row stays `sending`; reconcile resets it after 5 minutes and
  it may be sent again. SMTP offers no idempotency key, so this window can be narrowed but not removed.
- **API and worker in one process** for simplicity; `startWorker()` can move to its own entry point to scale workers independently.
- **Bull Board** is protected by basic auth only; fine for a demo, not for production.
- **Frontend polls every 5s** for status updates (UI only — sending is driven by BullMQ).

## Not configured for demo

Slack OAuth ("Connect Slack") and the rate-limit Slack alert are fully implemented
(`backend/src/slack.ts`, `backend/src/routes/slack.ts`) but were not set up for the demo due to time.
Without a Slack connection the alert is skipped silently; scheduling and rate limiting work the same.

To enable it:

1. Create a Slack app at https://api.slack.com/apps and add the **`incoming-webhook`** bot scope (OAuth & Permissions).
2. Expose the backend over https, which Slack requires for redirects: `ngrok http 4000`.
   Run ngrok only while connecting, since it makes the whole backend public.
3. In the Slack app, add the redirect URL `https://<ngrok>/api/slack/callback`.
4. In `backend/.env`, set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` (Basic Information → App Credentials)
   and `BACKEND_PUBLIC_URL=https://<ngrok>`, then restart the backend.
5. Click **Connect Slack** in the dashboard header and pick a channel.

## Notes

AI assistance (Claude Code) was used for implementation. The architecture and design decisions are documented above.
