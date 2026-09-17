import {
  APPLICATION_COLUMNS,
  DEFAULT_STATUS,
  SHEET_TABS,
  STATUSES,
  type Application,
  type ApplicationColumn,
  type Status,
} from './schema';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

export class SheetsApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function authedFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new SheetsApiError(`${res.status} ${res.statusText}: ${body}`, res.status);
  }
  return res;
}

// A1 notation column letter for a 0-based index (0 -> A, 11 -> L, ...).
function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

const LAST_COLUMN_LETTER = columnLetter(APPLICATION_COLUMNS.length - 1); // 'L'

export interface CreatedSpreadsheet {
  spreadsheetId: string;
  spreadsheetUrl: string;
}

// Creates a new spreadsheet with the 2 canonical tabs + the Applications header row,
// matching the schema preview shown in the SheetSetup wireframe.
export async function createTrackerSpreadsheet(token: string, title: string): Promise<CreatedSpreadsheet> {
  const res = await authedFetch(token, SHEETS_API, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: SHEET_TABS.applications, gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: SHEET_TABS.statusHistory, gridProperties: { frozenRowCount: 1 } } },
      ],
    }),
  });
  const data = (await res.json()) as { spreadsheetId: string; spreadsheetUrl: string };

  await authedFetch(token, `${SHEETS_API}/${data.spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: [
        {
          range: `${SHEET_TABS.applications}!A1:${LAST_COLUMN_LETTER}1`,
          values: [[...APPLICATION_COLUMNS]],
        },
        {
          range: `${SHEET_TABS.statusHistory}!A1:D1`,
          values: [['Company', 'Role', 'Status', 'Changed At']],
        },
      ],
    }),
  });

  return { spreadsheetId: data.spreadsheetId, spreadsheetUrl: data.spreadsheetUrl };
}

export interface SheetTab {
  title: string;
}

// Lists a spreadsheet's tabs — used on the "use an existing sheet" onboarding path
// to let the user pick which tab holds their application data.
export async function listSheetTabs(token: string, spreadsheetId: string): Promise<SheetTab[]> {
  const res = await authedFetch(
    token,
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`,
  );
  const data = (await res.json()) as { sheets: { properties: { title: string } }[] };
  return data.sheets.map((s) => ({ title: s.properties.title }));
}

export async function getHeaderRow(token: string, spreadsheetId: string, tab: string): Promise<string[]> {
  const res = await authedFetch(
    token,
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(`${tab}!1:1`)}`,
  );
  const data = (await res.json()) as { values?: string[][] };
  return data.values?.[0] ?? [];
}

// Appends new column headers after a tab's existing last column, without touching
// any existing columns (MapColumns wireframe: missing columns like Status get
// appended, existing columns are never reordered, renamed, or overwritten).
export async function appendColumns(
  token: string,
  spreadsheetId: string,
  tab: string,
  existingHeaderCount: number,
  newHeaders: string[],
): Promise<void> {
  const startCol = columnLetter(existingHeaderCount);
  const endCol = columnLetter(existingHeaderCount + newHeaders.length - 1);
  await authedFetch(token, `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(`${tab}!${startCol}1:${endCol}1`)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [newHeaders] }),
  });
}

function rowToApplication(row: string[], rowIndex: number): Application {
  const get = (col: ApplicationColumn) => row[APPLICATION_COLUMNS.indexOf(col)] ?? '';
  const rawStatus = get('Status');
  const status = (STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as Status)
    : DEFAULT_STATUS;
  return {
    rowIndex,
    company: get('Company'),
    role: get('Role'),
    status,
    dateApplied: get('Date Applied'),
    lastUpdated: get('Last Updated'),
    daysInStatus: Number(get('Days in Status')) || 0,
    jobUrl: get('Job URL'),
    contact: get('Contact'),
    referral: get('Referral?').toLowerCase() === 'yes' || get('Referral?').toLowerCase() === 'true',
    notes: get('Notes'),
  };
}

