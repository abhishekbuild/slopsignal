# tabcake_extension — the guide

Everything you need to work on the Tabcake Chrome extension, written for someone who has never seen it
before. This page is the index: every other page is listed here.

`tabcake_extension` is the Tabcake browser extension — [WXT](https://wxt.dev) on Manifest V3, React 19
and Tailwind v4. It talks to the Convex backend in the sibling `tabcake-server` repo, and it signs in
by pairing with the web dashboard in `tabcake_dashboard`.

Today it signs in, it captures, and it searches: read a page for fifteen seconds and it is sent to
the backend, remembered, and marked with a Butter dot on the toolbar icon. A page that was skipped
says why, you can pause capture, block a site, or forget the page you are on, all from the popup.
Ctrl+Shift+K from any tab opens the popup with the search field focused.
Nothing is sent until you have accepted the popup's first-run agreement, which the Chrome Web Store
requires.

Forty files, about 4,600 lines including the tests. Readable in a sitting.

## Read these first

In order, on your first day:

1. [What Tabcake is, and where this repo fits](orientation/what-is-tabcake.md) — the product, the
   three repos, and what this extension really does today
2. [Chrome extensions and WXT](orientation/chrome-extensions-and-wxt.md) — the four facts about
   Manifest V3 that shape every file here
3. [Getting it running](setup/install-and-run.md) — build it, then load it by hand, and why
4. [Where output goes](setup/debugging.md) — three consoles, none of them the one you have open
5. [A tour of the repo](orientation/repo-tour.md) — every file, one line each
6. [Signing in](how-it-works/signing-in.md) — pairing, from this side
7. [The session](how-it-works/the-session.md) — the most important file in the repo
8. [Page capture](how-it-works/page-capture.md) — what the extension is actually for
9. [Privacy controls](how-it-works/privacy-controls.md) — how to stop it, and how to say why
10. [Popup search](how-it-works/popup-search.md) — the other half of what the popup is for

## Every page

### Orientation — what this is

| Page | What it covers |
|---|---|
| [What Tabcake is](orientation/what-is-tabcake.md) | The product, the three repos, what works today |
| [Chrome extensions and WXT](orientation/chrome-extensions-and-wxt.md) | The sleeping worker, the disposable popup, async replies, and what WXT generates |
| [A tour of the repo](orientation/repo-tour.md) | Every file, one line each. Doubles as the file reference. |

### Setup — getting it working

| Page | What it covers |
|---|---|
| [Getting it running](setup/install-and-run.md) | Build, load unpacked, the two variables, and the port that is not negotiable |
| [Running the tests](setup/running-tests.md) | The fake browser, the mocked Convex client, and the two suites that need neither |
| [Where output goes](setup/debugging.md) | Three consoles, the worker that takes its logs with it, and how to trace pairing |

### How it works — the flows

| Page | What it covers |
|---|---|
| [Signing in](how-it-works/signing-in.md) | Pairing from this side, the origin check, and the popup's five states |
| [The session](how-it-works/the-session.md) | Token storage, single-flight renewal, and the two decisions in the error handling |
| [Page capture](how-it-works/page-capture.md) | The two halves, every reason a page is skipped, and where the dot comes from |
| [Privacy controls](how-it-works/privacy-controls.md) | The first-run agreement, pause, the blocklist, and the exact words for every skip |
| [Popup search](how-it-works/popup-search.md) | Why it searches on Enter, where the work happens, and why the rows carry letters |
| [The pinned extension id](how-it-works/the-pinned-extension-id.md) | Why the id must be stable, how it was derived, and what `tabcake.pem` is |

### Guides — doing a thing

| Page | What it covers |
|---|---|
| [Adding a message type](guides/add-a-message-type.md) | Which channel, the shape, and the `return true` that is not optional |
| [Publishing to the Chrome Web Store](guides/publish-to-the-chrome-web-store.md) | What to fix first, keeping the id, and every answer the dashboard asks for |

### Reference — looking something up

| Page | What it covers |
|---|---|
| [Conventions](reference/conventions.md) | Every rule this repo follows, and why |
| [Permissions](reference/permissions.md) | Every permission, what Chrome tells the user, and the ones deliberately not asked for |
| [Glossary](reference/glossary.md) | The words this repo uses without explaining |

### And

| Page | What it covers |
|---|---|
| [Changelog](changelog.md) | What changed in each version |

## How these docs are organised

Five folders, by what you are doing rather than by which part of the code it is:
`orientation/` for what this is, `setup/` for getting it working, `how-it-works/` for the flows,
`guides/` for tasks, `reference/` for lookups.

Every page is listed on this page. Every page ends with links to what to read before, next, or
alongside. The root `README.md` is only a front door — it points here and holds nothing this guide
does not.

If a page disagrees with the code, the code is right and the page is a bug. The rules for keeping
these current are in `CLAUDE.md` at the repo root.

## The other two repos

Sibling folders in the same workspace, and separate git repositories. Each has a `docs/` laid out
exactly like this one.

| Repo | Folder | Remote |
|---|---|---|
| Backend | `tabcake-server/` | `github.com/abhishekbuild/tabcake_server` |
| Web dashboard | `tabcake_dashboard/` | `github.com/abhishekbuild/tabcake_dashboard` |
| Chrome extension (this one) | `tabcake_extension/` | `github.com/abhishekbuild/tabcake_extension` |

Cross-repo references in these docs name a repo and a path rather than linking, because a relative
link out of a repo breaks and a link to a remote would point at a branch that lags behind local work.

The one to read early is `tabcake-server/docs/how-it-works/extension-pairing.md`, which is the
canonical account of the sign-in flow — the whole thing, rather than this repo's half.

Two more things live in the workspace and belong to no repo: **`assets/design.md`** v4.8, the
design system both clients follow (`entrypoints/popup/style.css` copies its light tokens from the
dashboard's `app/globals.css`), and `tabcake_app/extension/`, the retired prototype whose dwell timer
and text extractor were the starting point for capture.
