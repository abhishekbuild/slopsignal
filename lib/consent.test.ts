import { beforeEach, expect, test } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { CONSENT_VERSION, clearConsent, giveConsent, hasConsent } from "./consent";

beforeEach(() => fakeBrowser.reset());

test("a fresh browser has agreed to nothing", async () => {
  expect(await hasConsent()).toBe(false);
});

test("agreeing is remembered, with the version and the moment", async () => {
  await giveConsent(1_000);
  expect(await hasConsent()).toBe(true);
  expect((await fakeBrowser.storage.local.get("consent")).consent).toEqual({
    version: CONSENT_VERSION,
    at: 1_000,
  });
});

test("an agreement to an older disclosure does not count", async () => {
  await fakeBrowser.storage.local.set({ consent: { version: CONSENT_VERSION - 1, at: 1_000 } });
  expect(await hasConsent()).toBe(false);
});

test("a junk value counts as no agreement", async () => {
  await fakeBrowser.storage.local.set({ consent: "yes" });
  expect(await hasConsent()).toBe(false);
});

test("clearing it, as sign-out does, asks again", async () => {
  await giveConsent();
  await clearConsent();
  expect(await hasConsent()).toBe(false);
});
