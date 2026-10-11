import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { watchAddress } from "./route";

/**
 * The single-page-app fix. Fake timers and nothing else, the same as `dwell.test.ts`, because
 * `route.ts` is a timer and nothing else.
 */

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Records which addresses were watched, and how many of those watches were cancelled. */
function recorder() {
  const watched: string[] = [];
  const cancelled: string[] = [];
  const watch = (url: string) => {
    watched.push(url);
    return () => cancelled.push(url);
  };
  return { watched, cancelled, watch };
}

test("watches the address it starts on, before any time passes", () => {
  const { watched, watch } = recorder();

  watchAddress(() => "https://a.example/one", watch);

  expect(watched).toEqual(["https://a.example/one"]);
});

test("an address that has not changed re-arms nothing", () => {
  const { watched, cancelled, watch } = recorder();

  watchAddress(() => "https://a.example/one", watch);
  vi.advanceTimersByTime(10_000);

  expect(watched).toEqual(["https://a.example/one"]);
  expect(cancelled).toEqual([]);
});

test("a route change cancels the watch in flight and arms one on the new address", () => {
  const { watched, cancelled, watch } = recorder();
  let href = "https://a.example/one";

  watchAddress(() => href, watch);
  href = "https://a.example/two";
  vi.advanceTimersByTime(1000);

  expect(watched).toEqual(["https://a.example/one", "https://a.example/two"]);
  // Without this the old dwell timer fires fifteen seconds later, against the new page's text.
  expect(cancelled).toEqual(["https://a.example/one"]);
});

test("the fragment counts, because a hash-routed app changes route with it", () => {
  const { watched, watch } = recorder();
  let href = "https://a.example/app#/inbox";

  watchAddress(() => href, watch);
  href = "https://a.example/app#/settings";
  vi.advanceTimersByTime(1000);

  expect(watched).toEqual(["https://a.example/app#/inbox", "https://a.example/app#/settings"]);
});

test("route changes keep being noticed, not just the first", () => {
  const { watched, cancelled, watch } = recorder();
  let href = "https://a.example/one";

  watchAddress(() => href, watch);
  for (const next of ["two", "three", "four"]) {
    href = `https://a.example/${next}`;
    vi.advanceTimersByTime(1000);
  }

  expect(watched).toHaveLength(4);
  expect(cancelled).toHaveLength(3);
});

test("cancelling stops the polling and the watch in flight", () => {
  const { watched, cancelled, watch } = recorder();
  let href = "https://a.example/one";

  const cancel = watchAddress(() => href, watch);
  cancel();
  href = "https://a.example/two";
  vi.advanceTimersByTime(10_000);

  expect(cancelled).toEqual(["https://a.example/one"]);
  expect(watched).toEqual(["https://a.example/one"]);
});
