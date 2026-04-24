# ORION SaaS V1 (Demo)

This is the V1 release of the ORION SaaS interface, built with Next.js App Router and a modular component architecture.

## Features
- **Fake Authentication**: Login with ANY username/password. Session persists in localStorage.
- **Mock Data Pipeline**: Simulates document upload, OCR processing, and vehicle data generation (Spanish ITV format).
- **Module 3 (OCR)**: Full "Zone 2" implementation with confidence scoring and inline editing.
- **Responsive Layout**: Sidebar + Topbar structure with collapsible navigation.

## How to Run

1. Install dependencies (if not already):
   ```bash
   npm install
   ```

2. Run development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000).
   - You will be redirected to `/login`.
   - Enter any username to access the dashboard.

## Architecture
- `src/app/(auth)`: Public authentication routes.
- `src/app/(dashboard)`: Protected SaaS routes (layout includes Sidebar/Topbar).
- `src/components/saas`: UI components specific to the SaaS application.
- `src/services/mock-data.ts`: Generates realistic vehicle data.
- `src/context/AuthContext.tsx`: Client-side session management.
