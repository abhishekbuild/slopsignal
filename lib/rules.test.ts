import { expect, test } from "vitest";
import {
  type BlockRule,
  type Blocklist,
  defaults,
  flattenHosts,
  isBlocked,
  isFormDominated,
  isPrivateHost,
  isSearchResults,
  isShort,
  isVideoWatch,
  parseBlocklist,
  SCHEMA,
  videoId,
  toBlocklist,
} from "./rules";

const search = (url: string) => isSearchResults(new URL(url));
const video = (url: string) => isVideoWatch(new URL(url));

/** A blocklist holding these hosts and nothing else, at the reach a bare hostname has always had. */
const only = (...hosts: string[]) => parseBlocklist(hosts)!;

/** A document with one group, for the tests about what a group's switch does. */
const grouped = (enabled: boolean, ...rules: BlockRule[]): Blocklist => ({
  schema: 2,
  rules: [],
  groups: [{ id: "g", name: "A group", enabled, rules }],
});

test("isSearchResults: the search engines themselves", () => {
  expect(search("https://www.google.com/search?q=convex")).toBe(true);
  expect(search("https://google.co.uk/search?q=convex")).toBe(true);
  expect(search("https://duckduckgo.com/?q=convex")).toBe(true);
  expect(search("https://www.bing.com/search?q=convex")).toBe(true);
  expect(search("https://kagi.com/search?q=convex")).toBe(true);
});

test("isSearchResults: a site's own search, whoever the site is", () => {
  expect(search("https://github.com/search?q=convex")).toBe(true);
  expect(search("https://example.com/results?page=2")).toBe(true);
  expect(search("https://example.com/?q=anything")).toBe(true);
});

test("isSearchResults: a real page on a search company's domain is still a real page", () => {
  // The whole point of matching the host exactly rather than looking for "google" in it.
  expect(search("https://docs.google.com/document/d/abc123/edit")).toBe(false);
  expect(search("https://developers.google.com/web/fundamentals")).toBe(false);
  expect(search("https://mail.google.com/mail/u/0/")).toBe(false);
});

test("isSearchResults: a q deep inside a site is a filter, not a search page", () => {
  expect(search("https://example.com/docs/guides/setup?q=install")).toBe(false);
  expect(search("https://example.com/articles/how-search-works")).toBe(false);
});

test("isVideoWatch knows a video from the rest of the site", () => {
  expect(video("https://www.youtube.com/watch?v=abc")).toBe(true);
  expect(video("https://m.youtube.com/watch?v=abc")).toBe(true);
  expect(video("https://music.youtube.com/watch?v=abc")).toBe(true);
  expect(video("https://www.youtube.com/shorts/abc")).toBe(true);
  // youtu.be is nothing but videos, whatever the path looks like.
  expect(video("https://youtu.be/abc")).toBe(true);

  // The rest of YouTube is an ordinary site and stays readable.
  expect(video("https://www.youtube.com/@abaker")).toBe(false);
  expect(video("https://www.youtube.com/")).toBe(false);
  expect(video("https://www.youtube.com/results?search_query=cake")).toBe(false);
  // A name that merely starts the same way is a different company.
  expect(video("https://youtube.com.evil.net/watch?v=abc")).toBe(false);
  expect(video("https://notyoutube.com/watch?v=abc")).toBe(false);
});

test("a watch address carrying a q also reads as a search page, so the gate asks about video first", () => {
  // `/watch` is one path segment, so `isSearchResults`'s "a q at the top of a site is a search box"
  // rule fires on it. Both are true at once, and the content script must ask `isVideoWatch` first —
  // it did not until 0.13.1, and `youtube.com/watch?v=X&q=…` skipped as a search with no button.
  const url = "https://www.youtube.com/watch?v=abc&q=cake";
  expect(search(url)).toBe(true);
  expect(video(url)).toBe(true);
});

test("isShort tells the two surfaces apart, because only one of them has a transcript panel", () => {
  expect(isShort(new URL("https://www.youtube.com/shorts/abc"))).toBe(true);
  expect(isShort(new URL("https://www.youtube.com/watch?v=abc"))).toBe(false);
});

test("videoId reads the id from every video address, and nothing from the rest", () => {
  // A Short's button opens `/watch?v=<id>`, and that page checks the id against the note the Short
  // left before pressing itself — so the two forms of the same video must agree.
  expect(videoId(new URL("https://www.youtube.com/shorts/abc123"))).toBe("abc123");
  expect(videoId(new URL("https://www.youtube.com/watch?v=abc123&t=10"))).toBe("abc123");
  expect(videoId(new URL("https://youtu.be/abc123?si=x"))).toBe("abc123");
  expect(videoId(new URL("https://www.youtube.com/@abaker"))).toBe("");
  expect(videoId(new URL("https://www.youtube.com/shorts/"))).toBe("");
});

