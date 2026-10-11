import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { PageStatus } from "./messages";

// Signed in and agreed, unless a test says otherwise. Both are read from storage in the real thing,
// and what this file tests is the tab, not those two.
const signedIn = vi.hoisted(() => ({ tokens: true as boolean, consent: true as boolean }));
vi.mock("./auth", () => ({ readTokens: async () => (signedIn.tokens ? { token: "t" } : undefined) }));
vi.mock("./consent", () => ({ hasConsent: async () => signedIn.consent }));

import { finishPageJob, indexUrl, isPageJob } from "./manual";

/**
 * A pasted link: read in a tab you never see, closed once it has answered, given up on when it
 * never does, and never opened at all for something that is not a web page.
 */

const REMEMBERED: PageStatus = { state: "remembered", result: "captured" };

/** Tabs this file opened. The fake browser keeps one of its own, with no address. */
async function opened() {
  return (await fakeBrowser.tabs.query({})).filter((t) => t.url !== undefined);
}

async function openedTab() {
  return vi.waitFor(async () => {
    const tab = (await fakeBrowser.tabs.query({})).find((t) => t.url?.startsWith("https://example.com"));
    if (tab === undefined) throw new Error("not opened yet");
    return tab;
  });
}

beforeEach(() => {
  fakeBrowser.reset();
  signedIn.tokens = true;
  signedIn.consent = true;
});

afterEach(() => {
  vi.useRealTimers();
});

test("a link is read in a hidden tab, which goes once it has answered", async () => {
  const job = indexUrl("  https://example.com/an-article ");

  const tab = await openedTab();
  expect(tab.active).toBe(false);
  expect(isPageJob(tab.id as number)).toBe(true);

  finishPageJob(tab.id as number, REMEMBERED);
  expect(await job).toEqual(REMEMBERED);
  expect(isPageJob(tab.id as number)).toBe(false);
  expect(await fakeBrowser.tabs.query({ url: "https://example.com/an-article" })).toHaveLength(0);
});

test("a tab that never answers is given up on", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const job = indexUrl("https://example.com/slow");
  await openedTab();

  await vi.advanceTimersByTimeAsync(30_000);
  expect(await job).toEqual({ state: "failed", error: "the page did not finish loading" });
});

test.each(["javascript:alert(1)", "file:///etc/passwd", "chrome://settings", "not a link"])(
  "%s is never opened",
  async (url) => {
    expect(await indexUrl(url)).toEqual({ state: "failed", error: "that is not a web address" });
    expect(await opened()).toHaveLength(0);
  },
);

test("a PDF is turned away before a tab opens, with the way that works", async () => {
  expect(await indexUrl("https://example.com/report.PDF")).toEqual({ state: "skipped", reason: "pdf" });
  expect(await opened()).toHaveLength(0);
});

test("signed out, or not turned on, opens nothing", async () => {
  signedIn.tokens = false;
  expect(await indexUrl("https://example.com/a")).toEqual({ state: "skipped", reason: "signed-out" });
  signedIn.tokens = true;
  signedIn.consent = false;
  expect(await indexUrl("https://example.com/a")).toEqual({ state: "skipped", reason: "no-consent" });
  expect(await opened()).toHaveLength(0);
});
