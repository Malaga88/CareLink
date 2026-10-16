# CareLink Bauchi — Telemedicine Platform

Node.js + Express 5 + MongoDB (Mongoose) API with a plain HTML/CSS/JS frontend. The system starts **empty**: there is no demo data. You create the first administrator, then set everything else up from the web app.

```
CareLink/
  frontend/   static pages (login, patient, booking, records, doctor console, admin, users) + js/
  backend/    Express API, Mongoose models, scripts, integration tests
```

## 1. Run it

```bash
cd backend
npm install
cp .env.example .env        # then edit .env (see below)
npm run create-admin        # creates the first Health Officer (asks name, email, password)
npm start                   # open http://localhost:4000
```

In `backend/.env` set:
- `MONGO_URI`: your MongoDB Atlas string with the database name `carelink` in the path (`...mongodb.net/carelink?retryWrites=true&w=majority`).
- `JWT_SECRET`: 32+ random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

> **Secrets live only in `.env`, which is gitignored.** `.env.example` is committed to Git, so it must only ever contain placeholders. If a database password was ever committed or shared, rotate it in Atlas; deleting the file later does not remove it from Git history.

## 2. Set the system up (as the Health Officer)

Sign in with the **Health Officer** role, then open **Users & Facilities**:
1. **Add facilities** (name, short name, LGA).
2. **Create doctors** (facility, department, working days). A temporary password is shown once; the doctor must choose their own at first sign-in. You can also create Nurse/Admin and extra Health Officer accounts.
3. Patients register themselves on the login page.

Until at least one facility has a doctor, the patient booking page shows a message instead of dropdowns.

## 3. What each role can do

| Role | Can do |
|---|---|
| Patient | Register, book/cancel appointments, join the video call, see own visits and prescriptions |
| Doctor | See own queue by date, record diagnosis and prescription (appears in the patient's records), refer to another facility, join the video call |
| Nurse/Admin | State reports, referral tracking (accept / mark in transit) |
| Health Officer | Everything above, plus create/disable accounts, reset passwords, edit doctor schedules, add facilities, read the activity log |

## Video consultations

Each appointment gets a random, unguessable meeting room on a Jitsi server (`VIDEO_BASE_URL`, default the public `meet.jit.si`). The patient and the doctor of that appointment can fetch the link only from **15 minutes before until 90 minutes after** the start time; the server enforces this. Notes:
- Public `meet.jit.si` is a third-party service and has at times asked the first person in a room to sign in. For real patient use, **self-host Jitsi** and set `VIDEO_BASE_URL`.
- Calls are not recorded or stored by CareLink.

## Removing demo data from an existing database

Older versions created fictional accounts (`@carelink.example`). To remove them from a database that has them:

```bash
npm run create-admin                 # first make a real Health Officer, if you have not
npm run purge-demo                   # DRY RUN: shows what would be deleted
npm run purge-demo -- --yes          # deletes it
# optional extras: --facilities (remove the 3 demo facilities if unused)  --reset-stats (clear booking statistics)
```

It refuses to run unless a real Health Officer exists. It deletes demo accounts and everything tied to them, and tells you if real patients had booked a demo doctor. The activity log is kept.

## API

| Method & path | Who | What |
|---|---|---|
| `POST /api/auth/login`, `/register`, `/change-password`; `GET /api/auth/me` | public / any | JWT (8h). Role must match the account. 5 wrong passwords lock the account for 15 minutes. |
| `GET /api/facilities`, `/doctors`, `/doctors/:id/availability?date=` | signed in | Catalogue; each doctor includes server-computed bookable `dates` |
| `POST /api/appointments`, `GET /mine`, `PATCH /:id/cancel`, `GET /:id/join` | patient | Book, list, cancel, video link |
| `GET /api/records/mine` | patient | Visits and prescriptions |
| `GET /api/doctor/queue?date=`, `/patients/:id/history`, `/appointments/:id/join`; `PUT /consultations`; `POST /referrals` | doctor | Own queue only; history only for patients under their care |
| `GET /api/referrals`, `PATCH /api/referrals/:id/status` | staff | Referral tracking |
| `GET /api/reports/summary` | nurse, officer | Counts computed from the database |
| `GET/POST /api/admin/users`, `PATCH /:id`, `POST /:id/reset-password`, `POST /api/admin/facilities`, `GET /api/admin/audit` | officer | Account and facility management, activity log |

## How double-booking is prevented

Each held slot stores a `slotKey` (`doctor|date|slot`) with a **unique index**. If two patients book the same slot at the same instant, MongoDB lets exactly one insert succeed and the other receives `409`. Cancelling removes the key. Dates and times use clinic time (`TZ_OFFSET_HOURS`, Nigeria = 1) and the **server** decides which dates are bookable, so a wrong device clock or timezone cannot cause bad bookings.

## Security notes

- Passwords hashed with bcrypt (10+ characters required); login timing equalised for unknown emails; per-IP rate limits plus per-account lockout.
- Roles are enforced **on the server** and the user is re-loaded on every request, so disabling an account takes effect immediately.
- Helmet with a strict Content-Security-Policy (no inline scripts); 10 KB body limit; only `frontend/` is served, never `backend/`.
- The token is kept in `sessionStorage` (cleared when the tab closes). For production consider httpOnly cookies and CSRF protection.
- This holds health data: plan for NDPA 2023 compliance (consent, retention rules, backups, encryption at rest — Atlas provides it — and a data-protection officer). The admin activity log records account and facility changes; it does not log who viewed which record.

## Deploying (e.g. Render)

Root directory `backend`, build `npm install`, start `npm start`. Environment variables: `MONGO_URI`, `JWT_SECRET`, `TRUST_PROXY=1` (and `VIDEO_BASE_URL` if self-hosting Jitsi). In Atlas, allow the host's IPs under Network Access. Run `npm run create-admin` once against the production database (from your own machine with the production `MONGO_URI`, or in the host's shell). If the frontend is hosted elsewhere, set `window.CARELINK_API` in `frontend/js/config.js` and put the frontend's origin in `CLIENT_ORIGIN`.

## Tests

`cd backend && TEST_MONGO_URI=mongodb://127.0.0.1:27017/carelink_test npm test`
**This wipes the target database.** The runner refuses any database name that does not contain "test". The suite covers authentication and lockout, booking races, role enforcement, consultations, referrals, video access windows, account management and the two maintenance scripts.

## Not built yet

SMS/email notifications and email-based password recovery (a Health Officer resets passwords), lab-result entry, in-app messaging, record-level access logging.
