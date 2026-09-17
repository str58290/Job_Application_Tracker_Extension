import { getAuthToken } from '@/lib/auth';
import {
  appendApplication,
  deleteApplicationRows,
  getApplications,
  updateApplicationFields,
  SheetsApiError,
} from '@/lib/sheets';
import { connectedSheetId, connectedSheetName, onboardingComplete } from '@/lib/storage';
import { STATUSES, DEFAULT_STATUS, type Application, type ApplicationColumn, type Status } from '@/lib/schema';
import { STATUS_DOT, statusClass, statusLabel } from '@/lib/status';
import { getCachedTheme, initTheme, toggleTheme } from '@/lib/theme';

type View = 'kanban' | 'table';
type SortKey = 'updated' | 'company' | 'daysInStatus';

interface EditorDraft {
  mode: 'create' | 'edit';
  rowIndex: number | null;
  company: string;
  role: string;
  status: Status;
  jobUrl: string;
  contact: string;
  referral: boolean;
  notes: string;
}

type AppState =
  | { kind: 'loading' }
  | { kind: 'not-connected' }
  | { kind: 'auth-error' }
  | {
      kind: 'ready';
      token: string;
      sheetId: string;
      sheetName: string;
      applications: Application[];
      view: View;
      search: string;
      statusFilter: string;
      sort: SortKey;
      selected: Set<number>;
      error: string | null;
      editor: EditorDraft | null;
      editorSaving: boolean;
      editorDeleting: boolean;
      editorError: string | null;
    };

type ReadyState = Extract<AppState, { kind: 'ready' }>;

const app = document.getElementById('app')!;
let state: AppState = { kind: 'loading' };

const icons = {
  brandCheck:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 6"></path></svg>',
  search:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9A93" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  chevronDown:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9B9A93" stroke-width="2"><path d="M6 9l6 6 6-6"></path></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>',
  close:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B6A64" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>',
  external:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B6A64" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><path d="M15 3h6v6"></path><path d="M10 14L21 3"></path></svg>',
  refresh:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B6A64" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path><path d="M8 16H3v5"></path></svg>',
  checkSquare:
    '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 6"></path></svg>',
  sun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B6A64" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>',
  moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B6A64" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
  clock:
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#767469" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path></svg>',
};

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return '—';
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return dateStr;
  const days = Math.max(0, Math.round((Date.now() - then) / 86400000));
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

// --- Rendering ---

function render() {
  const activeId = document.activeElement instanceof HTMLElement ? document.activeElement.id : '';
  const activeInput = document.activeElement instanceof HTMLInputElement ? document.activeElement : null;
  const selStart = activeInput?.selectionStart ?? null;

  app.innerHTML = renderApp();
  wire();

  if (activeId) {
    const el = document.getElementById(activeId);
    if (el instanceof HTMLElement) {
      el.focus();
      if (el instanceof HTMLInputElement && selStart !== null) {
        try {
          el.setSelectionRange(selStart, selStart);
        } catch {
          // Not a text-selectable input type; ignore.
        }
      }
    }
  }
}

function renderApp(): string {
  if (state.kind === 'loading') return renderLoading();
  if (state.kind === 'not-connected') return renderNotConnected();
  if (state.kind === 'auth-error') return renderAuthError();
  const s = state;
  return `
    <div class="app">
      ${renderTopbar(s)}
      ${renderToolbar(s)}
      <div class="main">
        ${s.error ? `<div class="error-banner">${escapeHtml(s.error)}</div>` : ''}
        ${s.view === 'kanban' ? renderKanban(s) : renderTable(s)}
      </div>
    </div>
    ${renderEditorDialog(s)}
  `;
}

function renderLoading(): string {
  return `<div class="loading-state">Loading your applications&hellip;</div>`;
}

function renderNotConnected(): string {
  return `
    <div class="connect-prompt">
      <div class="connect-prompt-title">Set up Job/Internship Tracker first</div>
      <div class="connect-prompt-copy">Connect your Google Account and set up a tracker sheet to see your dashboard.</div>
      <button id="setup-btn" class="primary-btn">Start setup</button>
    </div>
  `;
}