test("isBlocked matches the host itself and its subdomains", () => {
  expect(isBlocked("paypal.com", only("paypal.com"))).toBe(true);
  expect(isBlocked("www.paypal.com", only("paypal.com"))).toBe(true);
  expect(isBlocked("PayPal.com", only("paypal.com"))).toBe(true);
});

test("isBlocked does not match a host that merely ends with the same letters", () => {
  // A suffix match would block this, and it is a different company.
  expect(isBlocked("notpaypal.com", only("paypal.com"))).toBe(false);
  expect(isBlocked("paypal.com.example.org", only("paypal.com"))).toBe(false);
});

test("a host-scoped rule blocks that one hostname and leaves the rest of the site alone", () => {
  // The whole reason the scope exists: blocking your webmail should not block the company site.
  const list = grouped(true, { host: "mail.example.com", scope: "host", enabled: true });
  expect(isBlocked("mail.example.com", list)).toBe(true);
  expect(isBlocked("a.mail.example.com", list)).toBe(false);
  expect(isBlocked("example.com", list)).toBe(false);
});

test("a rule that is switched off blocks nothing, and is still there", () => {
  // Off is how you lift a block without losing the rule and having to type it again.
  const off: Blocklist = {
    schema: 2,
    rules: [{ host: "paypal.com", scope: "domain", enabled: false }],
    groups: [],
  };
  expect(isBlocked("paypal.com", off)).toBe(false);
  expect(off.rules).toHaveLength(1);
});

test("a group that is switched off blocks nothing its rules say", () => {
  const rule: BlockRule = { host: "paypal.com", scope: "domain", enabled: true };
  expect(isBlocked("www.paypal.com", grouped(true, rule))).toBe(true);
  expect(isBlocked("www.paypal.com", grouped(false, rule))).toBe(false);
});

test("isBlocked falls back to the defaults when no list is stored", () => {
  // Storage being empty must mean "the defaults", never "block nothing".
  expect(isBlocked("mail.google.com")).toBe(true);
  expect(isBlocked("example.com")).toBe(false);
  // localhost used to be in here, as a preset rule. isPrivateHost answers it now, above the list,
  // which is why the popup must not report it as a blocked domain.
  expect(isBlocked("localhost")).toBe(false);
  expect(isPrivateHost("localhost")).toBe(true);
  expect(flattenHosts(defaults())).toContain("web.whatsapp.com");
});

test("an old stored list still blocks everything it used to, and no more", () => {
  // The migration, and the only thing about it that matters. Reading these as host-scoped would
  // quietly stop blocking www.paypal.com for everyone already blocking paypal.com.
  const migrated = toBlocklist(["paypal.com", "internal.example"]);

  expect(isBlocked("www.paypal.com", migrated)).toBe(true);
  expect(isBlocked("internal.example", migrated)).toBe(true);
  // Their list replaced the defaults, so the presets arrive switched off rather than re-blocking
  // something they had deliberately removed.
  expect(isBlocked("mail.google.com", migrated)).toBe(false);
  expect(migrated.groups.every((group) => !group.enabled)).toBe(true);
});

test("an unreadable stored value falls back to the defaults, never to blocking nothing", () => {
  expect(isBlocked("mail.google.com", toBlocklist("nonsense"))).toBe(true);
  expect(isBlocked("mail.google.com", toBlocklist({ schema: 99 }))).toBe(true);
  expect(isBlocked("mail.google.com", toBlocklist(undefined))).toBe(true);
});

test("flattenHosts is what an older dashboard sees, and it leaves out what is switched off", () => {
  const list: Blocklist = {
    schema: 2,
    rules: [
      { host: "example.com", scope: "domain", enabled: true },
      { host: "off.example", scope: "domain", enabled: false },
    ],
    groups: [
      { id: "g", name: "Off", enabled: false, rules: [{ host: "hidden.example", scope: "domain", enabled: true }] },
    ],
  };
  expect(flattenHosts(list)).toEqual(["example.com"]);
});

test("isFormDominated: a checkout page is a form, an article with a comment box is not", () => {
  expect(isFormDominated(9, 3)).toBe(true); // card, address, expiry… and three headings
  expect(isFormDominated(2, 40)).toBe(false); // an article with a comment box
  expect(isFormDominated(8, 60)).toBe(false); // a long article with a long form under it
  expect(isFormDominated(5, 1)).toBe(false); // a search box and filters, under the threshold
});

