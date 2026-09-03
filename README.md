# CareLink Bauchi — Static Website (Plain HTML/CSS)

A working, framework-free static site for the CareLink Bauchi
telemedicine platform interface. No build step, no dependencies —
open `index.html` (or any page) directly in a browser, or drop the
whole folder onto any static host.

## Pages

- `index.html` — redirects straight to the login screen
- `login.html` — login & role selection (Patient / Doctor / Nurse-Admin / Health Officer)
- `patient_dashboard.html` — patient dashboard: next appointment, recent records, reminders
- `book_appointment.html` — real-time appointment booking with a live conflict-detection example
- `doctor_console.html` — doctor's patient queue, EHR view, diagnosis/prescription form, referral action
- `admin_dashboard.html` — health officer's state-level reporting dashboard (LGA usage, referrals, live metrics)
- `style.css` — shared design system used by every page (colours, sidebar, cards, buttons, tags, tables)

## Navigation

The pages are properly linked to each other, not standalone mockups:

- The **role chips** and **Sign in** button on the login page take you
  to the matching dashboard.
- Each dashboard's **sidebar** and **logo** link back to the other
  built pages (Dashboard ↔ Appointments, and the CareLink logo
  returns to the login screen).
- **Book New Appointment** (patient dashboard) → booking page;
  **Confirm Booking** → back to the patient dashboard.
- **Refer to Another Facility** (doctor console) → admin dashboard,
  standing in for the receiving facility's view.

A few links (Medical Records, Consultations, Notifications, Patient
Records, Referrals, Users & Facilities) are left as plain sidebar
labels rather than dead links, since those screens haven't been built
yet — add a page and turn them into `<a href="...">` links the same
way the others are wired up.

## Design tokens

- Primary teal: `#0E5E59` / dark teal: `#08403C`
- Accent (CTAs): `#D9822B`
- Background: `#F5F8F7`, Card surface: `#FFFFFF`
- Text: `#17302D` (body), `#5C7A76` (muted)
- Status tags: green `#2F855A` (success), amber `#B3541E` (pending/offline),
  blue `#2B5C8A` (informational)
- Headings: 'DejaVu Serif' — Body/UI: 'Liberation Sans'
  (swap for whichever web fonts you prefer — just update the
  `font-family` values in `style.css`)

## Deploying it

Since it's plain static HTML/CSS, you can host it anywhere with zero
configuration:

- **GitHub Pages** — push this folder to a repo and enable Pages on
  the branch/folder.
- **Netlify / Vercel** — drag-and-drop the folder onto their web
  dashboard for an instant live URL.
- **Anywhere else** — any static file host (Render, Railway static
  sites, a plain Apache/Nginx server) will serve it as-is.

## Wiring it to a real backend later

All data on screen (patient names, appointment times, LGA stats) is
placeholder content. When the Node/Express + PostgreSQL backend from
Chapter Three is ready, replace the static values in each page with
JavaScript `fetch()` calls to your API endpoints (auth, scheduling,
EHR, admin reporting) — no framework required for that either, plain
`fetch` and DOM updates will do it.
