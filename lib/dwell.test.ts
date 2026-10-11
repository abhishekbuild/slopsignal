import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { startDwell } from "./dwell";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const visible = () => true;

test("nothing happens before the fifteenth second", () => {
  const run = vi.fn();
  startDwell(15, visible, run);
  vi.advanceTimersByTime(14_000);
  expect(run).not.toHaveBeenCalled();
});

test("it fires once, and then never again", () => {
  const run = vi.fn();
  startDwell(15, visible, run);
  vi.advanceTimersByTime(15_000);
  expect(run).toHaveBeenCalledTimes(1);
  // One capture per document load. Sitting on the page longer must not send it twice.
  vi.advanceTimersByTime(120_000);
  expect(run).toHaveBeenCalledTimes(1);
});

test("a hidden tab does not count", () => {
  // Twenty tabs opened at once and left in the background are not twenty pages you read.
  let onScreen = false;
  const run = vi.fn();
  startDwell(15, () => onScreen, run);

  vi.advanceTimersByTime(60_000);
  expect(run).not.toHaveBeenCalled();

  onScreen = true;
  vi.advanceTimersByTime(14_000);
  expect(run).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1_000);
  expect(run).toHaveBeenCalledTimes(1);
});

test("cancelling stops the count", () => {
  const run = vi.fn();
  startDwell(15, visible, run)();
  vi.advanceTimersByTime(60_000);
  expect(run).not.toHaveBeenCalled();
});
