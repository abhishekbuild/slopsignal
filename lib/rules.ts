/**
 * What is worth remembering, decided without touching the DOM or the network.
 *
 * Everything here is a pure function of its arguments, so the whole of it is testable in plain
 * node. The content script does the looking; this file does the deciding.
 */

/**
 * Search results pages. You did not read them, and remembering them buries the pages you did read
 * under a layer of your own queries.
 */
const SEARCH_HOSTS =
  /^(www\.)?(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|search\.brave\.com|kagi\.com|ecosia\.org|startpage\.com)$/;

/** A path whose first segment says "these are results", whatever the site. */
const SEARCH_SEGMENTS = new Set(["search", "results"]);

/**
 * True for a search results page. Three signals, because search does not look the same twice:
 * a known search host, a first path segment of `search` or `results`, or a `q` parameter on a
 * shallow path. `docs.google.com/document/d/...` passes all three; GitHub's `/search` does not.
 */
export function isSearchResults(url: URL): boolean {
  if (SEARCH_HOSTS.test(url.hostname.toLowerCase())) return true;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length > 0 && SEARCH_SEGMENTS.has(segments[0]!.toLowerCase())) return true;

  // A `q` deep inside a site is usually a filter on a real page; at the top it is a search box.
  return url.searchParams.has("q") && segments.length <= 1;
}

/** Every hostname YouTube serves a video from. `youtu.be` is nothing but videos. */
const VIDEO_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"];

/**
 * Is this a page whose point is a video rather than its text?
 *
 * The text of a watch page is the sidebar, the comments and the up-next list — none of it what you
 * were watching. So the page is never read, and the button this script injects offers to save the
 * transcript instead.
 *
 * A rule here rather than a blocked-list entry on purpose: the blocked list is checked above
 * everything, so a host on it could never show that button.
 *
 * Copied from `tabcake-server/convex/pages/url.ts`, which runs the same test vectors. Change one
 * and change both.
 */
export function isVideoWatch(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === "youtu.be") return true;
  if (!VIDEO_HOSTS.includes(host)) return false;
  return url.pathname === "/watch" || url.pathname.startsWith("/shorts/");
}

/** A Short's button opens it as a video: the Shorts player has no transcript panel, and the video page does. */
export function isShort(url: URL): boolean {
  return url.pathname.startsWith("/shorts/");
}

/** The video's id: `v` on a watch page, the path on a Short or a youtu.be link. `""` when there is none. */
export function videoId(url: URL): string {
  if (url.hostname.toLowerCase() === "youtu.be") return url.pathname.split("/")[1] ?? "";
  if (isShort(url)) return url.pathname.split("/")[2] ?? "";
  return url.searchParams.get("v") ?? "";
}

/**
 * One site you never want read, and how far the block reaches.
 *
 * `scope` is two values rather than a pattern language because there are only two useful answers
 * and a parser would be one more thing to get wrong. The dashboard spells `domain` as `*.host`, so
 * the star a person types is the whole grammar.
 */
export type BlockRule = {
  /** A lowercase hostname. Never a URL, a path, a port or a wildcard — the scope carries that. */
  host: string;
  /** `domain` blocks the host and every subdomain. `host` blocks that one hostname. */
  scope: "domain" | "host";
  /** Why you blocked it. Yours, shown back to you, and never matched on. */
  reason?: string;
  /** Off keeps the rule without enforcing it, so you can lift a block without losing it. */
  enabled: boolean;
};

/** Several hosts under one name and one switch. */
export type BlockGroup = {
  /** Stable. A preset keeps its id through a rename, which is how it stays recognisable. */
  id: string;
  name: string;
  rules: BlockRule[];
  enabled: boolean;
  /** True for the ones that ship with the extension. They can be switched off, not deleted. */
  preset?: true;
};

/**
 * Everything blocked in this browser: loose rules you added, and groups of them.
 *
 * `schema` travels with the document so the dashboard can tell a new extension from an old one
 * before it offers controls that would fail on save.
 */
export type Blocklist = {
  schema: typeof SCHEMA;
  rules: BlockRule[];
  groups: BlockGroup[];
};

export const SCHEMA = 2;

/** A `domain`-scoped rule: the host and everything under it. What migration and the popup produce. */
function rule(host: string): BlockRule {
  return { host, scope: "domain", enabled: true };
}

/**
 * Sites nobody wants a transcript of. Webmail, chat, the sign-in pages that carry your address,
 * money and health.
 *
 * Four groups rather than one list, so you can keep the banking block and drop the webmail one.
 * They are still **defaults rather than seeded data** — nothing writes them to storage until you
 * first edit something, so an upgrade, a reinstall or cleared storage cannot leave a browser with
 * capture on and nothing blocked.
 */
