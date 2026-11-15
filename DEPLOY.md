# Deploying Gawali

One image serves the web app and the API; a second process runs the scheduler. All state lives in
**Neon**: Lakebase Postgres for data and cache, Neon Object Storage (private `assets` bucket) for photos.
App servers are stateless and can be scaled freely.

## 0. Neon

`neon.ts` declares the project's services; `neon deploy` provisions them and writes the connection
variables to the repo-root `.env.local` (gitignored, never baked into images). Django reads it first:

| Variable | Used for |
| --- | --- |
| `DATABASE_URL` (pooled, `-pooler`) | all app traffic, through PgBouncer transaction mode |
| `DATABASE_URL_UNPOOLED` (direct) | `migrate`, `createcachetable` and other schema commands, picked automatically |
| `AWS_*` | Neon Object Storage: uploads, served via `/media/<key>` → 15-minute presigned URL |

**Free plan:** the compute scales to zero when idle. The scheduler only opens a connection when a job is
due (and hourly), and `/healthz` does not touch the database (`/healthz?deep=1` does), so an idle system
lets the compute sleep. If the monthly compute allowance runs out, Postgres refuses connections with
SQLSTATE 53000 until the next cycle or an upgrade.

## 1. Configure `backend/.env`

Already set: NVIDIA keys, a generated `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False` (database and storage come from `.env.local`).
Before going live, set:

| Variable | Value |
| --- | --- |
| `DJANGO_ALLOWED_HOSTS` | your domain(s), e.g. `app.gawali.in` |
| `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | `https://app.gawali.in` |
| `SECURE_SSL_REDIRECT` | `True` (once HTTPS is in front) |
| `SENTRY_DSN` | from Sentry → Project settings → Client Keys (DSN) |
| `FIREBASE_SERVICE_ACCOUNT` | see Push below |
| `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_APP_ID`, `FIREBASE_VAPID_KEY` | see Push below |

## 2. Run

**Docker (Linux host, recommended):**

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This starts `web` (gunicorn, migrations on boot over the direct URL, `/healthz` health check) and `scheduler`.
Put a TLS-terminating proxy or your platform's load balancer in front (Render, Railway, Fly, AWS ALB…).

**Windows host:** `backend/run_production.ps1` runs migrations, then waitress + the scheduler.

## 3. Scheduled jobs (`manage.py run_scheduler`)

| Job | When (IST) | What |
| --- | --- | --- |
| `manifest_today` | 00:05 | Build today's delivery manifest |
| `morning_routes` | 04:45 | Push each partner their stop count |
| `cutoff_reminder` | 1 h before each dairy's cutoff | Remind households with a delivery tomorrow |
| `close_tomorrow` | at each dairy's cutoff | Hold deliveries of households over the credit limit, freeze tomorrow's manifest, notify partners |
| `auto_close_missed` | 12:00 | Unmarked stops become "missed" (never charged); both sides notified |
| `dues_reminders` | 19:00 | Payment reminders (daily when near/over limit, weekly otherwise) |
| `cleanup` | 03:00 | Prune old AI logs, read notifications, expired tokens, job history |

Each job runs once per day per dairy (a database lock), so restarts and multiple scheduler replicas are safe.
Status and history: **Admin console → Jobs & audit**.

## 4. Push notifications (Firebase)

`mobile/android/app/google-services.json` is the *Android app* config — it lets the Android app receive
pushes, but a server cannot send with it. Two more values are needed, both from the Firebase console
(project `gawali-63588`):

1. **Server sending** — Project settings → *Service accounts* → *Generate new private key*.
   Paste the whole JSON (or its base64) into `FIREBASE_SERVICE_ACCOUNT`. Keep it secret.
2. **Browser push** — Project settings → *General* → *Your apps* → *Add app* → Web. Copy `apiKey` →
   `FIREBASE_WEB_API_KEY` and `appId` → `FIREBASE_WEB_APP_ID`. Then *Cloud Messaging* → *Web Push
   certificates* → *Generate key pair* → `FIREBASE_VAPID_KEY`.

After a restart, every role sees **Notifications → Turn on** and every in-app notification is also pushed.

## 5. Sentry

Set `SENTRY_DSN` (backend) and build the web image with `--build-arg VITE_SENTRY_DSN=<dsn>`.
The `sentry-wizard -i android` command you have configures the separate React Native app in `mobile/`;
it is interactive (it opens a browser to sign in), so run it yourself from `mobile/` when you work on that app.

## 6. Verify a deployment

```bash
cd backend
python scripts/e2e_live.py https://app.gawali.in   # ~80 live checks across all roles, cleans up after itself
```
