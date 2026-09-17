import { getAuthToken, AuthError } from '@/lib/auth';
import {
  appendApplication,
  connectExistingSpreadsheet,
  deleteApplicationRows,
  getApplications,
  updateApplicationFields,
  SheetsApiError,
} from '@/lib/sheets';
import {
  cachedApplicationsSnapshot,
  columnMapping,
  connectedSheetId,
  connectedSheetTab,
  onboardingComplete,
  reconcileStatusOrder,
  statusFilterOrder,
} from '@/lib/storage';
import { DEFAULT_STATUS, STATUSES, type Application, type ApplicationColumn, type Status } from '@/lib/schema';
import { STATUS_DOT, statusClass, statusLabel } from '@/lib/status';
import { detectJobPosting, type DetectedJob } from '@/lib/job-detect';
import { getCachedTheme, initTheme, toggleTheme } from '@/lib/theme';

const app = document.getElementById('app')!;

type State =
  | { kind: 'loading' }
  | { kind: 'not-connected' }
  | { kind: 'auth-error' }
  | {
      kind: 'capture';
      job: DetectedJob;
      company: string;
      role: string;
      status: Status;
      contact: string;
      referral: boolean;
      notes: string;
      token: string;
      sheetId: string;
      tab: string;
      columns: Record<ApplicationColumn, number>;
      saving: boolean;
      saved: boolean;
      error: string | null;
    }
  | {
      kind: 'update';
      applications: Application[];
      token: string;
      sheetId: string;
      tab: string;
      columns: Record<ApplicationColumn, number>;
      search: string;
      statusFilter: 'All' | Status;
      statusOrder: Status[];
      filterMenuOpen: boolean;
      openRowIndex: number | null;
      deleting: boolean;
      error: string | null;
    }
  | {
      kind: 'quick-add';
      company: string;
      role: string;
      status: Status;
      jobUrl: string;
      contact: string;
      referral: boolean;
      notes: string;
      token: string;
      sheetId: string;
      tab: string;
      columns: Record<ApplicationColumn, number>;
      saving: boolean;
      error: string | null;
      returnTo: Extract<State, { kind: 'update' }>;
    };

let state: State = { kind: 'loading' };

// Tracks the status being dragged in the filter bar across the drag/drop event
// pair — chip elements are recreated on every render, so this can't live on the DOM node.
let dragStatusIndex: number | null = null;