function renderAuthError(): string {
  return `
    <div class="connect-prompt">
      <div class="connect-prompt-title">Reconnect your Google Account</div>
      <div class="connect-prompt-copy">Your Google session expired or access was revoked. Reconnect to keep tracking your applications.</div>
      <button id="reconnect-btn" class="primary-btn">Reconnect Google Account</button>
    </div>
  `;
}

function renderTopbar(s: ReadyState): string {
  const count = s.applications.length;
  const isDark = getCachedTheme() === 'dark';
  return `
    <div class="topbar">
      <div class="brand">
        <div class="brand-mark">${icons.brandCheck}</div>
        <span class="brand-name">Job/Internship Tracker</span>
      </div>
      <div class="topbar-right">
        <div class="sync-status">
          <span class="sync-dot"></span>
          <div>
            <div class="sync-text-title">Connected: ${escapeHtml(s.sheetName)}</div>
            <div class="sync-text-sub">${count} application${count === 1 ? '' : 's'} tracked</div>
          </div>
        </div>
        <div class="topbar-divider"></div>
        <button id="open-sheet-btn" class="icon-btn" title="Open in Google Sheets">${icons.external}</button>
        <button id="refresh-btn" class="icon-btn" title="Refresh">${icons.refresh}</button>
        <button id="theme-toggle-btn" class="icon-btn" title="Toggle theme">${isDark ? icons.sun : icons.moon}</button>
      </div>
    </div>
  `;
}

function renderToolbar(s: ReadyState): string {
  return `
    <div class="toolbar">
      <div class="search-box">
        ${icons.search}
        <input id="search-input" type="text" placeholder="Search applications&hellip;" value="${escapeHtml(s.search)}" />
      </div>
      <div class="chip-select-wrap">
        <select id="status-filter" class="chip-select">
          <option value="All" ${s.statusFilter === 'All' ? 'selected' : ''}>Status: All</option>
          ${STATUSES.map((st) => `<option value="${st}" ${s.statusFilter === st ? 'selected' : ''}>Status: ${statusLabel(st)}</option>`).join('')}
        </select>
        ${icons.chevronDown}
      </div>
      <div class="chip-select-wrap">
        <select id="sort-select" class="chip-select">
          <option value="updated" ${s.sort === 'updated' ? 'selected' : ''}>Sort: Recently updated</option>
          <option value="company" ${s.sort === 'company' ? 'selected' : ''}>Sort: Company (A&ndash;Z)</option>
          <option value="daysInStatus" ${s.sort === 'daysInStatus' ? 'selected' : ''}>Sort: Longest in status</option>
        </select>
        ${icons.chevronDown}
      </div>
      <div class="toolbar-spacer"></div>
      <div class="view-toggle">
        <button id="view-kanban-btn" class="${s.view === 'kanban' ? 'active' : ''}">Board</button>
        <button id="view-table-btn" class="${s.view === 'table' ? 'active' : ''}">Table</button>
      </div>
      <button id="add-app-btn" class="add-btn">${icons.plus} Add Application</button>
    </div>
  `;
}

function visibleApplications(s: ReadyState): Application[] {
  let list = s.applications;
  if (s.statusFilter !== 'All') list = list.filter((a) => a.status === s.statusFilter);
  const q = s.search.trim().toLowerCase();
  if (q) list = list.filter((a) => a.company.toLowerCase().includes(q) || a.role.toLowerCase().includes(q));

  const sorted = [...list];
  if (s.sort === 'company') sorted.sort((a, b) => a.company.localeCompare(b.company));
  else if (s.sort === 'daysInStatus') sorted.sort((a, b) => b.daysInStatus - a.daysInStatus);
  else sorted.sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || ''));
  return sorted;
}

function renderKanban(s: ReadyState): string {
  if (s.applications.length === 0) return renderEmptyDashboard();
  const visible = visibleApplications(s);
  return `<div class="kanban">${STATUSES.map((status) => renderKanbanColumn(status, visible.filter((a) => a.status === status))).join('')}</div>`;
}

