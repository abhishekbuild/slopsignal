import type { PageSummary, User } from "./api";
import type { Blocklist } from "./rules";
import type { PageSignal } from "./signal";
import type { Label } from "./video-button";

/** Dashboard → extension, over chrome.runtime.sendMessage from an externally_connectable origin. */
export type ExternalMessage =
  | { type: "ping" }
  | { type: "link"; code: string }
  | { type: "getSettings" }
  /** `blocklist` is whatever the page sends. It is validated here before anything is stored. */
  | { type: "setSettings"; blocklist: unknown }
  /**
   * A moment, `PAUSED_INDEFINITELY`, or 0 to resume. The same pause the popup sets, because
   * pausing is about this browser and there is only one answer per browser to hold.
   */
  | { type: "pause"; until: number }
  /** The /feedback page collecting the popup's "Report a bug" screenshot. One use (`lib/shot.ts`). */
  | { type: "takeShot" }
  /** The dashboard's "Add a link". Read in a hidden tab like any page you open (`lib/manual.ts`). */
  | { type: "indexUrl"; url: string }
  /**
   * Sync every cached setting from the account now (0.33.0): sent after a change on the
   * dashboard's Settings, so it applies here at once rather than at the next half-hourly sync.
   */
  | { type: "refresh" };

/**
 * Never carries tokens. It does carry the blocklist, because editing it is the dashboard's whole
 * job on that page, and only the pinned dashboard origin can ask.
 *
 * `blocklist` and `hosts` are two views of one answer, and both are sent. A dashboard built
 * before rules had scopes and groups reads `hosts` and keeps working; a current one reads
 * `schema` first and only offers the rule controls when it finds one.
 */
export type ExternalReply = {
  ok: boolean;
  signedIn?: boolean;
  blocklist?: Blocklist;
  /** Every blocked hostname, flat. What an older dashboard's textarea shows. */
  hosts?: string[];
  /** Absent from an extension older than scoped rules. The dashboard's version check. */
  schema?: number;
  /** Whether capture is paused here, so the dashboard draws the state rather than guessing it. */
  pauseUntil?: number;
  /** This build's version, for the dashboard's Install section. Absent before 0.23.0. */
  version?: string;
  /**
   * `takeShot`'s answer: the tab the popup captured for "Report a bug", if one was stashed in the
   * last ten minutes and not already taken. `dataUrl` is a `data:image/jpeg;base64,…` string; read
   * the type from the prefix rather than assuming it. Absent before 0.29.0, and when there is none.
   */
  shot?: { dataUrl: string; pageUrl?: string; title?: string; at: number };
  /** `indexUrl`'s answer: what became of the page. Absent before 0.30.0. */
  status?: PageStatus;
};

/** Popup and content script → background. The background is the only place that holds or uses tokens. */
export type InternalMessage =
  | { type: "me" }
  | { type: "signOut" }
  /** The popup's disclosure, accepted. Capture is refused until this has been sent (`lib/consent.ts`). */
  | { type: "consent" }
  /** `signal` describes the page for the classifier; `content` is only sent if it approves. */
  | {
      type: "capture";
      url: string;
      title: string;
      content: string;
      signal: PageSignal;
      /** An explicit per-video save: `content` is a transcript, not the text of the page. */
      kind?: "video";
      /** The channel that uploaded it. Only ever set alongside `kind`. */
      author?: string;
    }
  /** A skip the content script decided alone. Only the background may write storage.session. */
  | { type: "pageStatus"; host: string; url: string; title: string; status: PageStatus }
  /** A moment, `PAUSED_INDEFINITELY`, or 0 to resume. */
  | { type: "pause"; until: number }
  | { type: "setBlocked"; host: string; blocked: boolean }
  /** The popup's allow toggle. An origin, never a hostname: a grant is matched exactly. */
  | { type: "setAllowed"; origin: string; allowed: boolean }
  /** Run a search. Costs an embedding of the query, so the popup sends it on Enter. */
  | { type: "search"; query: string }
  /** The last five pages remembered, for the popup with an empty search field. */
  | { type: "recent" }
  /** What the server holds for the tab behind the popup: how often it was seen, and whether it is indexed. */
  | { type: "pageInfo"; url: string }
  /** Forgets one page, from the popup's active-page panel or a result card. */
  | { type: "forget"; pageId: PageSummary["_id"] }
  /**
   * A Short's button. The background opens the Short's video page in a tab you never see, whose own
   * button reads and saves, and answers with what that button ended up saying (`lib/shorts.ts`).
   */
  | { type: "rememberShort"; id: string }
  /** A video page asking whether it is one of those tabs, so its button presses itself. */
  | { type: "videoJob" }
  /** That page's button, reporting where its press ended. */
  | { type: "videoDone"; label: Label }
  /** The popup's "Add a link". Answers with a `PageStatus` (`lib/manual.ts`). */
  | { type: "indexUrl"; url: string }
  /** Any page asking whether it was opened to read a pasted link, so it skips the reading wait. */
  | { type: "pageJob" }
  /** The popup's "Report a bug" capture, parked for the dashboard to collect with `takeShot`. */
  | { type: "stashShot"; dataUrl: string; pageUrl?: string; title?: string };