const icons = {
  brandCheck:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 6"></path></svg>',
  close:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9B9A93" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9A93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>',
  link: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B6A64" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"></path></svg>',
  chevronDown:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9A93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>',
  chevronRight:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#52514E" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"></path></svg>',
  search:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9B9A93" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  lock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0CA30C" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>',
  sun: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9B9A93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>',
  moon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9B9A93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
  trash:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16z"></path></svg>',
};

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function initials(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

function statusOptionsHtml(selected: Status): string {
  return STATUSES.map((st) => `<option value="${st}" ${st === selected ? 'selected' : ''}>${statusLabel(st)}</option>`).join('');
}

function header(title: string): string {
  const isDark = getCachedTheme() === 'dark';
  return `
    <div class="header">
      <div class="brand">
        <div class="brand-mark">${icons.brandCheck}</div>
        <span class="brand-name">${escapeHtml(title)}</span>
      </div>
      <div class="header-actions">
        <button class="icon-btn" id="theme-toggle-btn" title="Toggle theme">${isDark ? icons.sun : icons.moon}</button>
        <button class="icon-btn" id="close-btn">${icons.close}</button>
      </div>
    </div>
  `;
}

function renderLoadingSkeleton(): string {
  const row = () => `
    <div class="app-row-wrap">
      <div class="app-row">
        <div class="avatar skeleton-block" style="border:none;"></div>
        <div class="app-info">
          <div class="skeleton-line" style="width:55%;"></div>
          <div class="skeleton-line" style="width:35%;margin-top:6px;"></div>
        </div>
      </div>
    </div>
  `;
  return `
    ${header('Job/Internship Tracker')}
    <div class="search-box">
      <div class="skeleton-block" style="width:100%;height:14px;"></div>
    </div>
    <div class="status-filter-row">
      <div class="skeleton-block" style="width:100%;height:24px;border-radius:999px;"></div>
    </div>
    <div class="app-list">${row()}${row()}</div>
  `;
}

function render() {
  const activeId = document.activeElement instanceof HTMLElement ? document.activeElement.id : '';
  const activeInput = document.activeElement instanceof HTMLInputElement ? document.activeElement : null;
  const selStart = activeInput?.selectionStart ?? null;

  if (state.kind === 'loading') {
    app.innerHTML = renderLoadingSkeleton();
  } else if (state.kind === 'not-connected') {
    app.innerHTML = `
      ${header('Job/Internship Tracker')}
      <div class="connect-prompt">
        <div class="connect-prompt-title">Finish setting up Job/Internship Tracker</div>
        <div class="connect-prompt-copy">Connect your Google Account and set up your tracker sheet to start saving applications.</div>
        <button class="primary-btn" id="setup-btn">Finish setup</button>
      </div>
    `;
  } else if (state.kind === 'auth-error') {
    app.innerHTML = `
      ${header('Job/Internship Tracker')}
      <div class="connect-prompt">
        <div class="connect-prompt-title">Reconnect your Google Account</div>
        <div class="connect-prompt-copy">Your Google connection needs to be refreshed before Job/Internship Tracker can save to your sheet.</div>
        <button class="primary-btn" id="reconnect-btn">Reconnect</button>
      </div>
    `;
  } else if (state.kind === 'capture') {
    app.innerHTML = renderCapture(state);
  } else if (state.kind === 'quick-add') {
    app.innerHTML = renderQuickAdd(state);
  } else {
    app.innerHTML = renderUpdate(state);
  }
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

function renderCapture(s: Extract<State, { kind: 'capture' }>): string {
  if (s.saved) {
    return `
      ${header('Job/Internship Tracker')}
      <div class="saved-state">
        <div class="brand-mark" style="width:40px;height:40px;border-radius:12px;">${icons.brandCheck.replace('width="12" height="12"', 'width="18" height="18"')}</div>
        <div class="saved-title">Saved to your sheet</div>
        <div class="saved-copy">${escapeHtml(s.company)} &middot; ${escapeHtml(s.role)}</div>
      </div>
    `;
  }

  return `
    ${header('Job/Internship Tracker')}
    <div class="eyebrow">Adding from this page</div>

    <div class="company-row">
      <div class="avatar">${escapeHtml(initials(s.company))}</div>
      <input type="text" id="company-input" value="${escapeHtml(s.company)}" style="flex:1;border:none;background:transparent;font-size:14px;font-weight:600;color:var(--ink);font-family:inherit;" />
      ${icons.edit}
    </div>

    <div class="field">
      <label>Role</label>
      <div class="company-row" style="background:var(--page-bg);">
        <input type="text" id="role-input" value="${escapeHtml(s.role)}" style="flex:1;border:none;background:transparent;font-size:14px;font-weight:500;color:var(--ink);font-family:inherit;" />
        ${icons.edit}
      </div>
    </div>

    <div class="source-row">
      ${icons.link}
      <span>${escapeHtml(s.job.jobUrl)}</span>
    </div>

    <div class="divider"></div>

    <div class="field">
      <label>Status</label>
      <div class="select-wrap">
        <select id="status-select">
          ${statusOptionsHtml(s.status)}
        </select>
        <span class="chevron">${icons.chevronDown}</span>
      </div>
    </div>

    <div class="field">
      <label>Contact <span class="optional-hint">(optional)</span></label>
      <input type="text" id="contact-input" placeholder="Recruiter name or email" value="${escapeHtml(s.contact)}" />
    </div>

    <div class="check-row">
      <input type="checkbox" id="referral-input" ${s.referral ? 'checked' : ''} />
      <label for="referral-input">Got a referral</label>
    </div>

    <div class="field">
      <label>Notes <span class="optional-hint">(optional)</span></label>
      <input type="text" id="notes-input" placeholder="Anything worth remembering" value="${escapeHtml(s.notes)}" />
    </div>

    <button class="save-btn" id="save-btn" ${s.saving ? 'disabled' : ''}>
      ${icons.plus} ${s.saving ? 'Saving…' : 'Save Application'}
    </button>
    ${s.error ? `<div class="error-banner">${escapeHtml(s.error)}</div>` : ''}

    <div class="reassurance">${icons.lock}<span>Saves instantly to your Google Sheet</span></div>
  `;
}

function renderQuickAdd(s: Extract<State, { kind: 'quick-add' }>): string {
  return `
    ${header('Job/Internship Tracker')}
    <button class="quick-add-back" id="quick-add-cancel">&larr; Back to list</button>

    <div class="company-row">
      <div class="avatar">${escapeHtml(initials(s.company || '?'))}</div>
      <input type="text" id="qa-company-input" placeholder="Company" value="${escapeHtml(s.company)}" style="flex:1;border:none;background:transparent;font-size:14px;font-weight:600;color:var(--ink);font-family:inherit;" />
    </div>

    <div class="field">
      <label>Role</label>
      <div class="company-row" style="background:var(--page-bg);">
        <input type="text" id="qa-role-input" placeholder="Role" value="${escapeHtml(s.role)}" style="flex:1;border:none;background:transparent;font-size:14px;font-weight:500;color:var(--ink);font-family:inherit;" />
      </div>
    </div>

    <div class="divider"></div>

    <div class="field">
      <label>Status</label>
      <div class="select-wrap">
        <select id="qa-status-select">
          ${statusOptionsHtml(s.status)}
        </select>
        <span class="chevron">${icons.chevronDown}</span>
      </div>
    </div>

    <div class="field">
      <label>Job URL <span class="optional-hint">(optional)</span></label>
      <input type="text" id="qa-joburl-input" placeholder="https://…" value="${escapeHtml(s.jobUrl)}" />
    </div>

    <div class="field">
      <label>Contact <span class="optional-hint">(optional)</span></label>
      <input type="text" id="qa-contact-input" placeholder="Recruiter name or email" value="${escapeHtml(s.contact)}" />
    </div>

    <div class="check-row">
      <input type="checkbox" id="qa-referral-input" ${s.referral ? 'checked' : ''} />
      <label for="qa-referral-input">Got a referral</label>
    </div>

    <div class="field">
      <label>Notes <span class="optional-hint">(optional)</span></label>
      <input type="text" id="qa-notes-input" placeholder="Anything worth remembering" value="${escapeHtml(s.notes)}" />
    </div>

    <button class="save-btn" id="quick-add-save" ${s.saving ? 'disabled' : ''}>
      ${icons.plus} ${s.saving ? 'Saving…' : 'Add Application'}
    </button>
    ${s.error ? `<div class="error-banner">${escapeHtml(s.error)}</div>` : ''}
  `;
}

function visibleApplications(s: Extract<State, { kind: 'update' }>): Application[] {
  let list = s.applications;
  if (s.statusFilter !== 'All') list = list.filter((a) => a.status === s.statusFilter);
  if (s.search.trim()) {
    const q = s.search.trim().toLowerCase();
    list = list.filter((a) => a.company.toLowerCase().includes(q) || a.role.toLowerCase().includes(q));
  }
  return [...list].sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
}

// Number of status chips shown inline before the rest fold into the "More" dropdown.
// Fixed (not measured) so the bar never depends on a layout pass racing web-font
// load — the earlier width-measurement approach could compute its cutoff against
// fallback-font widths, then clip a chip once Archivo swapped in and widened it.
const COMPACT_FILTER_COUNT = 3;

// Moves a status to the front of the order, so picking it from the "More" menu
// promotes it into the compact/inline set — the visible chips track whichever
// statuses are actually being filtered by, without any manual reordering.
function promoteStatus(order: Status[], status: Status): Status[] {
  return [status, ...order.filter((s) => s !== status)];
}

function renderStatusFilterBar(s: Extract<State, { kind: 'update' }>): string {
  const compact = s.statusOrder.slice(0, COMPACT_FILTER_COUNT);
  const overflow = s.statusOrder.slice(COMPACT_FILTER_COUNT);
  const activeOverflowStatus = s.statusFilter !== 'All' && overflow.includes(s.statusFilter) ? s.statusFilter : null;

  const allChip = `<button type="button" class="filter-chip ${s.statusFilter === 'All' ? 'active' : ''}" data-filter="All">All</button>`;
  const compactChips = compact
    .map(
      (st, i) => `
        <button type="button" class="filter-chip ${s.statusFilter === st ? 'active' : ''}" data-filter="${st}" draggable="true" data-order-index="${i}">
          <span class="filter-chip-dot" style="background:${STATUS_DOT[st]}"></span>${statusLabel(st)}
        </button>
      `,
    )
    .join('');

  const moreBtn =
    overflow.length === 0
      ? ''
      : `
      <div class="filter-more-wrap">
        <button type="button" class="filter-chip filter-more-btn ${activeOverflowStatus ? 'active' : ''} ${s.filterMenuOpen ? 'open' : ''}" id="filter-more-btn">
          ${activeOverflowStatus ? `<span class="filter-chip-dot" style="background:${STATUS_DOT[activeOverflowStatus]}"></span>` : ''}
          <span>${activeOverflowStatus ? statusLabel(activeOverflowStatus) : 'More'}</span>
          <span class="filter-more-chevron">${icons.chevronDown}</span>
        </button>
        ${s.filterMenuOpen ? renderFilterMenu(s, overflow) : ''}
      </div>
    `;

  return `
    <div class="status-filter-row">
      <div class="status-filter-bar">${allChip}${compactChips}${moreBtn}</div>
    </div>
  `;
}

function renderFilterMenu(s: Extract<State, { kind: 'update' }>, overflow: Status[]): string {
  return `
    <div class="filter-menu" id="filter-menu">
      ${overflow
        .map(
          (st) => `
        <button type="button" class="filter-menu-item ${s.statusFilter === st ? 'active' : ''}" data-filter-menu="${st}">
          <span class="filter-chip-dot" style="background:${STATUS_DOT[st]}"></span>
          <span>${statusLabel(st)}</span>
        </button>
      `,
        )
        .join('')}
    </div>
  `;
}

function renderUpdate(s: Extract<State, { kind: 'update' }>): string {
  const list = visibleApplications(s);

  return `
    ${header('Job/Internship Tracker')}
    <div class="search-row">
      <div class="search-box">
        ${icons.search}
        <input type="text" id="search-input" placeholder="Search applications…" value="${escapeHtml(s.search)}" />
      </div>
      <button class="add-icon-btn" id="quick-add-btn" title="Add application">${icons.plus}</button>
    </div>

    ${renderStatusFilterBar(s)}

    <div class="app-list">
      ${
        list.length === 0
          ? `<div class="empty-state">No applications found.</div>`
          : list
              .map((a) => {
                const open = s.openRowIndex === a.rowIndex;
                return `
                  <div class="app-row-wrap">
                    <button class="app-row ${open ? 'expanded' : ''}" data-row="${a.rowIndex}">
                      <div class="avatar">${escapeHtml(initials(a.company))}</div>
                      <div class="app-info">
                        <div class="app-company">${escapeHtml(a.company)}</div>
                        <div class="app-role">${escapeHtml(a.role)}</div>
                      </div>
                      <span class="status-pill ${statusClass(a.status)}">${statusLabel(a.status)}</span>
                      <span class="chevron-btn ${open ? 'open' : ''}">${icons.chevronRight}</span>
                    </button>
                    ${open ? renderStatusEditor(a, s.deleting) : ''}
                  </div>
                `;
              })
              .join('')
      }
    </div>
    ${s.error ? `<div class="error-banner">${escapeHtml(s.error)}</div>` : ''}

    <div class="view-all">
      <button id="dashboard-link">View all applications on Dashboard →</button>
    </div>
  `;
}

function renderStatusEditor(a: Application, deleting: boolean): string {
  return `
    <div class="status-editor">
      <div class="select-wrap">
        <select data-status-for="${a.rowIndex}">
          ${statusOptionsHtml(a.status)}
        </select>
        <span class="chevron">${icons.chevronDown}</span>
      </div>
      <button type="button" class="delete-entry-btn" data-delete="${a.rowIndex}" ${deleting ? 'disabled' : ''}>
        ${icons.trash}<span>${deleting ? 'Deleting…' : 'Delete entry'}</span>
      </button>
    </div>
  `;
}

// The popup's <body> is a fixed-size, self-scrolling box (width/max-height set
// in CSS, overflow-y: auto) rather than a page that grows to fit its content.
// A plain `position: absolute` dropdown anchored under the "More" button can
// extend past that box's actual rendered height — Chrome sizes the popup
// window from the normal-flow layout, which excludes absolutely-positioned
// overflow, so the window never grows to reveal it. The dropdown becomes
// reachable only by scrolling the whole popup, which carries the trigger
// button (and the rest of the filter bar) out of view with it — effectively
// invisible. Anchoring the menu to the viewport with `position: fixed` and
// clamping its height to whatever space is actually visible around the
// button sidesteps that: it never needs the popup to grow.
function positionFilterMenu() {
  const btn = document.getElementById('filter-more-btn');
  const menu = document.getElementById('filter-menu');
  if (!btn || !menu) return;

  const margin = 8;
  const btnRect = btn.getBoundingClientRect();
  const menuWidth = menu.offsetWidth;
  const spaceBelow = window.innerHeight - btnRect.bottom - margin;
  const spaceAbove = btnRect.top - margin;
  const openUpward = spaceBelow < 160 && spaceAbove > spaceBelow;

  menu.style.position = 'fixed';
  menu.style.maxHeight = `${Math.max(120, Math.min(260, openUpward ? spaceAbove : spaceBelow))}px`;

  if (openUpward) {
    menu.style.top = 'auto';
    menu.style.bottom = `${window.innerHeight - btnRect.top + 6}px`;
  } else {
    menu.style.top = `${btnRect.bottom + 6}px`;
    menu.style.bottom = 'auto';
  }

  // Prefer aligning the menu's right edge with the button's, but the "More"
  // chip can land anywhere along the filter bar (it wraps to its own row and
  // can end up hard against the left edge) — clamp so the menu never runs
  // off either side of the popup regardless of where the button sits.
  const preferredLeft = btnRect.right - menuWidth;
  const left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - menuWidth - margin));
  menu.style.left = `${left}px`;
  menu.style.right = 'auto';
}