function renderKanbanColumn(status: Status, apps: Application[]): string {
  return `
    <div class="kanban-col">
      <div class="kanban-col-header">
        <span class="kanban-col-dot" style="background:${STATUS_DOT[status]}"></span>
        <span class="kanban-col-title">${statusLabel(status)}</span>
        <span class="kanban-col-count">${apps.length}</span>
      </div>
      <div class="kanban-cards">${apps.map(renderJobCard).join('')}</div>
    </div>
  `;
}

function renderJobCard(a: Application): string {
  const faded = a.status === 'Rejected' || a.status === 'Withdrawn';
  return `
    <div class="job-card ${a.status === 'Offer' ? 'status-offer' : ''} ${faded ? 'faded' : ''}" data-row="${a.rowIndex}">
      <div class="job-card-top">
        <div class="job-avatar">${initials(a.company)}</div>
        <span class="job-card-company">${escapeHtml(a.company)}</span>
      </div>
      <div class="job-card-role">${escapeHtml(a.role || '—')}</div>
      ${a.daysInStatus > 0 ? `<div class="job-card-meta">${icons.clock}${a.daysInStatus} day${a.daysInStatus === 1 ? '' : 's'} in status</div>` : ''}
    </div>
  `;
}

function renderEmptyDashboard(): string {
  return `<div class="empty-dashboard">No applications yet. Click &ldquo;Add Application&rdquo; to track your first one.</div>`;
}

function renderTable(s: ReadyState): string {
  if (s.applications.length === 0) return renderEmptyDashboard();
  const visible = visibleApplications(s);
  const selectedCount = s.selected.size;
  return `
    ${selectedCount > 0 ? renderBulkBar(s, selectedCount) : ''}
    <div class="table-wrap">
      <div class="table-header-row">
        <span></span>
        <span>Company</span>
        <span>Role</span>
        <span>Status</span>
        <span>Updated</span>
      </div>
      ${visible.length ? visible.map((a) => renderTableRow(a, s)).join('') : `<div class="empty-state">No applications match your filters.</div>`}
    </div>
  `;
}

function renderBulkBar(s: ReadyState, count: number): string {
  return `
    <div class="bulk-bar">
      <span class="bulk-bar-count">${count} selected</span>
      <span class="bulk-bar-sep"></span>
      <select id="bulk-status-select" class="bulk-select">
        <option value="">Set Status&hellip;</option>
        ${STATUSES.map((st) => `<option value="${st}">${statusLabel(st)}</option>`).join('')}
      </select>
      <div class="bulk-spacer"></div>
      <button id="bulk-apply-btn" class="bulk-apply-btn">Apply to ${count}</button>
      <button id="bulk-delete-btn" class="bulk-delete-btn">Delete ${count}</button>
      <button id="bulk-cancel-btn" class="bulk-cancel-btn">Cancel</button>
    </div>
  `;
}

function renderTableRow(a: Application, s: ReadyState): string {
  const checked = s.selected.has(a.rowIndex);
  const faded = a.status === 'Rejected' || a.status === 'Withdrawn';
  return `
    <div class="table-row ${faded ? 'faded' : ''}" data-row="${a.rowIndex}">
      <span class="row-checkbox ${checked ? 'checked' : ''}" data-checkbox="${a.rowIndex}">${checked ? icons.checkSquare : ''}</span>
      <span class="table-company"><span class="table-avatar">${initials(a.company)}</span><span class="name">${escapeHtml(a.company)}</span></span>
      <span class="table-role">${escapeHtml(a.role || '—')}</span>
      <span class="status-pill ${statusClass(a.status)}">${statusLabel(a.status)}</span>
      <span class="table-updated">${relativeTime(a.lastUpdated)}</span>
    </div>
  `;
}

// --- Application editor dialog (add / edit) ---