export function presets(): BlockGroup[] {
  return [
    {
      id: "webmail-chat",
      name: "Webmail & Chat",
      enabled: true,
      preset: true,
      rules: [
        rule("mail.google.com"),
        rule("outlook.live.com"),
        rule("web.whatsapp.com"),
        rule("web.telegram.org"),
        rule("accounts.google.com"),
      ],
    },
    {
      id: "banking",
      name: "Banking & Finance",
      enabled: true,
      preset: true,
      rules: [rule("paypal.com")],
    },
    {
      id: "health",
      name: "Health Portals",
      enabled: true,
      preset: true,
      rules: [rule("healthcare.gov")],
    },
    // A feed is different every time you open it, so indexing the page gives you dozens of
    // near-identical rows that bury the pages you actually read. The right unit is one post, and
    // that is not built yet. The video sites are here for the same reason — the page is the
    // sidebar and the comments, and what is worth keeping is what was said in the video.
    //
    // x.com, twitter.com, reddit.com and linkedin.com are deliberately absent. Each carries enough
    // writing worth finding again that blocking the host would cost more than the feed does, and
    // the classifier already refuses their private halves.
    //
    // YouTube is absent too, and for a different reason: `isVideoWatch` refuses it instead. The
    // blocked list is checked above everything, so a host on it could never show the per-video
    // save button.
    {
      id: "social-video",
      name: "Social & Video",
      enabled: true,
      preset: true,
      rules: [
        rule("facebook.com"),
        rule("instagram.com"),
        rule("threads.net"),
        rule("tiktok.com"),
        rule("bsky.app"),
        rule("mastodon.social"),
        rule("vimeo.com"),
        rule("twitch.tv"),
        rule("dailymotion.com"),
      ],
    },
  ];
}

/** Reserved and conventional endings for a name that only answers inside one network. */
const PRIVATE_SUFFIX = [".localhost", ".local", ".internal", ".lan", ".home.arpa"];

/**
 * True for an address that resolves only inside a network, or has no name at all.
 *
 * This is not a blocklist rule and cannot be switched off. It sits above the list, so there is no
 * entry to add, remove or argue with — which is why the `Localhost & Intranet` preset group was
 * retired when this arrived. That group held two strings, `localhost` and `127.0.0.1`, and missed
 * the rest of loopback, every private range, and `[::1]`, which the rule grammar cannot even
 * express because a host may not contain brackets.
 *
 * **Every IP literal is refused** rather than the private ranges enumerated. There is no CIDR
 * arithmetic to get wrong, it covers carrier-grade NAT and IPv6 unique-local and whatever range is
 * reserved next, and a page worth remembering has a hostname.
 *
 * Deliberately **not** folded into `isBlocked`: the popup would then say "blocked domain" for a
 * host with no rule behind it, and offer to unblock something no rule blocks.
 *
 * ponytail: this is a string rule, so a public name that resolves to a private address —
 * `127.0.0.1.nip.io` and that whole family — passes. Answering that needs DNS, which a content
 * script does not have. The log-out-link signal is what is meant to catch those pages.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host.startsWith("[")) return true; // any IPv6 literal, `[::1]` included
  if (/^[0-9.]+$/.test(host)) return true; // any IPv4 literal
  if (!host.includes(".")) return true; // localhost, wiki, jira, and every other intranet name
  return PRIVATE_SUFFIX.some((suffix) => host.endsWith(suffix));
}

/** What a browser with nothing stored blocks. */
export function defaults(): Blocklist {
  return { schema: SCHEMA, rules: [], groups: presets() };
}

/** True when this rule, on its own, blocks the host. A rule that is off blocks nothing. */
function covers(host: string, item: BlockRule): boolean {
  if (item.scope === "host") return host === item.host;
  // Blocking `paypal.com` covers `www.paypal.com`; it does not cover `notpaypal.com`, which is
  // why this is not a suffix match.
  return host === item.host || host.endsWith("." + item.host);
}

/** Every rule currently in force: the loose ones, and the ones inside groups that are switched on. */
export function activeRules(blocklist: Blocklist): BlockRule[] {
  return [
    ...blocklist.rules,
    ...blocklist.groups.filter((group) => group.enabled).flatMap((group) => group.rules),
  ].filter((item) => item.enabled);
}

/** True when anything in force blocks this hostname. The one question capture asks. */
export function isBlocked(hostname: string, blocklist: Blocklist = defaults()): boolean {
  const host = hostname.toLowerCase();
  return activeRules(blocklist).some((item) => covers(host, item));
}

