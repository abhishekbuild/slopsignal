/**
 * Noticing that the address changed without the document reloading.
 *
 * A single-page app calls `history.pushState` and replaces nothing: the content script is not run
 * again, so without this the page is examined once and every route after it is invisible. Navigate
 * from a public page into a private one inside the same app and nothing ever looks at it.
 *
 * Polling rather than listening, for three reasons and in that order. A content script runs in an
 * isolated world, so patching `history.pushState` cannot see the page's own calls.
 * `webNavigation.onHistoryStateUpdated` would answer it properly and costs the "read your browsing
 * history" install warning, for something observable here for free. And the Navigation API's
 * behaviour inside an isolated world is not a thing to bet a privacy gate on.
 *
 * A second's delay is nothing against a fifteen-second dwell.
 */

/** How often the address is compared. The dwell timer already ticks at this rate. */
const POLL_MS = 1000;

/**
 * Calls `watch` with the current address, and again with each new one, cancelling the last first.
 *
 * `read` is passed in rather than reading `location` here, so this file is a timer and nothing
 * else and its test is fake timers and nothing else — the same shape as `dwell.ts`.
 *
 * The whole address is compared, fragment included, because a hash-routed app's `#/settings` is a
 * real route change. The cost of restarting on an ordinary in-page anchor is fifteen seconds and a
 * page the server answers `"revisited"` for.
 *
 * Returns a cancel function that stops the polling and the watch in flight.
 */
export function watchAddress(read: () => string, watch: (url: string) => () => void): () => void {
  let url = read();
  let cancel = watch(url);

  const timer = setInterval(() => {
    const next = read();
    if (next === url) return;
    url = next;
    cancel();
    cancel = watch(next);
  }, POLL_MS);

  return () => {
    clearInterval(timer);
    cancel();
  };
}
