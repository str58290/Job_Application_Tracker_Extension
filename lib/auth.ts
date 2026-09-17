// Wraps chrome.identity.getAuthToken (the standard flow for a manifest.json
// oauth2 block of type "Chrome Extension" — no client secret involved).

export class AuthError extends Error {}

export async function getAuthToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      if (chrome.runtime.lastError || !result) {
        reject(new AuthError(chrome.runtime.lastError?.message ?? 'No token returned'));
        return;
      }
      // chrome.identity.getAuthToken's callback type varies by @types/chrome version
      // (plain string vs. { token }); handle both.
      const token = typeof result === 'string' ? result : (result as { token?: string }).token;
      if (!token) {
        reject(new AuthError('No token returned'));
        return;
      }
      resolve(token);
    });
  });
}

export async function signOut(): Promise<void> {
  const token = await getAuthToken(false).catch(() => null);
  if (!token) return;

  await new Promise<void>((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
  // Revoke on Google's side too, so the next sign-in shows the account chooser again.
  await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`).catch(() => {});
}

// Call after a 401 from the Sheets/Drive API: the cached token is stale, evict it
// so the next getAuthToken(true) call forces a fresh one.
export async function evictToken(token: string): Promise<void> {
  await new Promise<void>((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
}
