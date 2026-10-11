# Getting it running

For someone who has just cloned this repo. By the end you will have the extension loaded in Chrome and
know why you had to load it by hand.

## What you need

Node 20 or newer, npm, and Chrome. The backend is a hosted Convex deployment, so there is nothing else
to run — though pairing needs the dashboard running too, which is covered below.

## Build it

```
npm install
cp .env.example .env
npm run dev
```

`npm run dev` builds into `.output/chrome-mv3-dev` and rebuilds on every save. **Leave it running** —
the next section explains why that is not just advice.

It serves on **port 3100**, pinned by `dev.server.port` in `wxt.config.ts`. WXT would otherwise take
the first free port from 3000 up, which is the dashboard's, and the two would race for it.

## Load it into Chrome, once

WXT does not open a browser for you. Chrome 137 and later ignore the `--load-extension` flag it
relied on, so an auto-opened Chrome would come up without the extension — worse than not opening one.
That is what `webExt: { disabled: true }` in `wxt.config.ts` is for.

So, by hand:

1. Open `chrome://extensions`
2. Turn on **Developer mode**, top right
3. **Load unpacked**, and pick `.output/chrome-mv3-dev`

Once loaded, the dev build reconnects to WXT and reloads itself when you save. You only do this again
if you remove it or switch between the dev and production builds.

Check the id Chrome shows is `ngeaffckbmmghligcbeimhkedggfgcfa`. It is pinned, so it should be, and the
dashboard is configured against that exact value —
[The pinned extension id](../how-it-works/the-pinned-extension-id.md) explains why.

## The dev build is not a standalone extension

This is the one thing about WXT that will cost you an afternoon if nobody tells you.

`.output/chrome-mv3-dev` is a shell around the dev server. Stop `npm run dev` and the extension stays
in Chrome, keeps its icon, and quietly stops working:

| What breaks | Why |
|---|---|
| The popup opens blank | `popup.html` loads its scripts from `http://localhost:3100`. With nothing there, nothing runs. |
| Nothing is ever captured | The dev manifest has **no `content_scripts`**. In dev, WXT registers the content script at run time, over its websocket, so with no server it is never registered and the dwell timer never starts. |

The extension itself says nothing: no badge, no entry in the DB. The only trace is on its card at
`chrome://extensions` — `[wxt] Failed to connect to dev server`, with a refused WebSocket to
`localhost:3100` — and it stays there until you reload the extension, because the worker tries once
and does not retry. Compare
`.output/chrome-mv3/manifest.json` against `.output/chrome-mv3-dev/manifest.json` and you can see it:
only the production one declares a content script.

So: if capture has stopped, check that `npm run dev` is still running before you look anywhere else.

### For a demo, use the production build

`npm run build` writes `.output/chrome-mv3`, which is self-contained — the popup is bundled, the
content script is in the manifest, and no server has to be running.

It is also the store build, so it reads `.env.production`: it signs in through
`https://app.tabcake.com` and talks to the **prod** backend, not your local dashboard and the dev
one. For a demo against `localhost:3000`, copy the two lines from `.env` into `.env.production.local`,
which is gitignored and wins over `.env.production`, and rebuild:

```
WXT_CONVEX_URL=https://nautical-caribou-809.convex.cloud
WXT_DASHBOARD_URL=http://localhost:3000
```

Both lines, not just the dashboard. A local dashboard mints its link code on the dev backend, and an
extension built for prod would try to redeem it on prod, where it does not exist. Pairing then fails
as "invalid or expired code". Delete the file before you build for the store.

Switching between the two means **removing** the extension and loading the other folder, because both
carry the same pinned id and Chrome will not hold two. Removing it wipes `storage.local`, so you lose
the session and have to pair again. Reloading the *same* folder with the reload arrow keeps it.

## The three environment variables

All public. They end up in the built extension, which anyone can unzip.

| Variable | What it is |
|---|---|
| `WXT_CONVEX_URL` | The Convex deployment, `https://<deployment>.convex.cloud` |
| `WXT_DASHBOARD_URL` | The dashboard's origin. Where the popup sends people, and the only origin allowed to hand over a link code. |
| `WXT_SITE_URL` | The marketing site's origin. The consent screen links its `/privacy` page. |

They are read at **build** time, not run time, so changing `.env` needs a rebuild.

Which file they come from depends on the command:

| Command | Reads | Backend | Dashboard | Site |
|---|---|---|---|---|
| `npm run dev`, `npm test` | `.env` | dev, `nautical-caribou-809` | `http://localhost:3000` | `http://localhost:3001` |
| `npm run build`, `npm run zip` | `.env`, then `.env.production` on top | prod, `festive-porpoise-146` | `https://app.tabcake.com` | `https://tabcake.com` |

So the build command is the dev/prod switch: there is no variable to flip. The rest of the product
switches with `NEXT_PUBLIC_DEPLOY_ENV=production`; the whole picture is
`tabcake-server/docs/setup/going-to-production.md`.

`.env.production` is tracked, because it holds the values the Chrome Web Store copy ships with and
all are public. `.env` is not; you make it from `.env.example`.

`WXT_DASHBOARD_URL` also sets `externally_connectable` in the manifest: `wxt.config.ts` reads the
same files. That matters because the env value decides who the background trusts and the manifest
decides who Chrome lets through. They used to be two copies that had to be kept in step by hand, and
when they disagreed, pairing failed as if the extension was not installed. If neither file sets it,
the build stops and says so.

Note that `.env.example` is tracked and names this project's deployment. A second developer working
against their own deployment needs to change their local `.env`.

## To exercise pairing

Three things running:

1. `npx convex dev` in `tabcake-server` — or nothing at all, since the deployment is hosted
2. `npm run dev` in `tabcake_dashboard`, **on port 3000**
3. This extension loaded, per above

Port 3000 is not negotiable: it is what `.env` names, and so what `externally_connectable` allows, and it is the port the
dashboard's own docs pin. If something else holds 3000, Next quietly moves to 3001 and pairing fails
as "extension not found" — free the port rather than moving either side.

Then open the popup, click **Sign in with Tabcake**, and follow it through.

Once connected, **Ctrl+Shift+K** (or Command+Shift+K) opens the popup from any tab with the search
field focused. Chrome drops a suggested shortcut another extension already claimed, and never says
so — `chrome://extensions/shortcuts` is where you check, and where you rebind it.

## The checks

```
npm run compile      # wxt prepare && tsc --noEmit
npm test             # 55 tests, no browser needed
npm run build
```

`npm run compile` runs `wxt prepare` first, because the TypeScript config this repo extends is
generated. On a fresh clone, typechecking before preparing fails with confusing errors about missing
modules and JSX.

---

**Next:** [Running the tests](running-tests.md) · **See also:**
[Where output goes](debugging.md) · [Signing in](../how-it-works/signing-in.md) ·
[Chrome extensions and WXT](../orientation/chrome-extensions-and-wxt.md) · [Index](../README.md)