test("parseBlocklist cleans a plain list, which is what an older dashboard still sends", () => {
  expect(parseBlocklist([" Example.com ", "*.mail.google.com", "example.com"])).toEqual({
    schema: 2,
    rules: [
      // trimmed, lowercased, and the duplicate dropped
      { host: "example.com", scope: "domain", enabled: true },
      // a `*.` prefix is how a person writes the reach a bare hostname already had
      { host: "mail.google.com", scope: "domain", enabled: true },
    ],
    groups: [],
  });
  expect(parseBlocklist([])).toEqual({ schema: 2, rules: [], groups: [] });
});

test("parseBlocklist keeps a note and a scope the dashboard sent", () => {
  expect(
    parseBlocklist({
      schema: 2,
      rules: [{ host: "mail.example.com", scope: "host", enabled: false, reason: " Webmail " }],
      groups: [],
    }),
  ).toEqual({
    schema: 2,
    rules: [{ host: "mail.example.com", scope: "host", enabled: false, reason: "Webmail" }],
    groups: defaults().groups,
  });
});

test("parseBlocklist refuses the whole list rather than part of it", () => {
  // A half-stored list would silently stop blocking something the user believes is blocked.
  expect(parseBlocklist(["good.com", "https://bad.com/path"])).toBeNull();
  expect(parseBlocklist(["good.com", "two words"])).toBeNull();
  expect(parseBlocklist(["good.com", "host:8080"])).toBeNull();
  expect(parseBlocklist(["good.com", ""])).toBeNull();
  expect(parseBlocklist(["good.com", 7])).toBeNull();
});

test("parseBlocklist refuses a document it does not recognise", () => {
  const rule = { host: "a.com", scope: "domain", enabled: true };
  expect(parseBlocklist("example.com")).toBeNull();
  expect(parseBlocklist(null)).toBeNull();
  expect(parseBlocklist({ 0: "example.com" })).toBeNull();
  expect(parseBlocklist({ schema: 1, rules: [], groups: [] })).toBeNull();
  expect(parseBlocklist({ schema: 2, rules: [{ ...rule, scope: "sometimes" }], groups: [] })).toBeNull();
  expect(parseBlocklist({ schema: 2, rules: [{ host: "a.com" }], groups: [] })).toBeNull();
  expect(parseBlocklist({ schema: 2, rules: [], groups: [{ id: "g", name: "", enabled: true, rules: [] }] })).toBeNull();
  // Two groups sharing an id, which would make a toggle ambiguous.
  const group = { id: "g", name: "A", enabled: true, rules: [] };
  expect(parseBlocklist({ schema: 2, rules: [], groups: [group, group] })).toBeNull();
});

test("parseBlocklist refuses more entries than a person could have meant", () => {
  const hosts = (n: number) => Array.from({ length: n }, (_, i) => `h${i}.com`);
  expect(parseBlocklist(hosts(501))).toBeNull();
  expect(parseBlocklist(hosts(500))?.rules).toHaveLength(500);

  // The cap is on the whole document, so it cannot be dodged by hiding rules inside groups.
  const group = (i: number) => ({
    id: `g${i}`,
    name: `Group ${i}`,
    enabled: true,
    rules: hosts(100).map((host) => ({ host: `${i}.${host}`, scope: "domain", enabled: true })),
  });
  expect(
    parseBlocklist({ schema: 2, rules: [], groups: [0, 1, 2, 3, 4, 5].map(group) }),
  ).toBeNull();
  expect(parseBlocklist({ schema: 2, rules: [], groups: Array.from({ length: 21 }, (_, i) => ({
    id: `g${i}`,
    name: "Group",
    enabled: true,
    rules: [],
  })) })).toBeNull();
});

test("a preset stored under an older name comes back with the current one", () => {
  // Preset names cannot be edited, so a stored copy of an old wording would never correct itself.
  const stored = {
    schema: SCHEMA,
    rules: [],
    groups: [{ id: "health", name: "Health", rules: [], enabled: true, preset: true }],
  };

  const parsed = parseBlocklist(stored);

  expect(parsed?.groups[0]?.name).toBe("Health Portals");
  expect(parsed?.groups[0]?.preset).toBe(true);
});

test("a group of yours keeps the name you gave it", () => {
  const stored = {
    schema: SCHEMA,
    rules: [],
    groups: [{ id: "health", name: "Health", rules: [], enabled: true }],
  };

  expect(parseBlocklist(stored)?.groups[0]?.name).toBe("Health");
});

test("the presets are the four this version ships", () => {
  expect(defaults().groups.map((group) => group.id)).toEqual([
    "webmail-chat",
    "banking",
    "health",
    "social-video",
  ]);
});

