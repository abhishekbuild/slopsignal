/**
 * The sites Tabcake stopped reading on its own, as this browser remembers them.
 *
 * Pure, so the gate can ask its question without a round trip. The account holds the real list and
 * decides; what is here is a cache, exactly like the blocklist and the grants. `pages.ingest.capture`
 * checks the account's copy before it writes anything, so a stale one costs a wasted call and never
 * a stored page that should have been refused.
 *
 * A hostname, not an origin, and matched exactly: a rule Tabcake wrote for `app.company.com` must
 * not reach `company.com`, because one page is not evidence about a whole company.
 */

/** More than this is not a list of sites, it is a payload. */
const MAX_HOSTS = 500;

/** The same shape `blocklist/rules.ts` accepts on both sides, so the two cannot come to disagree. */
const HOSTNAME = /^[a-z0-9.-]+$/;

/**
 * Whatever is in storage, read as a list of hostnames. Junk reads as nothing blocked.
 *
 * "Nothing blocked" is the safe direction here, the same way it is for grants and the opposite of
 * the way it is for the blocklist. Forgetting one of these costs a call to the backend, which
 * refuses the page anyway. Forgetting a blocked rule would read a site somebody banned.
 */
export function parseAutoBlocks(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_HOSTS) return [];

  const out: string[] = [];
  for (const entry of value) {
    // One rule for everything that is not a hostname: drop it. Unlike the blocklist, which refuses a
    // whole document rather than store half of it, a dropped entry here fails towards asking.
    if (typeof entry !== "string") continue;
    const host = entry.trim().toLowerCase();
    if (HOSTNAME.test(host) && !out.includes(host)) out.push(host);
  }
  return out;
}

/** Has Tabcake blocked this exact host? No subdomain reach, in either direction. */
export function isAutoBlocked(hostname: string, hosts: string[]): boolean {
  return hosts.includes(hostname.toLowerCase());
}
