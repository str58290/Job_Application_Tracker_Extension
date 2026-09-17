import { defineConfig } from 'wxt';
import { readFileSync } from 'node:fs';

// The extension's stable identity. Generated once (see .secrets/), so the
// extension ID never changes across rebuilds — required because Google's
// OAuth client's authorized redirect URI (https://<extension-id>
// .chromiumapp.org/, see lib/auth.ts) is pinned to this ID. .secrets/
// manifest-key.txt is gitignored; each dev machine needs its own copy (or
// share the one .pem across the team so everyone builds the same ID).
const manifestKey = readFileSync('.secrets/manifest-key.txt', 'utf-8').trim();

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    key: manifestKey,
    name: 'Job/Internship Tracker',
    description: 'Track job and internship applications straight into your own Google Sheet.',
    permissions: ['identity', 'storage', 'tabs'],
    host_permissions: [
      'https://sheets.googleapis.com/*',
    ],
  },
});
