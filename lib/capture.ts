import { browser } from "wxt/browser";
import { api } from "./api";
import { client, readTokens, withFreshToken } from "./auth";
import { isAutoBlocked } from "./autoblock";
import { hasConsent } from "./consent";
import { DASHBOARD_ORIGIN } from "./dashboard";
import type { PageStatus, TabState } from "./messages";
import type { PageSignal } from "./signal";
import { isBlocked } from "./rules";
import { isPaused, readSettings } from "./settings";
import { titleFor } from "./toolbar-title";
import { PALETTE } from "./palette";

/**
 * The last gate before a page leaves this browser, and the only writer of per-tab state.
 *
 * The content script has already decided the page is worth reading. This decides whether it is
 * allowed to leave, which is a different question and one only the background can answer: it is
 * the only context holding the session, and the only one that may read settings or write
 * `storage.session`.
 */

/**
 * design.md §3 Butter on the dot, Ink on its text — the badge, not the popup's `live` amber, because
 * Butter carries ink at 10:1 on the toolbar. The one live element on screen.
 * From `PALETTE`, because `chrome.action` paints the toolbar and has no stylesheet to read.
 */
const BADGE_COLOUR = PALETTE.butter;
const BADGE_TEXT_COLOUR = PALETTE.ink;

const statusKey = (tabId: number) => `tab:${tabId}`;

/**
 * The dot, or nothing, and the tooltip that explains it. Per-tab, cosmetic, and best-effort.
 *
 * Every per-tab action call races the tab closing, and `tabs.onRemoved` fires *after* it has gone,
 * so a rejection here is the normal path rather than a fault. A tab that does not exist has no icon
 * to draw on, and nothing about that is worth reporting.
 */
async function setBadge(tabId: number, text: string | null, title: string): Promise<void> {
  try {
    await browser.action.setTitle({ tabId, title });
    // null, not "": an empty string is a value of the tab's own and hides the global II while
    // capture is paused; null clears it back to the global badge. Chrome takes null here (checked
    // in Chromium 1243); the typings only say string.
    await browser.action.setBadgeText({ tabId, text: text as string });
    if (text === null) return;
    await browser.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOUR });
    await browser.action.setBadgeTextColor({ tabId, color: BADGE_TEXT_COLOUR });
  } catch {
    // The tab closed between deciding to draw and drawing.
  }
}

/** Records what happened in one tab, and shows it on the icon when it is worth showing. */
export async function setStatus(tabId: number, state: TabState): Promise<void> {
  await browser.storage.session.set({ [statusKey(tabId)]: state });
  const paused = isPaused((await readSettings()).pauseUntil);
  // One dot, only for a page that was actually remembered. Everything else is popup-only text.
  await setBadge(tabId, state.status.state === "remembered" ? "•" : null, titleFor(state, paused));
}

/** Forgets a tab: on its next navigation, and when it closes. A stale dot is worse than no dot. */
export async function clearStatus(tabId: number): Promise<void> {
  await browser.storage.session.remove(statusKey(tabId));
  // Back to what the toolbar says with no tab state: "Tabcake", or that capture is paused.
  await setBadge(tabId, null, titleFor(undefined, isPaused((await readSettings()).pauseUntil)));
}

type Page = {
  url: string;
  title: string;
  content: string;
  signal: PageSignal;
  /** An explicit per-video save: `content` is a transcript rather than the text of the page. */
  kind?: "video";
  /** The channel that uploaded it. Only ever set alongside `kind`. */
  author?: string;
  /** A link you pasted (`lib/manual.ts`), so the dashboard files it under added links. */
  added?: boolean;
};

/**
 * Sends a page to the backend, unless something says not to. Returns the status it recorded.
 *
 * The order is the order of certainty. Being signed out is a fact about this browser; not having
 * agreed to the disclosure yet is the next one; being paused is a decision you made; a blocked domain is a decision you made about that site; only then is it
 * worth spending a network call. Each answer names its own reason, because "nothing happened" with
 * no explanation is the thing that makes a capture extension impossible to trust.
 */