/**
 * Every blocked hostname, flat and deduped.
 *
 * Two callers: the count the dashboard shows in its nav, and the reply an **older** dashboard
 * reads, which knows only about `string[]`. Without it, upgrading the extension would leave the
 * old settings page showing an empty textarea and one Save away from clearing someone's list.
 */
export function flattenHosts(blocklist: Blocklist): string[] {
  return [...new Set(activeRules(blocklist).map((item) => item.host))];
}

/**
 * Whatever is in storage, as a blocklist.
 *
 * This is the migration, and it is the only one. An old `string[]` is read as rules by whoever
 * looks at it, and the first edit writes the new shape back. That is how the defaults have always
 * worked, so there is no install hook to get wrong and no moment where half the extension sees one
 * shape and half sees the other.
 *
 * **It never fails open.** Anything unreadable falls back to the defaults, because "I could not
 * parse your settings" must never mean "so nothing is blocked".
 */
export function toBlocklist(stored: unknown): Blocklist {
  if (stored === undefined || stored === null) return defaults();

  // An old stored list replaced the defaults outright, so it migrates to rules with the presets
  // switched off. Turning them on would re-block a site someone had deliberately removed.
  if (Array.isArray(stored)) {
    const parsed = parseBlocklist(stored);
    if (parsed === null) return defaults();
    return { ...parsed, groups: presets().map((group) => ({ ...group, enabled: false })) };
  }

  return parseBlocklist(stored) ?? defaults();
}

/** More than this is not a blocklist, it is a payload. */
const MAX_RULES = 500;

/** More than this is not a set of groups, it is a filing cabinet. */
const MAX_GROUPS = 20;

/** A note, not an essay. */
const MAX_TEXT = 120;

/** A hostname and nothing else: no scheme, no path, no port, no spaces. */
const HOSTNAME = /^[a-z0-9.-]+$/;

/** A hostname somebody typed, as a rule. `*.example.com` and `example.com` both mean the subtree. */
function parseHost(value: string): BlockRule | null {
  const trimmed = value.trim().toLowerCase();
  const host = trimmed.startsWith("*.") ? trimmed.slice(2) : trimmed;
  if (host === "" || !HOSTNAME.test(host)) return null;
  return rule(host);
}

/** One rule, cleaned, or null if any part of it fails. A bare string still means the subtree. */
function parseRule(value: unknown): BlockRule | null {
  if (typeof value === "string") return parseHost(value);
  if (typeof value !== "object" || value === null) return null;

  const { host, scope, reason, enabled } = value as Record<string, unknown>;
  if (typeof host !== "string") return null;
  if (scope !== "domain" && scope !== "host") return null;
  if (typeof enabled !== "boolean") return null;
  if (reason !== undefined && (typeof reason !== "string" || reason.length > MAX_TEXT)) return null;

  const cleaned = parseHost(host);
  if (cleaned === null) return null;

  // `scope` wins over a `*.` somebody left in the host, because `scope` is the field the UI edits.
  const note = reason?.trim();
  return {
    host: cleaned.host,
    scope,
    enabled,
    ...(note === undefined || note === "" ? {} : { reason: note }),
  };
}

/** Two rules are the same entry when they name the same host at the same reach. */
function same(a: BlockRule, b: BlockRule): boolean {
  return a.host === b.host && a.scope === b.scope;
}

/** A list of rules, deduped, or null if one of them fails. */
function parseRules(value: unknown[]): BlockRule[] | null {
  const parsed: BlockRule[] = [];
  for (const entry of value) {
    const item = parseRule(entry);
    if (item === null) return null;
    if (!parsed.some((other) => same(other, item))) parsed.push(item);
  }
  return parsed;
}

/** One group, cleaned, or null. */
function parseGroup(value: unknown): BlockGroup | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, name, rules, enabled, preset } = value as Record<string, unknown>;
  if (typeof id !== "string" || id === "" || id.length > 64) return null;
  if (typeof name !== "string" || name.trim() === "" || name.length > MAX_TEXT) return null;
  if (typeof enabled !== "boolean") return null;
  if (preset !== undefined && preset !== true) return null;
  if (!Array.isArray(rules)) return null;

  const parsed = parseRules(rules);
  if (parsed === null) return null;

  return {
    id,
    name: name.trim(),
    enabled,
    rules: parsed,
    ...(preset === true ? { preset: true as const } : {}),
  };
}

