import { browser } from "wxt/browser";
import { readTokens } from "./auth";
import { hasConsent } from "./consent";
import type { PageStatus } from "./messages";

/**
 * Remembering a link you pasted, without opening it yourself.
 *
 * The same trick as `shorts.ts`: the background opens the address in a tab you never look at,
 * inactive and muted, and the content script there does what it does on any page. The one thing it
 * skips is the fifteen seconds of reading, because you have already said you want this page, and a
 * hidden tab never counts as visible anyway. Every other rule applies unchanged: the address rules,
 * search pages, too little text, forms, consent, pause, your blocked list, the auto-skip list and
 * the classifier. The server never fetches anything; the page is read in your browser, signed in as
 * you, and redacted before it leaves.
 *
 * Whatever the tab ends up saying about itself is the answer: `background.ts` hands every status
 * a job tab reports, remembered or skipped, to `finishPageJob`, so the page needs no reporting code
 * of its own.
 *
 * None of this needs a permission: `tabs.create`, `tabs.update` and `tabs.remove` are free.
 */

/**
 * A job that has not answered in this long is over. Loading, a two-second settle, the classifier
 * and the save take well under half of it. A page that never runs a content script, such as a
 * browser error page for a mistyped host, only ever answers this way.
 */
const JOB_TIMEOUT_MS = 30_000;

/** The tabs reading a pasted link, by id, and how each one hands back its answer. */
const jobs = new Map<number, (status: PageStatus | undefined) => void>();

const NOT_AN_ADDRESS: PageStatus = { state: "failed", error: "that is not a web address" };

/** Opens the link out of sight, waits for what became of it, and closes the tab. */
export async function indexUrl(raw: string): Promise<PageStatus> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return NOT_AN_ADDRESS;
  }
  // The trust boundary: the dashboard and the popup are trusted, but nothing that is not a web page
  // is ever opened from a message. `javascript:`, `file:`, `chrome:` and the rest stop here.
  if (url.protocol !== "https:" && url.protocol !== "http:") return NOT_AN_ADDRESS;
  // Chrome shows a PDF in a viewer no content script can enter, so the tab would only time out.
  // Said now, with the way that does work: uploading the file on the dashboard.
  if (/\.pdf$/i.test(url.pathname)) return { state: "skipped", reason: "pdf" };
  // Asked before a tab opens, so a page is never loaded for an answer that was already known.
  if ((await readTokens()) === undefined) return { state: "skipped", reason: "signed-out" };
  if (!(await hasConsent())) return { state: "skipped", reason: "no-consent" };

  const tab = await browser.tabs.create({ url: url.href, active: false });
  const tabId = tab.id;
  if (tabId === undefined) return { state: "failed", error: "the page could not be opened" };
  // A job from the moment the tab exists, before anything else is awaited: the page in it may ask.
  let answer: (status: PageStatus | undefined) => void = () => {};
  const answered = new Promise<PageStatus | undefined>((resolve) => (answer = resolve));
  jobs.set(tabId, answer);
  const timer = setTimeout(() => answer(undefined), JOB_TIMEOUT_MS);

  await browser.tabs.update(tabId, { muted: true }).catch(() => {});

  const status = await answered;
  clearTimeout(timer);
  jobs.delete(tabId);
  // Closed by hand already: nothing to remove.
  await browser.tabs.remove(tabId).catch(() => {});
  return status ?? { state: "failed", error: "the page did not finish loading" };
}

/** Whether this tab was opened to read a pasted link, which is how its page knows to skip the wait. */
export function isPageJob(tabId: number): boolean {
  return jobs.has(tabId);
}

/** The job's answer: what became of the page, or nothing when the tab went away first. */
export function finishPageJob(tabId: number, status: PageStatus | undefined): void {
  jobs.get(tabId)?.(status);
}
