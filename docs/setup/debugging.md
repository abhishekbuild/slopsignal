# Where output goes

For the first time a `console.log` does not appear. Extensions are the worst of the three repos for
this: there are three separate consoles and none of them is the one you have open.

## The three consoles

| Code | Where its output appears |
|---|---|
| `entrypoints/background.ts`, `lib/auth.ts` | `chrome://extensions`, then the **"service worker"** link on the Tabcake card |
| `entrypoints/popup/*` | right-click inside the popup, then **Inspect** |
| a test | your terminal |

The popup one has a trap: opening devtools for the popup keeps the popup alive, and closing the popup
closes its console. If you are inspecting the popup and it vanishes, click the toolbar icon again and
re-inspect.

## The service worker sleeps, and takes its console with it

The worker is killed after roughly thirty seconds of idleness. When that happens:

- Its console **clears**. Logs you were reading are gone.
- The devtools window may show it as stopped, or detach entirely.
- The next message starts a fresh worker with no memory of the last one.

So a log that "disappeared" often means the worker restarted between you causing the thing and you
looking. Two ways to cope: keep the service worker devtools open before you trigger anything, because
an attached debugger keeps it awake; or write what you need into `chrome.storage` and read it from
the Application tab afterwards.

This is also why `lib/auth.ts` writes tokens to storage the instant a response arrives rather than at
the end of a chain of work. A worker death mid-function is normal, not exceptional.

## Reading storage

The whole session lives under one key. In the popup's console, or the service worker's:

```js
await chrome.storage.local.get("auth")     // { auth: { token, refreshToken } } or {}
await chrome.storage.local.remove("auth")  // forces the signed-out state
```

Removing the key is the quickest way to test the signed-out popup. Hand-editing the `exp` inside the
token is the quickest way to test the refresh path — the popup will still show the account, because
the background renewed it.

## Reloading after a change

`npm run dev` rebuilds and the dev build reloads itself. When it does not — and it sometimes does not
after a change to `wxt.config.ts`, because the manifest itself changed — press the reload arrow on the
extension's card in `chrome://extensions`.

A manifest error stops it loading at all and Chrome shows a red **Errors** button on the card. That is
the place to look if a change to `wxt.config.ts` makes the extension vanish.

## `Could not find public function` in the Convex log

The build Chrome is running predates a backend rename. Reload the extension; if the line keeps
appearing, run `npm run build` and load the folder again.

A Convex function's name **is** its file path, so moving `convex/users.ts` to `convex/users/profile.ts`
renamed `users:me` to `users/profile:me`. Any build still in the browser goes on asking for the old
name, and the deployment no longer has it.

There is no popup error, no red card, nothing in the extension's own console. The only evidence is in
the deployment log, so watch it the first time you run against a backend that has moved things:

```
npx convex logs          # from tabcake-server
```

The names to expect are `pages/ingest:capture` when a page is read, `users/profile:me` when the popup
opens, and `search/queries:hybrid` when you search. A bare `users:me` or `pages:capture` means a
stale build.

The source itself cannot fall behind silently any more, as long as someone emits. `lib/convex-api.ts`
is generated from the backend by `npm run api:emit` in `tabcake-server`, so after a rename the next
emit makes every stale call a compile error here. If the log names a function your source does not,
the build is old; if your source names one the log rejects, the emit is old.

## The popup is blank, or nothing is captured

Check this before anything else, because the cause is usually not in this codebase.

Both symptoms come from the same place: `.output/chrome-mv3-dev` is a shell around the dev server, and
it fails silently when the server is gone. See
[the dev build is not a standalone extension](install-and-run.md).

| What you see | What it means |
|---|---|
| The popup is an empty white box | `popup.html` fetched its scripts from `http://localhost:3100` and got nothing — or got somebody else. |
| `[wxt] Failed to connect to dev server` and `WebSocket connection to 'ws://localhost:3100/' failed: net::ERR_CONNECTION_REFUSED` on the extension's card | Nothing was listening on 3100 when the worker or the popup started. The worker tries once and does not retry, so this stays true until you reload the extension, even after the server comes up. |
| Warnings about `localhost:3000/_next/...` on the extension's card | Something else answered on the dev server's port. `_next` is Next, so that is the dashboard replying to the popup. |
| Pages are read but the `pages` table stays empty | The content script was never registered, so the dwell timer never ran. |
| No Remember button on a YouTube watch page, and no capture anywhere else | The same: no content script. It is one script for every site. |

