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

// The column map for a sheet we just created ourselves: header order is exactly
// APPLICATION_COLUMNS, so positions are just its indices.
export function identityColumnMap(): Record<ApplicationColumn, number> {
  return Object.fromEntries(APPLICATION_COLUMNS.map((col, i) => [col, i])) as Record<
    ApplicationColumn,
    number
  >;
}

// Matches a sheet's actual header row against our canonical columns by name
// (case-insensitive, trimmed). Columns the sheet doesn't have are simply absent
// from the result — callers append them rather than losing/reordering anything.
export function matchColumns(headerRow: string[]): Partial<Record<ApplicationColumn, number>> {
  const normalized = headerRow.map((h) => h.trim().toLowerCase());
  const result: Partial<Record<ApplicationColumn, number>> = {};
  for (const col of APPLICATION_COLUMNS) {
    const index = normalized.indexOf(col.toLowerCase());
    if (index !== -1) result[col] = index;
  }
  return result;
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

export interface ConnectedSheetInfo {
  spreadsheetId: string;
  title: string;
  tab: string;
  columns: Record<ApplicationColumn, number>;
  addedColumns: ApplicationColumn[];
}

// Connects to an existing spreadsheet: picks its "Applications" tab (falling back
// to the first tab), matches the tab's header row against our canonical columns by
// name, and appends whichever canonical columns are missing. Never reorders,
// renames, or overwrites anything already in the sheet — safe to run against a
// sheet this extension created before, or a foreign one.
export async function connectExistingSpreadsheet(
  token: string,
  spreadsheetId: string,
): Promise<ConnectedSheetInfo> {
  const res = await authedFetch(
    token,
    `${SHEETS_API}/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
  );
  const data = (await res.json()) as {
    properties: { title: string };
    sheets: { properties: { title: string } }[];
  };
  const tabTitles = data.sheets.map((s) => s.properties.title);
  const tab = tabTitles.includes(SHEET_TABS.applications) ? SHEET_TABS.applications : tabTitles[0];
  if (!tab) throw new SheetsApiError('Spreadsheet has no sheets/tabs', 404);

  const headerRow = await getHeaderRow(token, spreadsheetId, tab);
  const matched = matchColumns(headerRow);
  const addedColumns = APPLICATION_COLUMNS.filter((col) => matched[col] === undefined);

  if (addedColumns.length > 0) {
    await appendColumns(token, spreadsheetId, tab, headerRow.length, addedColumns);
    addedColumns.forEach((col, i) => {
      matched[col] = headerRow.length + i;
    });
  }

  return {
    spreadsheetId,
    title: data.properties.title,
    tab,
    columns: matched as Record<ApplicationColumn, number>,
    addedColumns,
  };
}

function rowToApplication(
  row: string[],
  rowIndex: number,
  columns: Record<ApplicationColumn, number>,
): Application {
  const get = (col: ApplicationColumn) => row[columns[col]] ?? '';
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

export async function getApplications(
  token: string,
  spreadsheetId: string,
  tab: string,
  columns: Record<ApplicationColumn, number>,
): Promise<Application[]> {
  const res = await authedFetch(
    token,
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(`${tab}!A2:ZZ`)}`,
  );
  const data = (await res.json()) as { values?: string[][] };
  return (data.values ?? []).map((row, i) => rowToApplication(row, i + 2, columns));
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

// Appends a new application row. Last Updated / Date Applied are stamped here;
// Days in Status is written as a live formula that recomputes from Last Updated
// on every open, so it never needs a separate update when status changes.
export async function appendApplication(
  token: string,
  spreadsheetId: string,
  tab: string,
  columns: Record<ApplicationColumn, number>,
  app: NewApplication,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const width = Math.max(...Object.values(columns)) + 1;
  const row = new Array<string>(width).fill('');
  const set = (col: ApplicationColumn, value: string) => {
    row[columns[col]] = value;
  };

  set('Company', app.company);
  set('Role', app.role);
  set('Status', app.status ?? DEFAULT_STATUS);
  set('Date Applied', today);
  set('Last Updated', today);
  const lastUpdatedLetter = columnLetter(columns['Last Updated']);
  set(
    'Days in Status',
    `=IF(INDIRECT("${lastUpdatedLetter}"&ROW())="","",TODAY()-INDIRECT("${lastUpdatedLetter}"&ROW()))`,
  );
  set('Job URL', app.jobUrl);
  set('Contact', app.contact ?? '');
  set('Referral?', app.referral ? 'Yes' : 'No');
  set('Notes', app.notes ?? '');

  await authedFetch(
    token,
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(`${tab}!A:ZZ`)}:append?valueInputOption=USER_ENTERED`,
    { method: 'POST', body: JSON.stringify({ values: [row] }) },
  );
}

// Patches a subset of columns on an existing row (e.g. Status + Last Updated
// from the dashboard's bulk-update action bar, or the popup's quick-update flow).
// Updating Last Updated also refreshes Days in Status automatically, since that
// column holds a formula referencing it rather than a stored value.
export async function updateApplicationFields(
  token: string,
  spreadsheetId: string,
  tab: string,
  columns: Record<ApplicationColumn, number>,
  rowIndex: number,
  updates: Partial<Record<ApplicationColumn, string>>,
): Promise<void> {
  const withStamp = { ...updates, 'Last Updated': new Date().toISOString().slice(0, 10) };
  const data = Object.entries(withStamp).map(([col, value]) => {
    const letter = columnLetter(columns[col as ApplicationColumn]);
    return { range: `${tab}!${letter}${rowIndex}`, values: [[value]] };
  });

  await authedFetch(token, `${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
}

async function getApplicationsSheetId(token: string, spreadsheetId: string, tab: string): Promise<number> {
  const res = await authedFetch(
    token,
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
  );
  const data = (await res.json()) as { sheets: { properties: { sheetId: number; title: string } }[] };
  const sheet = data.sheets.find((s) => s.properties.title === tab);
  if (!sheet) throw new SheetsApiError(`Sheet tab "${tab}" not found`, 404);
  return sheet.properties.sheetId;
}

// Deletes one or more application rows (e.g. an accidental entry). Sorts
// highest row first so a single batchUpdate can remove several rows without
// earlier deletions shifting the indices of the ones still queued.
export async function deleteApplicationRows(
  token: string,
  spreadsheetId: string,
  tab: string,
  rowIndexes: number[],
): Promise<void> {
  const sheetId = await getApplicationsSheetId(token, spreadsheetId, tab);
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
