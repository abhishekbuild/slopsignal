import { getFunctionName } from "convex/server";
import { beforeEach, expect, test, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

// Same shape as capture.test.ts: one set of spies behind every `new ConvexHttpClient(...)`, so the
// per-call clients in lib/auth.ts all share them.
const convex = vi.hoisted(() => ({
  action: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
  setAuth: vi.fn(),
}));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth = convex.setAuth;
    action = convex.action;
    query = convex.query;
    mutation = convex.mutation;
  },
}));

// The fake browser stops at the APIs it implements, and `action` is not one of them.
const badge = vi.hoisted(() => ({ text: vi.fn(), background: vi.fn(), textColour: vi.fn(), title: vi.fn() }));

import { type Blocklist, defaults, flattenHosts, isBlocked, parseBlocklist } from "./rules";
import {
  applyPauseBadge,
  clearBlocklistCache,
  isPaused,
  migrateBlocklist,
  PAUSED_INDEFINITELY,
  readSettings,
  setAllowed,
  setBlocked,
  setBlocklist,
  setPause,
  startBlocklistSync,
  syncAutoBlocks,
  syncBlocklist,
  syncGrants,
} from "./settings";

const jwt = (expiresAtMs: number) =>
  `h.${btoa(JSON.stringify({ exp: Math.floor(expiresAtMs / 1000), sub: "u|s" })).replace(/=+$/, "")}.sig`;
const signedIn = { token: jwt(Date.now() + 3_600_000), refreshToken: "r1" };

const stored = () => fakeBrowser.storage.local.get(["pauseUntil", "blocklist"]);
const cached = async () => (await fakeBrowser.storage.local.get("blocklist")).blocklist;
const alarms = () => fakeBrowser.alarms.getAll();

/**
 * A stand-in for the account's list, so the round trip these functions make is the thing under test
 * rather than something mocked away. Its mutations apply the same rules the backend does; the real
 * ones are in `tabcake-server/convex/blocklist/edit.ts`.
 */
let server: Blocklist;

/** The account's allowed origins, the same way. */
let serverGrants: { origin: string; device: string; createdAt: number }[];

/** Which backend function a mocked call was for. `anyApi` refs carry their path, not their identity. */
const path = (ref: unknown) => getFunctionName(ref as Parameters<typeof getFunctionName>[0]);
const isGrants = (ref: unknown) => path(ref).includes("grants");
const isAutoBlocks = (ref: unknown) => path(ref).includes("autoblock");

/** The account's auto-blocked hosts, the same way. Read-only: nothing in this browser writes them. */
let serverAutoBlocks: { host: string; createdAt: number; evidence: never[] }[];

function fakeServer() {
  server = defaults();
  serverGrants = [];
  serverAutoBlocks = [];
  convex.query.mockImplementation(async (ref: unknown) => {
    if (isAutoBlocks(ref)) return serverAutoBlocks;
    return isGrants(ref) ? serverGrants : server;
  });
  convex.mutation.mockImplementation(async (ref: unknown, args: Record<string, unknown>) => {
    if (isGrants(ref)) {
      const origin = String(args.origin);
      serverGrants =
        "device" in args
          ? serverGrants.some((grant) => grant.origin === origin)
            ? serverGrants
            : [...serverGrants, { origin, device: String(args.device), createdAt: Date.now() }]
          : serverGrants.filter((grant) => grant.origin !== origin);
      return null;
    }
    if ("blocked" in args) {
      const host = String(args.host);
      const without = (rules: Blocklist["rules"]) => rules.filter((rule) => rule.host !== host);
      server = args.blocked
        ? { ...server, rules: [...without(server.rules), { host, scope: "domain", enabled: true }] }
        : {
            ...server,
            rules: without(server.rules),
            groups: server.groups.map((group) => ({ ...group, rules: without(group.rules) })),
          };
      return null;
    }
    if (args.document === null) {
      server = defaults();
      return null;
    }
    server = parseBlocklist(args.document) ?? server;
    return { merged: false };
  });
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.resetAllMocks();
  // @ts-expect-error see above; the badge is not what these tests are about.
  fakeBrowser.action = {
    setBadgeText: badge.text,
    setBadgeBackgroundColor: badge.background,
    setBadgeTextColor: badge.textColour,
    setTitle: badge.title,
  };
  fakeServer();
  await fakeBrowser.storage.local.set({ auth: signedIn });
});

test("isPaused reads the two shapes a pause can take", () => {
  const now = Date.now();
  expect(isPaused(0, now)).toBe(false);
  expect(isPaused(now - 1, now)).toBe(false); // ran out a millisecond ago
  expect(isPaused(now + 60_000, now)).toBe(true);
  expect(isPaused(PAUSED_INDEFINITELY, now)).toBe(true);
});

