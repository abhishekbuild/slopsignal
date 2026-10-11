# A tour of the repo

For finding your way around. Every file, one line each. This doubles as the file reference — there are
under twenty source files, so a separate list would say the same thing twice.

## `entrypoints/` — the parts of the extension

| File | What it is |
|---|---|
| `background.ts` | The service worker, and **the only holder of tokens**. Answers six messages from the dashboard (`ping`, which also sends the version, `link`, `getSettings`, `setSettings`, `pause`, `takeShot`, `indexUrl`) and eighteen from inside the extension (`me`, `signOut`, `consent`, `capture`, `pageStatus`, `pause`, `setBlocked`, `setAllowed`, `search`, `recent`, `pageInfo`, `forget`, `rememberShort`, `videoJob`, `videoDone`, `indexUrl`, `pageJob`, `stashShot`), clears a tab's status when it navigates or closes, keeps the cached blocklist fresh, and runs the hidden tabs that read a Short (`lib/shorts.ts`) or a pasted link (`lib/manual.ts`). |
| `content.ts` | Runs on every http and https page. Decides whether you read it, extracts the text, and sends it to the background. Talks to nothing else. |
| `popup/index.html` | The popup document. A title and a root div. |
| `popup/main.tsx` | Mounts React, and imports the five bundled font faces and the stylesheet. |
| `popup/App.tsx` | The popup's five states, the 480×600 frame, the header (the account and Sign out), Add a link (a pasted link, read in a hidden tab, and Upload a document, which opens the dashboard), the feedback block (Report a bug, which screenshots the tab, and Share feedback) and the footer (Open Tabcake, Reading rules). |
| `popup/controls.tsx` | The page you are on — one sentence and the one control that fits — and the capture row, which says Capturing or Paused in every state. |
| `popup/search.tsx` | The search field, the Recent / Results heading, the scrolling list with Open all results, and its empty states. |
| `popup/ask.ts` | The popup's one round trip to the background. Six lines, so nothing declares its own. |
| `popup/style.css` | Tailwind plus the design tokens of `assets/design.md` v4.8. The light `:root` block is a byte-for-byte copy of the dashboard's `app/globals.css`. Since 0.34.0 a dark block follows it under `prefers-color-scheme: dark`, with design.md 5.5's dark values for every colour token. |

WXT turns this folder into the manifest. Nothing here is registered by hand.

## `lib/` — the logic

| File | What it does |
|---|---|
| `auth.ts` | The whole session story: storage, expiry, single-flight refresh, pairing, reading the user, signing out. The most important file in the repo. |
| `capture.ts` | The last gate before a page leaves the browser, and the only writer of per-tab status, the badge and the per-tab tooltip. |
| `consent.ts` | Whether this browser has accepted the popup's first-run agreement, and which version of it. Capture is refused until it has. |
| `dashboard.ts` | The dashboard's address and origin, read once from `WXT_DASHBOARD_URL`. The background trusts it, the popup opens it, and the content script refuses to read it. |
| `rules.ts` | What is worth remembering: search pages, private and nameless hosts, the blocklist — rules, scopes, groups, presets and the migration — and the form heuristic. All pure. |
| `extract.ts` | A rendered page to the text a person read. Ported from the retired prototype. |
| `dwell.ts` | Fifteen seconds of visible time, once per address. A timer and nothing else. |
| `route.ts` | Noticing that a single-page app changed route, so every check runs again. A timer and nothing else. |
| `grants.ts` | The origins you allowed on purpose, as this browser caches them. Pure. |
| `autoblock.ts` | The hosts Tabcake stopped reading by itself, as this browser caches them. Pure. |
| `transcript.ts` | Reading what was said in a YouTube video out of its own transcript panel. Scraping, and it says so. |
| `shorts.ts` | Remembering a Short without leaving it: the background opens its video page in a tab you never see, and hands back what the button there said. |
| `manual.ts` | Remembering a pasted link without opening it: the same hidden tab, read with the fifteen-second wait skipped, and what became of it handed back. |
| `shot.ts` | The "Report a bug" screenshot, parked in `storage.session` until the dashboard's /feedback page takes it: once, and within ten minutes. |
| `video-button.ts` | The one element Tabcake puts into a page: the ink button offering to remember a video's transcript. |
| `redact.ts` | Taking the personal data out of page text, before any of it leaves. Pure. |
| `signal.ts` | The small description of a page the classifier is shown. No body text, no query string. |
| `send.ts` | The content script's two ways to reach the background — `send`, fire-and-forget, and `ask`, which waits for the answer — and the two ways either can fail. |
| `settings.ts` | Pause and the three cached lists: the only reader and writer of any of them, and of the pause badge, the default tooltip and its alarm. Pause is stored here; the blocklist, the allowed origins and the auto-blocked hosts belong to the account, so what is stored here is a cache this file syncs. |
| `search.ts` | The four calls behind the popup: a search (eight results), the last five pages, one page's stored state, and forgetting one. None throws. |
| `toolbar-title.ts` | `titleFor`: the toolbar tooltip for a tab's state, "paused" while capture is. Pure; shared by the badge writers in `capture.ts` and `settings.ts`. |
| `this-page.ts` | `thisPageControl`, which picks the popup's one this-page control from the tab's state, and `WAIVABLE`, the refusals allowing a site lifts. Pure. |
| `api.ts` | Re-exports the generated `api`, with `auth` typed by hand because Convex Auth declares no return types, plus the `User`, `Tokens`, `PageSummary` and `SearchResult` types, each derived from a function's return. |
| `convex-api.ts` | Every public backend function, typed. Generated by `npm run api:emit` in `tabcake-server` and committed here; never edit it by hand. |
| `format.ts` | "4h ago", for the result rows. Copied from the dashboard. |
| `palette.ts` | The five brand colours for the places with no stylesheet: the toolbar badges and the video button on YouTube. Each names the token it mirrors. |
| `messages.ts` | The message shapes, as discriminated unions. The contract between the popup, the content script, the dashboard and the background. |
| `auth.test.ts` | Ten tests over `auth.ts`, against a fake browser and a mocked Convex client. |
| `capture.test.ts` | The gate order, the status written, the badge and the tooltip. |
| `settings.test.ts` | Pause, the alarm, the badge on ink and its tooltip, and storing a blocklist that arrived from outside. |
| `search.test.ts` | Eleven tests over the four calls: signed out, the shape the lists normalise to, the difference between unreachable and revoked, and the quieter `null` the other two answer with. |
| `this-page.test.ts` | The one control for each tab state, and that a rule outranks the page's state. |
| `rules.test.ts`, `extract.test.ts`, `dwell.test.ts`, `send.test.ts` | Twenty-four tests over the four small modules. `extract` is the only one needing a DOM. |