/**
 * Validates a blocklist arriving from outside the extension, which today means the dashboard page.
 *
 * Returns the cleaned document, or `null` when any part of it fails. Refusing the whole thing
 * rather than dropping the bad entries is deliberate: a half-stored list would silently stop
 * blocking something the user believes is blocked, which is the worst outcome this file can
 * produce.
 *
 * A plain `string[]` is still accepted, because an older dashboard sends one. It means what it has
 * always meant — this is the whole list — so it replaces the groups as well.
 */
export function parseBlocklist(value: unknown): Blocklist | null {
  if (Array.isArray(value)) {
    if (value.length > MAX_RULES) return null;
    const rules = parseRules(value);
    return rules === null ? null : { schema: SCHEMA, rules, groups: [] };
  }

  if (typeof value !== "object" || value === null) return null;
  const { schema, rules, groups } = value as Record<string, unknown>;
  if (schema !== SCHEMA) return null;
  if (!Array.isArray(rules) || !Array.isArray(groups) || groups.length > MAX_GROUPS) return null;

  const parsedRules = parseRules(rules);
  if (parsedRules === null) return null;

  const parsedGroups: BlockGroup[] = [];
  for (const entry of groups) {
    const group = parseGroup(entry);
    if (group === null) return null;
    // A preset this version no longer ships is dropped rather than kept. `Localhost & Intranet`
    // went when `isPrivateHost` arrived, and a stored copy would draw a switch on the blocked
    // screen that cannot change anything. Groups of your own are never touched.
    if (group.preset === true && !presets().some((preset) => preset.id === group.id)) continue;
    if (parsedGroups.some((other) => other.id === group.id)) return null;
    parsedGroups.push(group);
  }

  // The cap is about what a client may send, so it counts what a client owns: the rules somebody
  // typed, the groups they made, and since presets became editable the hosts somebody added to a
  // preset. The hosts we ship in a preset are still not counted, so every host we add to one does
  // not quietly shrink everybody's allowance.
  const total =
    parsedRules.length +
    parsedGroups.reduce((n, group) => n + (group.preset === true ? added(group) : group.rules.length), 0);
  if (total > MAX_RULES) return null;

  // The other direction of the rule above, and the reason a new preset reaches anybody at all. A
  // document written before a group existed has no entry for it, and without this it never would:
  // one click on the popup's block toggle stores a document, and that document would freeze that
  // day's presets for that account forever.
  //
  // A missing id means the document predates the group, never that somebody removed it — a preset
  // can be switched off and cannot be deleted, and a switched-off one is still here by id, so this
  // cannot switch one back on. A host taken out of a preset by unblocking stays out, because the
  // group itself is still present.
  //
  // After the cap, so a document already at MAX_RULES is not refused over rules we added.
  for (const preset of presets()) {
    if (!parsedGroups.some((group) => group.id === preset.id)) parsedGroups.push(preset);
  }

  return { schema: SCHEMA, rules: parsedRules, groups: parsedGroups.map(named) };
}

/**
 * A preset wears the name this version ships. Its hosts are yours to edit.
 *
 * Preset names are ours — they cannot be edited, only switched off — so a stored copy of an older
 * wording would go on showing it forever.
 *
 * The hosts used to be ours too, clamped to the ones this version ships. Since presets became
 * editable on the dashboard's Reading rules screen, a preset keeps whatever hosts the document holds:
 * the ones we ship that you kept, any you edited, and any you added. `added` counts the last two for
 * the cap.
 *
 * Your switch is untouched. A group you turned off stays off.
 */
function named(group: BlockGroup): BlockGroup {
  if (group.preset !== true) return group;
  const current = presets().find((preset) => preset.id === group.id);
  if (current === undefined) return group;
  return { ...group, name: current.name };
}

/** How many of a preset's hosts are not ones this version ships in it: the ones somebody added. */
function added(group: BlockGroup): number {
  const current = presets().find((preset) => preset.id === group.id);
  const ours = new Set(current?.rules.map((item) => item.host) ?? []);
  return group.rules.filter((item) => !ours.has(item.host)).length;
}

/** Six visible fields is a form, not an aside. */
const FORM_FIELD_THRESHOLD = 6;

/**
 * True when the page is mostly something to fill in: a checkout, a sign-up, an application.
 * Both conditions are needed. An article with a comment box has fields but far more paragraphs,
 * and a checkout page has a handful of headings at most.
 *
 * Counting is the content script's job, because "visible" is a layout question.
 */
export function isFormDominated(visibleFields: number, paragraphs: number): boolean {
  return visibleFields >= FORM_FIELD_THRESHOLD && visibleFields > paragraphs;
}