function wire() {
  document.getElementById('close-btn')?.addEventListener('click', () => window.close());
  document.getElementById('theme-toggle-btn')?.addEventListener('click', async () => {
    await toggleTheme();
    render();
  });
  document.getElementById('setup-btn')?.addEventListener('click', openOnboarding);
  document.getElementById('reconnect-btn')?.addEventListener('click', onReconnectClick);
  document.getElementById('dashboard-link')?.addEventListener('click', openDashboard);

  if (state.kind === 'capture') {
    document.getElementById('company-input')?.addEventListener('input', (e) => {
      if (state.kind === 'capture') state.company = (e.target as HTMLInputElement).value;
    });
    document.getElementById('role-input')?.addEventListener('input', (e) => {
      if (state.kind === 'capture') state.role = (e.target as HTMLInputElement).value;
    });
    document.getElementById('status-select')?.addEventListener('change', (e) => {
      if (state.kind === 'capture') state.status = (e.target as HTMLSelectElement).value as Status;
    });
    document.getElementById('contact-input')?.addEventListener('input', (e) => {
      if (state.kind === 'capture') state.contact = (e.target as HTMLInputElement).value;
    });
    document.getElementById('referral-input')?.addEventListener('change', (e) => {
      if (state.kind === 'capture') state.referral = (e.target as HTMLInputElement).checked;
    });
    document.getElementById('notes-input')?.addEventListener('input', (e) => {
      if (state.kind === 'capture') state.notes = (e.target as HTMLInputElement).value;
    });
    document.getElementById('save-btn')?.addEventListener('click', onSaveCapture);
  }

  if (state.kind === 'quick-add') {
    document.getElementById('quick-add-cancel')?.addEventListener('click', onCancelQuickAdd);
    document.getElementById('qa-company-input')?.addEventListener('input', (e) => {
      if (state.kind === 'quick-add') state.company = (e.target as HTMLInputElement).value;
    });
    document.getElementById('qa-role-input')?.addEventListener('input', (e) => {
      if (state.kind === 'quick-add') state.role = (e.target as HTMLInputElement).value;
    });
    document.getElementById('qa-joburl-input')?.addEventListener('input', (e) => {
      if (state.kind === 'quick-add') state.jobUrl = (e.target as HTMLInputElement).value;
    });
    document.getElementById('qa-status-select')?.addEventListener('change', (e) => {
      if (state.kind === 'quick-add') state.status = (e.target as HTMLSelectElement).value as Status;
    });
    document.getElementById('qa-contact-input')?.addEventListener('input', (e) => {
      if (state.kind === 'quick-add') state.contact = (e.target as HTMLInputElement).value;
    });
    document.getElementById('qa-referral-input')?.addEventListener('change', (e) => {
      if (state.kind === 'quick-add') state.referral = (e.target as HTMLInputElement).checked;
    });
    document.getElementById('qa-notes-input')?.addEventListener('input', (e) => {
      if (state.kind === 'quick-add') state.notes = (e.target as HTMLInputElement).value;
    });
    document.getElementById('quick-add-save')?.addEventListener('click', onSaveQuickAdd);
  }

  if (state.kind === 'update') {
    const s = state;
    document.getElementById('quick-add-btn')?.addEventListener('click', openQuickAdd);
    document.getElementById('search-input')?.addEventListener('input', (e) => {
      if (state.kind !== 'update') return;
      state.search = (e.target as HTMLInputElement).value;
      render();
    });

    document.querySelectorAll<HTMLElement>('[data-filter]').forEach((el) => {
      el.addEventListener('click', () => {
        if (state.kind !== 'update') return;
        state.statusFilter = el.dataset.filter as 'All' | Status;
        render();
      });
    });
    document.getElementById('filter-more-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.kind !== 'update') return;
      state.filterMenuOpen = !state.filterMenuOpen;
      render();
    });
    document.querySelectorAll<HTMLElement>('[data-filter-menu]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.kind !== 'update') return;
        const status = el.dataset.filterMenu as Status;
        state.statusFilter = status;
        state.filterMenuOpen = false;
        state.statusOrder = promoteStatus(state.statusOrder, status);
        statusFilterOrder.setValue(state.statusOrder);
        render();
      });
    });
    if (s.filterMenuOpen) positionFilterMenu();
    document.querySelectorAll<HTMLElement>('.filter-chip[data-order-index]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        dragStatusIndex = Number(el.dataset.orderIndex);
        el.classList.add('dragging');
        if (e instanceof DragEvent) e.dataTransfer?.setData('text/plain', String(dragStatusIndex));
      });
      el.addEventListener('dragend', () => {
        dragStatusIndex = null;
        el.classList.remove('dragging');
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        if (state.kind !== 'update' || dragStatusIndex === null) return;
        const targetIndex = Number(el.dataset.orderIndex);
        if (targetIndex === dragStatusIndex) return;
        const order = [...state.statusOrder];
        const [moved] = order.splice(dragStatusIndex, 1);
        if (!moved) return;
        order.splice(targetIndex, 0, moved);
        state.statusOrder = order;
        statusFilterOrder.setValue(order);
        render();
      });
    });

    document.querySelectorAll('[data-row]').forEach((el) => {
      el.addEventListener('click', () => {
        if (state.kind !== 'update') return;
        const rowIndex = Number((el as HTMLElement).dataset.row);
        state.openRowIndex = state.openRowIndex === rowIndex ? null : rowIndex;
        render();
      });
    });
    document.querySelectorAll('[data-status-for]').forEach((el) => {
      el.addEventListener('click', (e) => e.stopPropagation());
    });
    document.querySelectorAll<HTMLElement>('[data-delete]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.kind !== 'update') return;
        const rowIndex = Number(el.dataset.delete);
        const a = state.applications.find((app) => app.rowIndex === rowIndex);
        if (a) onDeleteApplication(a);
      });
    });

    if (s.openRowIndex !== null) {
      const app = s.applications.find((a) => a.rowIndex === s.openRowIndex);
      const select = document.querySelector(`[data-status-for="${s.openRowIndex}"]`) as HTMLSelectElement | null;
      if (app && select) {
        select.addEventListener('click', (e) => e.stopPropagation());
        select.addEventListener('change', () => onStatusChange(app, select.value as Status));
      }
    }
  }
}

