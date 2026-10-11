import { browser } from "wxt/browser";
import type { InternalMessage } from "@/lib/messages";

/**
 * The popup's round trip to the background, and the only way it causes anything.
 *
 * Not `lib/send.ts` — that one is fire-and-forget for the content script, returns `void`, and
 * swallows everything on purpose because an orphaned content script has nobody to report to. The
 * popup needs the reply, and it is a page this extension controls, so neither of that file's two
 * failure modes applies.
 *
 * Reading, by contrast, goes straight to `browser.storage` with a subscription — see the
 * `useStored` hook in controls.tsx. The popup reads storage to display something and sends a
 * message to cause something.
 */
export function ask<T>(message: InternalMessage): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}
