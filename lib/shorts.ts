import { browser } from "wxt/browser";
import type { Label } from "./video-button";

/**
 * Remembering a Short without leaving it.
 *
 * The Shorts player has no transcript panel, and YouTube's transcript endpoints refuse anything that
 * is not its own player, so a Short's words can only be read on its video page. Until 0.24.0 the
 * button took you there. Now the background opens that page in a tab you never look at — inactive,
 * muted — and the button on it does what it always did: presses itself, reads the panel off screen,
 * saves. The page reports what its button ended up saying, the tab is closed, and the Short's button
 * says the same words.
 *
 * None of this needs a permission: `tabs.create`, `tabs.update` and `tabs.remove` are free, and the
 * tab is known by its id, never by its address.
 *
 * ponytail: the Short's own tab keeps its "video" status and the dot goes on the job tab, which
 * closes. The button on the Short says the outcome, which is what the person is looking at.
 */

/**
 * A job that has not reported in this long is over. The page loads, presses two seconds after its
 * row renders, waits up to four for the panel and a few more for the save — well under half of this.
 */
const JOB_TIMEOUT_MS = 45_000;

/** The tabs doing a Short's reading, by id, and how each one hands back its answer. */
const jobs = new Map<number, (label: Label | undefined) => void>();

/** Opens the Short's video page out of sight and answers with what its button said, or nothing. */
export async function rememberShort(id: string): Promise<Label | undefined> {
  const tab = await browser.tabs.create({
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
    active: false,
  });
  const tabId = tab.id;
  if (tabId === undefined) return undefined;
  // A job from the moment the tab exists, before anything else is awaited: the page in it may ask.
  let answer: (label: Label | undefined) => void = () => {};
  const answered = new Promise<Label | undefined>((resolve) => (answer = resolve));
  jobs.set(tabId, answer);
  const timer = setTimeout(() => answer(undefined), JOB_TIMEOUT_MS);

  // YouTube does not autoplay in a background tab. Muting it makes that a promise rather than a hope.
  await browser.tabs.update(tabId, { muted: true }).catch(() => {});

  const label = await answered;
  clearTimeout(timer);
  jobs.delete(tabId);
  // Closed by hand already, or never opened: nothing to remove, and nothing to say about it.
  await browser.tabs.remove(tabId).catch(() => {});
  return label;
}

/** Whether this tab was opened to read a Short — how its video page knows to press its own button. */
export function isJob(tabId: number): boolean {
  return jobs.has(tabId);
}

/** The job's answer: what the video page's button said, or nothing when the tab went away first. */
export function finishJob(tabId: number, label: Label | undefined): void {
  jobs.get(tabId)?.(label);
}
