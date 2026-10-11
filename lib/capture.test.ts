import { beforeEach, expect, test, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

// Same shape as auth.test.ts: one set of spies behind every `new ConvexHttpClient(...)`, so the
// per-call clients in lib/auth.ts all share them.
const convex = vi.hoisted(() => ({
  action: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
  setAuth: vi.fn(),
}));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth = convex.setAuth;
    action = convex.action;
    query = convex.query;
    mutation = convex.mutation;
  },
}));

// The fake browser stops at the APIs it implements, and `action` is not one of them.
const badge = vi.hoisted(() => ({ text: vi.fn(), background: vi.fn(), textColour: vi.fn(), title: vi.fn() }));

import { capture, clearStatus, setStatus } from "./capture";
import { clearConsent, giveConsent } from "./consent";
import { titleFor } from "./toolbar-title";
import type { TabState } from "./messages";

const jwt = (expiresAtMs: number) =>
  `h.${btoa(JSON.stringify({ exp: Math.floor(expiresAtMs / 1000), sub: "u|s" })).replace(/=+$/, "")}.sig`;
const signedIn = { token: jwt(Date.now() + 3_600_000), refreshToken: "r1" };

const SIGNAL = {
  origin: "https://example.com",
  path: "/an-article",
  title: "An article",
  headings: ["An article"],
  hasLogout: false,
  noindex: false,
  passwordFields: 0,
  formFields: 0,
  paragraphs: 12,
  hasCurrency: false,
};

const PAGE = {
  url: "https://example.com/an-article",
  title: "An article",
  content: "Long enough to have got this far.",
  signal: SIGNAL,
};

/** What `capture` actually sends the backend once a decision has allowed it: never the signal. */
const SENT = { url: PAGE.url, title: PAGE.title, content: PAGE.content };

/**
 * The classifier's answer. It is an action, and so is the token refresh inside `withFreshToken`, so
 * this is the same spy — which is fine while the refresh only happens on an expiring token.
 */
const allows = () => convex.action.mockResolvedValueOnce({ allow: true, reason: "ok" });

const storedStatus = async () => (await fakeBrowser.storage.session.get("tab:7"))["tab:7"];

beforeEach(async () => {
  fakeBrowser.reset();
  vi.resetAllMocks();
  // Every test below is about a browser that has accepted the disclosure, except the one that says not.
  await giveConsent();
  // @ts-expect-error the fake browser stops at the APIs it implements; this is the rest of it.
  fakeBrowser.action = {
    setBadgeText: badge.text,
    setBadgeBackgroundColor: badge.background,
    setBadgeTextColor: badge.textColour,
    setTitle: badge.title,
  };
});

test("signed out, nothing leaves the browser", async () => {
  expect(await capture(7, PAGE)).toEqual({ state: "skipped", reason: "signed-out" });
  expect(convex.mutation).not.toHaveBeenCalled();
  expect(await storedStatus()).toEqual({
    host: "example.com",
    url: PAGE.url,
    title: PAGE.title,
    status: { state: "skipped", reason: "signed-out" },
  });
});

test("signed in but not agreed, not even the address leaves", async () => {
  await clearConsent();
  await fakeBrowser.storage.local.set({ auth: signedIn });
  expect(await capture(7, PAGE)).toEqual({ state: "skipped", reason: "no-consent" });
  expect(convex.action).not.toHaveBeenCalled();
  expect(convex.mutation).not.toHaveBeenCalled();
});

test("not having agreed beats a pause, because it is the thing to fix first", async () => {
  await clearConsent();
  await fakeBrowser.storage.local.set({ auth: signedIn, pauseUntil: -1 });
  expect(await capture(7, PAGE)).toEqual({ state: "skipped", reason: "no-consent" });
});

test("paused beats everything except being signed out", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn, pauseUntil: Date.now() + 60_000 });
  expect(await capture(7, PAGE)).toEqual({ state: "skipped", reason: "paused" });
  expect(convex.mutation).not.toHaveBeenCalled();
});