test("empty storage means the defaults, not nothing", async () => {
  // The reason there is no seeding on install: this state is impossible to get wrong. It is also
  // what a browser that has never reached the account falls back on, so it still has to block.
  //
  // The two lists fall back in opposite directions on purpose. The blocklist has to be the presets,
  // because "I could not read your settings" must never mean "so nothing is blocked". The
  // auto-blocks have to be empty, because they are guesses this browser has not been told about yet
  // and the backend refuses those pages anyway.
  await expect(readSettings()).resolves.toEqual({
    pauseUntil: 0,
    blocklist: defaults(),
    autoBlocks: [],
  });
});

test("reading settings never touches the network", async () => {
  // The capture gate calls this on the way out of every page. It has to answer instantly, and it
  // has to answer offline.
  await readSettings();
  expect(convex.query).not.toHaveBeenCalled();
});

test("a timed pause stores the moment, badges it, and sets an alarm to undo the badge", async () => {
  const until = Date.now() + 15 * 60_000;

  await setPause(until);

  expect((await stored()).pauseUntil).toBe(until);
  expect(badge.text).toHaveBeenCalledWith({ text: "II" });
  // Nothing else would redraw the badge when the pause runs out.
  expect(await alarms()).toHaveLength(1);
  expect((await alarms())[0]?.scheduledTime).toBe(until);
});

test("a pause with no end sets no alarm, because it has no end", async () => {
  await setPause(PAUSED_INDEFINITELY);

  expect((await stored()).pauseUntil).toBe(PAUSED_INDEFINITELY);
  expect(badge.text).toHaveBeenCalledWith({ text: "II" });
  expect(await alarms()).toEqual([]);
});

test("resuming clears the badge and the alarm", async () => {
  await setPause(Date.now() + 60_000);
  vi.clearAllMocks();

  await setPause(0);

  expect((await stored()).pauseUntil).toBe(0);
  expect(badge.text).toHaveBeenCalledWith({ text: "" });
  expect(await alarms()).toEqual([]);
});

test("a pause that has run out stops claiming to be one", async () => {
  // What the alarm calls, and what the worker calls when it starts: badge state does not survive a
  // browser restart but the stored pause does, so they have to be reconciled from storage.
  await fakeBrowser.storage.local.set({ pauseUntil: Date.now() - 1 });

  await applyPauseBadge();

  expect(badge.text).toHaveBeenCalledWith({ text: "" });
  expect(badge.title).toHaveBeenCalledWith({ title: "Tabcake" });
});

test("a pause is II on ink, and every tooltip says paused", async () => {
  await fakeBrowser.storage.local.set({ pauseUntil: Date.now() + 60_000 });
  const tab = await fakeBrowser.tabs.create({ url: "https://example.com/a" });
  await fakeBrowser.storage.session.set({
    [`tab:${tab.id}`]: { host: "example.com", url: "https://example.com/a", title: "A", status: { state: "watching", startedAt: 0 } },
  });

  await applyPauseBadge();

  expect(badge.text).toHaveBeenCalledWith({ text: "II" });
  expect(badge.background).toHaveBeenCalledWith({ color: "#1c1714" });
  expect(badge.title).toHaveBeenCalledWith({ title: "Tabcake: paused" });
  // A tab's own title overrides the default and cannot be cleared, so it is rewritten too.
  expect(badge.title).toHaveBeenCalledWith({ tabId: tab.id, title: "Tabcake: paused" });
});

test("sync replaces the cache with the account's list", async () => {
  server = parseBlocklist(["account.example"]) as Blocklist;

  expect(await syncBlocklist()).toBe(true);
  // The loose rules are exactly what the account sent. The presets are alongside them because a
  // document that has never heard of a preset group gains it on read — see `parseBlocklist`.
  expect((await readSettings()).blocklist.rules.map((rule) => rule.host)).toEqual([
    "account.example",
  ]);
  expect(flattenHosts((await readSettings()).blocklist)).toContain("account.example");
});

test("a sync that cannot reach the account leaves the cache alone", async () => {
  await setBlocked("news.example", true);
  convex.query.mockRejectedValue(new Error("offline"));

  expect(await syncBlocklist()).toBe(false);

  // Still blocking what it knew about. The failure mode is a list that is behind, never an empty one.
  expect(isBlocked("news.example", (await readSettings()).blocklist)).toBe(true);
});

test("a sync while signed out does not call the account at all", async () => {
  await fakeBrowser.storage.local.remove("auth");

  expect(await syncBlocklist()).toBe(false);
  expect(convex.query).not.toHaveBeenCalled();
});

