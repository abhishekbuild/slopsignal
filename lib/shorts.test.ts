import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { finishJob, isJob, rememberShort } from "./shorts";
import type { Label } from "./video-button";

/**
 * The tab that reads a Short: opened out of sight, closed once it has answered, and given up on
 * when it never does. What the tab's own button does there is `video-button.test.ts`'s job.
 */

const SAVED: Label = { text: "Remembered in Tabcake", again: false, icon: "saved" };

/** The tabs `rememberShort` opened. The fake browser keeps a tab of its own, with no address. */
async function tabs() {
  const all = await fakeBrowser.tabs.query({});
  return all.filter((tab) => tab.url?.startsWith("https://www.youtube.com/"));
}

/** The one tab `rememberShort` opened, once it has. */
async function openedTab() {
  return vi.waitFor(async () => {
    const [tab] = await tabs();
    if (tab === undefined) throw new Error("not opened yet");
    return tab;
  });
}

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

test("a Short is read in a tab you never see, which goes once it has answered", async () => {
  const job = rememberShort("abc123");

  const tab = await openedTab();
  expect(tab.url).toBe("https://www.youtube.com/watch?v=abc123");
  expect(tab.active).toBe(false);
  expect(isJob(tab.id as number)).toBe(true);

  finishJob(tab.id as number, SAVED);

  expect(await job).toEqual(SAVED);
  expect(await tabs()).toHaveLength(0);
  expect(isJob(tab.id as number)).toBe(false);
});

test("a tab that never reports is given up on after 45 seconds, and closed", async () => {
  vi.useFakeTimers();
  const job = rememberShort("abc123");
  await vi.advanceTimersByTimeAsync(0);
  expect(await tabs()).toHaveLength(1);

  await vi.advanceTimersByTimeAsync(45_000);

  expect(await job).toBeUndefined();
  expect(await tabs()).toHaveLength(0);
});

test("a tab closed by hand is no answer, at once", async () => {
  const job = rememberShort("abc123");
  const tab = await openedTab();

  // What the background's `tabs.onRemoved` listener does when that tab goes.
  finishJob(tab.id as number, undefined);

  expect(await job).toBeUndefined();
  expect(isJob(tab.id as number)).toBe(false);
});

test("an id is put in the address as data, never as more address", async () => {
  const job = rememberShort("a&b=c");
  const tab = await openedTab();
  expect(tab.url).toBe("https://www.youtube.com/watch?v=a%26b%3Dc");
  finishJob(tab.id as number, undefined);
  await job;
});