export async function capture(tabId: number, page: Page): Promise<PageStatus> {
  const host = new URL(page.url).hostname;
  const status = await decide(page, host);
  await setStatus(tabId, { host, url: page.url, title: page.title, status });
  return status;
}

async function decide(page: Page, host: string): Promise<PageStatus> {
  if ((await readTokens()) === undefined) return { state: "skipped", reason: "signed-out" };
  // Before anything else about the page, so not even its address is sent until the person has
  // agreed to what Tabcake collects. The store requires the agreement; `lib/consent.ts` says why.
  if (!(await hasConsent())) return { state: "skipped", reason: "no-consent" };
  // The content script refuses the dashboard too; this is the copy that holds when a build older
  // than that rule is still running in a tab, so the product's own screens never reach the server.
  if (new URL(page.url).origin === DASHBOARD_ORIGIN) return { state: "skipped", reason: "dashboard" };

  const { pauseUntil, blocklist, autoBlocks } = await readSettings();
  // Checked here, at send time, rather than when the dwell timer started: pausing must stop the
  // page you are already fifteen seconds into, not only the next one.
  if (isPaused(pauseUntil)) return { state: "skipped", reason: "paused" };
  if (isBlocked(host, blocklist)) return { state: "skipped", reason: "blocked" };
  // In front of the verdict call, not behind it: a host Tabcake has already decided about must not
  // have another page's title and headings sent out only to be told the same thing again.
  if (isAutoBlocked(host, autoBlocks)) return { state: "skipped", reason: "auto-skipped" };

  const { url, title, content, signal, kind, author, added } = page;

  try {
    // Asked before the text is sent, and that order is the point: a page the classifier refuses
    // has only ever had its address, title and headings leave this browser. The signal is all this
    // call carries — `capture` below is the only thing that ever sends the page itself.
    const answer = await withFreshToken((token) =>
      client(token).action(api.pages.classify.verdict, { url, signal, kind }),
    );
    if (!answer.allow) {
      if (answer.reason === "blocked") return { state: "skipped", reason: "blocked" };
      // "address" cannot normally be reached — the content script applies the same rules — so it
      // means this build and the backend disagree, and the backend is the one that decides.
      if (answer.reason === "unavailable" || answer.reason === "address") {
        return { state: "skipped", reason: "unchecked" };
      }
      return { state: "skipped", reason: "sensitive" };
    }

    // Named fields, never the whole `page`: the signal has done its job and `capture` does not take
    // it, so spreading the message here would be an argument the backend refuses.
    const result = await withFreshToken((token) =>
      client(token).mutation(api.pages.ingest.capture, { url, title, content, kind, author, added: added || undefined }),
    );
    // The server checks the blocklist too, against the account's own copy rather than the cache
    // read above. Reaching this means the two disagreed — a rule added on another browser that has
    // not synced here yet — so the answer is the same word the cached check would have given.
    if (result === "blocked") return { state: "skipped", reason: "blocked" };
    // `"skipped"` is the server's one word for every refusal it makes about the address, the text,
    // and a page no decision stands behind. Reaching it means the checks above let something
    // through — a build older than the server's rules, or a decision that expired in the moment
    // between the two calls — and the common case by far is the 200-character floor, which this
    // script's own 500-character one already covers. So it gets the sentence that is nearly always
    // right rather than a vaguer one that never is.
    return result === "skipped"
      ? { state: "skipped", reason: "too-short" }
      : { state: "remembered", result };
  } catch (error) {
    // The raw message is for the console, never for a person: the popup and the dashboard both
    // print `error` as a sentence.
    console.error("Tabcake: capture failed", error);
    const text = error instanceof Error ? error.message : String(error);
    return {
      state: "failed",
      error: text.includes("PAGE_LIMIT_REACHED")
        ? "you have reached your plan's page limit"
        : "the page could not be saved",
    };
  }
}
