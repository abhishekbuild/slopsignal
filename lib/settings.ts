import { browser } from "wxt/browser";
import { api } from "./api";
import { client, readTokens, withFreshToken } from "./auth";
import { parseAutoBlocks } from "./autoblock";
import { CAPTURE_KEY, parseCapture } from "./capture-settings";
import { parseGrants } from "./grants";
import { type Blocklist, isBlocked, parseBlocklist, toBlocklist } from "./rules";
import { PALETTE } from "./palette";
import type { TabState } from "./messages";
import { titleFor } from "./toolbar-title";

/**
 * The two things a person can change about capture: when it is paused, and which sites it never
 * touches. This is the only file that reads or writes either, so the badge, the alarm and the
 * stored value cannot drift apart.
 *
 * **They live in different places, and that is the point.** Pause is about the browser in front of
 * you, so it stays in `browser.storage.local` and never leaves. The blocklist belongs to your
 * account, so Convex holds it and what is in storage here is a **cache**.
 *
 * Why a cache rather than asking the server: `lib/capture.ts` checks the blocklist on the way out of
 * every page, and that gate has to answer instantly and has to work with no network. A round trip
 * in front of it would make every capture wait on the server to find out whether to talk to the
 * server.
 *
 * Why a stale cache is safe: `pages.ingest.capture` checks the account's real list before it writes
 * anything. So the worst a wrong cache can do is waste one call, never store a page that should
 * have been refused. That is the whole reason this design is allowed to be optimistic below.
 *
 * Neither is seeded. Absent means the default, which is a state an upgrade, a reinstall or cleared
 * storage cannot get wrong.
 */

/**
 * Ink with Cream text (design.md §3). It was warm grey until 0.23.0, which beside the remembered
 * dot's Butter left paused and remembered told apart by colour alone at toolbar size (audit E-07).
 */
const PAUSE_BADGE_COLOUR = PALETTE.ink;
const PAUSE_BADGE_TEXT_COLOUR = PALETTE.cream;

/** Two bars. Short enough for a toolbar badge, and it reads as "paused" in any language. */
const PAUSE_BADGE = "II";

/** Fires when a timed pause runs out, so the badge can stop claiming something untrue. */
export const RESUME_ALARM = "resume-capture";

/** Fires to refresh the cached blocklist and the cached grants. See `SYNC_MINUTES`. */
export const SYNC_ALARM = "sync-settings";

/**
 * What `SYNC_ALARM` was called before 0.11.0, cleared once when the repeating refresh is armed.
 *
 * ponytail: an alarm under the old name goes on firing in a browser that upgraded, matching no
 * listener and doing nothing. Harmless, and noise in `chrome://extensions`. Delete this and the
 * clear in `startBlocklistSync` once no browser can still be running 0.10.0 — which for an unpacked
 * extension is as soon as you have reloaded it once.
 */
export const OLD_SYNC_ALARM = "sync-blocklist";

/**
 * How often the cached blocklist is refreshed.
 *
 * Polling, because the background holds a `ConvexHttpClient` and that has no subscriptions — the
 * popup is destroyed on close and a service worker is killed whenever Chrome feels like it, so a
 * live connection would be torn down and rebuilt all day for a value that changes about never.
 * Thirty minutes is the window in which a rule added on your laptop reaches your desktop; every
 * other path (worker start, popup open, an edit here) refreshes it sooner.
 */
const SYNC_MINUTES = 30;

/** Where the cached blocklist lives. `entrypoints/popup/controls.tsx` reads this key directly. */
const BLOCKLIST_KEY = "blocklist";

/** Set once the local list has been handed to the account. Absent means it has not been. */
const MIGRATED_KEY = "blocklistMigrated";

/**
 * Where the cached grants live: a flat array of origins.
 *
 * Read raw by two places that are not the background — `entrypoints/popup/controls.tsx` for the
 * toggle's label, and the content script, which needs the answer synchronously while it decides
 * whether the address rules apply. Same arrangement as `BLOCKLIST_KEY`, and the same reason: a
 * cache that decides nothing on its own can be read by anyone who needs it.
 */
export const GRANTS_KEY = "grants";

/**
 * Where the cached auto-blocked hosts live: a flat array of hostnames.
 *
 * The sites Tabcake stopped reading by itself, from three of its own refusals. Cached for the same
 * reason as the other two lists, and with one extra: a host refused here never has its title or its
 * headings sent anywhere at all, where letting the backend answer would send them and be told no.
 */
const AUTO_BLOCKS_KEY = "autoBlocks";

/** `pauseUntil` when the pause has no end. Any other non-zero value is a moment to compare against. */
export const PAUSED_INDEFINITELY = -1;

