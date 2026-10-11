/**
 * The fifteen seconds that separate reading a page from landing on it.
 *
 * Dwell is the one signal that only exists in the tab, and it is the cheapest filter there is: it
 * removes bounces, mistaken clicks and tabs opened to read later, without the page having to say
 * anything about itself.
 *
 * Time spent on a hidden tab does not count. Twenty tabs opened at once and left in the background
 * are not twenty pages you read.
 */

/**
 * Runs `run` once, after `seconds` of visible time, and never again. Returns a cancel function.
 *
 * `isVisible` is passed in rather than read from `document` here, so this file is a timer and
 * nothing else, and its test is fake timers and nothing else.
 */
export function startDwell(seconds: number, isVisible: () => boolean, run: () => void): () => void {
  let elapsed = 0;
  const timer = setInterval(() => {
    if (!isVisible()) return;
    if (++elapsed < seconds) return;
    clearInterval(timer);
    run();
  }, 1000);

  return () => clearInterval(timer);
}
