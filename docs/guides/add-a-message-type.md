# Adding a message type

For when the popup needs something new from the background, or the dashboard does. By the end you will
have added one without breaking the async reply.

Messages are the only way the three parts of this extension talk. The popup holds no tokens and does
no network work, so almost any new capability starts here.

## 1. Decide which channel

| Channel | Between | Listener |
|---|---|---|
| internal | popup → background | `browser.runtime.onMessage` |
| external | dashboard → background | `browser.runtime.onMessageExternal` |

**Default to internal.** External means a web page can trigger it, which is a security boundary, and
today six external messages exist because each one had to justify itself: `ping` and `link` for
pairing, `getSettings` and `setSettings` for the blocklist editor, `pause` for the dashboard's pause
control, and `takeShot` for the /feedback page to collect the popup's bug screenshot.

## 2. Add the shape to `lib/messages.ts`

Both directions are discriminated unions in that one file:

```ts
export type InternalMessage =
  | { type: "me" }
  | { type: "signOut" }
  | { type: "pause"; until: number };
```

Add the reply type too. Keeping both in one file is what makes the contract checkable from all three
sides — the popup, the background, and the dashboard's page all import from here.

## 3. Handle it in the background

`entrypoints/background.ts`, in the matching listener:

The listener is two lines and hands off to a `switch`, so TypeScript makes adding a member without
handling it an error:

```ts
browser.runtime.onMessage.addListener((message: InternalMessage, sender, respond) => {
  void route(message, sender.tab?.id).then(respond);
  return true;
});
```

Take `tabId` from `sender`, never from the message. A page must not be able to label someone else's
tab.

**`return true` is not optional.** It tells Chrome to hold the channel open for an asynchronous reply.
Without it the sender receives `undefined` and you will spend an hour blaming the wrong thing.
Returning a promise instead works in Firefox and not in Chrome.

Register the listener at the top level, synchronously. A listener added after an `await` may not exist
when a message arrives at a cold worker, and the message is dropped silently.

Keep the handler itself thin. The work belongs in `lib/`, so it can be tested without a browser.

## 4. If it is external, guard it

Every external handler starts with the origin check that is already there:

```ts
if (sender.origin !== DASHBOARD_ORIGIN) return;
```

Then think about what you are exposing. Two rules the existing pair follow:

- **A reply never carries tokens or personal data.** `ping` answers a boolean, not an account. `link`
  answers `{ok}`. A page that can ask the extension who is signed in is a page that can fingerprint
  the user.
- **Assume the payload is hostile.** Validate the shape before using it. `link` checks the code is a
  string before sending it anywhere. `setSettings` is the fuller example: its `blocklist` is typed
  `unknown`, and `parseBlocklist` in `lib/rules.ts` refuses the whole payload unless every rule,
  every group and every limit passes. Store all of it or none of it — a half-applied setting is
  worse than a rejected one.
- **A reply has to make sense to an older page.** The dashboard ships separately, so it can be
  behind this repo. `getSettings` answers with a `schema` number a current page checks, and, beside
  the document, the flat `hosts` list the previous dashboard knew how to read.

The blocklist is one piece of user data that does cross this channel, because editing it is the
entire purpose of the dashboard page that asks. The other is `takeShot`'s screenshot, which you took
on purpose to send there; it crosses once and is deleted. Tokens still never do.

## 5. Call it from the popup

```ts
const reply = await browser.runtime.sendMessage({ type: "capture", url });
```

Remember the popup can be closed before the reply lands. That is normal — the background finishes
regardless — so never make the completion of anything depend on the popup still being open.

## 6. Test it

If the logic went into `lib/`, test it in `lib/auth.test.ts` or a new file beside it, against
`fakeBrowser`. The listener wiring itself is thin enough not to need one; the thing it calls is not.
[Running the tests](../setup/running-tests.md) covers the setup.

## 7. Version and docs

A new capability is a minor bump: `VERSION`, `package.json`, and a line in `docs/changelog.md`. If the
message is part of a flow worth explaining, add it to
[The session](../how-it-works/the-session.md)'s contract table.

---

**See also:** [The session](../how-it-works/the-session.md) ·
[Chrome extensions and WXT](../orientation/chrome-extensions-and-wxt.md) ·
[Page capture](../how-it-works/page-capture.md) · [Index](../README.md)