export type Settings = { pauseUntil: number; blocklist: Blocklist; autoBlocks: string[] };

/** Pure, so the gate and the popup agree about what "paused" means. */
export function isPaused(pauseUntil: number, now = Date.now()): boolean {
  return pauseUntil === PAUSED_INDEFINITELY || now < pauseUntil;
}

/**
 * Both settings, with the defaults already applied. Nothing else should read these keys.
 *
 * Never touches the network. The blocklist here is whatever the last sync left, or the presets.
 */
export async function readSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(["pauseUntil", BLOCKLIST_KEY, AUTO_BLOCKS_KEY]);
  return {
    pauseUntil: (stored.pauseUntil as number | undefined) ?? 0,
    // Absent means the defaults, never "block nothing". `toBlocklist` also reads a list stored by
    // an older version, so a browser that has not synced yet still blocks the presets.
    blocklist: toBlocklist(stored[BLOCKLIST_KEY]),
    // Absent means nothing, which is the opposite direction and the right one: these are guesses,
    // and the backend refuses the page anyway if this browser has not heard about one yet.
    autoBlocks: parseAutoBlocks(stored[AUTO_BLOCKS_KEY]),
  };
}

/** Writes the cache. The one place that key is set, so the popup's live read has one writer. */
async function cache(blocklist: Blocklist): Promise<void> {
  await browser.storage.local.set({ [BLOCKLIST_KEY]: blocklist });
}

/**
 * Forgets the cached list. Called on sign-out.
 *
 * Two accounts can share a browser profile, and a list left behind would block the second account's
 * pages using the first account's rules — invisibly, because nothing on screen would say where they
 * came from. Dropping back to the presets is the safe direction: still blocking, just not blocking
 * somebody else's choices.
 */
export async function clearBlocklistCache(): Promise<void> {
  await browser.storage.local.remove([BLOCKLIST_KEY, MIGRATED_KEY, GRANTS_KEY, AUTO_BLOCKS_KEY]);
}

/**
 * Refreshes the cache from the account. Returns false when it could not, leaving the cache alone.
 *
 * Quiet on failure, like the popup's header reads in `lib/search.ts`: being offline is not an error
 * worth reporting here, because the cache it falls back on is exactly what it would have written.
 */
export async function syncBlocklist(): Promise<boolean> {
  if ((await readTokens()) === undefined) return false;
  try {
    const answer = await withFreshToken((token) =>
      client(token).query(api.blocklist.queries.get, {}),
    );
    // A reply is still a payload. Anything unreadable leaves the cache as it was rather than
    // replacing a list that works with one that does not.
    const blocklist = parseBlocklist(answer);
    if (blocklist === null) return false;
    await cache(blocklist);
    return true;
  } catch {
    return false;
  }
}

/** Reads the cached grants. Absent means nothing is allowed, which is the safe direction. */
export async function readGrants(): Promise<string[]> {
  const stored = await browser.storage.local.get(GRANTS_KEY);
  return parseGrants(stored[GRANTS_KEY]);
}

