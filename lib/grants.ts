/**
 * The sites you have told Tabcake to read anyway, as this browser remembers them.
 *
 * Pure, so the content script can ask its question without a round trip. The account holds the real
 * list; what is here is a cache, and like the blocklist cache it never decides anything on its own —
 * `pages.classify.verdict` and `pages.ingest.capture` both check the account's copy, so a stale one
 * costs a wasted call and never a stored page that should have been refused.
 *
 * An origin, not a hostname: `https://example.com` and `http://example.com` are different sites to
 * the person reading them, and so is a different port. Matching is exact for the same reason.
 */

/** More than this is not a list of sites you allowed, it is a payload. */
const MAX_GRANTS = 500;

/**
 * Scheme and host, and nothing else. Anything longer never came from `pages.grants.list`.
 *
 * The bracketed alternative is an IPv6 literal, which is how `URL.origin` writes one — and which
 * the server accepts, so refusing it here would be this cache quietly disagreeing with the account.
 */
const ORIGIN = /^https?:\/\/(\[[0-9a-f:]+\]|[a-z0-9.-]+)(:\d{1,5})?$/;

/**
 * Whatever is in storage, read as a list of origins. Junk reads as nothing allowed.
 *
 * "Nothing allowed" is the safe direction here, unlike the blocklist, where an unreadable value has
 * to fall back to the presets: forgetting a grant costs you a page you have to allow again, where
 * forgetting a block would read a site you said never to read.
 */
export function parseGrants(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_GRANTS) return [];

  const out: string[] = [];
  for (const entry of value) {
    // One rule for everything that is not an origin: drop it. Unlike the blocklist, which refuses a
    // whole document rather than store half of it, a dropped grant fails towards reading less.
    if (typeof entry !== "string") continue;
    const origin = entry.trim().toLowerCase();
    if (ORIGIN.test(origin) && !out.includes(origin)) out.push(origin);
  }
  return out;
}

/** Has this exact origin been allowed? No subdomain reach, and no scheme shuffling. */
export function isAllowed(origin: string, grants: string[]): boolean {
  return grants.includes(origin.toLowerCase());
}
