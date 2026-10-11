import { expect, test } from "vitest";
import type { TabState } from "./messages";
import { thisPageControl } from "./this-page";

const tab = (status: TabState["status"]): TabState => ({
  host: "example.com",
  url: "https://example.com/a",
  title: "A",
  status,
});
const plain = { blocked: false, allowed: false, known: true };

test("the row offers the one control that answers what happened to the tab", () => {
  expect(thisPageControl(tab({ state: "watching", startedAt: 0 }), plain)).toBe("block");
  expect(thisPageControl(tab({ state: "remembered", result: "captured" }), plain)).toBe("forget");
  expect(thisPageControl(tab({ state: "skipped", reason: "blocked" }), plain)).toBe("unblock");
  expect(thisPageControl(tab({ state: "skipped", reason: "sensitive" }), plain)).toBe("allow");
  expect(thisPageControl(tab({ state: "skipped", reason: "too-short" }), plain)).toBeNull();
  expect(thisPageControl(tab({ state: "failed", error: "offline" }), plain)).toBeNull();
});

test("a rule outranks the page's state, and nothing is offered that cannot work", () => {
  // Blocked since the page was read: the rule is what to act on.
  const read = tab({ state: "remembered", result: "captured" });
  expect(thisPageControl(read, { ...plain, blocked: true })).toBe("unblock");
  // Remembered, but the server has not said which page it is, so there is no id to forget.
  expect(thisPageControl(read, { ...plain, known: false })).toBeNull();
  // Already allowed: reading it anyway is what the grant does, so it is not offered twice.
  expect(thisPageControl(tab({ state: "skipped", reason: "private" }), { ...plain, allowed: true })).toBeNull();
});
