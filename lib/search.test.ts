import { beforeEach, expect, test, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

// Same shape as auth.test.ts and capture.test.ts: one set of spies behind every
// `new ConvexHttpClient(...)`, so the per-call clients in lib/auth.ts all share them.
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

import type { PageSummary } from "./api";
import { forget, pageInfo, recent, search } from "./search";

const id = (s: string) => s as PageSummary["_id"];

const jwt = (expiresAtMs: number) =>
  `h.${btoa(JSON.stringify({ exp: Math.floor(expiresAtMs / 1000), sub: "u|s" })).replace(/=+$/, "")}.sig`;
const signedIn = { token: jwt(Date.now() + 3_600_000), refreshToken: "r1" };

/** One row as `search.queries.hybrid` returns it: `pageId`, and a relevance the popup must never show. */
const HIT = {
  pageId: "p1",
  url: "https://example.com/bridges",
  domain: "example.com",
  title: "Why bridges hum",
  summary: "Two sentences.",
  tags: ["bridges"],
  lastVisited: 1_700_000_000_000,
  relevance: 0.031,
};

/** The same page as `pages.queries.list` returns it: `_id`, and the capture fields instead. */
const PAGE = {
  _id: "p1",
  _creationTime: 1,
  userId: "u1",
  url: "https://example.com/bridges",
  domain: "example.com",
  title: "Why bridges hum",
  contentHash: "abc",
  summary: "Two sentences.",
  tags: ["bridges"],
  status: "ready" as const,
  firstVisited: 1,
  lastVisited: 1_700_000_000_000,
  visitCount: 2,
};

/**
 * What both are normalised to, so the popup has one row component rather than two.
 *
 * `relevance` is absent, and that is the assertion: it orders one result set and means nothing
 * outside it, so it never reaches the popup.
 */
const ROW = {
  pageId: "p1",
  title: "Why bridges hum",
  domain: "example.com",
  lastVisited: 1_700_000_000_000,
  summary: "Two sentences.",
  tags: ["bridges"],
  status: "ready",
};

beforeEach(() => {
  fakeBrowser.reset();
  vi.resetAllMocks();
});

test("search says signed out rather than calling anything", async () => {
  expect(await search("bridges")).toEqual({ signedOut: true });
  expect(convex.action).not.toHaveBeenCalled();
});

test("recent says signed out rather than calling anything", async () => {
  expect(await recent()).toEqual({ signedOut: true });
  expect(convex.query).not.toHaveBeenCalled();
});

test("a search asks for five and normalises what comes back", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  convex.action.mockResolvedValueOnce([HIT]);

  expect(await search("why do bridges hum")).toEqual({ signedOut: false, rows: [ROW] });
  expect(convex.setAuth).toHaveBeenCalledWith(signedIn.token);
  expect(convex.action).toHaveBeenCalledWith(expect.anything(), {
    query: "why do bridges hum",
    limit: 8,
  });
});

test("a query that is only whitespace never reaches the network", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });

  // Blank still costs an embedding server-side, and there is nothing to search for.
  expect(await search("   ")).toEqual({ signedOut: false, rows: [] });
  expect(convex.action).not.toHaveBeenCalled();
});

test("the query is trimmed before it is sent", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  convex.action.mockResolvedValueOnce([]);

  await search("  bridges  ");

  expect(convex.action).toHaveBeenCalledWith(expect.anything(), { query: "bridges", limit: 8 });
});

test("recent asks for five pages and normalises them the same way", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  convex.query.mockResolvedValueOnce({ page: [PAGE], isDone: true, continueCursor: "" });

  expect(await recent()).toEqual({ signedOut: false, rows: [ROW] });
  expect(convex.query).toHaveBeenCalledWith(expect.anything(), {
    paginationOpts: { numItems: 5, cursor: null },
  });
});

test("an unreachable backend becomes something the popup can render, not an exception", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  // fetch throws TypeError when the network is down. Rejecting every call covers the search and
  // the one forced token refresh withFreshToken makes before giving up.
  convex.action.mockRejectedValue(new TypeError("Failed to fetch"));

  expect(await search("bridges")).toEqual({
    error: expect.stringContaining("Could not reach Tabcake"),
  });
  // Signing someone out over flaky Wi-Fi would be the wrong answer, so the session survives.
  expect(await fakeBrowser.storage.local.get("auth")).toEqual({ auth: signedIn });
});

test("a revoked session reads as signed out, not as an error", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  // Anything that is not a network failure means the server rejected the session. lib/auth clears
  // it, and the popup should offer to reconnect rather than a "try again" that never will.
  convex.action.mockRejectedValue(new Error("InvalidAccountId"));

  expect(await search("bridges")).toEqual({ signedOut: true });
  expect(await fakeBrowser.storage.local.get("auth")).toEqual({});
});

/*
 * The two calls behind the this-page row. They answer `null`/`false` rather than the lists'
 * three-way reply, because a figure that cannot be fetched is one the popup leaves out —
 * there is no sentence worth showing in its place.
 */

test("signed out, neither of the two calls reaches the network", async () => {
  expect(await pageInfo("https://example.com/bridges")).toBeNull();
  expect(await forget(id("p1"))).toBe(false);

  expect(convex.query).not.toHaveBeenCalled();
  expect(convex.mutation).not.toHaveBeenCalled();
});

test("pageInfo passes the address through untouched — the server normalises it", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  convex.query.mockResolvedValueOnce({
    pageId: "p1",
    status: "ready",
    visitCount: 2,
    lastVisited: 1_700_000_000_000,
  });

  expect(await pageInfo("https://example.com/bridges?utm_source=x")).toMatchObject({
    pageId: "p1",
    visitCount: 2,
  });
  expect(convex.query).toHaveBeenCalledWith(expect.anything(), {
    url: "https://example.com/bridges?utm_source=x",
  });
});

test("forget reports whether it happened", async () => {
  await fakeBrowser.storage.local.set({ auth: signedIn });
  convex.mutation.mockResolvedValueOnce(null);

  expect(await forget(id("p1"))).toBe(true);
  expect(convex.mutation).toHaveBeenCalledWith(expect.anything(), { pageId: "p1" });

  // Someone else's page, or a page already gone. The popup refreshes either way.
  convex.mutation.mockRejectedValue(new Error("NOT_FOUND"));
  expect(await forget(id("p2"))).toBe(false);
});