/**
 * One line in the popup's list, whether it came from a search or from the recent five.
 *
 * `search.queries.hybrid` and `pages.queries.list` return different shapes — `pageId` against `_id`, and a
 * relevance score only one of them has. They are normalised to this in `lib/search.ts`, so the
 * popup has one row component for what a reader sees as one kind of thing.
 */
export type MemoryRow = {
  pageId: PageSummary["_id"];
  title: string;
  domain: string;
  lastVisited: number;
  /** What the model wrote about the page. Serif on the card — it is remembered text, not chrome. */
  summary?: string;
  tags?: string[];
  /** `pages.queries.list` knows whether a page finished indexing. A search result is always indexed. */
  status?: "pending" | "ready" | "failed";
};

/** Both list replies share a shape: signed out, the rows, or something to show the reader. */
export type RowsReply =
  | { signedOut: true }
  | { signedOut: false; rows: MemoryRow[] }
  /** The session is kept; the search did not finish. */
  | { error: string };

/**
 * What the server holds for the tab behind the popup. `null` when nothing is stored for the
 * address, which is also the signed-out answer — neither is worth a different line.
 */
export type PageInfoReply = {
  /** What the popup's Forget button needs. The tab gives it an address, never an id. */
  pageId: PageSummary["_id"];
  status: "pending" | "ready" | "failed";
  summary?: string;
  tags?: string[];
  visitCount: number;
  lastVisited: number;
} | null;

export type MeReply =
  | { signedOut: true }
  /**
   * `user` is null when the account was deleted but this session's JWT has not expired yet.
   * `consented` is whether this browser has accepted the current disclosure; the popup shows it
   * until it has. Added by the background, not by `me()`, which knows only about the session.
   */
  | { signedOut: false; user: User | null; consented?: boolean }
  /** Tokens exist but Convex could not be reached; the session is kept. */
  | { error: string };

/** Why a page was not remembered. Each one gets its own sentence in the popup. */
export type SkipReason =
  | "signed-out"
  /** Signed in, but the popup's disclosure has not been accepted in this browser yet. */
  | "no-consent"
  | "paused"
  | "blocked"
  /**
   * The dashboard itself. It shows what was read, and a memory holding its own screens would come
   * back in searches and be cited in answers. Not waived by allowing the site.
   */
  | "dashboard"
  /** Not an https address. */
  | "insecure"
  /** An IP literal, or a name that only one network's resolver knows. */
  | "private"
  /** The classifier judged the page one whose contents would be private to you. */
  | "sensitive"
  /**
   * A video. The page is the sidebar and the comments, so it is never read — the button injected
   * into the page is how you save what was actually said.
   */
  | "video"
  /**
   * Tabcake stopped reading this whole site, from three of its own refusals on it. Its own reason
   * rather than `sensitive`, because it is the only thing on screen that says a host-wide rule
   * exists — and the undo for one is on the dashboard rather than here.
   */
  | "auto-skipped"
  /** The classifier could not answer. Refusing is the safe direction, so the page is not indexed. */
  | "unchecked"
  | "search"
  | "error-page"
  | "too-short"
  | "form"
  /** A pasted link to a PDF, which no content script can read. Upload the file on the dashboard. */
  | "pdf";

/**
 * Everything the popup knows about the tab behind it, written to `browser.storage.session` under
 * `tab:<id>` by the background and read by nobody else.
 *
 * `host`, `url` and `title` are all here so the popup can name the page and offer to block the site
 * without `tab.url` or `tab.title`, either of which would cost the `tabs` permission and the install
 * warning that comes with it. The content script knows all three for free, so it sends them.
 */
export type TabState = { host: string; url: string; title: string; status: PageStatus };

/** What happened to the page in one tab. The popup displays it; nothing acts on it. */
export type PageStatus =
  /**
   * Readable, and the fifteen seconds are counting. `startedAt` is when they started, so the popup
   * can say how long you have been here without a message per second.
   *
   * ponytail: this is wall-clock, and the dwell timer only counts seconds the tab is visible, so a
   * tab left in the background reads high. A tick message would fix it; one has not been worth it.
   */
  | { state: "watching"; startedAt: number }
  /** `result` is what the server said: a new page, changed text, or one you had read before. */
  | { state: "remembered"; result: "captured" | "updated" | "revisited" }
  | { state: "skipped"; reason: SkipReason }
  | { state: "failed"; error: string };
