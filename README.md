# CareLink Bauchi — Telemedicine Platform

Node.js + Express 5 + MongoDB (Mongoose) API with a plain HTML/CSS/JS frontend.

```
CareLink/
  frontend/   static pages (login, patient, booking, records, doctor console, admin) + js/
  backend/    Express API, Mongoose models, seed script, integration tests
```

> **All seeded people, emails and figures are fictional demo data.** Demo emails use the reserved `carelink.example` domain.

## Run it locally (5 steps)

1. `cd backend && npm install`
2. `cp .env.example .env`, then edit `.env`:
   - **`MONGO_URI`**: use the same connection string as your AMS backend (your Atlas string, same variable name), but change the database name in the path to `carelink`:
     `mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/carelink?retryWrites=true&w=majority`
     That keeps CareLink data apart from AMS data on the same cluster.
   - **`JWT_SECRET`**: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - **`SEED_PASSWORD`**: any 8+ character password for the demo accounts.
3. `npm run seed` creates facilities, doctors, patients, today's 6-patient queue, records and referrals.
4. `npm start`, then open **http://localhost:4000**. The API also serves `../frontend`, so there is no CORS setup.
5. Sign in with the `SEED_PASSWORD`: `amina.ibrahim@` (Patient), `bello.suleiman@` (Doctor), `zainab.musa@` (Nurse/Admin), `officer@` (Health Officer), all `@carelink.example`.

Patients can also create their own account from the login page. Staff accounts are created by an admin or the seed script.

## API

| Method & path | Who | What |
|---|---|---|
| `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me` | public / any | JWT (8h). Login rejects a role that does not match the account. |
| `GET /api/facilities`, `GET /api/doctors`, `GET /api/doctors/:id/availability?date=` | any signed-in | Booking catalogue and live slot status |
| `POST /api/appointments`, `GET /api/appointments/mine`, `PATCH /api/appointments/:id/cancel` | patient | Book, list upcoming, cancel |
| `GET /api/records/mine` | patient | Medical records |
| `GET /api/doctor/queue?date=`, `GET /api/doctor/patients/:id/history`, `PUT /api/doctor/consultations`, `POST /api/doctor/referrals` | doctor | Own queue only; history only for patients under their care |
| `GET /api/referrals`, `PATCH /api/referrals/:id/status` | staff (read: doctor too) | Referral tracking |
| `GET /api/reports/summary` | nurse, officer | Computed KPIs, weekly volume, LGA usage |

## How conflicts are prevented

Each held slot stores a `slotKey` (`doctor|date|slot`) with a **unique index**. If two patients book the same slot at the same instant, MongoDB lets exactly one insert succeed and the other gets `409`. Cancelling removes the key, which frees the slot. The tests include a simultaneous-booking race.

## Security notes

- Passwords hashed with bcrypt; login timing is equalised for unknown emails; rate limits on login, sign-up and the whole API.
- Role checks happen **on the server** (`requireRole`) and the user is re-loaded from the database on every request, so disabling an account takes effect immediately.
- Helmet with a strict Content-Security-Policy (no inline scripts). Request bodies are capped at 10 KB. Only `frontend/` is served statically, never `backend/`.
- The frontend keeps the token in `sessionStorage` (cleared when the tab closes). For production, consider httpOnly cookies and CSRF protection.
- This holds health data. Before real use, plan for NDPA 2023 compliance: consent, audit logging, encryption at rest (Atlas provides it), backups, and an admin screen for creating and disabling staff accounts.
- **Never commit `.env`.** If a database password has ever been committed or shared, rotate it in Atlas.

## Deploying (e.g. Render)

Root directory `backend`, build `npm install`, start `npm start`. Set `MONGO_URI`, `JWT_SECRET`, `TRUST_PROXY=1` as environment variables. In Atlas, allow Render's IPs under Network Access. If the frontend is hosted elsewhere (GitHub Pages), set `window.CARELINK_API` in `frontend/js/config.js` and put the frontend's origin in `CLIENT_ORIGIN`.

## Tests

`cd backend && TEST_MONGO_URI=mongodb://127.0.0.1:27017/carelink_test SEED_PASSWORD=Demo-pass-123 npm test`
**This wipes the target database.** The runner refuses any database name that does not contain "test".

## Not built yet

Video calling, SMS/email reminders (Termii/Nodemailer), staff account management UI, sidebar items marked "Soon". The SUS score is not computed by the server (it comes from a user survey).
