# Job/Internship Tracker

A Chrome/Edge browser extension for tracking job and internship applications
— straight into a Google Sheet you already own. No account to create, no
hosted backend, no paid AI. Your data lives in your Sheet, not on anyone
else's server.

## Why

Most application trackers either lock your data into someone else's product
or want you to paste it into a spreadsheet by hand. This extension sits in
your toolbar: log an application in a couple of clicks while you're on the
posting, and it's written directly to your own Google Sheet as a new row —
company, role, status, dates, and a live "days in this status" column that
recalculates on its own.

## Features

- **Popup** — quickly log a new application or update an existing one's
  status without leaving the page you're on.
- **Dashboard** — a full view of every application, organized by pipeline
  stage (Saved → Applied → OA → Phone Screen → Interview → Technical →
  Final Round → Offer, plus Rejected / Withdrawn / Ghosted).
- **Onboarding** — create a brand-new tracker sheet with one click, or
  connect an existing spreadsheet and match its columns to the extension's
  schema.
- **Days in Status** — written as a live spreadsheet formula tied to "Last
  Updated," so it recalculates every time you open the sheet — no extra
  writes needed when a status changes.
- **Works in both Chrome and Edge** — sign-in uses a standard OAuth2 web
  flow (`chrome.identity.launchWebAuthFlow`), not a Chrome-only API, so it
  isn't tied to being signed into the browser itself with a Google account.
- **Light/dark theme**, following the system preference or a manual toggle.

## How it works

There's no server component. The extension talks directly to the [Google
Sheets API](https://developers.google.com/sheets/api) using an OAuth token
scoped only to `.../auth/spreadsheets`, and stores your sign-in state,
connected-sheet reference, and preferences locally via the browser's
extension storage. See [`PRIVACY.md`](PRIVACY.md) for the full breakdown of
what's accessed and why.

## Tech stack

- [WXT](https://wxt.dev) (Vite-based, Manifest V3) for the extension
  framework and build tooling
- TypeScript, no UI framework — each surface (`popup`, `dashboard`,
  `onboarding`) is plain DOM manipulation over a shared `lib/` of Sheets API
  and storage helpers
- Google Sheets API v4

## Project structure

```
entrypoints/
  popup/         Toolbar popup — quick add/update
  dashboard/     Full application list, grouped by status
  onboarding/    First-run setup: create or connect a sheet
  content.ts     Reads the current page to help prefill a new application
lib/
  auth.ts        OAuth (chrome.identity.launchWebAuthFlow) + token caching
  sheets.ts      All Google Sheets API calls (create, connect, read, write)
  schema.ts      Canonical columns/statuses shared across the extension
  storage.ts     Local extension storage (wxt/storage wrappers)
```

## Local development

### Prerequisites

- Node.js and npm
- A Google Cloud project with the Sheets API enabled

### 1. Install dependencies

```bash
npm install
```

### 2. Generate your own extension signing key

The manifest pins a `key` so the extension gets a **stable ID** across
rebuilds — required because the Google OAuth client's redirect URI is
pinned to that ID. This is gitignored (`.secrets/`), so each machine needs
its own copy:

```bash
mkdir -p .secrets
openssl genrsa -out .secrets/extension-key.pem 2048
openssl rsa -in .secrets/extension-key.pem -pubout -outform DER -out .secrets/extension-key-public.der
openssl base64 -in .secrets/extension-key-public.der -A -out .secrets/manifest-key.txt
```

Then run `npm run build` once and load `.output/chrome-mv3` as an unpacked
extension (`chrome://extensions` → Developer mode → Load unpacked) to see
the extension ID Chrome derives from your key — you'll need it in the next
step. It'll stay the same on every future build as long as you keep
`.secrets/extension-key.pem`.

### 3. Set up a Google OAuth client

In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Enable the **Google Sheets API** for your project.
2. Create an OAuth client of type **Web application**.
3. Under **Authorized redirect URIs**, add:
   `https://<your-extension-id>.chromiumapp.org/`
4. Copy the client ID into `GOOGLE_OAUTH_CLIENT_ID` in
   [`lib/auth.ts`](lib/auth.ts).

### 4. Run it

```bash
npm run dev          # Chrome, with hot reload
npm run dev:firefox  # Firefox (not actively supported/tested)
npm run build        # Production build → .output/chrome-mv3
npm run zip          # Zips the build for store upload
```

Load the unpacked build from `.output/chrome-mv3` in `chrome://extensions`
or `edge://extensions` (enable Developer mode in both).

### Other scripts

```bash
npm run compile   # TypeScript type-check, no emit
```

## Status

Currently v2.0.0 — feature-complete for personal use in Chrome and Edge,
not yet published to the Chrome Web Store or Edge Add-ons.

## Privacy

See [`PRIVACY.md`](PRIVACY.md), also published at
[str58290.github.io/Job_Application_Tracker_Extension/PRIVACY.html](https://str58290.github.io/Job_Application_Tracker_Extension/PRIVACY.html).