test("the social and video group blocks feeds and leaves the useful half of the web alone", () => {
  const blocklist = defaults();

  for (const host of ["facebook.com", "www.instagram.com", "tiktok.com", "vimeo.com", "twitch.tv"]) {
    expect(isBlocked(host, blocklist)).toBe(true);
  }
  // Deliberately absent. Each carries enough writing worth finding again that blocking the host
  // would cost more than the feed does.
  for (const host of ["x.com", "twitter.com", "reddit.com", "www.linkedin.com"]) {
    expect(isBlocked(host, blocklist)).toBe(false);
  }
  // And YouTube, which `isVideoWatch` refuses instead so the per-video button can exist.
  expect(isBlocked("www.youtube.com", blocklist)).toBe(false);
});

test("a document written before a preset existed gains it", () => {
  // The state every browser that has ever synced a stored list is in. Without the append it would
  // never see a group added after the day it last wrote.
  const stored = parseBlocklist({ schema: SCHEMA, rules: [], groups: [] })!;

  expect(stored.groups.map((group) => group.id)).toEqual([
    "webmail-chat",
    "banking",
    "health",
    "social-video",
  ]);
});

test("appending a preset never switches a preset back on", () => {
  const off = defaults().groups.map((group) =>
    group.id === "social-video" ? { ...group, enabled: false } : group,
  );
  const stored = parseBlocklist({ schema: SCHEMA, rules: [], groups: off })!;

  expect(stored.groups.filter((group) => group.id === "social-video")).toHaveLength(1);
  expect(isBlocked("facebook.com", stored)).toBe(false);
});

test("a preset keeps a host you added", () => {
  // Presets are editable on the dashboard since server 0.51.0, and the extension has to block what
  // the account's list holds, or a host added there would be shown as blocked and read anyway.
  const stored = parseBlocklist({
    schema: SCHEMA,
    rules: [],
    groups: [
      {
        id: "banking",
        name: "Banking & Finance",
        enabled: true,
        preset: true,
        rules: [{ host: "news.example", scope: "domain", enabled: true }],
      },
    ],
  })!;

  expect(isBlocked("news.example", stored)).toBe(true);
});

test("a preset this version no longer ships is dropped, and your own groups are not", () => {
  // `Localhost & Intranet` went when isPrivateHost arrived. A browser upgrading still has it stored.
  const stored = parseBlocklist({
    schema: SCHEMA,
    rules: [],
    groups: [
      { id: "local", name: "Localhost & Intranet", enabled: true, preset: true, rules: [{ host: "localhost", scope: "domain", enabled: true }] },
      { id: "banking", name: "Banking & Finance", enabled: false, preset: true, rules: [] },
      { id: "work", name: "Work", enabled: true, rules: [{ host: "jira.example", scope: "domain", enabled: true }] },
    ],
  })!;

  // `local` dropped, `work` kept — and the presets this document had never heard of appended,
  // which is the other half of the same rule.
  expect(stored.groups.map((group) => group.id)).toEqual([
    "banking",
    "work",
    "webmail-chat",
    "health",
    "social-video",
  ]);
  // Banking came in switched off and stays switched off.
  expect(stored.groups.find((group) => group.id === "banking")?.enabled).toBe(false);
});

/**
 * The same vectors as `tabcake-server/convex/tests/blocklist.test.ts`.
 *
 * `blocklist/rules.ts` there is a deliberate copy of this file, and these tables are what stop the
 * two drifting in silence. If you change one, change the other and run both.
 */
const PRIVATE = [
  "localhost",
  "LOCALHOST",
  "foo.localhost",
  "127.0.0.1",
  // The rest of loopback, which the two-string preset this replaced never covered.
  "127.0.0.2",
  "0.0.0.0",
  "10.0.0.5",
  "172.16.0.1",
  "172.31.255.1",
  "192.168.1.1",
  // The cloud metadata address, and carrier-grade NAT, which enumerating the usual ranges misses.
  "169.254.169.254",
  "100.64.0.1",
  // Brackets are how URL reports an IPv6 literal, and a block rule may not contain them.
  "[::1]",
  "[fe80::1]",
  "[fc00::1]",
  // No dot at all: an intranet name that only one network's resolver knows.
  "wiki",
  "jira",
  "printer.local",
  "db.internal",
  "nas.lan",
  "router.home.arpa",
];

const PUBLIC = [
  "example.com",
  "www.example.com",
  // Ordinary names that end in the letters of a private suffix without ending in the suffix.
  "localhost.com",
  "mylocal.com",
  "locale.io",
  "local.example.com",
  // Digits and dots, but not only digits and dots.
  "1.2.3.4.example.com",
  // The documented ceiling: a public name whose DNS answer is a private address. A string rule
  // cannot see that, and it is not meant to.
  "127.0.0.1.nip.io",
];

test("isPrivateHost refuses every IP literal and every nameless host", () => {
  for (const host of PRIVATE) expect([host, isPrivateHost(host)]).toEqual([host, true]);
  for (const host of PUBLIC) expect([host, isPrivateHost(host)]).toEqual([host, false]);
});
