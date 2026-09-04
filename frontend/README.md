# ChainGuard — AI Exam Paper Integrity Monitoring System

A premium, dark-themed React frontend for an AI-powered CCTV monitoring system that tracks
sealed exam envelopes from the printing room to the exam center and flags tampering in real time.

## Stack

- React 18 + Vite
- React Router v6
- Tailwind CSS (custom dark theme — primary `#22C55E`, accent `#38BDF8`, bg `#020617`, cards `#111827`)
- Framer Motion (page transitions, hover/lift, animated backgrounds)
- Recharts (area/bar/line/pie charts)
- Lucide React (icons only)

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173`).

Log in with a real backend account (see the backend README for seeded demo accounts and passwords) — the login screen no longer accepts arbitrary passwords.

## Build

```bash
npm run build
npm run preview
```

## Project structure

```
src/
  components/
    layout/     Sidebar, Navbar, DashboardLayout,
                ProtectedRoute (Phase 2: optional `allowedRoles` prop for role-gated routes)
    ui/         Card, Badge, StatusBadge, StatCard, Modal, Toast, Skeleton, EmptyState
  pages/        Login, Dashboard, LiveMonitoring, EnvelopeDetails, AlertCenter,
                Analytics, CameraManagement, AIDetection, Reports, Settings, NotFound,
                UserManagement, UserDetails (Phase 2 — Administrator-only, under /admin/users*)
  context/      AppContext (auth, sidebar state, toast queue)
  services/     api.js (axios + interceptors), socket.js, and one *Service.js
                per backend module (auth, camera, alert, envelope, custody,
                report, user, analytics, dashboard, activity, aiDetection,
                auditLog — Phase 2)
  constants/    roles.js (Phase 2) — single shared list of role values/labels,
                used by UserManagement/UserDetails so they can't drift apart
  data/         dummyData.js — remaining placeholder data with no backend
                source yet (see Notes below); no longer the primary data path
  routes/       (routing lives in src/App.jsx via React Router)
  index.css     Tailwind entry + global styles/utilities
```

## Notes

- **Authentication is real**, not a demo — JWT access + refresh tokens against the ChainGuard backend (`src/services/authService.js`, `src/context/AppContext.jsx`). A valid backend account is required; there's no "any password works" shortcut anymore.
- **Most pages are wired to the real backend** via `src/services/*Service.js`: Dashboard, Live Monitoring, Alert Center, AI Detection, Camera Management, Analytics, Reports, and Envelope Details all fetch real data (see the root `CHANGELOG.md` for exactly which phase migrated which page).
- **Administration (Phase 2)**: `/admin/users` and `/admin/users/:id` are Administrator-only — gated both by `ProtectedRoute`'s `allowedRoles` prop (redirects non-admins to `/dashboard`) and by the backend's own RBAC (so this is defense in depth, not the only check). The Sidebar's "Administration" link is only rendered for admins in the first place.
- `src/data/dummyData.js` still holds a handful of **deliberate placeholders** for figures with no backend source yet (e.g. `Dashboard.jsx`'s 7-day scan chart, `AIDetection.jsx`'s model version stats) — these are intentional, not leftover mock data, and are called out in code comments where used.
- Live camera feeds are simulated with CSS/SVG placeholders and a scanning-line animation;
  swap the placeholder `<div>` in `LiveMonitoring.jsx`'s `CameraFeed` component for a real
  `<video>`/WebRTC/HLS player when wiring up actual CCTV streams.
