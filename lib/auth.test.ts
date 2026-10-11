import { beforeEach, expect, test, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

const convex = vi.hoisted(() => ({ action: vi.fn(), query: vi.fn(), setAuth: vi.fn() }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth = convex.setAuth;
    action = convex.action;
    query = convex.query;
  },
}));

import { getToken, isExpiringSoon, link, me, signOut } from "./auth";

const jwt = (expiresAtMs: number) =>
  `h.${btoa(JSON.stringify({ exp: Math.floor(expiresAtMs / 1000), sub: "u|s" })).replace(/=+$/, "")}.sig`;
const fresh = { token: jwt(Date.now() + 3_600_000), refreshToken: "r1" };
const stale = { token: jwt(Date.now() - 1_000), refreshToken: "r0" };
const stored = async () => (await fakeBrowser.storage.local.get("auth")).auth;

beforeEach(() => {
  fakeBrowser.reset();
  vi.resetAllMocks();
});

test("isExpiringSoon: an hour out is fine, under a minute is not, garbage is not", () => {
  expect(isExpiringSoon(jwt(Date.now() + 3_600_000))).toBe(false);
  expect(isExpiringSoon(jwt(Date.now() + 30_000))).toBe(true);
  expect(isExpiringSoon("not.a.jwt")).toBe(true);
});

test("getToken: signed out is null and calls nothing", async () => {
  expect(await getToken()).toBeNull();
  expect(convex.action).not.toHaveBeenCalled();
});

test("getToken: a fresh token is returned as is", async () => {
  await fakeBrowser.storage.local.set({ auth: fresh });
  expect(await getToken()).toBe(fresh.token);
  expect(convex.action).not.toHaveBeenCalled();
});

test("getToken: a stale token is refreshed and the new pair stored", async () => {
  await fakeBrowser.storage.local.set({ auth: stale });
  convex.action.mockResolvedValueOnce({ tokens: fresh });
  expect(await getToken()).toBe(fresh.token);
  expect(convex.action).toHaveBeenCalledWith(expect.anything(), { refreshToken: "r0" });
  expect(await stored()).toEqual(fresh);
});

test("getToken: a refresh the server rejects clears the session", async () => {
  await fakeBrowser.storage.local.set({ auth: stale });
  convex.action.mockRejectedValueOnce(new Error("Invalid refresh token"));
  expect(await getToken()).toBeNull();
  expect(await stored()).toBeUndefined();
});

test("getToken: a refresh that fails on the network keeps the session", async () => {
  await fakeBrowser.storage.local.set({ auth: stale });
  convex.action.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  expect(await getToken()).toBeNull();
  expect(await stored()).toEqual(stale);
});

test("link: a rejected code stores nothing", async () => {
  convex.action.mockResolvedValueOnce({ tokens: null });
  expect(await link("bad")).toEqual({ ok: false });
  expect(await stored()).toBeUndefined();
});

test("link: a good code stores the new session and signs out the old one", async () => {
  await fakeBrowser.storage.local.set({ auth: fresh });
  const next = { token: jwt(Date.now() + 3_600_000), refreshToken: "r2" };
  convex.action.mockResolvedValueOnce({ tokens: next }); // auth:signIn
  convex.action.mockResolvedValueOnce(null); // auth:signOut of the previous session
  expect(await link("good")).toEqual({ ok: true });
  expect(await stored()).toEqual(next);
  expect(convex.action).toHaveBeenCalledTimes(2);
  expect(convex.setAuth).toHaveBeenCalledWith(fresh.token);
});

test("me: signed out, then the user, then an error that keeps the session", async () => {
  expect(await me()).toEqual({ signedOut: true });

  await fakeBrowser.storage.local.set({ auth: fresh });
  convex.query.mockResolvedValueOnce({ _id: "u", tier: "free" });
  expect(await me()).toEqual({ signedOut: false, user: { _id: "u", tier: "free" } });

  convex.query.mockRejectedValue(new TypeError("Failed to fetch"));
  convex.action.mockRejectedValue(new TypeError("Failed to fetch")); // the forced refresh is offline too
  expect(await me()).toMatchObject({ error: expect.any(String) });
  expect(await stored()).toEqual(fresh);
});

test("signOut clears storage even when the server call fails", async () => {
  await fakeBrowser.storage.local.set({ auth: fresh });
  convex.action.mockRejectedValueOnce(new Error("boom"));
  await signOut();
  expect(await stored()).toBeUndefined();
});