async function onStatusChange(a: Application, newStatus: Status) {
  if (state.kind !== 'update') return;
  if (newStatus === a.status) return;
  try {
    await updateApplicationFields(state.token, state.sheetId, state.tab, state.columns, a.rowIndex, {
      Status: newStatus,
    });
    a.status = newStatus;
    state.openRowIndex = null;
    render();
  } catch {
    state.error = 'Could not update that application. Please try again.';
    render();
  }
}

async function onDeleteApplication(a: Application) {
  if (state.kind !== 'update') return;
  if (!window.confirm(`Delete the application for ${a.company || 'this entry'}? This can't be undone.`)) return;
  state.deleting = true;
  state.error = null;
  render();
  try {
    await deleteApplicationRows(state.token, state.sheetId, state.tab, [a.rowIndex]);
    const applications = await getApplications(state.token, state.sheetId, state.tab, state.columns);
    cachedApplicationsSnapshot.setValue({ sheetId: state.sheetId, applications, cachedAt: Date.now() });
    state.applications = applications;
    state.openRowIndex = null;
    state.deleting = false;
    render();
  } catch {
    state.deleting = false;
    state.error = 'Could not delete that application. Please try again.';
    render();
  }
}

function openOnboarding() {
  browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
  window.close();
}

function openDashboard() {
  browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
  window.close();
}

