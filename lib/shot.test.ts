import { beforeEach, expect, test } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { SHOT_TTL_MS, stashShot, takeShot } from "./shot";

beforeEach(() => fakeBrowser.reset());

const shot = { dataUrl: "data:image/jpeg;base64,AAAA", pageUrl: "https://example.com/", title: "Example" };

test("nothing stashed, nothing taken", async () => {
  expect(await takeShot()).toBeUndefined();
});

test("a fresh shot comes back once, with its moment", async () => {
  await stashShot(shot, 1_000);
  expect(await takeShot(2_000)).toEqual({ ...shot, at: 1_000 });
  expect(await takeShot(2_000)).toBeUndefined();
});

test("a second report replaces the first", async () => {
  await stashShot(shot, 1_000);
  await stashShot({ dataUrl: "data:image/jpeg;base64,BBBB" }, 1_500);
  expect(await takeShot(2_000)).toEqual({ dataUrl: "data:image/jpeg;base64,BBBB", at: 1_500 });
});

test("a stale shot is not handed over, and is deleted anyway", async () => {
  await stashShot(shot, 1_000);
  expect(await takeShot(1_000 + SHOT_TTL_MS)).toBeUndefined();
  expect(await fakeBrowser.storage.session.get("shot")).toEqual({});
});