test("blocking a site adds it to the defaults rather than replacing them", async () => {
  expect(await setBlocked("News.Example.com", true)).toBe(true);

  const { blocklist } = await readSettings();
  expect(flattenHosts(blocklist)).toContain("news.example.com");
  expect(flattenHosts(blocklist)).toContain("mail.google.com"); // still there
});

test("the cache is written before the account, so the popup's label flips at once", async () => {
  let cacheAtCallTime: unknown;
  convex.mutation.mockImplementation(async () => {
    cacheAtCallTime = (await fakeBrowser.storage.local.get("blocklist")).blocklist;
    return null;
  });

  await setBlocked("news.example", true);

  // The popup has no state of its own: it re-renders from storage.onChanged. If the account went
  // first, the label would say the opposite of what was clicked for the length of a round trip.
  expect(isBlocked("news.example", cacheAtCallTime as Blocklist)).toBe(true);
});

test("a block the account refuses is rolled back, and says so", async () => {
  await setBlocked("first.example", true);
  const before = await cached();
  convex.mutation.mockRejectedValue(new Error("offline"));

  expect(await setBlocked("second.example", true)).toBe(false);

  // The label flips back with the cache, which is the honest signal that nothing was saved.
  expect(await cached()).toEqual(before);
  expect(isBlocked("second.example", (await readSettings()).blocklist)).toBe(false);
});

test("blocking a site twice does not add it twice", async () => {
  await setBlocked("news.example.com", true);
  await setBlocked("news.example.com", true);

  const { blocklist } = await readSettings();
  expect(blocklist.rules.filter((rule) => rule.host === "news.example.com")).toHaveLength(1);
});

test("unblocking one of the defaults works, and does not lose the rest", async () => {
  // paypal.com lives inside a preset group, so removing it has to reach in there rather than only
  // the loose rules — otherwise the popup says unblocked and capture goes on refusing the page.
  await setBlocked("paypal.com", false);

  const { blocklist } = await readSettings();
  expect(isBlocked("paypal.com", blocklist)).toBe(false);
  expect(isBlocked("mail.google.com", blocklist)).toBe(true);
});

test("setBlocklist stores a valid list whole", async () => {
  expect(await setBlocklist(["example.com", "Other.COM"])).toBe(true);
  expect((await readSettings()).blocklist.rules.map((rule) => rule.host)).toEqual([
    "example.com",
    "other.com",
  ]);
});

test("setBlocklist refuses a bad payload without calling the account", async () => {
  await setBlocklist(["example.com"]);
  vi.clearAllMocks();

  expect(await setBlocklist(["ok.com", "https://bad.com/x"])).toBe(false);
  expect(await setBlocklist("not a list")).toBe(false);
  expect(await setBlocklist({ schema: 2, rules: [{ host: "ok.com" }], groups: [] })).toBe(false);

  // A half-valid document must not reach the account any more than it reaches storage.
  expect(convex.mutation).not.toHaveBeenCalled();
  expect((await readSettings()).blocklist.rules.map((rule) => rule.host)).toEqual(["example.com"]);
});

test("resetting forgets the stored list, so the defaults apply again", async () => {
  // What "Reset to defaults" sends. Storing the defaults back would work today and would rot the
  // moment the defaults changed; forgetting the key cannot.
  await setBlocklist(["example.com"]);

  expect(await setBlocklist(null)).toBe(true);

  expect((await readSettings()).blocklist).toEqual(defaults());
  expect(await fakeBrowser.storage.local.get("blocklist")).toEqual({});
});

test("migration uploads a list this browser had stored, once", async () => {
  await fakeBrowser.storage.local.set({ blocklist: ["mine.example"] });

  await migrateBlocklist();
  expect(convex.mutation).toHaveBeenCalledTimes(1);

  await migrateBlocklist();
  // The flag stops a browser re-uploading a list its owner has since edited away.
  expect(convex.mutation).toHaveBeenCalledTimes(1);
});

test("a browser that never blocked anything uploads nothing", async () => {
  await migrateBlocklist();

  // readSettings would have handed back the presets here. Uploading those would tell the account
  // that all four preset groups are wanted, which is a decision nobody made.
  expect(convex.mutation).not.toHaveBeenCalled();
  expect((await fakeBrowser.storage.local.get("blocklistMigrated")).blocklistMigrated).toBe(true);
});

test("signing out forgets the cached list and the migration flag", async () => {
  await setBlocked("news.example", true);

  await clearBlocklistCache();

  // Two accounts can share a browser profile; the next one must not inherit these rules.
  expect((await readSettings()).blocklist).toEqual(defaults());
  expect(await fakeBrowser.storage.local.get("blocklistMigrated")).toEqual({});
});

const grants = async () => (await fakeBrowser.storage.local.get("grants")).grants;