function onReconnectClick() {
  // Interactive OAuth opens a separate Google window that steals focus, which
  // auto-closes this action popup mid-flow before the token promise can
  // resolve. Do the reconnect in the dashboard tab instead, where it already
  // works (tabs don't close on blur).
  openDashboard();
}

async function onSaveCapture() {
  if (state.kind !== 'capture') return;
  state.saving = true;
  state.error = null;
  render();
  try {
    await appendApplication(state.token, state.sheetId, state.tab, state.columns, {
      company: state.company,
      role: state.role,
      status: state.status,
      jobUrl: state.job.jobUrl,
      contact: state.contact,
      referral: state.referral,
      notes: state.notes,
    });
    state.saved = true;
    state.saving = false;
    render();
    setTimeout(() => window.close(), 1400);
  } catch (err) {
    state.saving = false;
    state.error =
      err instanceof SheetsApiError ? 'Could not save to your sheet. Please try again.' : 'Something went wrong. Please try again.';
    render();
  }
}

async function openQuickAdd() {
  if (state.kind !== 'update') return;
  const returnTo = state;
  state = {
    kind: 'quick-add',
    company: '',
    role: '',
    status: DEFAULT_STATUS,
    jobUrl: '',
    contact: '',
    referral: false,
    notes: '',
    token: returnTo.token,
    sheetId: returnTo.sheetId,
    tab: returnTo.tab,
    columns: returnTo.columns,
    saving: false,
    error: null,
    returnTo,
  };
  render();
}