test("paused until resumed is -1, not a moment in the past", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn, pauseUntil: -1 });
  expect(await capture(7, PAGE)).toEqual({ state: "skipped", reason: "paused" });
});

test("a blocked domain is refused before the network is touched", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn, blocklist: ["example.com"] });
  expect(await capture(7, PAGE)).toEqual({ state: "skipped", reason: "blocked" });
  expect(convex.mutation).not.toHaveBeenCalled();
});

test("a host Tabcake blocked by itself is refused before the classifier is asked", async () => {
  // In front of `verdict`, so this page's title and headings never leave the browser at all.
  await fakeBrowser.storage.local.set({ auth: signedIn, autoBlocks: ["example.com"] });
  expect(await capture(7, PAGE)).toEqual({ state: "skipped", reason: "auto-skipped" });
  expect(convex.action).not.toHaveBeenCalled();
  expect(convex.mutation).not.toHaveBeenCalled();
});

test("an auto-blocked host reaches that exact host and nothing beside it", async () => {
  // The rule was written off three prefixes on one subdomain. It is not evidence about the parent.
  await fakeBrowser.storage.local.set({ auth: signedIn, autoBlocks: ["app.example.com"] });
  allows();
  convex.mutation.mockResolvedValueOnce("captured");

  expect(await capture(7, PAGE)).toEqual({ state: "remembered", result: "captured" });
});

test("a junk auto-block cache blocks nothing rather than everything", async () => {
  // The opposite direction from the blocklist, and safe for the same reason as grants: the backend
  // checks its own copy before it writes, so the worst a wrong cache costs is one wasted call.
  await fakeBrowser.storage.local.set({ auth: signedIn, autoBlocks: "example.com" });
  allows();
  convex.mutation.mockResolvedValueOnce("captured");

  expect(await capture(7, PAGE)).toEqual({ state: "remembered", result: "captured" });
});

test("with no stored blocklist, the defaults still apply", async () => {
  // The step that ships the editor comes later; capture must not be unguarded until then.
  await fakeBrowser.storage.local.set({ auth: signedIn });
  const status = await capture(7, { ...PAGE, url: "https://mail.google.com/mail/u/0/" });
  expect(status).toEqual({ state: "skipped", reason: "blocked" });
});

test("a pasted link is sent marked as added", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  allows();
  convex.mutation.mockResolvedValueOnce("captured");

  await capture(7, { ...PAGE, added: true });
  expect(convex.mutation).toHaveBeenCalledWith(expect.anything(), { ...SENT, added: true });
});

test("a page that passes every gate is sent, and the dot goes on", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  allows();
  convex.mutation.mockResolvedValueOnce("captured");

  expect(await capture(7, PAGE)).toEqual({ state: "remembered", result: "captured" });
  expect(convex.setAuth).toHaveBeenCalledWith(signedIn.token);
  expect(convex.mutation).toHaveBeenCalledWith(expect.anything(), SENT);
  expect(await storedStatus()).toEqual({
    host: "example.com",
    url: PAGE.url,
    title: PAGE.title,
    status: { state: "remembered", result: "captured" },
  });
  expect(badge.text).toHaveBeenCalledWith({ tabId: 7, text: "•" });
  expect(badge.title).toHaveBeenCalledWith({ tabId: 7, title: "Tabcake: remembered" });
});

