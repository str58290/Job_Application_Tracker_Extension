import { defineConfig } from 'wxt';
import { readFileSync } from 'node:fs';

// The extension's stable identity. Generated once (see .secrets/), so the
// extension ID never changes across rebuilds — required because the Google
// Cloud OAuth client (type "Chrome Extension") is registered against this ID.
// .secrets/manifest-key.txt is gitignored; each dev machine needs its own copy
// (or share the one .pem across the team so everyone builds the same ID).
const manifestKey = readFileSync('.secrets/manifest-key.txt', 'utf-8').trim();

// Chrome Extension-type OAuth client, registered against this extension's
// item ID (nmbfpkcpfnoedjccglhcakhcpknmendd) in Google Cloud Console.
// This is a public client identifier, not a secret — safe to commit.
const GOOGLE_OAUTH_CLIENT_ID = '965159170957-o9v13cg1mq8k6assh9vd72vg4g4bss5p.apps.googleusercontent.com';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    key: manifestKey,
    name: 'Job/Internship Tracker',
    description: 'Track job and internship applications straight into your own Google Sheet.',
    permissions: ['identity', 'storage', 'tabs'],
    host_permissions: [
      'https://sheets.googleapis.com/*',
      'https://www.googleapis.com/*',
    ],
    oauth2: {
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ],
    },
  },
});
