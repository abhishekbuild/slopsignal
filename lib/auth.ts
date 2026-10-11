import { ConvexHttpClient } from "convex/browser";
import { browser } from "wxt/browser";
import { api, type Tokens } from "./api";
import type { ExternalReply, MeReply } from "./messages";

/**
 * The extension's session, owned by the background service worker and nobody else.
 *
 * The popup never touches tokens: it sends `me` / `signOut` messages and gets answers. When
 * page capture arrives it does the same from here, with `getToken()`, so there is exactly one
 * refresher per browser profile. Convex Auth invalidates a session whose refresh token is used
 * from two places outside a 10 s window, which is also why this session is separate from the
 * dashboard's and is obtained by trading a dashboard-minted code (see `link`).
 */

const STORAGE_KEY = "auth";
/** Refresh this long before the JWT's `exp`, so a query in flight never carries a stale token. */
const EXPIRY_MARGIN_MS = 60_000;

/** A throwaway HTTP client; cheap, and per-call construction keeps auth from leaking between calls. */
export function client(token?: string) {
  const c = new ConvexHttpClient(import.meta.env.WXT_CONVEX_URL);
  if (token !== undefined) c.setAuth(token);
  return c;
}

export async function readTokens(): Promise<Tokens | undefined> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] as Tokens | undefined;
}
const writeTokens = (tokens: Tokens) => browser.storage.local.set({ [STORAGE_KEY]: tokens });
const clearTokens = () => browser.storage.local.remove(STORAGE_KEY);

/** True when the JWT has under EXPIRY_MARGIN_MS left, or cannot be parsed (which forces a refresh). */
export function isExpiringSoon(jwt: string, now = Date.now()): boolean {
  try {
    const payload = JSON.parse(
      atob((jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof payload.exp !== "number" || payload.exp * 1000 - now < EXPIRY_MARGIN_MS;
  } catch {
    return true;
  }
}

// ponytail: single-flight per worker instance; a promise lost to a worker restart is harmless
// because the server tolerates a second refresh inside its 10 s reuse window.
let refreshing: Promise<string | null> | null = null;

/** The current JWT, refreshed when stale or when `force` is set. Null when signed out or unreachable. */
export async function getToken(force = false): Promise<string | null> {
  const tokens = await readTokens();
  if (tokens === undefined) return null;
  if (!force && !isExpiringSoon(tokens.token)) return tokens.token;
  refreshing ??= refresh(tokens.refreshToken).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function refresh(refreshToken: string): Promise<string | null> {
  try {
    const { tokens } = await client().action(api.auth.signIn, { refreshToken });
    if (tokens === null) {
      await clearTokens();
      return null;
    }
    await writeTokens(tokens); // written before anything else can interrupt the worker
    return tokens.token;
  } catch (error) {
    // fetch throws TypeError when the network is down. That is not a rejected session, and
    // signing the user out over flaky Wi-Fi would be the wrong answer.
    if (!(error instanceof TypeError)) await clearTokens();
    return null;
  }
}

/** Runs `run` with a usable JWT; one forced refresh covers a session the server revoked under us. */
export async function withFreshToken<T>(run: (token: string) => Promise<T>): Promise<T> {
  const token = await getToken();
  if (token === null) throw new Error("No usable token");
  try {
    return await run(token);
  } catch (error) {
    const fresh = await getToken(true);
    if (fresh === null || fresh === token) throw error;
    return run(fresh);
  }
}

/** Trades a dashboard-minted code for this extension's own session. `ok: false` = invalid or expired. */
export async function link(code: string): Promise<ExternalReply> {
  const previous = await readTokens();
  const { tokens } = await client().action(api.auth.signIn, {
    provider: "extension",
    params: { code },
  });
  if (tokens === null) return { ok: false };
  await writeTokens(tokens);
  // Reconnecting (possibly as another account) must not leave the old session alive server-side.
  if (previous !== undefined) {
    await client(previous.token).action(api.auth.signOut, {}).catch(() => undefined);
  }
  return { ok: true };
}

/** What the popup shows: the signed-in user, signed out, or unreachable (session kept). */
export async function me(): Promise<MeReply> {
  if ((await readTokens()) === undefined) return { signedOut: true };
  try {
    const user = await withFreshToken((token) => client(token).query(api.users.profile.me, {}));
    return { signedOut: false, user };
  } catch {
    // Either the refresh found the session revoked and cleared it, or Convex is unreachable.
    return (await readTokens()) === undefined
      ? { signedOut: true }
      : { error: "Could not reach Tabcake. Check your connection and try again." };
  }
}

/** Forgets the session locally first (so the UI flips at once), then invalidates it server-side. */
export async function signOut(): Promise<void> {
  const tokens = await readTokens();
  await clearTokens();
  if (tokens !== undefined) {
    await client(tokens.token).action(api.auth.signOut, {}).catch(() => undefined);
  }
}
