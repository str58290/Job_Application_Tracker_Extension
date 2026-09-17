import { getAuthToken, AuthError } from '@/lib/auth';
import { connectExistingSpreadsheet, createTrackerSpreadsheet, identityColumnMap, SheetsApiError } from '@/lib/sheets';
import {
  columnMapping,
  connectedSheetId,
  connectedSheetName,
  connectedSheetTab,
  onboardingComplete,
} from '@/lib/storage';
import { APPLICATION_COLUMNS, type ApplicationColumn } from '@/lib/schema';
import { getCachedTheme, initTheme, toggleTheme } from '@/lib/theme';

type Step = 'connect' | 'sheet-setup' | 'already-done';

const app = document.getElementById('app')!;

interface ConnectedExisting {
  id: string;
  name: string;
  tab: string;
  columns: Record<ApplicationColumn, number>;
  addedColumns: ApplicationColumn[];
}

const state: {
  step: Step;
  token: string | null;
  connectError: string | null;

  sheetName: string;
  creating: boolean;
  createError: string | null;
  createdSheet: { id: string; name: string; url: string } | null;

  existingSheetInput: string;
  connectingExisting: boolean;
  connectExistingError: string | null;
  connectedExisting: ConnectedExisting | null;
} = {
  step: 'connect',
  token: null,
  connectError: null,

  sheetName: `Internship Applications ${new Date().getFullYear()}`,
  creating: false,
  createError: null,
  createdSheet: null,

  existingSheetInput: '',
  connectingExisting: false,
  connectExistingError: null,
  connectedExisting: null,
};