`lib/auth.ts` is background-only. The popup must never import it: two programs refreshing the same
session is precisely what the design avoids, and it would need tokens in the popup to do it.

## `components/` — five small pieces

| File | What it is |
|---|---|
| `button.tsx` | Primary, secondary, ghost, quiet and danger, at 32px. |
| `brand.tsx` | The only place the logo is drawn: the mark and the lockup (mark plus the Manrope wordmark). A verbatim copy of the dashboard's. |
| `loader.tsx` | The loader: the logo with its back tab sliding, so the overlap shrinks and grows. It replaces every spinner. A verbatim copy of the dashboard's. |
| `result-row.tsx` | One remembered page as a 52px row: monogram, the title as a link into the dashboard, site and time. The same shape as the dashboard's list rows. |
| `monogram.tsx` | A site as its first letter on a disc. Copied from the dashboard. design.md §9 uses it everywhere a favicon would go — see [permissions](../reference/permissions.md). |

All but `button.tsx` are deliberate copies rather than a shared package. A few files across two
repos are cheaper than another repo to publish and version.

## Configuration

| File | What it is |
|---|---|
| `wxt.config.ts` | The manifest: name, the pinned `key`, `permissions`, `externally_connectable` (built from `WXT_DASHBOARD_URL`), and the Ctrl+Shift+K command. Plus the React module and the Tailwind plugin. |
| `tsconfig.json` | Extends the generated `.wxt/tsconfig.json`, and adds `jsx: react-jsx`. |
| `vitest.config.ts` | Loads WXT's vitest plugin, which supplies the fake browser and the env values. |
| `env.d.ts` | Types the two `WXT_*` environment variables. |
| `.env`, `.env.example` | Two public values: the Convex deployment and the dashboard origin. `.env` is yours, copied from the example. |
| `.env.production` | The same two values for `npm run build`, the store build: the dashboard is `https://app.tabcake.com`. Tracked. |
| `package.json` | Six scripts. The `version` here is what ends up in the built manifest. |

## Repo root

| File | What it is |
|---|---|
| `README.md` | The front door. What this is, how to run it, a pointer here. |
| `CLAUDE.md` | The three working rules: versioning, never commit, keep these docs true. |
| `VERSION` | The current version. One line of semver, and the source of truth. |
| `tabcake.pem` | **The private key that pins the extension's id.** Gitignored, and it must stay that way. See [The pinned extension id](../how-it-works/the-pinned-extension-id.md). |
| `public/icon/` | Four PNGs. 128, 48 and 32 are `assets/logo/tabcake-mark.svg`; 16 is `tabcake-favicon.svg`, which is redrawn for that size. Rendered once with `sharp`; re-render them if the logo changes. |
| `docs/` | This guide. |

## Generated, and gitignored

| Path | What it is |
|---|---|
| `.output/` | The built extension. `chrome-mv3` from `npm run build`, `chrome-mv3-dev` from `npm run dev`. |
| `.wxt/` | WXT's generated TypeScript config and types. |

## What is not here

No side panel and no options page. No blocklist editor either — the popup blocks one site at a
time, and rules, groups and notes are edited from the dashboard. No state management library: the popup has
five states, a few message round trips, and a few subscriptions to storage.

No type-ahead in the search field. It searches when you press Enter, because each search embeds the
query on the server and that is a paid request — see [popup search](../how-it-works/popup-search.md).

No shadcn or Radix: two buttons and one card do not justify them. No Convex React client either. The
popup asks the background once per open rather than holding a live subscription, which removes a whole
category of problem given that the popup is destroyed every time it closes.

---

**Before this:** [Chrome extensions and WXT](chrome-extensions-and-wxt.md) · **Next:**
[Getting it running](../setup/install-and-run.md) · **See also:**
[The session](../how-it-works/the-session.md) · [Conventions](../reference/conventions.md) ·
[Index](../README.md)
