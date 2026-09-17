// Canonical data schema shared by the Sheets client, onboarding, and dashboard.
// Mirrors the columns/tabs shown in the SheetSetup wireframe screen.

export const SHEET_TABS = {
  applications: 'Applications',
  statusHistory: 'Status History',
} as const;

// Column order matters: this is the exact header row written when creating a new sheet,
// and the order MapColumns offers when matching an existing sheet's columns.
export const APPLICATION_COLUMNS = [
  'Company',
  'Role',
  'Status',
  'Date Applied',
  'Last Updated',
  'Days in Status',
  'Job URL',
  'Contact',
  'Referral?',
  'Notes',
] as const;

export type ApplicationColumn = (typeof APPLICATION_COLUMNS)[number];

// The standard stages of landing a job, fixed in progression order — these double as
// the Dashboard's kanban columns. Pipelines/stages are no longer user-customizable.
export const STATUSES = [
  'Saved',
  'Applied',
  'OA',
  'Phone Screen',
  'Interview',
  'Technical',
  'Final Round',
  'Offer',
  'Rejected',
  'Withdrawn',
  'Ghosted',
] as const;

export type Status = (typeof STATUSES)[number];

export const DEFAULT_STATUS: Status = 'Saved';

export interface Application {
  rowIndex: number; // 1-based row in the Applications sheet, for updates
  company: string;
  role: string;
  status: Status;
  dateApplied: string;
  lastUpdated: string;
  daysInStatus: number;
  jobUrl: string;
  contact: string;
  referral: boolean;
  notes: string;
}

// Fields a column can be mapped to when importing an existing sheet (MapColumns screen).
export const IMPORT_TARGET_FIELDS = [
  { value: 'company', label: 'Company', required: true },
  { value: 'role', label: 'Role', required: true },
  { value: 'status_reference', label: 'Status (reference)', required: false },
  { value: 'dateApplied', label: 'Date Applied', required: false },
  { value: 'notes', label: 'Notes', required: false },
  { value: 'skip', label: "Don't import", required: false },
] as const;
