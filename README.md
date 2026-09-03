# CareLink Bauchi — UI Source (Static HTML/CSS)

This is the raw HTML/CSS behind the five interface screens used as
Figures 4.1–4.5 in Chapter Four. It's plain, framework-free markup —
no build step required. Open any .html file directly in a browser to
view it, or use it as a visual reference while building the real
React components described in Chapter Three.

## Files

- `login.html` — Login & role selection (Figure 4.2)
- `patient_dashboard.html` — Patient dashboard (Figure 4.1)
- `book_appointment.html` — Real-time appointment booking (Figure 4.3)
- `doctor_console.html` — Doctor console / EHR / referral (Figure 4.4)
- `admin_dashboard.html` — Health officer / state-level reporting (Figure 4.5)
- `style.css` — Shared design system (colours, sidebar, cards, buttons,
  tables, tags) used by all five pages

## Design tokens (for consistency if you extend this)

- Primary teal: `#0E5E59` / dark teal: `#08403C`
- Accent (CTAs): `#D9822B`
- Background: `#F5F8F7`, Card surface: `#FFFFFF`
- Text: `#17302D` (body), `#5C7A76` (muted)
- Status tags: green `#2F855A` (success), amber `#B3541E` (pending/offline),
  blue `#2B5C8A` (informational)
- Headings: 'DejaVu Serif' — Body/UI: 'Liberation Sans'
  (swap these for your preferred web fonts, e.g. Inter + Lora,
  when you move this into React)

## Turning this into React

Each page maps roughly to one route/component:

- `login.html` → `<LoginPage />`
- `patient_dashboard.html` → `<PatientDashboard />`
- `book_appointment.html` → `<BookAppointment />`
- `doctor_console.html` → `<DoctorConsole />`
- `admin_dashboard.html` → `<AdminReports />`

The `.sidebar`, `.topbar`, `.card`, `.btn` / `.btn-ghost`, and `.tag`
classes in `style.css` are reused across every page — a good starting
point for a shared `<Layout />` component and a small set of
Tailwind-equivalent utility classes.

All data shown (patient names, appointment times, LGA stats) is
placeholder content for illustration — wire these up to your real
API endpoints from Chapter 4 (auth, scheduling, EHR, admin reporting)
once the backend is running.
