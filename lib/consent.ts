import { browser } from "wxt/browser";

/**
 * Whether the person in front of this browser has agreed to what Tabcake collects.
 *
 * The Chrome Web Store has required, since 1 August 2026, that every kind of data collection is
 * disclosed inside the product and agreed to with an action, even collection that is the whole point
 * of the extension. A sentence in the listing or the privacy policy does not count. So the popup
 * shows the disclosure after sign-in, and `lib/capture.ts` refuses every page until it is accepted.
 *
 * Per browser rather than per account, like pause: it is about this copy of the extension reading
 * this browser's pages. It is cleared on sign-out, because the next person to sign in on a shared
 * profile has agreed to nothing.
 */

/**
 * Raise this whenever what Tabcake collects or where it goes changes, and update the popup's wording
 * in the same change. Every browser then sees the disclosure again and capture stops until it is
 * accepted — the store also requires telling people when data handling changes after install.
 */
export const CONSENT_VERSION = 1;

/** The policy the disclosure links to. The store listing names the same address. */
export const PRIVACY_URL = `${import.meta.env.WXT_SITE_URL}/privacy`;

const CONSENT_KEY = "consent";

type Stored = { version: number; at: number };

/** True once this browser has accepted the current version. Never touches the network. */
export async function hasConsent(): Promise<boolean> {
  const stored = (await browser.storage.local.get(CONSENT_KEY))[CONSENT_KEY] as Stored | undefined;
  return typeof stored?.version === "number" && stored.version >= CONSENT_VERSION;
}

/** Records the agreement, and when it was given, so a support question can be answered. */
export async function giveConsent(now = Date.now()): Promise<void> {
  const value: Stored = { version: CONSENT_VERSION, at: now };
  await browser.storage.local.set({ [CONSENT_KEY]: value });
}

/** Called on sign-out. */
export async function clearConsent(): Promise<void> {
  await browser.storage.local.remove(CONSENT_KEY);
}