export async function getApplications(token: string, spreadsheetId: string): Promise<Application[]> {
  const res = await authedFetch(
    token,
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(`${SHEET_TABS.applications}!A2:${LAST_COLUMN_LETTER}`)}`,
  );
  const data = (await res.json()) as { values?: string[][] };
  return (data.values ?? []).map((row, i) => rowToApplication(row, i + 2));
}

export interface NewApplication {
  company: string;
  role: string;
  status?: Status;
  jobUrl: string;
  contact?: string;
  referral?: boolean;
  notes?: string;
}

// Appends a new application row. Days in Status is left for the sheet or the
// dashboard to fill in; Last Updated / Date Applied are stamped here.
export async function appendApplication(token: string, spreadsheetId: string, app: NewApplication): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const row = APPLICATION_COLUMNS.map((col) => {
    switch (col) {
      case 'Company':
        return app.company;
      case 'Role':
        return app.role;
      case 'Status':
        return app.status ?? DEFAULT_STATUS;
      case 'Date Applied':
        return today;
      case 'Last Updated':
        return today;
      case 'Job URL':
        return app.jobUrl;
      case 'Contact':
        return app.contact ?? '';
      case 'Referral?':
        return app.referral ? 'Yes' : 'No';
      case 'Notes':
        return app.notes ?? '';
      default:
        return '';
    }
  });

  await authedFetch(
    token,
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(`${SHEET_TABS.applications}!A:${LAST_COLUMN_LETTER}`)}:append?valueInputOption=USER_ENTERED`,
    { method: 'POST', body: JSON.stringify({ values: [row] }) },
  );
}

// Patches a subset of columns on an existing row (e.g. Status + Last Updated
// from the dashboard's bulk-update action bar, or the popup's quick-update flow).
export async function updateApplicationFields(
  token: string,
  spreadsheetId: string,
  rowIndex: number,
  updates: Partial<Record<ApplicationColumn, string>>,
): Promise<void> {
  const withStamp = { ...updates, 'Last Updated': new Date().toISOString().slice(0, 10) };
  const data = Object.entries(withStamp).map(([col, value]) => {
    const colIndex = APPLICATION_COLUMNS.indexOf(col as ApplicationColumn);
    const letter = columnLetter(colIndex);
    return { range: `${SHEET_TABS.applications}!${letter}${rowIndex}`, values: [[value]] };
  });

  await authedFetch(token, `${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
}

async function getApplicationsSheetId(token: string, spreadsheetId: string): Promise<number> {
  const res = await authedFetch(
    token,
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
  );
  const data = (await res.json()) as { sheets: { properties: { sheetId: number; title: string } }[] };
  const sheet = data.sheets.find((s) => s.properties.title === SHEET_TABS.applications);
  if (!sheet) throw new SheetsApiError(`Sheet tab "${SHEET_TABS.applications}" not found`, 404);
  return sheet.properties.sheetId;
}

// Deletes one or more application rows (e.g. an accidental entry). Sorts
// highest row first so a single batchUpdate can remove several rows without
// earlier deletions shifting the indices of the ones still queued.
export async function deleteApplicationRows(
  token: string,
  spreadsheetId: string,
  rowIndexes: number[],
): Promise<void> {
  const sheetId = await getApplicationsSheetId(token, spreadsheetId);
  const requests = [...rowIndexes]
    .sort((a, b) => b - a)
    .map((rowIndex) => ({
      deleteDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex },
      },
    }));

  await authedFetch(token, `${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
}

export interface DriveFile {
  id: string;
  name: string;
}

// Only sees files the user has explicitly opened/created with this app, per the
// drive.file scope — used to re-list a previously-picked sheet, not to browse Drive.
export async function listAppVisibleSheets(token: string): Promise<DriveFile[]> {
  const url = `${DRIVE_API}?q=${encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
  )}&fields=files(id,name)`;
  const res = await authedFetch(token, url);
  const data = (await res.json()) as { files: DriveFile[] };
  return data.files;
}