// Accepts either a full Google Sheets URL or a bare spreadsheet ID.
function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) return urlMatch[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

const icons = {
  check: (color: string) =>
    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 6"></path></svg>`,
  brandCheck:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 6"></path></svg>',
  drive: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0E7C72" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"></rect><path d="M3 6l9 6 9-6"></path></svg>',
  lock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B6A64" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="1.5"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>',
  google:
    '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20.4H24v7.2h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.4-5.4C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6 4.4C13.8 15.5 18.5 12 24 12c3.1 0 5.8 1.2 8 3.1l5.4-5.4C34.6 6 29.6 4 24 4c-8.1 0-14.9 4.6-18.4 11.3z"/><path fill="#4CAF50" d="M24 44c5.6 0 10.5-1.9 14-5.2l-6.4-5.4c-2 1.4-4.6 2.3-7.6 2.3-5.3 0-9.7-3.4-11.3-8L6.2 32C9.7 39.4 16.4 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20.4H24v7.2h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.4 5.4C41.5 35.6 44 30.2 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>',
  file: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0E7C72" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M12 12v6M9 15h6"></path></svg>',
  search:
    '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#52514E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  sun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B6A64" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>',
  moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B6A64" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
};

function topbar(): string {
  const step = state.step;
  const connectDone = step !== 'connect';
  const isDark = getCachedTheme() === 'dark';
  return `
    <div class="topbar">
      <div class="brand">
        <div class="brand-mark">${icons.brandCheck}</div>
        <span class="brand-name">Job/Internship Tracker</span>
      </div>
      <div class="topbar-right">
        <div class="steps">
          <span class="step-dot ${connectDone ? 'done' : 'active'}">${connectDone ? icons.check('currentColor') : '1'}</span>
          <span class="step-label ${connectDone ? '' : 'active'}">Connect Google</span>
          <span class="step-sep"></span>
          <span class="step-dot ${!connectDone ? '' : 'active'}">2</span>
          <span class="step-label ${!connectDone ? '' : 'active'}">Set up sheet</span>
        </div>
        <button id="theme-toggle-btn" class="icon-btn" title="Toggle theme">${isDark ? icons.sun : icons.moon}</button>
      </div>
    </div>
  `;
}

function renderConnect(): string {
  return `
    ${topbar()}
    <div class="content center-vertical">
      <div class="connect-card">
        <div class="connect-icon">${icons.drive}</div>
        <div class="connect-title">Connect your Google Account</div>
        <div class="connect-copy">
          Job/Internship Tracker reads and writes only the one spreadsheet you choose on the next step &mdash; nothing else in your Drive, Gmail, or Google Account.
        </div>
        <button id="connect-btn" class="google-btn">${icons.google} Sign in with Google</button>
        <div class="reassurance">${icons.lock}<span>We never see your password &middot; disconnect anytime from the dashboard</span></div>
        ${state.connectError ? `<div class="error-banner">${escapeHtml(state.connectError)}</div>` : ''}
      </div>
    </div>
  `;
}

function renderSheetSetup(): string {
  const created = state.createdSheet;
  const connectedExisting = state.connectedExisting;
  const anyConnected = !!created || !!connectedExisting;
  return `
    ${topbar()}
    <div class="content">
      <div class="page-title">Set up your tracker sheet</div>
      <div class="page-subtitle">
        Your applications live in a normal Google Sheet in your own Drive &mdash; open it anytime for a deeper look, no extension required.
      </div>

      <div class="choice-row">
        <div class="choice-card recommended">
          <span class="recommended-badge">Recommended</span>
          <div class="choice-icon">${icons.file}</div>
          <div class="choice-title">Create a new sheet</div>
          <div class="choice-copy">We'll create a fresh spreadsheet in your Drive, already structured for tracking.</div>
          <div class="choice-checklist">
            <div class="choice-checklist-item">${icons.check('#0CA30C')} Standard application statuses already set up</div>
            <div class="choice-checklist-item">${icons.check('#0CA30C')} A Status History tab for a full timeline</div>
            <div class="choice-checklist-item">${icons.check('#0CA30C')} 100% yours &mdash; lives in your own Drive</div>
          </div>

          ${
            created
              ? `<div class="confirmed-sheet">${icons.check('#0A5F57')} Created &ldquo;${escapeHtml(created.name)}&rdquo; &mdash; <a href="${created.url}" target="_blank" rel="noopener">open in Sheets</a></div>
                 <button id="create-btn" class="secondary-btn" disabled>Sheet created</button>`
              : `<input id="sheet-name-input" class="text-input" type="text" placeholder="Sheet name" value="${escapeHtml(state.sheetName)}" ${connectedExisting ? 'disabled' : ''} />
                 <button id="create-btn" class="primary-btn" ${state.creating || connectedExisting ? 'disabled' : ''}>${state.creating ? 'Creating…' : 'Create Sheet'}</button>`
          }
          ${state.createError ? `<div class="error-banner">${escapeHtml(state.createError)}</div>` : ''}
        </div>

        <div class="choice-card">
          <div class="choice-icon neutral">${icons.search}</div>
          <div class="choice-title">Use an existing sheet</div>
          <div class="choice-copy">Signed out and back in? Reconnect the sheet Job/Internship Tracker created for you last time &mdash; paste its link below and we'll pick up right where you left off.</div>
          ${
            connectedExisting
              ? `<div class="confirmed-sheet">${icons.check('#0A5F57')} Connected &ldquo;${escapeHtml(connectedExisting.name)}&rdquo;${connectedExisting.addedColumns.length ? ` &mdash; added ${connectedExisting.addedColumns.length} missing column${connectedExisting.addedColumns.length > 1 ? 's' : ''}` : ''}</div>
                 <button class="secondary-btn" disabled>Sheet connected</button>`
              : `<input id="existing-sheet-input" class="text-input" type="text" placeholder="Paste sheet link or ID" value="${escapeHtml(state.existingSheetInput)}" ${created ? 'disabled' : ''} />
                 <button id="connect-existing-btn" class="secondary-btn" ${state.connectingExisting || created ? 'disabled' : ''}>${state.connectingExisting ? 'Connecting…' : 'Connect Sheet'}</button>`
          }
          ${state.connectExistingError ? `<div class="error-banner">${escapeHtml(state.connectExistingError)}</div>` : ''}
        </div>
      </div>

      <div class="schema-card">
        <div class="schema-eyebrow">What we'll set up inside your sheet</div>
        <div class="schema-copy">An &ldquo;Applications&rdquo; tab with these columns, plus a &ldquo;Status History&rdquo; tab that logs every status change over time:</div>
        <div>
          ${APPLICATION_COLUMNS.map((c) => `<span class="col-chip">${c}</span>`).join('')}
        </div>
      </div>
    </div>

    <div class="footer">
      <button id="back-btn" class="footer-btn">Back</button>
      <button id="continue-btn" class="footer-btn primary" ${anyConnected ? '' : 'disabled'}>Continue</button>
    </div>
  `;
}

function renderAlreadyDone(): string {
  return `
    ${topbar()}
    <div class="content center-vertical">
      <div class="connect-card">
        <div class="connect-icon">${icons.check('#0E7C72')}</div>
        <div class="connect-title">You're all set</div>
        <div class="connect-copy">Job/Internship Tracker is already connected to your sheet.</div>
        <button id="open-dashboard-btn" class="primary-btn">Open Dashboard</button>
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function render() {
  if (state.step === 'connect') app.innerHTML = renderConnect();
  else if (state.step === 'sheet-setup') app.innerHTML = renderSheetSetup();
  else app.innerHTML = renderAlreadyDone();
  wire();
}

function wire() {
  document.getElementById('theme-toggle-btn')?.addEventListener('click', async () => {
    await toggleTheme();
    render();
  });
  document.getElementById('connect-btn')?.addEventListener('click', onConnectClick);
  document.getElementById('sheet-name-input')?.addEventListener('input', (e) => {
    state.sheetName = (e.target as HTMLInputElement).value;
  });
  document.getElementById('create-btn')?.addEventListener('click', onCreateSheetClick);
  document.getElementById('existing-sheet-input')?.addEventListener('input', (e) => {
    state.existingSheetInput = (e.target as HTMLInputElement).value;
  });
  document.getElementById('connect-existing-btn')?.addEventListener('click', onConnectExistingClick);
  document.getElementById('back-btn')?.addEventListener('click', () => {
    state.step = 'connect';
    render();
  });
  document.getElementById('continue-btn')?.addEventListener('click', onContinueClick);
  document.getElementById('open-dashboard-btn')?.addEventListener('click', goToDashboard);
}

async function onConnectClick() {
  state.connectError = null;
  const btn = document.getElementById('connect-btn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  try {
    state.token = await getAuthToken(true);
    state.step = 'sheet-setup';
  } catch (err) {
    state.connectError =
      err instanceof AuthError
        ? "Couldn't connect that Google Account. Please try again."
        : 'Something went wrong connecting to Google.';
  }
  render();
}

async function onCreateSheetClick() {
  if (!state.token) {
    state.step = 'connect';
    render();
    return;
  }
  state.creating = true;
  state.createError = null;
  render();

  try {
    const year = new Date().getFullYear();
    const title = state.sheetName.trim() || `Internship Applications ${year}`;
    const sheet = await createTrackerSpreadsheet(state.token, title);
    state.createdSheet = { id: sheet.spreadsheetId, name: title, url: sheet.spreadsheetUrl };
    await Promise.all([
      connectedSheetId.setValue(sheet.spreadsheetId),
      connectedSheetName.setValue(title),
      connectedSheetTab.setValue('Applications'),
      columnMapping.setValue(identityColumnMap()),
    ]);
    state.creating = false;
    render();
    // Move on automatically instead of making the user click Continue —
    // the brief render above still shows the "Created ✓" confirmation.
    await onboardingComplete.setValue(true);
    setTimeout(goToDashboard, 900);
  } catch (err) {
    state.creating = false;
    state.createError = 'Could not create the sheet. Please try again.';
    render();
  }
}

async function onConnectExistingClick() {
  if (!state.token) {
    state.step = 'connect';
    render();
    return;
  }
  const id = extractSpreadsheetId(state.existingSheetInput);
  if (!id) {
    state.connectExistingError = 'Paste the link to your Google Sheet, or its ID.';
    render();
    return;
  }

  state.connectingExisting = true;
  state.connectExistingError = null;
  render();

  try {
    const info = await connectExistingSpreadsheet(state.token, id);
    state.connectedExisting = {
      id: info.spreadsheetId,
      name: info.title,
      tab: info.tab,
      columns: info.columns,
      addedColumns: info.addedColumns,
    };
    await Promise.all([
      connectedSheetId.setValue(info.spreadsheetId),
      connectedSheetName.setValue(info.title),
      connectedSheetTab.setValue(info.tab),
      columnMapping.setValue(info.columns),
    ]);
    state.connectingExisting = false;
    render();
    await onboardingComplete.setValue(true);
    setTimeout(goToDashboard, 900);
  } catch (err) {
    state.connectingExisting = false;
    state.connectExistingError =
      err instanceof SheetsApiError && err.status === 404
        ? "Couldn't find that spreadsheet. Double-check the link and that it's shared with this Google Account."
        : 'Could not connect that sheet. Please check the link and try again.';
    render();
  }
}

async function onContinueClick() {
  await onboardingComplete.setValue(true);
  goToDashboard();
}

function goToDashboard() {
  window.location.href = '/dashboard.html';
}

async function init() {
  await initTheme(render);

  const done = await onboardingComplete.getValue();
  if (done) {
    state.step = 'already-done';
    render();
    return;
  }

  // If we already have a cached, non-interactive token, skip straight to step 2.
  try {
    state.token = await getAuthToken(false);
    state.step = 'sheet-setup';
  } catch {
    state.step = 'connect';
    render();
    return;
  }

  // A sheet may already exist from a previous run that didn't reach
  // "Continue" (e.g. this tab was closed right after Create Sheet) — reflect
  // that instead of letting Create Sheet make a second spreadsheet.
  const [existingId, existingName] = await Promise.all([
    connectedSheetId.getValue(),
    connectedSheetName.getValue(),
  ]);
  if (existingId && existingName) {
    state.createdSheet = {
      id: existingId,
      name: existingName,
      url: `https://docs.google.com/spreadsheets/d/${existingId}/edit`,
    };
  }
  render();
}

init();
