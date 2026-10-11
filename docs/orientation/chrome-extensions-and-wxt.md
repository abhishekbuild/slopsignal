# Chrome extensions and WXT

For anyone who has not built a Manifest V3 extension, or has not used WXT. By the end you will know
the four facts about MV3 that shape this codebase, and what WXT does for you.

## The four facts that shape everything here

### 1. The background is a service worker, and it sleeps

There is no persistent background page in Manifest V3. `entrypoints/background.ts` runs as a service
worker that Chrome starts when something needs it and **kills when it goes idle** — usually after
about thirty seconds.

Everything in memory dies with it. A variable holding state, a timer, a half-finished promise: gone,
and it restarts from nothing on the next message.

So anything that must survive goes in `chrome.storage`, and it goes there **immediately**, not at the
end of a chain of work. `lib/auth.ts` writes new tokens the moment the response arrives for exactly
this reason.

It also means event listeners must be registered at the top level, synchronously, as the worker
starts. A listener added inside a callback or after an `await` may not exist yet when the message
arrives, and the message is simply lost.

### 2. The popup is a brand new document every time

Open the popup and it loads from scratch. Close it and everything is destroyed — no state, no
variables, no React tree. Reopen it and you get a fresh document.

Consequences that show up in this code:

- The popup keeps **no** state worth having. It asks the background for the truth on mount.
- Fonts are bundled rather than fetched, because a remote font would flash on every single open.
- There is no router and no persistence. It is one component with a handful of states.
- Closing the popup mid-operation is normal, not an error. The background is doing the work, so it
  finishes regardless.

### 3. Asynchronous replies need `return true`

A message listener that answers asynchronously has to call `sendResponse` later and **return `true`**
synchronously, to tell Chrome to keep the channel open. Forget it and the sender gets `undefined`.

Returning a promise works in Firefox but not in Chrome, so `entrypoints/background.ts` uses the
callback with `return true` even though the polyfill would let it look tidier.

### 4. A web page can only reach the extension if the manifest says so

Ordinary web pages have no access to an extension. `chrome.runtime` does not exist for them.

It appears **only** for origins the manifest names in `externally_connectable`. Ours names exactly one,
the dashboard, which is the whole mechanism behind [signing in](../how-it-works/signing-in.md) — and
also the reason the dashboard can detect whether the extension is installed at all.

## What WXT does

[WXT](https://wxt.dev) is the build tool. Think of it as the framework around the extension: you write
entrypoints, it produces a loadable extension.

| You write | WXT does |
|---|---|
| a file in `entrypoints/` | works out what it is and adds it to the manifest |
| `entrypoints/popup/index.html` | registers it as the toolbar popup |
| `entrypoints/background.ts` | builds it as the service worker |
| `manifest` in `wxt.config.ts` | merges it with what it inferred, and writes `manifest.json` |
| `public/icon/*.png` | picks the icons up by size |
| `WXT_*` in `.env` | exposes them as `import.meta.env.WXT_*` at build time |

### `npm run dev` and `npm run build` produce different extensions

Not the same extension with different minification — different manifests.

| | `npm run build` | `npm run dev` |
|---|---|---|
| Popup | bundled into the folder | fetched from the dev server at `localhost:3100` |
| Content script | declared in `manifest.json` | **absent** from the manifest, registered at run time by the worker over the dev server websocket |
| Needs a server running | no | yes, or it does nothing at all |

That second row is the one that bites. A dev build with no dev server is an extension that loads,
shows its icon, and captures nothing, with no error anywhere.
[Where output goes](../setup/debugging.md) has the symptoms.

It also generates `.wxt/`, which holds the TypeScript config this repo extends and the types for
`browser` and the path aliases. Both `.wxt/` and `.output/` are generated and gitignored; `npm run
compile` runs `wxt prepare` first to make sure they exist.

The `browser` object comes from `wxt/browser` and is the promise-based API, so `browser.storage.local.get`
returns a promise rather than taking a callback. That is a polyfill over `chrome.*`, and the two names
appear in this codebase for different reasons: `browser` in our code, `chrome` in the manifest field
names and in what the dashboard calls.

## One local wrinkle

**WXT does not open a browser for you here.** `webExt: { disabled: true }` in `wxt.config.ts`, because
Chrome 137 and later ignore the `--load-extension` flag WXT relied on — an auto-opened Chrome would
come up without the extension in it, which is worse than not opening one.

So you load the build unpacked once by hand. [Getting it running](../setup/install-and-run.md) has
the steps.

---

**Before this:** [What Tabcake is](what-is-tabcake.md) · **Next:**
[A tour of the repo](repo-tour.md) · **See also:** [The session](../how-it-works/the-session.md) ·
[Where output goes](../setup/debugging.md) · [Index](../README.md)