function renderEditorDialog(s: ReadyState): string {
  const d = s.editor;
  if (!d) return '';
  return `
    <dialog id="editor-dialog">
      <div class="dialog-header">
        <span class="dialog-title">${d.mode === 'create' ? 'Add Application' : 'Edit Application'}</span>
        <button id="editor-close-btn" class="icon-btn">${icons.close}</button>
      </div>
      <div class="dialog-body">
        ${s.editorError ? `<div class="error-banner">${escapeHtml(s.editorError)}</div>` : ''}
        <div class="field-group">
          <label>Company</label>
          <input id="editor-company" type="text" value="${escapeHtml(d.company)}" />
        </div>
        <div class="field-group">
          <label>Role</label>
          <input id="editor-role" type="text" value="${escapeHtml(d.role)}" />
        </div>
        <div class="field-group">
          <label>Status</label>
          <select id="editor-status">
            ${STATUSES.map((st) => `<option value="${st}" ${st === d.status ? 'selected' : ''}>${statusLabel(st)}</option>`).join('')}
          </select>
        </div>
        <div class="field-group">
          <label>Job URL <span style="text-transform:none;font-weight:500;">(optional)</span></label>
          <input id="editor-joburl" type="text" value="${escapeHtml(d.jobUrl)}" placeholder="https://&hellip;" />
        </div>
        <div class="field-group">
          <label>Contact <span style="text-transform:none;font-weight:500;">(optional)</span></label>
          <input id="editor-contact" type="text" value="${escapeHtml(d.contact)}" />
        </div>
        <div class="default-check-row" style="margin-bottom:14px;">
          <input id="editor-referral" type="checkbox" ${d.referral ? 'checked' : ''} />
          <label for="editor-referral" style="cursor:pointer;">Got a referral</label>
        </div>
        <div class="field-group">
          <label>Notes <span style="text-transform:none;font-weight:500;">(optional)</span></label>
          <input id="editor-notes" type="text" value="${escapeHtml(d.notes)}" />
        </div>
      </div>
      <div class="dialog-footer">
        ${d.mode === 'edit' ? `<button id="editor-delete-btn" class="danger-btn" ${s.editorDeleting ? 'disabled' : ''}>${s.editorDeleting ? 'Deleting&hellip;' : 'Delete'}</button>` : '<span></span>'}
        <div class="dialog-footer-right">
          <button id="editor-cancel-btn" class="cancel-btn">Cancel</button>
          <button id="editor-save-btn" class="primary-btn" ${s.editorSaving ? 'disabled' : ''}>${s.editorSaving ? 'Saving&hellip;' : d.mode === 'create' ? 'Add Application' : 'Save Changes'}</button>
        </div>
      </div>
    </dialog>
  `;
}

function openCreateEditor() {
  if (state.kind !== 'ready') return;
  state.editor = {
    mode: 'create',
    rowIndex: null,
    company: '',
    role: '',
    status: DEFAULT_STATUS,
    jobUrl: '',
    contact: '',
    referral: false,
    notes: '',
  };
  state.editorError = null;
  render();
}

function openEditEditor(a: Application) {
  if (state.kind !== 'ready') return;
  state.editor = {
    mode: 'edit',
    rowIndex: a.rowIndex,
    company: a.company,
    role: a.role,
    status: a.status,
    jobUrl: a.jobUrl,
    contact: a.contact,
    referral: a.referral,
    notes: a.notes,
  };
  state.editorError = null;
  render();
}

function closeEditor() {
  if (state.kind !== 'ready') return;
  state.editor = null;
  state.editorError = null;
  state.editorDeleting = false;
  render();
}

function wireEditorDialog(s: ReadyState) {
  const dialog = document.getElementById('editor-dialog');
  if (!(dialog instanceof HTMLDialogElement) || !s.editor) return;
  if (!dialog.open) dialog.showModal();
  const d = s.editor;

  document.getElementById('editor-close-btn')?.addEventListener('click', closeEditor);
  document.getElementById('editor-cancel-btn')?.addEventListener('click', closeEditor);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeEditor();
  });

  bindText('editor-company', (v) => (d.company = v));
  bindText('editor-role', (v) => (d.role = v));
  bindText('editor-joburl', (v) => (d.jobUrl = v));
  bindText('editor-contact', (v) => (d.contact = v));
  bindText('editor-notes', (v) => (d.notes = v));

  document.getElementById('editor-status')?.addEventListener('change', (e) => {
    d.status = (e.target as HTMLSelectElement).value as Status;
    render();
  });
  document.getElementById('editor-referral')?.addEventListener('change', (e) => {
    d.referral = (e.target as HTMLInputElement).checked;
    render();
  });

  document.getElementById('editor-save-btn')?.addEventListener('click', onEditorSave);
  document.getElementById('editor-delete-btn')?.addEventListener('click', onEditorDelete);
}

