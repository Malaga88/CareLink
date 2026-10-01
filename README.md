# CareLink Bauchi — Telemedicine Platform Prototype (plain HTML/CSS/JS)

A framework-free, no-build front-end prototype of the CareLink Bauchi telemedicine and records platform.
Open `index.html` in a browser, or drop the folder on any static host (GitHub Pages, Netlify, Vercel).

> **Demo data notice.** Every patient, doctor, facility figure, email address and statistic in this prototype is **fictional placeholder data**. Email addresses use the reserved `carelink.example` domain. Dashboard KPIs are simulated; replace them with measured results before reporting them anywhere.

## Pages

| File | Purpose |
|---|---|
| `index.html` | Redirects to the login screen |
| `login.html` | Role selection + validated sign-in form (Patient, Doctor, Nurse/Admin, Health Officer) |
| `patient_dashboard.html` | Next appointment (from your latest booking), records preview, reminders, cancel appointment |
| `book_appointment.html` | Facility → department → doctor → date → time slot, with live conflict checking |
| `records.html` | Medical records with type filters, search and expandable details |
| `doctor_console.html` | 6-patient queue, diagnosis/prescription form (saved per patient), referral dialog |
| `admin_dashboard.html` | State report KPIs, weekly chart, LGA usage, referrals table with Accept action |
| `style.css` | Shared design system (tokens in `:root`) |
| `app.js` | Shared demo logic: session, role guard, sidebar, toasts, booking/conflict helpers |

## What now works (vs. the first static version)

- **Sign-in:** real form with email/password validation, show/hide password, role-based redirect, sign-out.
- **Role guard:** pages redirect to login (or to the user's own home) if opened without the right role.
- **Booking:** slots are clickable buttons; the summary updates live; doctors only offer their working days; dates are computed from today (no stale dates).
- **Conflict detection:** a slot booked in this browser, or "taken" in the simulated server, is disabled. "Simulate a clashing request" locks your chosen slot; Confirm re-checks the slot before saving.
- **Cross-page flow:** a confirmed booking shows on the patient dashboard; a doctor's referral appears in the admin referrals table.
- **Doctor console:** queue selection, per-patient notes, validation, "Seen" markers.
- **Responsive and accessible:** viewport meta, mobile slide-in sidebar, labelled form fields, keyboard focus styles, `lang="en"`, page titles, skip link, readable text sizes and higher-contrast muted text, reduced-motion support.
- **Fonts:** Source Sans 3 / Source Serif 4 from Google Fonts, falling back to the original DejaVu Serif / Liberation Sans.

## Important limits

- State lives in the browser (`localStorage` / `sessionStorage`). There is **no real authentication or security**; the role guard only shapes the demo. Real access control, password hashing and audit logging must be enforced by the backend.
- Sidebar items marked "Soon" (Consultations, Notifications, Patient Records, Referrals, Facility Overview, Users & Facilities, Notifications Log) are not built yet.
- Clearing site data resets all demo bookings, notes and referrals.

## Design tokens

Primary teal `#0E5E59` / dark `#08403C` · Accent `#D9822B` · Background `#F5F8F7` · Text `#17302D` · Muted `#5A7773` (darkened for contrast) · Status green `#2F855A`, amber `#B3541E`, blue `#2B5C8A`.

## Wiring to the real backend

`app.js` is the seam. Replace the `CL.store` reads/writes and helpers (`slotTaken`, bookings, referrals, `CL.DOCTORS`) with `fetch()` calls to the Node/Express + PostgreSQL API (auth, scheduling, EHR, reporting). Do conflict detection in the database with a unique constraint on (doctor, date, slot) so two simultaneous requests cannot both succeed. Because the platform will hold patient health data, plan for Nigeria Data Protection Act (NDPA 2023) compliance: consent, role-based access, encryption in transit and at rest, and audit trails.
