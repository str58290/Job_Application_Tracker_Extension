// Uses chrome.identity.launchWebAuthFlow — the standard OAuth2 redirect flow,
// implemented at the Chromium engine level so it works the same in Chrome,
// Edge, and other Chromium browsers. (chrome.identity.getAuthToken instead
// relies on being signed into Chrome itself with a Google Account — a
// Chrome-specific mechanism Edge doesn't implement, which is why sign-in
// silently fails there.)
import { cachedAuthToken } from './storage';

export class AuthError extends Error {}

// "Web application" type OAuth client (not "Chrome Extension" type — that
// type only supports chrome.identity.getAuthToken). Its authorized redirect
// URI is chrome.identity.getRedirectURL(), i.e. https://<extension-id>
// .chromiumapp.org/, registered in Google Cloud Console for this client. This
// is a public client identifier, not a secret — safe to commit.
const GOOGLE_OAUTH_CLIENT_ID = '965159170957-le7ab6aj6823i9sbhjo3jjmp2riloioi.apps.googleusercontent.com';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Refreshed a little before actual expiry so a near-expiry token never gets
// handed to a caller that's about to use it.
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

function buildAuthUrl(interactive: boolean): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_OAUTH_CLIENT_ID);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('redirect_uri', chrome.identity.getRedirectURL());
  url.searchParams.set('scope', SCOPES.join(' '));
  // Lets the user pick which Google account on an interactive sign-in;
  // omitted on a silent check so it never shows UI.
  if (interactive) url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

// response_type=token returns the access token in the redirect URL's fragment
// (#access_token=...&expires_in=...), not its query string.
function parseTokenFromRedirect(redirectUrl: string): { token: string; expiresIn: number } {
  const params = new URLSearchParams(new URL(redirectUrl).hash.slice(1));
  const error = params.get('error');
  if (error) throw new AuthError(error);
  const token = params.get('access_token');
  if (!token) throw new AuthError('No token returned');
  return { token, expiresIn: Number(params.get('expires_in')) || 3600 };
}

function launchWebAuthFlow(url: string, interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive }, (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        reject(new AuthError(chrome.runtime.lastError?.message ?? 'No response from Google'));
        return;
      }
      resolve(redirectUrl);
    });
  });
}

export async function getAuthToken(interactive: boolean): Promise<string> {
  const cached = await cachedAuthToken.getValue();
  if (cached && cached.expiresAt > Date.now() + EXPIRY_SAFETY_MARGIN_MS) return cached.token;

  const redirectUrl = await launchWebAuthFlow(buildAuthUrl(interactive), interactive);
  const { token, expiresIn } = parseTokenFromRedirect(redirectUrl);
  await cachedAuthToken.setValue({ token, expiresAt: Date.now() + expiresIn * 1000 });
  return token;
}

export async function signOut(): Promise<void> {
  const cached = await cachedAuthToken.getValue();
  await cachedAuthToken.setValue(null);
  if (!cached) return;

  // Revoke on Google's side too, so the next sign-in shows the account chooser again.
  await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${cached.token}`).catch(() => {});
}

// Call after a 401 from the Sheets/Drive API: the cached token is stale, evict
// it so the next getAuthToken(true) call forces a fresh one.
export async function evictToken(token: string): Promise<void> {
  const cached = await cachedAuthToken.getValue();
  if (cached?.token === token) await cachedAuthToken.setValue(null);
}
