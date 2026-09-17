import { storage } from 'wxt/utils/storage';
import { SHEET_TABS, STATUSES, type Application, type ApplicationColumn, type Status } from './schema';

export const connectedSheetId = storage.defineItem<string | null>('local:sheetId', {
  fallback: null,
});

export const connectedSheetName = storage.defineItem<string | null>('local:sheetName', {
  fallback: null,
});

// Which tab in the connected spreadsheet holds application rows. Defaults to the
// canonical tab name for sheets connected before this was tracked separately.
export const connectedSheetTab = storage.defineItem<string>('local:connectedSheetTab', {
  fallback: SHEET_TABS.applications,
});

export const onboardingComplete = storage.defineItem<boolean>('local:onboardingComplete', {
  fallback: false,
});

// Maps each canonical column to its actual position (0-based) in the connected
// sheet's header row. Resolved once on connect/create and re-resolved whenever
// it's missing, so sheets with a drifted or foreign column order still work.
export const columnMapping = storage.defineItem<Record<ApplicationColumn, number> | null>(
  'local:columnMapping',
  { fallback: null },
);

// Cached OAuth access token from chrome.identity.launchWebAuthFlow — replaces
// chrome.identity.getAuthToken's built-in token cache, which we no longer use
// since launchWebAuthFlow doesn't cache tokens itself.
export interface CachedAuthToken {
  token: string;
  expiresAt: number;
}

export const cachedAuthToken = storage.defineItem<CachedAuthToken | null>('local:cachedAuthToken', {
  fallback: null,
});

export type ThemePreference = 'system' | 'light' | 'dark';

export const themePreference = storage.defineItem<ThemePreference>('local:themePreference', {
  fallback: 'system',
});

export interface ApplicationsSnapshot {
  sheetId: string;
  applications: Application[];
  cachedAt: number;
}

export const cachedApplicationsSnapshot = storage.defineItem<ApplicationsSnapshot | null>(
  'local:cachedApplicationsSnapshot',
  { fallback: null },
);

// User-customizable ordering for the popup's status filter bar. Stored as just the
// statuses the user has explicitly reordered away from the canonical order — missing
// or stale entries are reconciled against STATUSES on read.
export const statusFilterOrder = storage.defineItem<Status[] | null>('local:statusFilterOrder', {
  fallback: null,
});

// Drops statuses no longer in the schema and appends any new ones the stored
// order doesn't know about yet, so a schema change never loses or hides a status.
export function reconcileStatusOrder(stored: Status[] | null): Status[] {
  if (!stored) return [...STATUSES];
  const known = new Set<string>(STATUSES);
  const cleaned = stored.filter((s) => known.has(s));
  const missing = STATUSES.filter((s) => !cleaned.includes(s));
  return [...cleaned, ...missing];
}

export async function resetOnboarding(): Promise<void> {
  await Promise.all([
    connectedSheetId.setValue(null),
    connectedSheetName.setValue(null),
    connectedSheetTab.setValue(SHEET_TABS.applications),
    onboardingComplete.setValue(false),
    columnMapping.setValue(null),
  ]);
}
