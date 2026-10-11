import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { DASHBOARD_ORIGIN } from "@/lib/dashboard";
import { startDwell } from "@/lib/dwell";
import { extractText } from "@/lib/extract";
import { GRANTS_KEY } from "@/lib/settings";
import { CAPTURE_KEY, DEFAULT_CAPTURE, parseCapture } from "@/lib/capture-settings";
import { isAllowed, parseGrants } from "@/lib/grants";
import type { PageStatus, SkipReason } from "@/lib/messages";
import { redact } from "@/lib/redact";
import { watchAddress } from "@/lib/route";
import { isFormDominated, isPrivateHost, isSearchResults, isShort, isVideoWatch, videoId } from "@/lib/rules";
import { ask, send } from "@/lib/send";
import { isVisible, pageSignal } from "@/lib/signal";
import { ICONS, mountVideoButton, type Icon, type Label, type SaveVideo } from "@/lib/video-button";

/** Below this there is nothing to remember: a cookie wall, a redirect stub, a bare heading. */
const MIN_CONTENT_CHARS = 500;

/** Prose blocks, counted against form fields to tell an article from an application form. */
const PARAGRAPHS = "p,h1,h2,h3,h4,h5,li,blockquote";
const FORM_FIELDS = "input:not([type=hidden]),textarea,select";

/**
 * Runs on every page you open and decides, without sending anything anywhere, whether this is
 * something you read. Only then does it hand the text to the background, which decides whether it
 * is allowed to leave the browser.
 *
 * Splitting it that way is deliberate: dwell and layout only exist in the tab, and the session only
 * exists in the background. Neither can do the other's job.
 */
export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",

  async main() {
    // An advert or an embedded player is not the page you are reading.
    if (window.top !== window) return;

    // Asked once, and not per route: it describes this document's own navigation, so re-asking it
    // after a route change would keep reporting the original load. A 404 is a real page with real
    // text on it, and remembering it helps nobody.
    if (responseStatus() >= 400) return void skip("error-page");

    // Read once and kept current, because `watch` below is synchronous and awaiting storage per
    // route would be a round trip inside the gate. `storage.onChanged` fires in every open tab, so
    // allowing a site in the popup reaches the page you are standing on without a reload.
    // The capture settings (0.33.0) the same way: a changed dwell or form setting reaches pages
    // already open, from the next address they watch.
    await loadGrants();
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && GRANTS_KEY in changes) {
        granted = parseGrants(changes[GRANTS_KEY]?.newValue);
      }
      if (area === "local" && CAPTURE_KEY in changes) {
        capture = parseCapture(changes[CAPTURE_KEY]?.newValue);
      }
    });

    // Asked once, here, because `watch` below is synchronous and this tab is or is not a job for
    // its whole life.
    job = (await ask({ type: "videoJob" })) === true;
    pageJob = (await ask({ type: "pageJob" })) === true;

    watchAddress(() => location.href, watch);
  },
});

/**
 * The origins this browser knows you have allowed.
 *
 * A cache of a cache, and it decides nothing on its own: the backend checks the account's list
 * before it writes anything, so a stale copy here costs a wasted call and never a stored page. The
 * safe direction when it is empty is "nothing allowed", which is what `parseGrants` returns.
 */
let granted: string[] = [];

/** The account's capture settings as this browser last synced them; the defaults until then. */
let capture = DEFAULT_CAPTURE;

async function loadGrants(): Promise<void> {
  try {
    const stored = await browser.storage.local.get([GRANTS_KEY, CAPTURE_KEY]);
    granted = parseGrants(stored[GRANTS_KEY]);
    capture = parseCapture(stored[CAPTURE_KEY]);
  } catch {
    // Storage can be unavailable in a locked-down profile. Nothing allowed is the safe answer.
  }
}

/**
 * Examines one address, and returns the cancel function for whatever it started.
 *
 * Every check here is re-run per route, against the address it was given. That matters more than it
 * looks: the address used to be read at fire time, fifteen seconds after the checks ran, so landing
 * on an article and routing into search inside that window sent the search page under a gate that
 * never saw it.
 *
 * There is no PDF check here on purpose. Chrome renders one in a privileged viewer that runs no
 * content script, so this file never sees a PDF and a check would be dead code. The backend refuses
 * them too — and refuses them even for an allowed origin, because there is no text either way.
 */