function onCancelQuickAdd() {
  if (state.kind !== 'quick-add') return;
  state = state.returnTo;
  render();
}

async function onSaveQuickAdd() {
  if (state.kind !== 'quick-add') return;
  if (!state.company.trim() || !state.role.trim()) {
    state.error = 'Company and role are required.';
    render();
    return;
  }
  state.saving = true;
  state.error = null;
  render();
  try {
    await appendApplication(state.token, state.sheetId, state.tab, state.columns, {
      company: state.company.trim(),
      role: state.role.trim(),
      status: state.status,
      jobUrl: state.jobUrl.trim(),
      contact: state.contact.trim(),
      referral: state.referral,
      notes: state.notes.trim(),
    });
    const applications = await getApplications(state.token, state.sheetId, state.tab, state.columns);
    cachedApplicationsSnapshot.setValue({ sheetId: state.sheetId, applications, cachedAt: Date.now() });
    state = {
      kind: 'update',
      applications,
      token: state.token,
      sheetId: state.sheetId,
      tab: state.tab,
      columns: state.columns,
      search: state.returnTo.search,
      statusFilter: state.returnTo.statusFilter,
      statusOrder: state.returnTo.statusOrder,
      filterMenuOpen: state.returnTo.filterMenuOpen,
      openRowIndex: null,
      deleting: false,
      error: null,
    };
    render();
  } catch (err) {
    if (state.kind !== 'quick-add') return;
    state.saving = false;
    state.error =
      err instanceof SheetsApiError ? 'Could not save to your sheet. Please try again.' : 'Something went wrong. Please try again.';
    render();
  }
}