test("the toolbar tooltip names each tab's state, and a cleared tab hands it back", async () => {
  const at = (status: TabState["status"], paused = false) =>
    titleFor({ host: "example.com", url: PAGE.url, title: PAGE.title, status }, paused);
  expect(at({ state: "watching", startedAt: 0 })).toBe("Tabcake: reading");
  expect(at({ state: "skipped", reason: "blocked" })).toBe("Tabcake: blocked here by your rule");
  expect(at({ state: "skipped", reason: "sensitive" })).toBe("Tabcake: skipped this page");
  expect(at({ state: "failed", error: "offline" })).toBe("Tabcake: could not save this page");
  // A pause outranks every state but a remembered page, which keeps its dot and says so.
  expect(at({ state: "watching", startedAt: 0 }, true)).toBe("Tabcake: paused");
  expect(at({ state: "remembered", result: "captured" }, true)).toBe("Tabcake: remembered");
  expect(titleFor(undefined, false)).toBe("Tabcake");

  await clearStatus(7);
  // null, so the global badge — II while paused — shows through; "" would hide it.
  expect(badge.text).toHaveBeenCalledWith({ tabId: 7, text: null });
  expect(badge.title).toHaveBeenCalledWith({ tabId: 7, title: "Tabcake" });
});

test("a page you have read before is still remembered", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  allows();
  convex.mutation.mockResolvedValueOnce("revisited");
  expect(await capture(7, PAGE)).toEqual({ state: "remembered", result: "revisited" });
});

test("the server refusing the text is a skip, not a failure", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  allows();
  convex.mutation.mockResolvedValueOnce("skipped");
  expect(await capture(7, PAGE)).toEqual({ state: "skipped", reason: "too-short" });
});

test("a page the classifier refuses is skipped, and its text never leaves", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  convex.action.mockResolvedValueOnce({ allow: false, reason: "sensitive" });

  expect(await capture(7, PAGE)).toEqual({ state: "skipped", reason: "sensitive" });
  // The whole reason the decision is asked for first.
  expect(convex.mutation).not.toHaveBeenCalled();
  expect(badge.text).toHaveBeenCalledWith({ tabId: 7, text: null });
});

test("a classifier that cannot answer refuses the page and says which", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  convex.action.mockResolvedValueOnce({ allow: false, reason: "unavailable" });

  expect(await capture(7, PAGE)).toEqual({ state: "skipped", reason: "unchecked" });
  expect(convex.mutation).not.toHaveBeenCalled();
});

test("the backend disagreeing about the blocklist still reads as blocked", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  convex.action.mockResolvedValueOnce({ allow: false, reason: "blocked" });

  expect(await capture(7, PAGE)).toEqual({ state: "skipped", reason: "blocked" });
  expect(convex.mutation).not.toHaveBeenCalled();
});

test("a page that could not be sent says so, and wears no dot", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  convex.mutation.mockRejectedValue(new TypeError("Failed to fetch"));
  convex.action.mockRejectedValue(new TypeError("Failed to fetch")); // the retry's refresh

  expect(await capture(7, PAGE)).toEqual({ state: "failed", error: "the page could not be saved" });
  expect(badge.text).toHaveBeenCalledWith({ tabId: 7, text: null });
});

test("a tab that has already closed is not an error", async () => {
  // tabs.onRemoved fires after the tab is gone, so every badge call for it rejects. That is the
  // normal path, not a fault: an unhandled rejection here buries every real error under noise.
  badge.text.mockRejectedValue(new Error("No tab with id: 7"));

  await expect(clearStatus(7)).resolves.toBeUndefined();
  const state = {
    host: "example.com",
    url: "https://example.com/an-article",
    title: "An article",
    status: { state: "remembered", result: "captured" },
  } as const;
  await expect(setStatus(7, state)).resolves.toBeUndefined();
  // The session entry is still written and removed; only the drawing is best-effort.
  expect(await storedStatus()).toEqual(state);
});

test("the dashboard is never read, and allowing its origin does not change that", async () => {
  // Its screens show what was read; remembering them would make the memory cite itself.
  const origin = new URL(import.meta.env.WXT_DASHBOARD_URL).origin;
  await fakeBrowser.storage.local.set({ auth: signedIn, grants: [origin] });
  const dashboard = { ...PAGE, url: `${origin}/memory`, title: "Tabcake" };
  expect(await capture(7, dashboard)).toEqual({ state: "skipped", reason: "dashboard" });
  expect(convex.action).not.toHaveBeenCalled();
  expect(convex.mutation).not.toHaveBeenCalled();
});