function bindText(id: string, apply: (value: string) => void) {
  document.getElementById(id)?.addEventListener('input', (e) => {
    apply((e.target as HTMLInputElement).value);
    render();
  });
}

async function onEditorSave() {
  if (state.kind !== 'ready' || !state.editor) return;
  const d = state.editor;
  if (!d.company.trim() || !d.role.trim()) {
    state.editorError = 'Company and role are required.';
    render();
    return;
  }

  state.editorSaving = true;
  state.editorError = null;
  render();

  try {
    if (d.mode === 'create') {
      await appendApplication(state.token, state.sheetId, {
        company: d.company.trim(),
        role: d.role.trim(),
        status: d.status,
        jobUrl: d.jobUrl.trim(),
        contact: d.contact.trim(),
        referral: d.referral,
        notes: d.notes.trim(),
      });
    } else if (d.rowIndex !== null) {
      await updateApplicationFields(state.token, state.sheetId, d.rowIndex, {
        Company: d.company.trim(),
        Role: d.role.trim(),
        Status: d.status,
        'Job URL': d.jobUrl.trim(),
        Contact: d.contact.trim(),
        'Referral?': d.referral ? 'Yes' : 'No',
        Notes: d.notes.trim(),
      });
    }
    state.applications = await getApplications(state.token, state.sheetId);
    state.editor = null;
    state.editorSaving = false;
    render();
  } catch (err) {
    state.editorSaving = false;
    state.editorError =
      err instanceof SheetsApiError ? 'Could not save to your sheet. Please try again.' : 'Something went wrong. Please try again.';
    render();
  }
}

async function onEditorDelete() {
  if (state.kind !== 'ready' || !state.editor) return;
  const d = state.editor;
  if (d.rowIndex === null) return;
  if (!window.confirm(`Delete the application for ${d.company || 'this entry'}? This can't be undone.`)) return;

  state.editorDeleting = true;
  state.editorError = null;
  render();

  try {
    await deleteApplicationRows(state.token, state.sheetId, [d.rowIndex]);
    state.applications = await getApplications(state.token, state.sheetId);
    state.editor = null;
    state.editorDeleting = false;
    render();
  } catch {
    state.editorDeleting = false;
    state.editorError = 'Could not delete that application. Please try again.';
    render();
  }
}

// --- Top-level wiring ---

function wire() {
  if (state.kind === 'not-connected') {
    document.getElementById('setup-btn')?.addEventListener('click', () => {
      window.location.href = '/onboarding.html';
    });
    return;
  }
  if (state.kind === 'auth-error') {
    document.getElementById('reconnect-btn')?.addEventListener('click', onReconnectClick);
    return;
  }
  if (state.kind !== 'ready') return;

  const s = state;

  document.getElementById('open-sheet-btn')?.addEventListener('click', () => {
    window.open(`https://docs.google.com/spreadsheets/d/${s.sheetId}/edit`, '_blank', 'noopener');
  });
  document.getElementById('refresh-btn')?.addEventListener('click', onRefresh);
  document.getElementById('add-app-btn')?.addEventListener('click', openCreateEditor);
  document.getElementById('theme-toggle-btn')?.addEventListener('click', async () => {
    await toggleTheme();
    render();
  });

  document.getElementById('view-kanban-btn')?.addEventListener('click', () => {
    s.view = 'kanban';
    render();
  });
  document.getElementById('view-table-btn')?.addEventListener('click', () => {
    s.view = 'table';
    render();
  });

  document.getElementById('search-input')?.addEventListener('input', (e) => {
    s.search = (e.target as HTMLInputElement).value;
    render();
  });
  document.getElementById('status-filter')?.addEventListener('change', (e) => {
    s.statusFilter = (e.target as HTMLSelectElement).value;
    render();
  });
  document.getElementById('sort-select')?.addEventListener('change', (e) => {
    s.sort = (e.target as HTMLSelectElement).value as SortKey;
    render();
  });

  document.querySelectorAll<HTMLElement>('.job-card').forEach((card) => {
    card.addEventListener('click', () => {
      const rowIndex = Number(card.dataset.row);
      const a = s.applications.find((x) => x.rowIndex === rowIndex);
      if (a) openEditEditor(a);
    });
  });

  document.querySelectorAll<HTMLElement>('.table-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-checkbox]')) return;
      const rowIndex = Number(row.dataset.row);
      const a = s.applications.find((x) => x.rowIndex === rowIndex);
      if (a) openEditEditor(a);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-checkbox]').forEach((cb) => {
    cb.addEventListener('click', (e) => {
      e.stopPropagation();
      const rowIndex = Number(cb.dataset.checkbox);
      if (s.selected.has(rowIndex)) s.selected.delete(rowIndex);
      else s.selected.add(rowIndex);
      render();
    });
  });

  document.getElementById('bulk-cancel-btn')?.addEventListener('click', () => {
    s.selected.clear();
    render();
  });
  document.getElementById('bulk-apply-btn')?.addEventListener('click', onBulkApply);
  document.getElementById('bulk-delete-btn')?.addEventListener('click', onBulkDelete);

  wireEditorDialog(s);
}