async function detectActiveTabJob(): Promise<DetectedJob | null> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    const result = await browser.tabs.sendMessage(tab.id, { type: 'DETECT_JOB' });
    return (result as DetectedJob | null) ?? null;
  } catch {
    return null;
  }
}

async function init() {
  const [done, sheetId, tabStored, columnsStored, storedOrder] = await Promise.all([
    onboardingComplete.getValue(),
    connectedSheetId.getValue(),
    connectedSheetTab.getValue(),
    columnMapping.getValue(),
    statusFilterOrder.getValue(),
    initTheme(render),
  ]);
  if (!done || !sheetId) {
    state = { kind: 'not-connected' };
    render();
    return;
  }
  const statusOrder = reconcileStatusOrder(storedOrder);

  // Kick detection off in parallel with the token fetch — it usually resolves
  // fast, so this doesn't delay showing the capture form when a job page is open.
  const jobPromise = detectActiveTabJob();

  let token: string;
  try {
    token = await getAuthToken(false);
  } catch (err) {
    state = err instanceof AuthError ? { kind: 'auth-error' } : { kind: 'not-connected' };
    render();
    return;
  }

  let tab = tabStored;
  let columns = columnsStored;
  if (!columns) {
    // A sheet connected before column positions were tracked (or one whose
    // columns have drifted) has no usable mapping yet — resolve it here by
    // re-matching the sheet's actual header row, then cache the result.
    try {
      const info = await connectExistingSpreadsheet(token, sheetId);
      tab = info.tab;
      columns = info.columns;
      await Promise.all([connectedSheetTab.setValue(info.tab), columnMapping.setValue(info.columns)]);
    } catch {
      columns = {} as Record<ApplicationColumn, number>;
    }
  }

  const job = await jobPromise;

  if (job) {
    state = {
      kind: 'capture',
      job,
      company: job.company,
      role: job.role,
      status: 'Applied',
      contact: '',
      referral: false,
      notes: '',
      token,
      sheetId,
      tab,
      columns,
      saving: false,
      saved: false,
      error: null,
    };
    render();
    return;
  }

  // Paint the last-known list right away instead of sitting on the loading
  // skeleton for the whole Sheets round trip, then reconcile once it lands.
  const snapshot = await cachedApplicationsSnapshot.getValue();
  if (snapshot && snapshot.sheetId === sheetId) {
    state = {
      kind: 'update',
      applications: snapshot.applications,
      token,
      sheetId,
      tab,
      columns,
      search: '',
      statusFilter: 'All',
      statusOrder,
      filterMenuOpen: false,
      openRowIndex: null,
      deleting: false,
      error: null,
    };
    render();
  }

  try {
    const applications = await getApplications(token, sheetId, tab, columns);
    state = {
      kind: 'update',
      applications,
      token,
      sheetId,
      tab,
      columns,
      search: '',
      statusFilter: 'All',
      statusOrder,
      filterMenuOpen: false,
      openRowIndex: null,
      deleting: false,
      error: null,
    };
    cachedApplicationsSnapshot.setValue({ sheetId, applications, cachedAt: Date.now() });
  } catch {
    if (state.kind !== 'update') {
      state = {
        kind: 'update',
        applications: [],
        token,
        sheetId,
        tab,
        columns,
        search: '',
        statusFilter: 'All',
        statusOrder,
        filterMenuOpen: false,
        openRowIndex: null,
        deleting: false,
        error: 'Could not load your applications.',
      };
    }
  }
  render();
}

// Closing the filter-menu dropdown on an outside click or Escape is wired once
// here (not in wire()) since document itself is never replaced by render()'s
// innerHTML swap — attaching it inside wire() would stack a new listener on
// every re-render. The "More" button's own click handler stops propagation,
// so a click that opens/toggles the menu never reaches this listener.
document.addEventListener('click', (e) => {
  if (state.kind !== 'update' || !state.filterMenuOpen) return;
  const target = e.target as HTMLElement;
  if (target.closest('#filter-menu')) return;
  state.filterMenuOpen = false;
  render();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (state.kind !== 'update' || !state.filterMenuOpen) return;
  state.filterMenuOpen = false;
  render();
});

init();