test("allowing a site writes the cache first, then the account", async () => {
  const order: string[] = [];
  convex.mutation.mockImplementation(async () => {
    order.push(`cache: ${JSON.stringify(await grants())}`);
    return null;
  });

  expect(await setAllowed("https://neverssl.com", true)).toBe(true);

  // The popup has no state of its own and re-renders from storage, so the cache has to move first
  // or the label says the opposite of what was just clicked for the length of a round trip.
  expect(order).toEqual([`cache: ["https://neverssl.com"]`]);
});

test("allowing reaches the account, and the cache ends up agreeing with it", async () => {
  await setAllowed("https://neverssl.com", true);

  expect(serverGrants.map((grant) => grant.origin)).toEqual(["https://neverssl.com"]);
  expect(await grants()).toEqual(["https://neverssl.com"]);
  // The label has to say which browser, and it must never be an address.
  expect(serverGrants[0]?.device).toMatch(/^(Chrome on .+|This browser)$/);
});

test("a failed allow puts the cache back and says so", async () => {
  convex.mutation.mockRejectedValue(new TypeError("Failed to fetch"));

  expect(await setAllowed("https://neverssl.com", true)).toBe(false);
  // The label flips back with it, which is the honest signal that nothing was saved.
  expect(await grants()).toEqual([]);
});

test("stopping allowing removes it from both", async () => {
  await setAllowed("https://neverssl.com", true);

  expect(await setAllowed("https://neverssl.com", false)).toBe(true);
  expect(await grants()).toEqual([]);
  expect(serverGrants).toEqual([]);
});

test("the popup's toggle never forgets pages", async () => {
  await setAllowed("https://neverssl.com", true);
  convex.mutation.mockClear();

  await setAllowed("https://neverssl.com", false);

  // One click with no room to explain what would go. The dashboard asks properly.
  const [, args] = convex.mutation.mock.calls[0] as [unknown, Record<string, unknown>];
  expect(args.forget).toBe(false);
});

test("a sync replaces the cache with what the account holds", async () => {
  serverGrants = [
    { origin: "https://a.com", device: "Chrome on Windows", createdAt: 1 },
    { origin: "not an origin", device: "x", createdAt: 2 },
  ];

  expect(await syncGrants()).toBe(true);
  // A reply is still a payload: the entry that is not an origin never reaches the cache.
  expect(await grants()).toEqual(["https://a.com"]);
});

test("a sync that fails leaves the cache exactly as it was", async () => {
  await setAllowed("https://a.com", true);
  convex.query.mockRejectedValue(new TypeError("Failed to fetch"));

  expect(await syncGrants()).toBe(false);
  expect(await grants()).toEqual(["https://a.com"]);
});

test("signing out forgets the allowed sites too", async () => {
  await setAllowed("https://a.com", true);

  await clearBlocklistCache();

  // Same reason as the blocklist: two accounts can share a browser profile, and the next one must
  // not inherit permissions the last one gave.
  expect(await grants()).toBeUndefined();
});

const autoBlocks = async () => (await fakeBrowser.storage.local.get("autoBlocks")).autoBlocks;

test("the auto-blocked hosts are cached from the account", async () => {
  serverAutoBlocks = [
    { host: "payroll.example.com", createdAt: 1, evidence: [] },
    { host: "https://not-a-host.com", createdAt: 2, evidence: [] },
  ];

  expect(await syncAutoBlocks()).toBe(true);
  // A reply is still a payload: the entry that is not a hostname never reaches the cache.
  expect(await autoBlocks()).toEqual(["payroll.example.com"]);
});

test("an auto-block sync that fails leaves the cache exactly as it was", async () => {
  serverAutoBlocks = [{ host: "payroll.example.com", createdAt: 1, evidence: [] }];
  await syncAutoBlocks();
  convex.query.mockRejectedValue(new TypeError("Failed to fetch"));

  expect(await syncAutoBlocks()).toBe(false);
  expect(await autoBlocks()).toEqual(["payroll.example.com"]);
});

test("signing out forgets what Tabcake blocked by itself too", async () => {
  serverAutoBlocks = [{ host: "payroll.example.com", createdAt: 1, evidence: [] }];
  await syncAutoBlocks();

  await clearBlocklistCache();

  // These are guesses made from one account's browsing. The next account in this profile must not
  // inherit them, for the same reason it does not inherit the blocked list.
  expect(await autoBlocks()).toBeUndefined();
});

test("the repeating refresh clears the alarm it used to be called", async () => {
  await fakeBrowser.alarms.create("sync-blocklist", { periodInMinutes: 30 });

  await startBlocklistSync();

  expect((await alarms()).map((alarm) => alarm.name)).toEqual(["sync-settings"]);
});
