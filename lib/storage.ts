import { storage } from 'wxt/utils/storage';
import { STATUSES, type Application, type Status } from './schema';

export interface ColumnMapping {
  sourceHeader: string;
  targetField: string;
}

export const connectedSheetId = storage.defineItem<string | null>('local:sheetId', {
  fallback: null,
});

export const connectedSheetName = storage.defineItem<string | null>('local:sheetName', {
  fallback: null,
});

export const onboardingComplete = storage.defineItem<boolean>('local:onboardingComplete', {
  fallback: false,
});

export const columnMapping = storage.defineItem<ColumnMapping[] | null>('local:columnMapping', {
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
    onboardingComplete.setValue(false),
    columnMapping.setValue(null),
  ]);
}