/** Refreshes the cached grants from the account. Quiet on failure, like `syncBlocklist`. */
export async function syncGrants(): Promise<boolean> {
  if ((await readTokens()) === undefined) return false;
  try {
    const answer = await withFreshToken((token) => client(token).query(api.pages.grants.list, {}));
    await cacheGrants(parseGrants(answer.map((grant) => grant.origin)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Refreshes the cached capture settings (0.33.0) from the account's user row. Quiet on failure,
 * like the lists: the cache stays as it was, and an empty cache reads as the defaults.
 */
export async function syncCapture(): Promise<boolean> {
  if ((await readTokens()) === undefined) return false;
  try {
    const user = await withFreshToken((token) => client(token).query(api.users.profile.me, {}));
    if (user === null) return false;
    await browser.storage.local.set({
      [CAPTURE_KEY]: parseCapture({ dwellSeconds: user.captureDwellSeconds, skipForms: user.captureSkipForms }),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Pauses capture with no end, or resumes it: the `pause-capture` keyboard shortcut (0.33.0). The
 * same pause the popup and the dashboard set, badge included.
 */
export async function togglePause(): Promise<void> {
  const { pauseUntil } = await readSettings();
  await setPause(isPaused(pauseUntil) ? 0 : PAUSED_INDEFINITELY);
}

/**
 * Tells the account which browser this session is (0.32.0), so the dashboard's list of your
 * browsers can name it "Chrome on Windows · Extension" instead of an unknown browser. Runs on the
 * same sync as the lists; the backend skips the write when nothing changed. Quiet on failure.
 */
export async function touchDevice(): Promise<boolean> {
  if ((await readTokens()) === undefined) return false;
  try {
    await withFreshToken((token) =>
      client(token).mutation(api.users.devices.touch, { label: deviceLabel(), client: "extension" }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Writes the grants cache. The one place that key is set, so its live readers have one writer. */
async function cacheGrants(origins: string[]): Promise<void> {
  await browser.storage.local.set({ [GRANTS_KEY]: origins });
}

/**
 * Refreshes the cached auto-blocked hosts from the account. Quiet on failure, like the other two.
 *
 * Nothing here ever writes this list — Tabcake decides it from what the classifier already said,
 * and the only thing this browser can do about one is undo it on the dashboard. So there is no
 * `setAutoBlocked` to match `setBlocked` and `setAllowed`.
 */
export async function syncAutoBlocks(): Promise<boolean> {
  if ((await readTokens()) === undefined) return false;
  try {
    const answer = await withFreshToken((token) =>
      client(token).query(api.pages.autoblock.list, {}),
    );
    await browser.storage.local.set({
      [AUTO_BLOCKS_KEY]: parseAutoBlocks(answer.map((rule) => rule.host)),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Allows or stops allowing one origin. False when it did not reach the account.
 *
 * Cache first, then the account, exactly as `setBlocked` does and for the same reason: the popup
 * has no state of its own and re-renders from storage, so writing the server first would leave the
 * label saying the opposite of what was just clicked for the length of a round trip.
 *
 * Revoking never forgets pages from here. The popup is one click with no room to explain what would
 * go; the dashboard asks properly, and that is where the option lives.
 */
export async function setAllowed(origin: string, allowed: boolean): Promise<boolean> {
  const grants = await readGrants();
  const entry = origin.trim().toLowerCase();
  const next = allowed
    ? grants.includes(entry)
      ? grants
      : [...grants, entry]
    : grants.filter((item) => item !== entry);

  await cacheGrants(next);

  try {
    await withFreshToken((token) =>
      allowed
        ? client(token).mutation(api.pages.grants.allow, { origin: entry, device: deviceLabel() })
        : client(token).mutation(api.pages.grants.revoke, { origin: entry, forget: false }),
    );
  } catch {
    await cacheGrants(grants);
    return false;
  }
  await syncGrants();
  return true;
}

/**
 * Which browser this is, in words, for the line the dashboard shows beside a grant.
 *
 * `userAgentData.platform` is "Windows" or "macOS" and needs no permission and no parsing. This is
 * a browser extension, so the first half is not a guess. **Never an IP address** — the plan page
 * says why, and it is the one thing a permission record here must not carry.
 */
function deviceLabel(): string {
  const platform = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform;
  return platform ? `Chrome on ${platform}` : "This browser";
}

/**
 * Hands this browser's stored list to the account, once.
 *
 * **Reads the raw key rather than `readSettings`.** A browser where nobody ever opened the settings
 * has nothing stored, and `readSettings` would hand back the presets — uploading those would tell
 * the account that all four preset groups are wanted, which is a decision nobody made. Nothing
 * stored means nothing to migrate.
 *
 * The flag is set whatever the server answers, because the server merge is idempotent and a browser
 * retrying forever would upload a list its owner has since edited away.
 */
export async function migrateBlocklist(): Promise<void> {
  if ((await readTokens()) === undefined) return;

  const stored = await browser.storage.local.get([BLOCKLIST_KEY, MIGRATED_KEY]);
  if (stored[MIGRATED_KEY] === true) return;
  if (stored[BLOCKLIST_KEY] === undefined) {
    await browser.storage.local.set({ [MIGRATED_KEY]: true });
    return;
  }

  try {
    await withFreshToken((token) =>
      client(token).mutation(api.blocklist.edit.migrate, {
        document: toBlocklist(stored[BLOCKLIST_KEY]),
      }),
    );
    await browser.storage.local.set({ [MIGRATED_KEY]: true });
    await syncBlocklist();
  } catch {
    // Offline, or signed out between the two reads. The next worker start tries again.
  }
}

/**
 * Pauses until a moment, until PAUSED_INDEFINITELY, or not at all when given 0.
 *
 * The alarm is the point. A badge is drawn once and nothing redraws it when the pause expires, so
 * without one the toolbar would go on claiming "paused" until something else happened to write a
 * badge — which might be never. A pause with no end needs no alarm, because it has no end.
 */
export async function setPause(until: number): Promise<void> {
  await browser.storage.local.set({ pauseUntil: until });
  await browser.alarms.clear(RESUME_ALARM);
  if (until > 0) await browser.alarms.create(RESUME_ALARM, { when: until });
  await applyPauseBadge();
}

/** Starts the repeating refresh. Safe to call again; creating an alarm twice replaces it. */
export async function startBlocklistSync(): Promise<void> {
  await browser.alarms.clear(OLD_SYNC_ALARM);
  await browser.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_MINUTES });
}

/**
 * Redraws the pause badge from what is stored. Run it on the alarm, and once when the worker
 * starts: badge state does not survive a browser restart but `pauseUntil` does, and a missing
 * badge is as dishonest as a stale one.
 *
 * This is the **default** badge, so a tab already wearing the amber dot keeps it. That is right —
 * the dot says the page is remembered, which stays true while capture is paused.
 */
export async function applyPauseBadge(): Promise<void> {
  const { pauseUntil } = await readSettings();
  const paused = isPaused(pauseUntil);
  const text = paused ? PAUSE_BADGE : "";
  // The tooltip names the pause, so the II explains itself on hover (audit E-14) — the default,
  // and every open tab's own, because Chrome cannot clear a tab's title back to the default.
  // Tab ids need no permission; only a tab's address would.
  await browser.action.setTitle({ title: titleFor(undefined, paused) });
  const states = await browser.storage.session.get(null);
  for (const tab of await browser.tabs.query({})) {
    if (tab.id === undefined) continue;
    const state = states[`tab:${tab.id}`] as TabState | undefined;
    try {
      await browser.action.setTitle({ tabId: tab.id, title: titleFor(state, paused) });
    } catch {
      // The tab closed between listing it and titling it.
    }
  }
  await browser.action.setBadgeText({ text });
  if (text === "") return;
  await browser.action.setBadgeBackgroundColor({ color: PAUSE_BADGE_COLOUR });
  await browser.action.setBadgeTextColor({ color: PAUSE_BADGE_TEXT_COLOUR });
}

/**
 * Adds or removes one hostname — the popup's one-site toggle. False when it did not reach the
 * account.
 *
 * **The cache is written first, then the account.** The popup has no state of its own: it reads
 * `local.blocklist` and re-renders on `storage.onChanged`, so writing the server first would leave
 * the label saying the opposite of what was just clicked for as long as the round trip takes. A
 * failed write puts the cache back, and the label flips back with it, which is the honest signal
 * that nothing was saved.
 *
 * Being briefly wrong is affordable here for one reason: this cache never decides anything on its
 * own. `pages.ingest.capture` re-checks the account's list before it writes a page.
 *
 * Unblocking removes the host from the loose rules *and* from every group, because a rule left
 * inside a group would go on blocking a site this just said was unblocked. It removes the host
 * itself and nothing else: a site blocked only because its parent domain is blocked stays blocked.
 */
export async function setBlocked(host: string, blocked: boolean): Promise<boolean> {
  const { blocklist } = await readSettings();
  const entry = host.trim().toLowerCase();

  const next: Blocklist = blocked
    ? isBlocked(entry, blocklist)
      ? blocklist
      : {
          ...blocklist,
          rules: [...blocklist.rules, { host: entry, scope: "domain", enabled: true }],
        }
    : {
        ...blocklist,
        rules: blocklist.rules.filter((item) => item.host !== entry),
        groups: blocklist.groups.map((group) => ({
          ...group,
          rules: group.rules.filter((item) => item.host !== entry),
        })),
      };

  await cache(next);

  try {
    await withFreshToken((token) =>
      client(token).mutation(api.blocklist.edit.setHost, { host: entry, blocked }),
    );
  } catch {
    await cache(blocklist);
    return false;
  }
  // The server normalises and dedupes, so what it stored is not always what went out.
  await syncBlocklist();
  return true;
}

/**
 * Replaces the whole list, or resets it with `null`. False without storing anything when the
 * payload does not validate — see `parseBlocklist` for why a partial list is never stored.
 *
 * The account first and the cache second, the opposite way round from `setBlocked`. Nothing is
 * watching this one repaint: it arrives from the dashboard, which reads Convex itself and sees its
 * own write land there.
 */
export async function setBlocklist(value: unknown): Promise<boolean> {
  // null means "forget the stored list", so the presets apply again. The default list itself never
  // has to be copied into a second repo to be offered back.
  const document = value === null ? null : parseBlocklist(value);
  if (value !== null && document === null) return false;

  try {
    await withFreshToken((token) =>
      client(token).mutation(api.blocklist.edit.replace, { document }),
    );
  } catch {
    return false;
  }

  if (document === null) {
    await browser.storage.local.remove(BLOCKLIST_KEY);
    return true;
  }
  await syncBlocklist();
  return true;
}