function watch(href: string): () => void {
  const url = new URL(href);

  // Tabcake never reads Tabcake. Ahead of the grant check on purpose: allowing the dashboard's
  // origin must not turn the product's own screens into pages it remembers and then cites.
  if (url.origin === DASHBOARD_ORIGIN) return skip("dashboard", url);

  // Allowing the site waives the two address rules and nothing else. Search results, an error page,
  // too little text and a form are not about permission — you did not read those either way.
  if (!isAllowed(url.origin, granted)) {
    // Plain HTTP now skews towards development boxes and intranets.
    if (url.protocol !== "https:") return skip("insecure", url);
    if (isPrivateHost(url.hostname)) return skip("private", url);
  }
  // A video's text is the sidebar, the comments and the up-next list. The page is never read; the
  // button offers what was actually said instead. The dwell timer below never starts, so no text is
  // extracted from a video at all.
  //
  // **Above the search check, and that order is load-bearing.** `isSearchResults` treats a `q`
  // parameter on a one-segment path as a search box, and `/watch` is one segment — so
  // `youtube.com/watch?v=X&q=anything` read as a search results page and the button never appeared.
  // A `/watch` address is a video whatever else is hanging off it, and YouTube's own search lives at
  // `/results`, which this check does not match.
  if (isVideoWatch(url)) return offerVideo(url, href);

  if (isSearchResults(url)) return skip("search", url);

  announce({ state: "watching", startedAt: Date.now() }, url);

  const read = () => {
    // Redacted before it is measured, because redacting shortens it — and before anything else,
    // because everything downstream of here either stores this text or describes it.
    const content = redact(extractText(document));
    if (content.length < MIN_CONTENT_CHARS) return void skip("too-short", url);

    const fields = [...document.querySelectorAll(FORM_FIELDS)].filter(isVisible).length;
    const paragraphs = document.querySelectorAll(PARAGRAPHS).length;
    if (capture.skipForms && isFormDominated(fields, paragraphs)) return void skip("form", url);

    // The address this watch was gated on, not whatever `location` says now.
    send({
      type: "capture",
      url: href,
      title: document.title,
      content,
      signal: pageSignal(document, url, content, { formFields: fields, paragraphs }),
    });
  };

  // A pasted link (`lib/manual.ts`): you asked for this page, so there is no reading to wait for,
  // and a hidden tab would never count as visible anyway. Two seconds lets a script-built page draw.
  if (pageJob) {
    const timer = setTimeout(read, PAGE_JOB_SETTLE_MS);
    return () => clearTimeout(timer);
  }
  return startDwell(capture.dwellSeconds, () => !document.hidden, read);
}

/** How long a pasted link's page is given to finish drawing before it is read. */
const PAGE_JOB_SETTLE_MS = 2_000;

/** Whether the background opened this tab to read a pasted link (`lib/manual.ts`). */
let pageJob = false;

/**
 * Whether the background opened this tab to read a Short (`lib/shorts.ts`). Spent on the first video
 * page, so a later navigation in the same tab never presses a button on its own.
 */
let job = false;

/**
 * Puts the save button on a video, and hands back the way to take it off.
 *
 * **A Short's button stays on the Short.** The Shorts player has no transcript panel, and YouTube's
 * transcript endpoint refuses anything that is not its own player, so nothing on a Shorts page can be
 * read. The video page can, so the background opens it in a tab you never see; that page's button
 * presses itself, reads, saves, and reports its words, which this button then says. Until 0.24.0 the
 * button took you to the video page instead, and the reading happened in front of you.
 *
 * Both surfaces get the button at once. It changes nothing on the page and reads nothing until it is
 * pressed, and a button that appears fifteen seconds in looks like a fault. The cancel is still the
 * part that matters: every short is its own address, so scrolling to the next one takes the button
 * with it, and one left behind would offer the video you had just scrolled away from.
 */
function offerVideo(url: URL, href: string): () => void {
  announce({ state: "skipped", reason: "video" }, url);

  if (isShort(url)) {
    const id = videoId(url);
    return mountVideoButton(document, saveVideo(url, href), {
      kind: "short",
      remember: async () => asLabel(await ask({ type: "rememberShort", id })),
    });
  }

  const pressAtOnce = job;
  job = false;
  return mountVideoButton(document, saveVideo(url, href), {
    kind: "watch",
    pressAtOnce,
    report: pressAtOnce ? (label) => send({ type: "videoDone", label }) : undefined,
  });
}

/** The background's answer is trusted as far as it looks like a label; anything else is no answer. */
function asLabel(reply: unknown): Label | undefined {
  if (typeof reply !== "object" || reply === null) return undefined;
  const { text, again, icon } = reply as Partial<Label>;
  if (typeof text !== "string" || typeof again !== "boolean" || typeof icon !== "string") return undefined;
  return icon in ICONS ? { text, again, icon: icon as Icon } : undefined;
}

/** What pressing the button on a video page does with what it read. */
function saveVideo(url: URL, href: string): SaveVideo {
  return async (video) => {
    const transcript = video.transcript.trim();
    // The channel rides inside the text as well as beside it, so searching for who made something
    // finds it, and so the summary is written knowing who was talking.
    const content = [
      video.channel === "" ? "" : `Channel: ${video.channel}`,
      video.description,
      transcript,
    ]
      .filter(Boolean)
      .join("\n\n");

    // Redacted here like any other text that leaves. A transcript is speech, and people read card
    // numbers and email addresses out loud.
    //
    // `ask`, not `send`: this is the one message whose answer a person sees. The background
    // replies with the tab's `PageStatus`, or `{ok: false}` when it had no tab to attach it to,
    // and the button reads anything that is not a status as no answer.
    const reply = await ask({
      type: "capture",
      url: href,
      title: video.title === "" ? document.title : video.title,
      content: redact(content),
      signal: pageSignal(document, url, transcript, { formFields: 0, paragraphs: 0 }),
      kind: "video",
      author: video.channel === "" ? undefined : video.channel,
    });
    return reply as PageStatus | undefined;
  };
}

/** The status code of this document's own navigation. Undefined on a restored or cached entry. */
function responseStatus(): number {
  const [navigation] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return navigation?.responseStatus ?? 0;
}

/** Announces the skip and starts nothing, so the cancel function it returns has nothing to cancel. */
function skip(reason: SkipReason, url = new URL(location.href)): () => void {
  announce({ state: "skipped", reason }, url);
  return () => {};
}

/**
 * The address and the title ride along so the popup can name the page you are on and offer to block
 * the site. All three are free here and would cost the `tabs` permission anywhere else.
 */
function announce(status: PageStatus, url: URL): void {
  send({ type: "pageStatus", host: url.hostname, url: url.href, title: document.title, status });
}
