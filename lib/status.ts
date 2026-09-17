// Presentation metadata for the fixed Status list — shared by dashboard and popup so
// every entrypoint colors and orders statuses the same way.

import { STATUSES, type Status } from './schema';

export const STATUS_SLUG: Record<Status, string> = {
  Saved: 'saved',
  Applied: 'applied',
  OA: 'oa',
  'Phone Screen': 'phone-screen',
  Interview: 'interview',
  Technical: 'technical',
  'Final Round': 'final-round',
  Offer: 'offer',
  Rejected: 'rejected',
  Withdrawn: 'withdrawn',
  Ghosted: 'ghosted',
};

export function statusClass(status: Status): string {
  return `status-${STATUS_SLUG[status]}`;
}

// Display labels shown to users — distinct from the canonical Status value
// stored in the sheet, so abbreviations can be spelled out without a data migration.
export const STATUS_LABEL: Record<Status, string> = {
  Saved: 'Saved',
  Applied: 'Applied',
  OA: 'Online Assessment',
  'Phone Screen': 'Phone Screen',
  Interview: 'Interview',
  Technical: 'Technical',
  'Final Round': 'Final Round',
  Offer: 'Offer',
  Rejected: 'Rejected',
  Withdrawn: 'Withdrawn',
  Ghosted: 'Ghosted',
};

export function statusLabel(status: Status): string {
  return STATUS_LABEL[status];
}

// Fixed swatches for kanban column dots — legible on both themes, so a single
// hex value per status is enough (unlike pill ink/bg, which need theme pairs).
export const STATUS_DOT: Record<Status, string> = {
  Saved: '#6B7280',
  Applied: '#2A78D6',
  OA: '#7C5CFA',
  'Phone Screen': '#0EA5B7',
  Interview: '#4F46E5',
  Technical: '#D6409F',
  'Final Round': '#E8791A',
  Offer: '#0CA30C',
  Rejected: '#D03B3B',
  Withdrawn: '#6B6A64',
  Ghosted: '#FAB219',
};

export function statusOptions(): readonly Status[] {
  return STATUSES;
}

// Statuses where the application is no longer being actively pursued.
export const TERMINAL_STATUSES: readonly Status[] = ['Offer', 'Rejected', 'Withdrawn', 'Ghosted'];

export function isTerminalStatus(status: Status): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}
