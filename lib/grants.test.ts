import { expect, test } from "vitest";
import { isAllowed, parseGrants } from "./grants";

/**
 * The cached list of sites you allowed on purpose.
 *
 * Matching is exact, and that is the whole file: a grant that reached further than the origin it
 * names would be a permission nobody gave.
 */

test("an origin is a scheme and a host, and that is all", () => {
  expect(parseGrants(["https://example.com", "http://localhost:3000", "https://[::1]"])).toEqual([
    "https://example.com",
    "http://localhost:3000",
    "https://[::1]",
  ]);
});

test("anything carrying more than an origin is dropped", () => {
  // The server refuses these too. Dropping them here means a cache written by an older build, or
  // tampered with, cannot widen what this browser thinks is allowed.
  expect(
    parseGrants([
      "https://example.com/settings",
      "https://example.com?q=1",
      "https://example.com#top",
      "javascript:alert(1)",
      "file:///C:/notes.txt",
      "example.com",
      "",
    ]),
  ).toEqual([]);
});

test("junk reads as nothing allowed, never as everything", () => {
  // The opposite of the blocklist, where an unreadable value has to fall back to the presets:
  // forgetting a grant costs a page you allow again, forgetting a block reads a site you banned.
  expect(parseGrants(undefined)).toEqual([]);
  expect(parseGrants(null)).toEqual([]);
  expect(parseGrants("https://example.com")).toEqual([]);
  expect(parseGrants({ origin: "https://example.com" })).toEqual([]);
  // One bad entry is dropped rather than refusing the lot. The blocklist does the opposite, because
  // a half-read blocklist stops blocking; a half-read grant list only stops allowing.
  expect(parseGrants(["https://example.com", 7])).toEqual(["https://example.com"]);
});

test("a list longer than the cap is not a list of sites you allowed", () => {
  const many = Array.from({ length: 501 }, (_, n) => `https://site${n}.com`);
  expect(parseGrants(many)).toEqual([]);
  expect(parseGrants(many.slice(0, 500))).toHaveLength(500);
});

test("duplicates and casing collapse", () => {
  expect(parseGrants(["https://Example.com", "https://example.com"])).toEqual([
    "https://example.com",
  ]);
});

test("a grant covers its origin and nothing else", () => {
  const grants = parseGrants(["https://example.com"]);

  expect(isAllowed("https://example.com", grants)).toBe(true);
  expect(isAllowed("https://EXAMPLE.com", grants)).toBe(true);

  // A subdomain is a different site to the person reading it.
  expect(isAllowed("https://app.example.com", grants)).toBe(false);
  // So is a different scheme, which is the whole reason a grant is an origin and not a hostname.
  expect(isAllowed("http://example.com", grants)).toBe(false);
  // And so is a different port.
  expect(isAllowed("https://example.com:8443", grants)).toBe(false);
  // A name that merely starts the same way is a different company.
  expect(isAllowed("https://example.com.evil.net", grants)).toBe(false);
  expect(isAllowed("https://evil-example.com", grants)).toBe(false);
});

test("nothing is allowed when nothing is stored", () => {
  expect(isAllowed("https://example.com", [])).toBe(false);
});
