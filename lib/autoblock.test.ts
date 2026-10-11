import { expect, test } from "vitest";
import { isAutoBlocked, parseAutoBlocks } from "./autoblock";

/**
 * The cached list of sites Tabcake stopped reading by itself.
 *
 * Matching is exact, and that is the whole file: a machine's guess about one host reaching a
 * neighbouring one would be a refusal nobody can account for.
 */

test("a hostname is a hostname, and that is all", () => {
  expect(parseAutoBlocks(["payroll.example.com", "console.aws.amazon.com"])).toEqual([
    "payroll.example.com",
    "console.aws.amazon.com",
  ]);
});

test("anything carrying more than a hostname is dropped", () => {
  // The backend never sends these. Dropping them here means a cache written by an older build, or
  // tampered with, cannot widen what this browser refuses to read.
  expect(
    parseAutoBlocks([
      "https://example.com",
      "example.com/settings",
      "example.com:8443",
      "*.example.com",
      "exam ple.com",
      "",
    ]),
  ).toEqual([]);
});

test("junk reads as nothing blocked, never as everything", () => {
  // The opposite of the blocklist, where an unreadable value has to fall back to the presets:
  // forgetting one of these costs a call the backend refuses anyway.
  expect(parseAutoBlocks(undefined)).toEqual([]);
  expect(parseAutoBlocks(null)).toEqual([]);
  expect(parseAutoBlocks("example.com")).toEqual([]);
  expect(parseAutoBlocks({ host: "example.com" })).toEqual([]);
  // One bad entry is dropped rather than refusing the lot, the same way grants are read.
  expect(parseAutoBlocks(["example.com", 7])).toEqual(["example.com"]);
});

test("a list longer than the cap is not a list of sites", () => {
  const many = Array.from({ length: 501 }, (_, n) => `site${n}.com`);
  expect(parseAutoBlocks(many)).toEqual([]);
  expect(parseAutoBlocks(many.slice(0, 500))).toHaveLength(500);
});

test("duplicates and casing collapse", () => {
  expect(parseAutoBlocks(["Example.com", "example.com"])).toEqual(["example.com"]);
});

test("a rule covers its host and nothing else", () => {
  const hosts = parseAutoBlocks(["app.example.com"]);

  expect(isAutoBlocked("app.example.com", hosts)).toBe(true);
  expect(isAutoBlocked("APP.example.com", hosts)).toBe(true);

  // The parent domain is a different site, and blocking it off one subdomain's evidence is the
  // exact mistake the three-prefix rule exists to avoid.
  expect(isAutoBlocked("example.com", hosts)).toBe(false);
  // So is a sibling, and so is a name that merely starts the same way.
  expect(isAutoBlocked("docs.example.com", hosts)).toBe(false);
  expect(isAutoBlocked("app.example.com.evil.net", hosts)).toBe(false);
  expect(isAutoBlocked("notapp.example.com", hosts)).toBe(false);
});

test("nothing is blocked when nothing is stored", () => {
  expect(isAutoBlocked("example.com", [])).toBe(false);
});