async function onRefresh() {
  if (state.kind !== 'ready') return;
  try {
    state.applications = await getApplications(state.token, state.sheetId);
    state.error = null;
  } catch {
    state.error = 'Could not refresh. Please try again.';
  }
  render();
}

async function onBulkApply() {
  if (state.kind !== 'ready') return;
  const statusSelect = document.getElementById('bulk-status-select') as HTMLSelectElement | null;
  const statusVal = statusSelect?.value ?? '';
  if (!statusVal) return;

  const updates: Partial<Record<ApplicationColumn, string>> = { Status: statusVal };

  const rows = Array.from(state.selected);
  state.error = null;
  render();

  try {
    for (const rowIndex of rows) {
      await updateApplicationFields(state.token, state.sheetId, rowIndex, updates);
    }
    state.applications = await getApplications(state.token, state.sheetId);
    state.selected.clear();
    render();
  } catch {
    state.error = 'Some updates may not have saved. Please refresh and try again.';
    render();
  }
}

async function onBulkDelete() {
  if (state.kind !== 'ready') return;
  const rows = Array.from(state.selected);
  if (!rows.length) return;
  if (!window.confirm(`Delete ${rows.length} application${rows.length === 1 ? '' : 's'}? This can't be undone.`)) return;

  state.error = null;
  render();

  try {
    await deleteApplicationRows(state.token, state.sheetId, rows);
    state.applications = await getApplications(state.token, state.sheetId);
    state.selected.clear();
    render();
  } catch {
    state.error = 'Could not delete those applications. Please try again.';
    render();
  }
}

async function onReconnectClick() {
  try {
    const token = await getAuthToken(true);
    await init(token);
  } catch {
    state = { kind: 'auth-error' };
    render();
  }
}

async function init(existingToken?: string) {
  state = { kind: 'loading' };
  render();

  const [done, sheetId, sheetName] = await Promise.all([
    onboardingComplete.getValue(),
    connectedSheetId.getValue(),
    connectedSheetName.getValue(),
  ]);

  if (!done || !sheetId) {
    state = { kind: 'not-connected' };
    render();
    return;
  }

  let token: string;
  if (existingToken) {
    token = existingToken;
  } else {
    try {
      token = await getAuthToken(false);
    } catch {
      state = { kind: 'auth-error' };
      render();
      return;
    }
  }

  const ready: ReadyState = {
    kind: 'ready',
    token,
    sheetId,
    sheetName: sheetName ?? 'Untitled sheet',
    applications: [],
    view: 'kanban',
    search: '',
    statusFilter: 'All',
    sort: 'updated',
    selected: new Set(),
    error: null,
    editor: null,
    editorSaving: false,
    editorDeleting: false,
    editorError: null,
  };

  try {
    ready.applications = await getApplications(token, sheetId);
  } catch (err) {
    ready.error =
      err instanceof SheetsApiError ? 'Could not load your applications. Please refresh.' : 'Something went wrong loading your applications.';
  }

  state = ready;
  render();
}

initTheme(render).then(() => init());
