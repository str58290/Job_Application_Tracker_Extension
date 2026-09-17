# Privacy Policy for Job/Internship Tracker

**Effective date:** 17 Sep 2026

Job/Internship Tracker ("the extension") is a browser extension that helps you track job and internship applications directly inside your own Google Sheet. This policy explains exactly what data the extension accesses, how it's used, and what it never does.

## Summary

Job/Internship Tracker has no server of its own. Your application data lives entirely in a Google Sheet that you own, in your own Google Drive. The developer never receives, stores, or has access to your data — everything is read from and written directly to Google's APIs, from your browser, to your Sheet.

## What we access, and why

### Your Google Account
Signing in requests two Google API permissions ("scopes"):

- **Google Sheets** (`.../auth/spreadsheets`) — to create, read, and update the rows in your tracker spreadsheet (company, role, status, dates, notes, and similar fields).
- **Google Drive, file-scoped** (`.../auth/drive.file`) — limited to spreadsheets the extension itself creates, or that you explicitly choose to connect. This does **not** grant access to your other Drive files, folders, photos, or documents. (In a future version, this same permission will let you connect an existing spreadsheet instead of only creating a new one.)

*Note: the Sheets scope is technically broad enough to reach any spreadsheet in your Drive. In practice, Job/Internship Tracker only ever reads or writes the one spreadsheet you create or connect during setup — it never opens, lists, or modifies any other spreadsheet.*

We do not request your email address, name, profile photo, contacts, calendar, or Gmail, and no other Google scope is requested.

### Application data you enter
Company names, roles, statuses, dates, job posting URLs, recruiter/contact info, and notes you type are written directly to your own Google Sheet via Google's APIs. This data is never sent to, or stored on, any server operated by the developer.

### Local browser storage
The extension stores a small amount of configuration on your device only (via Chrome's `storage.local`): which spreadsheet you've connected, your light/dark theme preference, and a local cache of your application list so the popup loads instantly. This stays on your device — it is not synced to any account and is not accessible to the developer.

### The page you have open (Quick Capture)
When you open the extension's popup, it checks the currently active tab for structured job-posting data (the same schema.org "JobPosting" markup search engines use) so it can offer to pre-fill a new entry. It reads only this structured data already published by the page — never your browsing history, other tabs, or unrelated page content — and only while the popup is open.

## What we don't do

- We don't operate a backend server — there is nowhere for your data to go except Google's own APIs and your local browser.
- We don't use analytics, trackers, or any third-party SDKs.
- We don't sell, rent, or share your data with anyone.
- We don't use your data for advertising.

## Your Google sign-in token
Signing in issues a short-lived access token managed by Chrome's built-in identity system. The extension never stores this token itself — it's requested fresh as needed and is never written to disk, a server, or your spreadsheet.

## Revoking access
You can revoke Job/Internship Tracker's access to your Google Account at any time from [Google Account → Security → Third-party apps with account access](https://myaccount.google.com/permissions). This immediately stops the extension from accessing your Sheets/Drive data.

## Data retention
Because your data lives in your own Google Sheet and local browser storage, you're always in control of it: edit or delete rows in your Sheet at any time, clear the extension's local data from `chrome://extensions`, or uninstall the extension to remove all local storage.

## Children's privacy
Job/Internship Tracker is not directed at children under 13, and we do not knowingly collect data from children under 13.

## Changes to this policy
We may update this policy as the extension changes. The effective date above reflects the latest revision; continued use after a change means you accept the updated policy.

## Contact
Questions about this policy or your data? Contact: sohtairong@gmail.com