Three checks, in order:

1. Is `npm run dev` still running in `tabcake_extension`? That is the answer most of the time.
2. `chrome://extensions` → **Details** → does it list a content script? The dev build only gets one
   once its worker has connected to the dev server.
3. Right-click the popup → **Inspect** → Network. Failed requests to `localhost:3100` mean no dev
   server; requests answered with HTML from something else mean the port was taken.

Then reload the extension: the **↻** on its card, or **Alt+R** anywhere in Chrome (the dev
manifest's `wxt:reload-extension` command). The worker connects to the dev server only when it
starts, so starting or restarting `npm run dev` under a running extension is not enough on its own.
After the reload, Details lists the content script and a reloaded YouTube tab has its button.

The ports are separate on purpose — dashboard on 3000, extension dev server on 3100 — so they can no
longer take each other's. If you change either, change it in `wxt.config.ts` and nowhere else.

## Debugging the pairing flow

It spans three programs in about a second, so trace it in order:

1. **The dashboard's console.** Did `chrome.runtime` exist at all? If not, either the extension is not
   installed or the origin does not match `externally_connectable`.
2. **The service worker's console.** Did `onMessageExternal` fire? If it fired and did nothing, the
   `sender.origin` check rejected it — that means the dashboard is on the wrong origin, usually
   because something else held 3000 and Next moved to 3001.
3. **The Convex logs**, with `npx convex logs` in `tabcake-server`. Did `signIn` get called, and what
   did it return? `{tokens: null}` means the code was invalid, used, or expired.

The most common answer is step 2, and the most common cause is the port.

## The YouTube button

| What you see | What it means |
|---|---|
| The transcript panel stays open beside the video after a save | YouTube renamed the panel. Both ids it has used are in `lib/transcript.ts`; add the new one there. |
| The description expands and collapses on every save | This build of YouTube does not render the Show transcript button until the description is open. Expected; the fallback ran. |
| "No transcript for this video" on a video that plainly has captions | The Show transcript button moved. Its selectors are in `lib/transcript.ts`. |
| No button on a watch page | The content script is not running. In the dev build that means the worker never reached the dev server — see [the section above](#the-popup-is-blank-or-nothing-is-captured). |
| No button on a Short, or one in the bottom-left corner | The action column moved again. Its selectors are in `lib/video-button.ts` — `reel-action-bar-view-model`, the older `#actions`, and the parent of the Like button as the net — and after ten seconds without a match the button takes the corner. Run the line below on the Short and add what it prints. |
| A tab with the Short's video flashes in the tab strip after a press | Expected: that is where the transcript is read. It closes itself once the Short's button has its answer. |
| A Short says "Could not remember that" after about 45 seconds | The tab the background opened to read it never reported: it was closed by hand, or the video page did not render its description in a background tab. Open the Short's video page yourself and press the button there. |

The Like button's ancestors, innermost first — the column is the one right after it:

```js
(() => { const c = []; for (let e = document.querySelector('button[aria-label*="like this" i]'); e && e !== document.body; e = e.parentElement) c.push(e.tagName.toLowerCase() + (e.id ? "#" + e.id : "")); console.log(c.join(" < ")); })();
```

## The rest of the product

| Where the code runs | Where to look |
|---|---|
| A Convex function | `npx convex logs` in `tabcake-server`, or the Convex dashboard |
| The dashboard's `proxy.ts` or a server component | its `npm run dev` terminal |
| The dashboard's client components | the browser console |
| This extension's worker | `chrome://extensions`, "service worker" |
| This extension's popup | right-click the popup, Inspect |

---

**Before this:** [Running the tests](running-tests.md) · **See also:**
[Signing in](../how-it-works/signing-in.md) · [The session](../how-it-works/the-session.md) ·
[Chrome extensions and WXT](../orientation/chrome-extensions-and-wxt.md) · [Index](../README.md)
