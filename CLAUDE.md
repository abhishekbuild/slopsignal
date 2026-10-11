# CLAUDE.md — tabcake_extension

The Tabcake Chrome extension: [WXT](https://wxt.dev) (Manifest V3), React 19 and Tailwind v4, talking
to the Convex backend in the sibling `tabcake-server` repo. It signs in by pairing with the dashboard
in `tabcake_dashboard` and then holds a session of its own.

**Read `docs/README.md` before changing anything.** It is the index to the full guide and it is kept
current on purpose — do not rediscover the codebase by grepping.

## Working rules

These three rules are not negotiable, and they are not defaults to be improved on.

### 1. Keep the version current

`VERSION` at the repo root is the single source of truth. One line, semver, no `v` prefix.

Bump it in the same change that earns the bump — once per coherent piece of work, not once per file
you touch:

| Bump | When |
|---|---|
| patch (`0.1.0` → `0.1.1`) | bug fix, docs, tests, refactor, dependency bump |
| minor (`0.1.0` → `0.2.0`) | a new capability someone can use, or a change to one that exists |
| major | reserved. Before `1.0`, breaking changes go in minor. |

In the same change, also:

- mirror the number into `package.json`
- add an entry at the top of `docs/changelog.md` saying what changed, in plain English

If you are unsure whether a change earns a bump, it does. An unbumped change is invisible.

WXT copies the version out of `package.json` into the built `manifest.json`, so never hand-write a
version into `wxt.config.ts`. Rebuild after a bump if you want the built manifest to agree.

### 2. Never commit, never push

You do not commit and you do not push. Not as the last step of a task, not because the work "looks
finished", not to "save progress", not to a branch, not to a fork. This repo has a GitHub remote
configured, so a stray `push` reaches the internet.

Read-only git is fine: `status`, `log`, `diff`, `show`, `branch --list`, `remote -v`.

Never run: `commit`, `push`, `add`, `rm`, `mv`, `restore`, `checkout <path>`, `switch`, `reset`,
`revert`, `clean`, `stash`, `rebase`, `merge`, `cherry-pick`, `tag`, `remote add`/`set-url`,
`gh pr create`, `gh release`, or anything carrying `--force`, `--hard` or `-f`.

Half of those destroy uncommitted work with no undo, and this workspace normally has uncommitted work
sitting in it. Read a git command's flags twice before running it, and prefer a file-reading tool over
`git show` when you only want to look at a file.

One extra reason for care here: `tabcake.pem` holds the private key that pins the extension's ID. It
is gitignored and it must stay that way. Never commit it, never print it, never move it out of this
folder.

If a commit really is the right next step, stop and tell the user the exact command. They run it. If
the user asks you directly to commit, repeat the exact command and the exact file list back to them,
wait for a yes, then do that and nothing more.

### 3. Keep docs/ true, and readable by a beginner

`docs/` is a complete guide for someone who has never seen this codebase. `docs/README.md` is the
index: every page is reachable from it, and there are no orphan pages. The root `README.md` is only a
front door — what this is, how to run it, and a link into `docs/`. Detail belongs in `docs/`, once.

Layout — put a new page in the folder that fits, and add a folder only when a fourth page needs one:

| Folder | Holds |
|---|---|
| `orientation/` | what this repo is, how its stack works, a tour of every file |
| `setup/` | getting it running, environment variables, tests, debugging |
| `how-it-works/` | the flows that matter, end to end |
| `guides/` | "I need to add X" recipes |
| `reference/` | lookup tables, conventions, glossary |
| `changelog.md` | what changed in each version |

**When you change behaviour, update the page that describes it in the same change.** A doc that
disagrees with the code is worse than no doc. The code wins; fix the doc.

Style:

- Plain English. Short sentences. Active voice. "You" for instructions, never "we".
- Open every page with one sentence saying who it is for and what they will know by the end.
- Explain *why*. The code already says *what*.
- Snippets only where they clarify. Never dump a file into a page.
- Link related pages at the bottom of each page. Relative links, kebab-case filenames, `.md`.
- Never write: seamless, effortless, simply, just, robust, leverage, powerful, unlock, supercharge.
- Never pad a page to look thorough. If a page holds nothing a reader could not get from five minutes
  with the code, make it a row in a reference table instead and delete the page.

Copy on screen (the popup, the toolbar title, the on-page button, a status a user reads):

- No em dash, anywhere a user can read it, including text built from what they typed. Use a full
  stop, a colon or a comma.
- Short, plain sentences that read like a person wrote them.
- No raw error: never an error's `message`, a stack or a server code. A `PageStatus` `error` is a
  sentence a person reads, and the detail goes to `console.error`.

## Commands

```
npm install
npm run dev          # dev server on :3100, rebuilds on save into .output/chrome-mv3-dev
npm run compile      # wxt prepare && tsc --noEmit
npm test             # vitest against a fake browser
npm run build        # production build into .output/chrome-mv3
```

WXT does not open a browser here (`webExt.disabled`), because Chrome 137 and later ignore
`--load-extension`. Load `.output/chrome-mv3-dev` unpacked once from `chrome://extensions`, and it
reloads itself after that.

The dev build is a shell around the dev server, not a standalone extension: its popup is fetched from
`localhost:3100` and its content script is registered at run time rather than by the manifest. With
`npm run dev` stopped it loads, shows its icon, and does nothing, silently. The dashboard is on 3000
and must stay there; the dev server is pinned to 3100 so they cannot take each other's port.

## Where things are

- `entrypoints/background.ts` — the service worker. The only holder of tokens.
- `entrypoints/popup/` — the popup UI. It asks the background for everything.
- `lib/auth.ts` — the whole session story: storage, refresh, pairing, sign out.
- `wxt.config.ts` — the manifest, including the pinned `key` and `externally_connectable`
- `docs/` — the guide; start at `docs/README.md`

Every visual decision comes from `../assets/design.md` v4.8, which lives in the workspace and is not
part of this repo. `entrypoints/popup/style.css` copies the light tokens from the dashboard's
`app/globals.css`; a token change goes design.md → dashboard → here (design.md §13). Never write a
raw ramp class, an arbitrary value or a hex in a screen. A file-by-file tour is in `docs/orientation/repo-tour.md`.
