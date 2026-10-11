import { browser } from "wxt/browser";
import type { InternalMessage } from "./messages";

/**
 * Fire-and-forget to the background, from a page this extension does not control.
 *
 * Nothing is reported either way: the messages this carries are a page to remember or a label on a
 * tab, and if nobody is there to receive them there is nothing left to remember them for.
 */
export function send(message: InternalMessage): void {
  void ask(message);
}

/**
 * The same send, and it hands back what the background answered.
 *
 * `undefined` means no answer: the background was asleep, the page was closing, or the extension
 * was reloaded under this tab. A caller that shows the answer to a person treats that as the thing
 * not having happened, which is the safe direction.
 *
 * Two failures, one `catch`, and only because of the `await`:
 *
 * - The background is asleep, or the page is closing. The promise **rejects**.
 * - The extension was reloaded or updated. The content script injected before that keeps running
 *   with its extension context destroyed, and sendMessage then **throws**, before there is a
 *   promise at all. `await` inside the `try` is what turns that throw into the same rejection.
 *
 * Drop the `try` and every tab that was open across a reload gets an uncaught error.
 */
export async function ask(message: InternalMessage): Promise<unknown> {
  try {
    return await browser.runtime.sendMessage(message);
  } catch {
    return undefined;
  }
}
