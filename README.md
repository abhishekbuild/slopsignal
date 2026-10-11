# Tabcake for Chrome

Tabcake remembers what you read on the web, so you can find it again later. This repo is the Chrome
extension: it notices the pages you actually read, sends them to your Tabcake account, and lets you
search them from the toolbar.

Created by **Abhishek Gupta** at the **Scalar Vibe Sprint**.

## What it does

- **Captures what you read.** Stay on a page for fifteen seconds and it is remembered. A Butter dot
  on the toolbar icon says so. The dwell time and the form check follow your account's settings.
- **Searches your memory.** Press `Ctrl+Shift+K` on any tab to open the popup with search focused.
- **Puts you in control.** Pause capture (`Alt+Shift+P`), block a site, or forget the page you are
  on, all from the popup. A skipped page tells you why.
- **Asks first.** Nothing is sent until you accept the first-run agreement.
- **Signs in by pairing** with the Tabcake web dashboard, then holds a session of its own.
- **Follows your system theme**, light or dark.

## Built with

[WXT](https://wxt.dev) on Manifest V3, React 19, Tailwind CSS v4, and a [Convex](https://convex.dev)
backend. Tests run on Vitest with happy-dom.

## Run it

You need Node.js 20 or later and Chrome.

```
npm install
cp .env.example .env
npm run dev          # dev server on :3100, rebuilds into .output/chrome-mv3-dev on every save
```

Then load it into Chrome once:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick `.output/chrome-mv3-dev`.

After that it reloads itself when you save.

**Leave `npm run dev` running.** The dev build is a shell around its server. Stop the server and the
popup opens blank and nothing is captured, with no error. For a demo with no server, run
`npm run build` and load `.output/chrome-mv3` instead.

To test sign-in you also need the dashboard running on **port 3000**. It is the only origin the
extension accepts messages from, which is why the dev server sits on 3100.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with live reload |
| `npm run compile` | Generates WXT types and type-checks |
| `npm test` | Runs the unit tests, no browser needed |
| `npm run build` | Production build into `.output/chrome-mv3` |
| `npm run zip` | Packages the build for the Chrome Web Store |

## Configuration

| Variable | What it is |
|---|---|
| `WXT_CONVEX_URL` | The Convex deployment the extension talks to |
| `WXT_DASHBOARD_URL` | Where "Sign in with Tabcake" opens, and the only origin allowed to pair |
| `WXT_SITE_URL` | The marketing site, linked from the privacy disclosure |

Local values go in `.env` (copied from `.env.example`). Production values are in `.env.production`.

## Project layout

```
entrypoints/
  background.ts    the service worker, and the only holder of tokens
  content.ts       runs on each page: dwell timing and extraction
  popup/           the popup UI
lib/               session, capture, search, privacy rules (tests sit beside each file)
components/        shared React components
docs/              the full guide
wxt.config.ts      the manifest, including the pinned extension key
```

## Learn more

[docs/README.md](docs/README.md) is the full guide, written for someone new: how Manifest V3 shapes
the code, a tour of every file, how sign-in, the session and page capture work, and how to publish to
the Chrome Web Store. What changed in each version is in [docs/changelog.md](docs/changelog.md).

## Author

Abhishek Gupta built Tabcake at the Scalar Vibe Sprint.
