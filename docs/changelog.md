# Changelog

What changed in each version of `tabcake_extension`, newest first. Versions are semver and `VERSION`
at the repo root is the source of truth. `package.json` mirrors it, and WXT copies that into the built
manifest. The rules for bumping are in `CLAUDE.md`.

## 0.34.0 — 2026-10-10

**The popup follows the system's dark theme.**

- `entrypoints/popup/style.css` has a dark block under `@media (prefers-color-scheme: dark)` with
  design.md 5.5's dark palette, the same values as the dashboard's `.dark` block, every pair
  measured there. It names every colour token, not only the ones the dashboard overrides, because
  the popup's light block is still the 4.x palette and a white card or white-on-red text would
  otherwise show through. `color-scheme` follows, so the popup's scrollbar does.
- No choice in the popup: it has no settings screen. The mark's colours and the toolbar badge
  (`lib/palette.ts`) do not change.

## 0.33.0 — 2026-10-10

**Capture follows the account's settings, and a shortcut pauses it.**

- The dwell length and the form check are the account's now (server 0.62.0, set on the
  dashboard's Settings, Capture tab). `syncCapture` in `lib/settings.ts` reads them off
  `users.profile.me` on every sync and caches them under `local.capture`; the content script reads
  that key at start and through `storage.onChanged`. `parseCapture` in the new
  `lib/capture-settings.ts` (tested) reads anything missing or out of range as fifteen seconds and
  forms skipped, which is what capture did before.
- A `pause-capture` command, suggested `Alt+Shift+P`, pauses until resumed or resumes
  (`togglePause`).
- A new external message, `refresh`, syncs every cached setting at once, so a change saved on the
  dashboard applies in that browser before you leave the page.
- `lib/convex-api.ts` re-emitted from tabcake-server 0.62.0.

## 0.32.0 — 2026-10-09

**The extension names its session, for the dashboard's list of your browsers.**

- New `touchDevice` in `lib/settings.ts`: calls `users.devices.touch` (server 0.61.0) with
  `deviceLabel()` and `client: "extension"`. `refresh()` in the background runs it after the three
  list syncs, so on start and every thirty minutes. Quiet on failure.
- `lib/convex-api.ts` re-emitted from tabcake-server 0.61.0.

## 0.31.5 — 2026-10-09

**`lib/convex-api.ts` re-emitted** from `tabcake-server` 0.60.0: `chat.share.create`, `revoke` and
`get` are new, and `chat.messages.list` returns `shareToken`. The extension calls none of them, so
nothing here changes.

## 0.31.4 — 2026-10-09

**`lib/convex-api.ts` re-emitted** from `tabcake-server` 0.59.0: `chat.messages.ask` takes
`pageId`, `chat.messages.list` returns `about`, and `memory.search.pageHits` is new. The extension
touches none of them, so nothing here changes.

## 0.31.3 — 2026-10-09

**`lib/convex-api.ts` re-emitted** from `tabcake-server` 0.58.0: `chat.suggestions.get` and
`refresh` are new. The extension calls neither, so nothing here changes.

## 0.31.2 — 2026-10-09

**`lib/convex-api.ts` re-emitted** from `tabcake-server` 0.57.0: `chat.threads.list` takes a
`sort` and returns `lastAskedAt`, and `chat.threads.search` is new. The extension calls neither, so
nothing here changes.

## 0.31.1 — 2026-10-09

**`lib/convex-api.ts` re-emitted** from `tabcake-server` 0.56.0: `pages.queries.count` takes an
optional `since`. The extension never calls it, so nothing here changes.

## 0.31.0 — 2026-10-09

**A pasted link is marked as added, and no screen shows an em dash or a raw error.**

- The background sends `added: true` with a pasted link's `capture` (server 0.55.0), so the
  dashboard's Memory page lists it under "Added links". Only the background decides this, because
  only it knows it opened the tab.
- A failed capture no longer carries the thrown message. The popup and the dashboard now read "the
  page could not be saved", or "you have reached your plan's page limit". The detail goes to
  `console.error`.
- No em dashes on screen: the toolbar title reads "Tabcake: remembered" and so on, and the
  consent list and the video skip line were reworded.
- `CLAUDE.md` gains the copy rules. Docs: [privacy controls](how-it-works/privacy-controls.md).

## 0.30.0 — 2026-10-09

**Paste a link and Tabcake remembers it, without you opening it.** The popup has an "Add a link"
field, and the dashboard's Memory page asks the extension the same thing. The background opens the
link in a hidden, muted tab, and the page there is read exactly as if you had opened it, minus the
fifteen-second wait. Every other rule still applies: https and private hosts, search pages, too
little text, forms, consent, pause, your blocked list, sites Tabcake stopped reading, the
classifier, and redaction in the tab. The server still never fetches a page.

- New `lib/manual.ts`, a sibling of `lib/shorts.ts`: `indexUrl`, `isPageJob`, `finishPageJob`. Only an
  http or https address is ever opened. A link ending `.pdf` is turned away at once with the new
  skip reason `pdf` ("a PDF. Upload the file in Tabcake instead"), because no content script can
  read Chrome's PDF viewer. A tab that answers nothing in 30 seconds is given up on.
- New messages: `indexUrl` from the popup and from the dashboard (the reply carries `status`), and
  `pageJob`, which a page asks once to learn it should skip the wait. The background hands every
  status a job tab reports, remembered or skipped, to the job, so the page needs no reporting code.
- The popup gains "Add a link" above the feedback block, and an "Upload a document" button that
  opens the dashboard's Memory page. Documents are uploaded there, because a file picker closes the
  popup.
- Tests: new `lib/manual.test.ts`. Docs: [privacy controls](how-it-works/privacy-controls.md),
  [the session](how-it-works/the-session.md) and the [repo tour](orientation/repo-tour.md).

## 0.29.0 — 2026-10-09

**Feedback from the popup.** A line above the footer, "We’re listening. Your feedback shapes
Tabcake.", and two buttons that open the dashboard's new /feedback page.

- **Report a bug** screenshots the tab you are on, keeps it in `storage.session` (`lib/shot.ts`),
  and opens `/feedback?shot=extension`. The page collects the picture with a new external message,
  `takeShot`, which answers `{ok, shot?}`. The shot goes once and not after ten minutes. Where
  Chrome refuses a screenshot, such as a `chrome://` page or the Web Store, it opens `/feedback`
  without one.
- **Share feedback** opens `/feedback`.
- The screenshot is JPEG at quality 90, because a PNG of a large screen can pass the 10 MB
  `storage.session` holds.
- New permission: `activeTab`. It shows no install warning. Why it, and not `tabs` or a host
  permission, is in [Permissions](reference/permissions.md).
- New internal message `stashShot`; `ExternalReply` gains `shot`.

## 0.28.0 — 2026-10-09

**A host added to a preset is blocked.** Server 0.51.0 and dashboard 0.51.0 make the four built-in
presets editable, and this copy of `parseBlocklist` (`lib/rules.ts`) changes in step.

- `named()` keeps forcing a preset's shipped name but no longer strips the hosts this version does
  not ship. Without this, a host added to Banking & Finance on the dashboard would show as blocked
  there and be read here anyway, because the extension re-parses the account's list.
- The rule cap counts hosts added to a preset, as the server's does.
- `lib/rules.test.ts`: "a preset keeps a host you added" replaces "a preset cannot be made to carry
  hosts this version does not ship".

## 0.27.5 — 2026-10-09

**`lib/convex-api.ts` re-emitted** from `tabcake-server` 0.47.0: `memory.facts.list`, `remove` and
`clear`, and `users.profile.setLongTermMemory`, are new, and `me` carries `longTermMemory`. The
extension calls none of them.

## 0.27.4 — 2026-10-09

**`lib/convex-api.ts` re-emitted** from `tabcake-server` 0.46.0: `pages.progress.indexing` and
`pages.progress.retryFailed` are new. The extension calls neither yet. The popup could show the same
count later.

## 0.27.3 — 2026-10-06

**`lib/convex-api.ts` re-emitted** from `tabcake-server` 0.45.0: chat sources can be web results with
no `pageId`, and `users.profile.setWebSearch` is new. Nothing in the extension reads either.

## 0.27.2 — 2026-10-06

**`lib/convex-api.ts` re-emitted** from `tabcake-server` 0.44.0. Only chat's types changed: an answer
row can now be `working` and carries `steps`. Nothing in the extension reads chat.

## 0.27.1 — 2026-10-06

**`lib/convex-api.ts` re-emitted** from `tabcake-server` 0.43.0, which added billing. Nothing in the
extension calls the new functions. One behaviour to know about: a Free account now has 1,000 new
pages a billing period, and once they are spent `pages.ingest.capture` throws `PAGE_LIMIT_REACHED`.
This build reports that as a failed capture with the error's text; a dedicated "limit reached" state
is not built yet.

## 0.27.0 — 2026-10-05

**The store build talks to the prod backend.** `.env.production` pointed `WXT_CONVEX_URL` at the dev
deployment, so a store build would have signed in through `app.tabcake.com` and then saved everything
to dev. It now points at prod, `festive-porpoise-146`. `npm run dev` is unchanged and still uses dev.

- **New `WXT_SITE_URL`.** The marketing site's origin: `http://localhost:3001` in `.env` and
  `https://tabcake.com` in `.env.production`. The consent screen's privacy link is built from it, so
  `lib/consent.ts` no longer hardcodes `https://www.tabcake.com/privacy`.
- **A local demo of the store build overrides both URLs.** Getting it running says why: a link code
  minted on dev can't be redeemed on prod.

## 0.26.0 — 2026-10-03

**Nothing is sent until you agree to it.** The Chrome Web Store has required this since 1 August 2026.

- **The popup shows "Before Tabcake starts" after sign-in.** It says what is sent to your account,
  that Tabcake's servers and the AI services they use process it, and what is never sent, with a
  link to the privacy policy. **Start remembering pages** turns capture on; **Not now** closes the
  popup and changes nothing.
- **Capture refuses every page until then.** The check is in `lib/capture.ts`, straight after the
  session, so not even a page's address leaves. The popup says "Skipped: Tabcake is not turned on
  yet", and the YouTube button says "Turn on Tabcake in its popup first". A Short is refused before
  its background tab opens.
- **`lib/consent.ts` is new.** It stores the version agreed to and when, in `storage.local`. Signing
  out clears it. Raising `CONSENT_VERSION` shows the screen to everyone again, which is how a change
  to what is collected gets announced.
- One new internal message, `consent`, and one new skip reason, `no-consent`. `me` now also says
  whether this browser has agreed.
- Privacy controls, signing in, page capture, the repo tour and the publishing guide describe it.

## 0.25.0 — 2026-10-03

**The store build signs in through `app.tabcake.com`.**

- **`.env.production` is new and tracked.** `npm run build` reads it on top of `.env`, so the store
  build talks to `https://app.tabcake.com` and the same Convex deployment as before. `npm run dev`
  and `npm test` still use `.env` and `localhost:3000`. For a production build against a local
  dashboard, override it in `.env.production.local`.
- **`externally_connectable` is built from `WXT_DASHBOARD_URL`.** `wxt.config.ts` reads the same env
  files as the code, so the origin Chrome lets through and the origin the background trusts can no
  longer drift apart. The store build allows `app.tabcake.com` alone: `localhost` is not in it, so
  no local program can hand the extension a link code. A build with no dashboard URL now stops
  with an error instead of producing an extension that cannot sign in.
- Getting it running, signing in, conventions, the repo tour and the publishing guide describe the
  new arrangement.

## 0.24.2 — 2026-10-03

**A guide to publishing in the Chrome Web Store.** Nothing the extension does changed.

- **`docs/guides/publish-to-the-chrome-web-store.md` is new.** What to fix before a store build (the
  production URLs, the dashboard origin in `externally_connectable`, an in-product disclosure),
  how to keep the extension id on the first upload, draft listing copy, every Privacy practices
  answer, what the privacy policy has to cover, and the rejection codes to expect.
- **The pinned-id page was wrong about publishing.** It said to keep `key` in the uploaded zip. The
  store refuses a manifest with `key`; the first upload carries the private key as `key.pem`
  instead. The page now says so and links the guide.

## 0.24.1 — 2026-10-03

**The backend's API is generated, not hand-typed.** Nothing the extension does changed.

- **`lib/convex-api.ts` is new and generated.** `tabcake-server`'s `npm run api:emit` writes it from
  the functions the backend runs. `lib/api.ts` re-exports it and derives `User`, `PageSummary` and
  `SearchResult` from function return types. Only `auth.signIn` and `auth.signOut` stay hand-typed:
  they belong to Convex Auth, which declares no return types. A backend rename now fails to compile
  here after the next emit, instead of showing up only in the deployment log.
- **Page ids are typed.** The `forget` message and `forget()` in `lib/search.ts` take an
  `Id<"pages">` rather than a string, so the popup can only forget an id the backend handed it.
- Every function path was already current. One test file updated; the debugging, popup-search and
  repo-tour pages no longer describe the hand-typed file.
- `pages.video.recordAttempt` was typed in the old file but never called. It is still on the
  backend and in the generated file; nothing here calls it yet.

## 0.24.0 — 2026-09-29

**The YouTube button: back in the Shorts column, and a press that only remembers.**

- **On a Short the button is above Like again.** YouTube rebuilt the Shorts overlay
  (`reel-action-bar-view-model`), and the button had been spending ten seconds looking for the old
  column before settling in the bottom-left corner. It now knows the new name, the old one, and —
  for the next rename — the element the Like button sits in.
- **Pressing it on a Short keeps you on the Short.** The transcript still has to be read on the
  video page, so the background opens that page in a muted background tab, the button there reads
  and saves, the tab closes itself, and the Short's button says what happened. It used to take you
  to the video page and read in front of you. Three new messages (`rememberShort`, `videoJob`,
  `videoDone`), a new `lib/shorts.ts`, no new permission.
- **The transcript panel no longer appears after a save.** The page carries both of YouTube's
  transcript panels at once, and the close was going to the first one's button — the panel that was
  not open. Reading and closing now go to the panel that is actually open.

## 0.23.2 — 2026-09-29

**Docs: the dev build's card errors, and the reload.** `chrome://extensions` shows
`[wxt] Failed to connect to dev server` when the dev build's worker or popup started with no dev
server on 3100, and the worker never retries — so starting `npm run dev` afterwards does nothing
until you reload the extension (↻ or Alt+R). Debugging names the error and the step, and says a
missing YouTube button is the same missing content script. Install-and-run no longer claims the
card shows no error.

## 0.23.1 — 2026-09-28

**Signing out says so.** The popup's loader said "Checking…" while it signed out; it says "Signing
out…" now, as the dashboard does (audit #32). The stylesheet's note on dark mode follows the
dashboard's 0.39.0, which removed its unreachable dark tokens. The docs point at
`assets/design.md` 4.8.

## 0.23.0 — 2026-09-28

**Phase 10 of the audit fixes: the popup's layout.** Redesign §B, with E-05, E-06, E-07, E-09, E-11,
E-12, E-14, E-15 and R-07. `assets/design.md` is 4.7; no token changed.

- **480 wide, and the tab comes first.** The popup was 400, and its list showed two and a half
  pages. The order is fixed: the header, this page, capture, the search, the list, the footer.
- **The header is the account and Sign out.** The clipped version, the page count and the dashboard
  icon went. The signed-out card names the installed version and the address it will open.
- **This page is one sentence and one control.** "Remembered · read 3 times" with Forget this page,
  "Reading… 9 s" with Block this site, "Blocked by your rule" with Remove the rule, "Skipped: …" with
  Read it anyway where allowing the site would help — instead of up to three toggles at once. A page
  Tabcake never reads says so instead of drawing nothing. `thisPageControl` decides, and is tested.
- **The capture row says Capturing.** "Capturing" with Pause for 15 min · 1 hour · Until I resume,
  or "Paused until 18:19" with Resume, in every signed-in state.
- **Search shows eight results**, says "No pages match" when there are none, and "Open all results"
  opens the dashboard's Memory directly. The Ranked · Recent toggle went; an empty field is Recent,
  five rows, under an h2 at the popup's 14/600.
- **The footer is Open Tabcake and Reading rules**, the two ways into the dashboard. "Connected" went.
- **The error card gives one instruction** instead of repeating its heading.
- **The toolbar explains itself.** The paused badge is `II` on ink, not grey. The tooltip names each
  tab's state — "Tabcake — remembered", "— skipped this page", "— blocked here by your rule" — and
  says "Tabcake — paused" on every tab but a remembered one while capture is paused — a tab's own badge and title no longer
  hide the pause. A page opened during a pause says "Skipped: capture is paused", not "Reading…".
- **The YouTube button is ink and says Remember:** "Remember this video's transcript", "Remembered
  in Tabcake", "Could not remember that". Its disabled colours come from the palette.
- **`ping` sends the version**, for the dashboard's Install section.
- The popup's `count` message, its handler and its test are gone with the header's count.

## 0.22.3 — 2026-09-28

**The docs point at `assets/design.md` 4.6.** The spec's pass over the dashboard's Home, Reading
rules and Account (its 0.38.0) retired the stat tile and added a rule-group row; neither is in the
popup, and the `:root` token block did not change. The version number moves in `CLAUDE.md`, four
docs pages and the stylesheet's header comment.

## 0.22.2 — 2026-09-28

**The docs point at `assets/design.md` 4.5.** The spec's Chat rows changed for the dashboard's
0.37.0 — citation chips and a sources rail — and neither is in the popup; the `:root` token block
did not change. The version number moves in `CLAUDE.md`, four docs pages and the stylesheet's
header comment.

## 0.22.1 — 2026-09-28

**The docs point at `assets/design.md` 4.4.** The spec gained Tabs and a combobox for the dashboard's
Memory screens (its 0.36.0). Neither is in the popup, and the `:root` token block did not change, so
this is the version number in `CLAUDE.md`, four docs pages and the stylesheet's header comment.

## 0.22.0 — 2026-09-28

**Phase 6 of the dashboard's audit fixes, popup half: components.** Issues #24 and #25, and the
popup's share of #16, #18 and #30. The dashboard's half is its 0.35.0; `assets/design.md` is 4.3,
and the `:root` block did not change.

- **Nothing you press is under 32px tall.** The pause buttons, Ranked and Recent, Open Tabcake, the
  sign-out and forget icons, and the Block and Allow lines were 17 to 23px. `Button` gains
  `size="icon"` (32×32) and two variants, `quiet` for the header and footer icons and `danger` for
  the one destructive confirm.
- **Results are rows, and each is a link.** A result was a 150px `<button>` with an `<h3>`, the
  summary and the tags inside it, so the popup showed two and a half and a screen reader heard a
  forty-word button. It is now a 52px row — monogram, title, site and time — whose title is a link
  into the dashboard and the row's whole name. `components/result-card.tsx` became
  `components/result-row.tsx`.
- **The summary guard is gone.** Rows draw no summary, so `lib/summary.ts` and its test were
  deleted, and the popup stops loading Newsreader, which nothing in it used any more.
- **Headings and a live region.** The signed-in popup has a hidden `h1`, the list's label is an
  `h2`, the list's count is announced ("3 results for bridges"), and the this-page status line is a
  status region, so a block, an allow or a forget is heard.
- **One set of verbs.** "Never remember" is **Block {host}**, "Always remember" is **Allow {host}**,
  and "unblock" / "stop allowing" are "Remove the rule". The video button says "Could not", as the
  rest of the product does.
- **Forget asks first.** The bin turns into Forget it and Keep it; it used to forget on the first
  click.
- **Loaders wait 300ms and say what they are doing** ("Searching your memory…"), through a new
  `appear-late` class that mirrors the dashboard's.

## 0.21.0 — 2026-09-27

**Phase 5 of the dashboard's audit fixes, popup half: the token block and the popup's states.** The
light `:root` block is still byte-identical to the dashboard's `app/globals.css` (0.34.0), and both
follow `assets/design.md` 4.2.

- **The live dot is amber.** The dot beside a remembered page is `#8A5A00`, which can be seen on
  cream; Butter was 1.5:1. The toolbar badge stays ink on Butter.
- **Type:** `h1` 24 and `h3` 15/600 in the token block; the eyebrow is sans. The `↵` key hint, the
  account's page count, the version and the result card's footer are sans instead of mono; hosts
  stay mono.
- **Corners 8, spacing on the 4px grid.** `rounded-sm` (6px) is gone from the popup, and the half-step
  gaps and paddings moved to whole steps.
- **Disabled is a fill.** `Button` draws disabled as the muted surface and label at full opacity.
- **The focus ring no longer fades in**: `transition-colors` is redefined without `outline-color`.
- **One blue**: `accent-foreground` is ink.

## 0.20.0 — 2026-09-27

**Phase 2 of the dashboard's audit fixes, popup half.** A result whose stored summary is model
nonsense — a wall of `?` and dots — no longer shows that summary: `lib/summary.ts`
(`isReadableSummary`, copied from the dashboard) gates it in the result card. A relevance floor for
nonsense queries (audit Issue #7) stays backend-blocked; the reason and the measurement are in
`docs/how-it-works/popup-search.md`.

## 0.19.0 — 2026-09-27

**The first three fixes from the dashboard's UI/UX audit** (`tabcake_dashboard/docs/ui-ux-audit/`,
Issues #1, #5 and #8).

- **The dashboard origin is `http://localhost:3000` again.** It is the port the dashboard's own
  docs and dev script pin, and the one it was running on; the 3001 workaround from 0.14.1 left a
  first run that said "extension not found" to anyone who followed the documentation. `wxt.config.ts`,
  `.env.example` and the docs all say 3000. Reload the unpacked extension after this build, because
  the manifest changed, and update a local `.env` that still says 3001.
- **The popup renders Inter.** Chromium injects its own stylesheet into extension pages — a Segoe
  UI stack on `body` — as an unlayered author sheet, which beats anything inside Tailwind's
  `@layer base`. The family is now set on `html body` outside every layer, and
  `document.fonts.check("14px Inter")` is true in the built popup.
- **Tabcake never reads Tabcake.** The dashboard's own screens were being remembered, coming back
  in searches and being cited in answers. The content script refuses the dashboard origin before
  the allow waiver, the background refuses it again, and the popup says "Skipped · this is Tabcake
  itself". `lib/dashboard.ts` holds the one origin the background, the popup and the content script
  all read.

## 0.18.0 — 2026-09-27

**Blue accent and a larger logo**, following `assets/design.md` 4.1 and the dashboard's 0.29.0.

- Links, the focus ring and the selected sort are Harbour blue `#2B59C3`; Ember is only in the
  mark. The popup's light tokens are again a byte-for-byte copy of the dashboard's.
- `components/brand.tsx`, re-copied from the dashboard, draws the tabs' own bounds, so the logo
  fills its size. The header lockup is 22px and the signed-out card's is 40px.

## 0.17.0 — 2026-09-27

**A new logo, and a palette built from it**, following `assets/design.md` 4.0 and the dashboard's
0.28.0.

- **The logo is two overlapping tabs** — Butter behind, Tomato in front, Ember where they meet.
  `components/mark.tsx` (the old three-bar mark) is gone; `components/brand.tsx`, a verbatim copy
  of the dashboard's, draws the mark and the lockup. The popup header and the signed-out card use
  the lockup, with the wordmark in Manrope 800 (`@fontsource/manrope`, 800 only).
- **New toolbar icons.** `public/icon/*.png` are re-rendered from `assets/logo/`: the mark at 128,
  48 and 32, the favicon cut at 16.
- **Warm palette.** The popup's light tokens are a byte-for-byte copy of the dashboard's: Cream
  canvas, Ink `#1C1714` text and primary, Ember `#B8391F` links and focus ring, Butter `#F5C542`
  for live.
- **Live is Butter everywhere**, including the remembered badge and the video button on YouTube.
  The pause badge is warm grey on Cream. The three places that cannot read the stylesheet take
  their colours from one file, `lib/palette.ts`.
- **A new loader.** `StackLoader` is replaced by `Loader` (`components/loader.tsx`, copied from the
  dashboard): the mark with its back tab sliding, so the overlap shrinks and grows. One
  reduced-motion block now covers the loader, `page-in` and the live dot.

## 0.16.0 — 2026-09-25

**The YouTube button works on Shorts, and the transcript panel is never on screen.**

- **On a Short the button sits above Like, round like YouTube's own.** It shows only an icon — a
  bookmark, a spinner, a tick, an exclamation mark — and grows to the right on hover or focus to
  show its words. It appears at once; the fifteen-second wait on Shorts is gone. 0.15.0 placed it in
  the last watch page's owner row, which YouTube keeps in the DOM hidden, so nobody saw it; each
  kind of page now looks only for its own anchor.
- **Pressing it on a Short opens the Short as a video and saves it there.** The Shorts player has
  no transcript panel, and YouTube's transcript endpoint refuses anything that is not its own
  player — both checked — so nothing on a Shorts page can be read. The video page's button presses
  itself once on arrival; Back returns to the feed.
- **The transcript panel is no longer visible during a save.** Two fixes. The panel the February
  2026 UI opens carries a new id (`PAmodern_transcript_view`), which the 0.15.0 close did not know,
  so it stayed open; both ids are known now. And the panel is kept off screen while it is in use —
  out of the flow and invisible, by a style added for that second — so nothing on the page moves
  or appears. The description is no longer expanded either, unless YouTube hides the Show transcript
  button until it is.
- `lib/rules.ts` gains `videoId`, and the `send.ts` note in the repo tour names both `send` and `ask`.

## 0.15.0 — 2026-09-25

**The YouTube button tells the truth, reads English, sits by Subscribe, and leaves the page as it
found it.**

- **"Couldn't save that" after every save, including the ones that worked.** The button was reading
  the reply from `send`, which is fire-and-forget and has none, so the reply was `undefined` every
  time and every save was reported as a failure while the background saved it. `lib/send.ts` gains
  `ask`, which returns the background's answer, and the button now shows the same `PageStatus` the
  popup does: Saved to Tabcake (a revisit is a save), Sign in to Tabcake first, Tabcake is paused,
  Tabcake skipped this video, or Couldn't save that when there was no answer at all.
- **English first.** When the panel offers more than one language the button switches it to English
  before reading, a typed track over an auto-generated one. No English track: whatever YouTube
  opened with, as before.
- **The button sits in the owner row, after Subscribe.** It was fixed to the bottom-left corner, on
  top of the channel avatar. It now polls for `#owner` once a second for ten seconds and moves in
  when the row renders; after that, or on a Short, it takes the corner as before.
- **The page is put back.** Opening the transcript expands the description and opens the panel;
  both are closed again before the save is sent, and only if the button opened them. Nothing you
  can see changes except the button's label.
- The docs no longer claim a failed read is counted on your account. The counter exists on the
  backend and this extension has never called it.

## 0.14.1 — 2026-09-25

**The dashboard origin is `http://localhost:3001` for now.** Port 3000 is taken on the dev machine,
so Next lands on 3001 and pairing failed as "extension not found". `WXT_DASHBOARD_URL` in `.env`
and `externally_connectable` in `wxt.config.ts` both name 3001 now. Run the dashboard with
`npm run dev -- -p 3001` so it cannot drift back to 3000, and reload the unpacked extension after the
next build, because the manifest changed.

## 0.14.0 — 2026-09-24

**The popup now uses the same design as the dashboard: design.md v3.1.** It was still on v2.0.

- **No more teal.** Links and the selected sort are blue (`accent-strong`), the focus ring is blue,
  and the loader's three bars are one colour, the ink. The "Connected" dot is ink too. Everything
  else in the chrome is grey: icons and dots are `subtle`, secondary text is `muted-foreground`,
  which is now slate-600 so it stays readable on a hover. Site letters sit on grey discs, not tinted
  ones.
- **Bigger, simpler type.** Controls and labels are 14px (`ui`, was 13), small print is 12px
  (`meta`, was 10), and the serif summary is 16px. Inter Tight is gone; the wordmark is Inter at 600,
  and Inter 600 is now bundled so the browser does not fake it. The `@fontsource/inter-tight`
  package is removed.
- **Mono only for data.** Hostnames, the version and tags stay mono. Timestamps, "seen 3×", the
  "Connected" label, the pause buttons and what you type in the search field are sans. Figures use
  tabular digits, so the dwell counter no longer jitters.
- **Corners and edges.** Controls are 6px (were 4), the popup frame is 12px (was 16), a field's
  edge is a little darker so you can find it unfocused, and a result card's hover edge is grey.
- **Buttons follow design.md §7.** No focus classes of their own (the stylesheet draws the one
  ring), pressing nudges down 1px instead of shrinking, and a disabled button keeps its pointer
  events so its tooltip still shows.
- **The token block** in `entrypoints/popup/style.css` gains `subtle`, `accent-strong`, `success`,
  `warning`, the destructive and live surfaces, `border-strong`, `scrim`, `popover`,
  `shadow-modal`, `radius-xs`, the `title`/`body`/`ui` sizes and the `numeric` utility, and loses
  `brand-*`, `label`, `micro` and `font-display`. No screen writes a raw colour ramp or an
  arbitrary value any more.
- Docs now point at design.md v3.1 and say where the tokens really come from.

## 0.13.1 — 2026-09-23

**The video button now actually appears.** In 0.13.0 it never did, for anybody.

- **It was there the whole time, behind the masthead.** It hunted for `ytd-watch-metadata` and three
  other selectors to sit under the video title. Every one of them is empty when the content script
  runs: `document_idle` happens before YouTube renders the watch page. So it fell through to its
  fallback, `body.prepend`, which put it at the top of the document flow underneath YouTube's fixed
  masthead — in the DOM, styled, and invisible. The fallback's own comment said it would appear
  "rather than not appearing", which was the assumption that was wrong.
- **It is anchored to nothing now.** Fixed to the bottom left of the window on `document.body`,
  which always exists, so there is nothing to wait for and nothing to re-attach when YouTube rebuilds
  a subtree. The same on a watch page and a short, whose DOM shares nothing with it.
- **Bottom left, and hidden in fullscreen.** The right edge is where YouTube's own controls live on
  both surfaces, and a fixed element down there in fullscreen would sit on the play and volume
  controls.
- **Its position is inline and important, not `:host`.** The shadow root hides the button's insides
  from the page, but the host element is an ordinary div in the page's DOM, and a page rule matching
  it beats `:host` outright — that is the cascade, not a specificity contest.
- **Fixed: `youtube.com/watch?v=X&q=…` was read as a search results page.** `/watch` is one path
  segment, so the "a `q` at the top of a site is a search box" rule fired on it — and that check ran
  before the video check, so those addresses skipped as a search with no button at all. The gate asks
  whether it is a video first. A `/watch` address is a video whatever else is hanging off it, and
  YouTube's own search is at `/results`, which that rule does not match.
- **`lib/video-button.test.ts` is new**, and it asserts the host is a direct child of `body` — the
  assertion that stops anchor hunting coming back. It could not have caught the original bug, because
  happy-dom has no layout; that one is checked by eye.

## 0.13.0 — 2026-09-23

**Feeds are not read, and a YouTube video can be saved as its transcript instead.** The first thing
this extension has ever put into a page.

- **A fourth preset group, Social & Video**, matching the backend's. A feed is different every time
  you open it, so indexing the page buries the pages you actually read. `x.com`, `reddit.com` and
  `linkedin.com` are deliberately not in it.
- **A preset a stored list has never heard of is added when it is read**, which is the mirror of
  dropping one this version stopped shipping. Without it a group added later reached nobody who had
  ever synced a list. A group you switched off stays switched off.
- **A video page is never read.** The text of one is the sidebar, the comments and the up-next list.
  The dwell timer does not even start, so no text is extracted from a video at all.
- **A button on the video, offering its transcript.** Plain DOM in a shadow root — no React, which
  would be a hundred and forty kilobytes on every https page for one button, and no stylesheet, which
  would mean a build entry for eight rules. It needs no new permission.
- **A watch page gets it at once; a short waits fifteen seconds.** You open a watch page on purpose
  and scroll into a short, so a button on every short you flick past is an offer about something you
  did not choose to watch. Same dwell timer pages use.
- **It comes off when the address changes**, which on Shorts is every scroll. A button left behind
  would save the video you had just scrolled away from — the one way this can store something wrong
  rather than storing nothing.
- **Three readers for the transcript**, because YouTube changed this markup in February 2026: the
  classic element, the modern one, and a last resort that treats every `m:ss` in the panel as a line.
  None of them can reach outside the panel, so a break is an empty transcript and never the wrong
  text.
- **Each of the three ways it can fail says so.** "No transcript for this video" when YouTube offers
  no button, which is not a failure at all; "Couldn't read the transcript" when the panel opened and
  no reader found a line; and the ordinary network one. Only the middle is reported, as a count on
  your account — two integers a month, no video id, no address, no title.
- **The transcript is redacted like any other text that leaves.** People read card numbers and email
  addresses out loud.
- **`docs/reference/permissions.md` stopped saying Tabcake never changes a page**, because it now
  does — one button, on YouTube videos, removed when you leave. A promise the code does not keep is
  worse than the sentence that admits it.

## 0.12.0 — 2026-09-23

**Tabcake now stops reading a site it has already judged private three times.** The last phase of the
backend's indexing plan. Almost nothing here is new machinery — it is the grants cache again, with
the sign flipped.

- **A third cached list, `local.autoBlocks`.** The hosts the backend decided about, refreshed by
  `syncAutoBlocks` on the same `sync-settings` alarm as the other two, and cleared with them on sign
  out. These are guesses made from one account's browsing, so the next account in a shared profile
  must not inherit them.
- **The check sits in front of the verdict call, not behind it.** A page on a host Tabcake has
  already decided about never has its title or its headings leave this browser at all. Letting the
  backend answer would have sent them and been told the same thing again.
- **Matched on the exact hostname.** A rule for `app.example.com` does not reach `example.com`, in
  either direction.
- **Junk in that cache blocks nothing**, the same direction `grants` falls back in and the opposite
  of the blocklist. Forgetting one of these costs a call the backend refuses anyway; forgetting a
  blocked rule would read a site somebody banned.
- **Its own line in the popup**: "Skipped · Tabcake stopped reading this site". It is the only thing
  on screen that says a whole-site rule exists, which is why it is not folded into the classifier's
  wording.
- **Always remember this site still appears on one**, because an auto-block is a conclusion the
  classifier reached and a grant has waived the classifier since 0.11.0. One click is the way back
  from a guess this got wrong; the dashboard has the permanent undo.

## 0.11.0 — 2026-09-22

**You can tell Tabcake to read a site anyway.** Phase 3 of the backend's indexing plan, and the
first control here that says yes rather than no.

- **A second line in the popup, under the status.** "Always remember example.com" on a page that was
  skipped for a reason allowing the site can lift — the classifier judged it private, the classifier
  could not answer, it was not a secure address, or it was a private one. "Allowed · stop allowing"
  once it is on.
- **Not offered on a blocked page**, because the line above already offers to unblock it and a rule
  you wrote outranks a click here. Not offered on a page you did not read either: allowing a site
  does not make a search result worth keeping.
- **Scoped to the origin**, so `https://example.com` and `http://example.com` are different
  permissions, and so are a different port and a different subdomain. Stricter than the blocklist on
  purpose: blocking wants to cover a site, allowing wants to cover what you actually looked at.
- **The content script waives its two address rules for an allowed origin.** That is what makes old
  documentation on `http://` and your own dev server readable. The origins are cached in
  `local.grants`, read once when the script starts and kept current by `storage.onChanged`, so the
  answer is there synchronously and a site allowed in the popup reaches the tab you are standing on
  without a reload.
- **Stopping allowing from the popup never forgets pages.** One click has no room to explain what
  would go; the dashboard asks properly, and that is where the option lives.
- **The device label is `navigator.userAgentData.platform`** — "Chrome on Windows" — which needs no
  permission and no parsing. **Never an IP address.**
- **The refresh alarm is `sync-settings` now**, and it refreshes both cached lists. The old
  `sync-blocklist` alarm is cleared once on start so it does not go on firing at nothing.
- **Signing out clears the allowed sites too**, for the same reason it clears the blocked list: two
  accounts can share a browser profile, and the next one must not inherit permissions the last one
  gave.

## 0.10.0 — 2026-09-22

**Personal data is taken out of a page before any of it leaves, and a page is checked before its
text is sent at all.** Phase 2 of the backend's indexing plan.

- **`lib/redact.ts` runs in the tab.** API keys and JWTs, email addresses, IBANs, social security
  numbers, card numbers that pass a Luhn check, phone numbers, and any remaining run of ten or more
  digits. Over the page text, the title and every heading. Redacting here rather than on the server
  means what it matches never travels — a different promise from removing it on arrival.
- **The Luhn check is what keeps ordinary pages readable.** "order 5567" and "total 1200" survive; a
  real card number does not. The ten-digit rule is the one with a cost: ISBNs, long order numbers and
  epoch timestamps go with it. That is deliberate — a bare bank account number has no checksum and
  nothing else would catch it — and the losses are written into `lib/redact.test.ts` as losses, so
  nobody undoes them by accident.
- **The page is checked before its text is sent.** `lib/capture.ts` asks
  `pages.classify.verdict` first and only calls `capture` if the answer is yes, so **a page that gets
  refused has only ever had its address, title and headings leave this browser**.
- **`lib/signal.ts` is what the classifier sees**, and it has no body text and no query string in it:
  the origin and path, the redacted title and first twelve headings, whether there is a log-out link,
  whether the page is marked noindex, how many password and form fields and paragraphs there are, and
  whether a currency symbol appears. A test asserts the whole serialised object contains neither of
  the two things it must not.
- **Two new skip reasons.** "this looks like a private page" when the classifier refused it, and
  "could not check this page" when it could not answer. The popup still never says nothing.
- **No new permission, and no verdict cache in this browser.** The backend already keeps the decision
  per origin and path prefix, so a second page under the same prefix costs no model call; a second
  copy here would save one round trip on a path that has just waited fifteen seconds, and would be a
  third copy of a privacy decision to keep honest.

## 0.9.0 — 2026-09-22

**The address alone can refuse a page now, and every check runs again when a single-page app changes
route.** Phase 1 of the backend's indexing plan, and the first change to what gets captured since
capture was built.

- **HTTPS only**, and **no private or nameless host.** `isPrivateHost` refuses every IP literal, v4
  and v6, rather than listing the private ranges out; any host with no dot at all; and anything
  ending `.localhost`, `.local`, `.internal`, `.lan` or `.home.arpa`. The popup says "not a secure
  address" or "a private or local address" rather than going quiet.
- **A route change inside one document restarts everything.** `history.pushState` does not re-run a
  content script, so until now it was one capture per document, ever. Worse, the checks ran against
  the address at load while the address was read again at send time fifteen seconds later — so
  landing on an article and routing into search inside that window sent the search page under a gate
  that never saw it. `lib/route.ts` compares the address once a second, cancels the dwell timer in
  flight, and starts the list again. The address a page is sent under is now the one its checks ran
  against.
- **Polling rather than `webNavigation`.** A content script runs in an isolated world, so patching
  `history.pushState` cannot see the page's own calls; `webNavigation` would answer it and costs the
  "read your browsing history" install warning. No new permission.
- **The amber dot clears on a route change.** It was cleared only when a tab reported `loading`,
  which a same-document navigation never does, so the dot sat on a page nothing had looked at.
- **The `Localhost & Intranet` preset group is gone**, and a stored copy is dropped when the list is
  read, along with any other preset a later version stops shipping. `isPrivateHost` answers above the
  list and has no switch, so that group's switch would have changed nothing. Groups of your own are
  untouched, and a browser migrating one loses nothing else in its list.
- **No PDF check here.** Chrome renders a PDF in a privileged viewer that runs no content script, so
  there is nothing for this side to check. The backend refuses them.
- **A background handler that throws now answers.** `route` had no `catch`, so a throw left the popup
  or the content script waiting for a reply that never came. Fixed at the router, so it covers every
  message type rather than the one that surfaced it.

## 0.8.0 — 2026-09-22

**The blocked list belongs to your account now, and this browser keeps a copy.** Phase 0 of the
backend's indexing plan. What you block here shows up on your other computer, and the dashboard can
show the list without an extension installed. Nothing about what gets captured changed.

- **`browser.storage.local` still holds a `blocklist`, but it is a cache.** `lib/capture.ts` asks
  whether a host is blocked on the way out of every page you read, so that gate has to answer
  instantly and offline — it cannot wait on a round trip to decide whether to make a round trip.
- **A stale cache is safe, and that is the design.** `pages.ingest.capture` checks the account's
  list before it writes anything and answers `"blocked"` if the host is on it. So this copy never
  decides; it only saves a call. A cache an hour old, a build that has not synced, or anything else
  calling the backend directly all reach the same refusal.
- **The popup's block toggle writes the cache first and the account second.** The popup has no state
  of its own: it reads `local.blocklist` and re-renders on `storage.onChanged`. Writing the account
  first would leave the label saying the opposite of what was just clicked for the length of a round
  trip. A write the account refuses puts the cache back, and a line under the button says so.
- **This browser hands its list over once.** If the account has no list, this one becomes it. If it
  already has one, only the loose rules merge and the account's groups are left alone — a browser
  where nobody ever opened the settings reports all four preset groups as switched on because that
  is the default here, and reading that as a decision would switch Banking back on for someone who
  turned it off elsewhere. `migrateBlocklist` reads the raw storage key for that reason:
  `readSettings` would have handed back the presets.
- **The alarm listener reads `alarm.name`.** There are two alarms now — the pause expiry and a
  thirty-minute blocklist refresh — and the listener used to redraw the pause badge for any alarm at
  all. Correct with one alarm, quietly wrong with two.
- **Signing out clears the cached list and the migration flag.** Two accounts can share a browser
  profile, and a list left behind would block the next one's pages using the last one's rules.
- **`getSettings` and `setSettings` still answer**, because the dashboard ships separately and an
  older one still calls them. `setSettings` writes to the account now. A current dashboard reads the
  blocklist from the backend and only uses this channel for pairing and pause.

## 0.7.3 — 2026-09-22

**A build left in the browser keeps calling backend names that have gone.** Nothing in the code
changed; this writes down the failure mode 0.7.2 made possible, after it turned up for real in the
deployment log as `Could not find public function for 'users:me'`.

- **The tell is only in the Convex log.** No popup error, no red card on the extension, nothing in
  the extension's own console. `lib/api.ts` is written over `anyApi`, which builds a function name
  out of whatever you ask it for and never checks it against the backend, so a stale build fails
  quietly and completely — capture, popup search, the count and forget all stop working at once.
- **[Where output goes](setup/debugging.md) gains a section** naming the symptom, the fix (reload
  the extension, then `npm run build` if that does not do it) and the names to expect in the log:
  `pages/ingest:capture`, `users/profile:me`, `search/queries:hybrid`.
- **Why it can happen at all:** a Convex function's name is its file path. `tabcake-server` 0.13.0
  moved `convex/users.ts` to `convex/users/profile.ts`, which renamed `users:me` to
  `users/profile:me`. Reloading is what picks that up; the browser will not do it for you.

## 0.7.2 — 2026-09-22

**Every backend call this extension makes has a new name.** `tabcake-server` 0.13.0 reorganised its
`convex/` folder, and in Convex a function's name is its file path, so moving a file renames the
function. Nothing this extension does changed — same calls, same arguments, same replies, same 79
tests passing.

- **This build needs `tabcake-server` 0.13.0 or newer.** Against an older deployment every call but
  sign-in resolves to nothing. The two repos have to be deployed together.
- **The nine names.** `pages.capture` and `pages.status` are now `pages.ingest.*`; `pages.list` and
  `pages.count` are `pages.queries.*`; `pages.forget` is `pages.forget.one`; `users.me` is
  `users.profile.me`; `search.hybrid` is `search.queries.hybrid`.
- **Sign-in did not move.** `auth.signIn` and `auth.signOut` are pinned at the backend's root,
  because the auth library has those names written into its own code. So pairing, refreshing and
  signing out are untouched, provider id included.
- **The compiler could not have caught this, and still cannot.** `lib/api.ts` is a hand-typed facade
  over `anyApi`, which resolves any path at all, so a stale name fails in the browser rather than at
  the keyboard. Reshaping the facade first is what made `tsc` point at the four files that call it.
  The tests could not catch it either: they replace `convex/browser` and never look at the path.
- **Three stale counts fixed while in there.** `lib/api.ts` claimed it typed five backend functions,
  the repo tour said eight and the glossary said four. It is nine.

## 0.7.1 — 2026-09-20

Every cursor in the popup is now deliberate.

- **The result card and "See all results" did not say they were clickable.** Tailwind v4 stopped
  giving `<button>` a pointer cursor, so a control only has one if someone wrote it — and on a card
  where the whole surface is the button, the arrow is the only thing telling you it opens.
- **Display-only elements take `cursor-default`**: the wordmark and version, the account pill, the
  sync state, the list heading, the pause label. None of them does anything when clicked, so none of
  them offers an I-beam over text nobody wants to select.
- The rule was missing from the design system, which is why it was applied unevenly here. It is now
  **design.md §6, Cursors**, and summarised in [Conventions](reference/conventions.md). The check
  that caught this is worth repeating: every hand-rolled `<button>` must name a cursor, and there
  are ten of them.

## 0.7.0 — 2026-09-20

The popup is rebuilt from the production screen, and it is on the design system the rest of the
product moved to months ago.

- **design.md v2.0.** `sand` is gone and the neutral is stock `slate`; `tab` is gone and the warm
  signal is stock `amber`; the brand green is a brand teal; and **the primary action is near-black**,
  because black is the committed action and teal is brand presence. `entrypoints/popup/style.css` is
  the new token block, and the five files that named a ramp stop by hand now name a token instead.
  The toolbar badge colours moved too — they are painted by `chrome.action`, which has no stylesheet
  to read, so they are written out in `lib/capture.ts` and `lib/settings.ts`.
- **A result is a card now**, not a row: the site, when you read it, the title, what the model made
  of it in serif, and its tags. The popup loads Newsreader for the first time, because a summary is
  text the product remembered rather than text the product wrote, and the system admits no third
  case.
- **The list already had a summary and tags and was throwing them away.** `search.hybrid` and
  `pages.list` have returned both all along; `lib/search.ts` dropped them on the way to `MemoryRow`.
  It keeps dropping `relevance`, which is deliberate and unchanged: a fused rank orders one result
  set and means nothing outside it.
- **Ranked or Recent**, once a search has run. Both calls already existed.
- **The page you are on has a name.** The content script sends its title and address alongside the
  hostname it already sent — all three are free in the tab and would each cost the `tabs` permission
  anywhere else. Under it: how long you have been reading, how many times you have been here, and
  whether the page finished indexing.
- **You can forget the page you are on**, from the panel. Needs server 0.11.0: `pages.forget`
  existed already, but `pages.status` had to start returning the id, since a tab knows its address
  and never its id.
- The header carries the version and how many pages you have kept; the footer carries the session
  state and the one link out. The window is a fixed 400×600 when you are signed in and content-sized
  when you are not, because a single card in a 600px frame looks broken.

## 0.6.0 — 2026-09-19

The dashboard can pause capture, and presets keep their names current.

- **`pause` is now an external message.** The dashboard's topbar can pause for a while or until you
  turn it back on, using the same `setPause` the popup uses — badge and expiry alarm included.
  `getSettings` answers with `pauseUntil` so the page draws the real state instead of guessing.
  Pause is still per-browser, because the decision to read a page is made here and made offline.
- **A preset wears the name this version ships.** Preset names cannot be edited, only switched off,
  so a stored copy of older wording would have shown forever. What is *inside* a preset is left
  exactly as stored, because that part you can change.
- The four presets are renamed to match the product screens: Webmail & Chat, Banking & Finance,
  Health Portals, Localhost & Intranet. Their contents and their ids are unchanged.

## 0.5.0 — 2026-09-19

A blocked site is a rule now, not a string. The dashboard's new Blocked domains screen needed
somewhere to put what it shows, and this is that place.

- A rule carries a **scope**, a **note** and a **switch**. Scope is `domain`, which blocks a host
  and every subdomain, or `host`, which blocks that one hostname — so you can block your webmail
  without blocking the company site. A bare hostname still means `domain`, which is what it has
  always meant here, and the dashboard writes that as `*.example.com`.
- Switching a rule off keeps it and stops enforcing it. Lifting a block no longer means losing the
  rule and typing it again later.
- The nine default hostnames are now **four groups** — webmail & chat, banking & payments, health,
  local & intranet — each with its own switch, so you can keep the banking block and drop the
  webmail one. They are still defaults rather than seeded data: nothing is written to storage until
  you first change something.
- You can make groups of your own, name them, and switch a whole group at once.
- **An old stored list goes on blocking exactly what it blocked.** Every entry migrates to a
  `domain`-scoped rule, because reading them as `host` would quietly stop blocking
  `www.paypal.com` for anyone blocking `paypal.com`. The presets arrive switched off in that case:
  an old list replaced the defaults outright, and turning them back on would re-block a site
  somebody had deliberately removed. There is no install hook — `toBlocklist` in `lib/rules.ts` is
  the migration, and it runs wherever the value is read.
- `getSettings` now answers with the document, a flat list of hostnames, and a schema number. The
  flat list is there so a **dashboard built before this** keeps working instead of showing an empty
  box one Save away from clearing your blocklist. The schema number is how a current dashboard
  knows it can offer the rule controls at all.
- Unblocking from the popup now reaches inside groups, including the presets. It used to filter one
  flat list, and a rule left inside a group would have gone on blocking a site the popup had just
  said was unblocked.
- Three validation limits, refused whole as before: 500 rules across the document, 20 groups, and a
  note of 120 characters.

## 0.4.0 — 2026-09-18

Search, where you already are. The extension is what captured the page, so it is what you are
looking at when you think "I read something about this".

- Added a search field to the top of the popup. Type what a page was about in your own words and
  press Enter; five results, each one opening the stored page in the dashboard, and a link through
  to the full set. The backend does the work — a meaning search and a word search, merged.
- **Ctrl+Shift+K**, or Command+Shift+K, opens the popup from any tab with the field focused. That
  is Chrome's own `_execute_action` command, so it costs no permission and no code.
- With the field empty the popup shows the last five pages you remembered, under this page's status
  and the pause controls. Start typing and results take their place. That swap is what makes
  design.md's 400×600 popup enough without tabs, and it means nothing you could reach before is
  hidden now.
- **It searches on Enter, not as you type.** Each search embeds the query on the server, which is a
  paid request. The dashboard's ⌘K palette debounces at 400 ms instead, because it is a surface
  people linger in; a popup closes the moment you click a result.
- The account card became a footer line — "Open Tabcake", the email, and sign out. An email address
  is not worth a third of the window once there is something to search in it.
- **No new permission.** The build plan had the results carrying real favicons from the browser's
  cache, which needs Chrome's `favicon` permission — and that one is not silent: it adds "Read the
  icons of the websites you visit" to the install dialog, beside the warning the content script
  already costs. Rows carry the site's first letter on a disc instead, the same as the dashboard's
  memory list. `permissions` is still `["storage", "alarms"]`.
- Added [permissions](reference/permissions.md), which is every permission, the warning Chrome shows
  for it, and the ones deliberately not asked for. Step 5.2 of the build plan finishes it as the
  store listing form.
- Added `lib/search.ts` for the two calls behind the field, so `background.ts` stays two more lines
  of wiring. Neither call throws: the popup must render something whatever happened, so a failure
  comes back as a reply. A revoked session reads as signed out and offers to reconnect; an
  unreachable backend keeps the session and says so.
- `search.hybrid` returns `pageId` and `pages.list` returns `_id`. Both are normalised to one row
  shape in `lib/search.ts`, so one component draws what a reader sees as one kind of list.
- Added `entrypoints/popup/ask.ts`. `App.tsx` and `controls.tsx` each had their own copy of the
  round trip to the background and search would have been the third.
- Eight new tests, and the suite is 63.
- Brought [what Tabcake is](orientation/what-is-tabcake.md), the repo tour and the docs index back
  in line: all three still said pause and the blocklist were yet to come, and they shipped in 0.3.0.

Nothing about capture, pairing or the session changed.

## 0.3.2 — 2026-09-17

Fixes an extension that loaded, showed its icon, and did nothing: a blank popup and not one page
captured.

- The WXT dev server now has its own port, 3100, pinned by `dev.server.port` in `wxt.config.ts`. It
  used to take the first free port from 3000 up — which is the dashboard's, and the dashboard cannot
  move because `externally_connectable` names it. The two raced for 3000 on every start and the loser
  failed with no message at all. When the dashboard won, the popup fetched its scripts from Next and
  rendered nothing; when the extension won, pairing broke instead.
- Wrote down the thing underneath it, which no config can fix: **a dev build is not a standalone
  extension.** Its popup is served by `npm run dev`, and its content script is absent from the dev
  manifest and registered at run time over the dev server's websocket. Stop the server and capture
  stops, silently. [Getting it running](setup/install-and-run.md) says so where you first read about
  `npm run dev`, [Where output goes](setup/debugging.md) has the symptoms and the three checks, and
  [Chrome extensions and WXT](orientation/chrome-extensions-and-wxt.md) has the dev-versus-build
  table.

No source file outside `wxt.config.ts` changed and the 55 tests are untouched: the bug was in how the
extension is served in development, not in what it does.

## 0.3.1 — 2026-09-16

- `setSettings` now accepts `blocklist: null`, which forgets the stored list so the defaults apply
  again. That is what the dashboard's "Reset to defaults" sends, and it means the default list never
  has to be copied into the dashboard to be offered back — it stays in `lib/rules.ts` alone.

Three lines and a test. Nothing else changed.

## 0.3.0 — 2026-09-16

You can stop it now. Capture has had gates since 0.2.0 and nothing that could open or close them;
this is the half that was missing.

- Added a pause control to the popup: fifteen minutes, an hour, or until you resume. While paused the
  toolbar icon carries a grey `II`, and the popup says when it ends.
- A timed pause sets an `alarms` alarm for the moment it expires, because nothing else would redraw
  the badge and a badge that goes on claiming "paused" is worse than none. The badge is also
  reconciled with storage when the service worker starts, which covers a browser restart.
- Added a block toggle to the popup: "Never remember news.example.com", and "Blocked · unblock …"
  once it is. A toggle rather than a one-way button, so blocking something by accident is undoable.
- The popup gets that hostname from the content script, which sends it with the page status. Reading
  `tab.url` would have worked and would have cost the `tabs` permission and its "read your browsing
  history" install warning, for a string the extension already had.
- Added `getSettings` and `setSettings` on the external channel, for the dashboard's blocklist editor
  in the next step. Same pinned origin and same `sender.origin` check as pairing. A payload is stored
  whole or refused whole: `parseBlocklist` wants an array of at most 500 hostnames and rejects the
  lot if any one fails.
- Added `lib/settings.ts` as the only reader and writer of both settings, so the stored value, the
  badge and the alarm cannot drift apart. `lib/capture.ts` reads through it and gets shorter.
- Split the popup's two storage-backed controls into `entrypoints/popup/controls.tsx`. `App.tsx` was
  about to pass the 250 lines at which the plan says to split it.
- `permissions` gains `alarms`. It shows no install warning, and there is still no `tabs` permission
  and no host permission.
- Thirteen new tests, and the suite is 54.

The build plan had this step seed the default blocklist into storage on install. It does not: 0.2.0
already made an absent list read as the defaults, so seeding would be dead code and one more way for
an install to go wrong.

## 0.2.2 — 2026-09-16

- Fixed `Uncaught Error: Extension context invalidated` appearing in every page that was open when
  the extension reloaded. A reload destroys the context of a content script already injected into a
  page while the script keeps running, and `sendMessage` then throws rather than rejecting — so the
  `.catch` that was there could never run.
- Moved the content script's send into `lib/send.ts`, where it is tested. It now survives both
  failures: a rejected promise when the background is asleep or the page is closing, and a
  synchronous throw when the extension has gone. Three tests, one per case.

No behaviour changed. It affected `wxt dev` on every save, and would have affected every open tab on
a Web Store update.

## 0.2.1 — 2026-09-16

- Fixed a run of `Uncaught (in promise) Error: No tab with id` in the background console. Closing a
  window logged one per tab. `tabs.onRemoved` fires after the tab has gone, so the badge call that
  cleared its dot was always for a tab that no longer existed.
- Every per-tab badge call now goes through one place and tolerates a missing tab, rather than only
  the call in the stack trace: the same race exists when a tab closes mid-navigation, and when it
  closes during the round trip to the backend. Storage is unaffected and still has to succeed.

No behaviour changed. Nothing was captured or lost that would not have been before; the errors were
noise, but noise that would have hidden a real one.

## 0.2.0 — 2026-09-16

The extension captures. Read a page for fifteen seconds and it is remembered; skip it and the popup
says why.

- Added `entrypoints/content.ts`, a content script on every http and https page. It skips search
  results pages, pages that returned an error, pages with under 500 characters of readable text, and
  pages that are mostly a form — then waits for fifteen seconds of **visible** dwell before sending
  anything. Time on a hidden tab does not count.
- Added `lib/extract.ts`, ported from the retired prototype: semantic blocks under `article`, `main`
  or `body`, with the page furniture dropped when there was no markup to go on.
- Added `lib/rules.ts` — the search-page rules, the form heuristic, and the default blocklist. The
  defaults apply whenever nothing is stored, so webmail, chat, money and health domains are never
  captured even before there is a way to edit the list.
- Added `lib/dwell.ts` and `lib/capture.ts`. `capture.ts` is the last gate before a page leaves the
  browser: signed out, paused, or a blocked domain, each with its own reason, and only then the call
  to the backend.
- Added a status line to the popup, under the account card. It reads `browser.storage.session`
  directly and subscribes to changes, so it updates live without a message or a poll.
- A remembered page puts an amber dot on that tab's toolbar icon. It is cleared when the tab
  navigates away and when it closes.
- Added `pages.capture` to `lib/api.ts`, and rewrote its `ponytail:` note: the upgrade path is a
  committed `.d.ts` snapshot, not an npm workspace, because a workspace root that is not a git
  repository stops this repo building on its own.
- `lib/auth.ts` now exports `client` and `withFreshToken`. Nothing else in it moved — capture uses
  the same one retry and the same two error decisions as reading the user.
- The manifest gained `incognito: "not_allowed"` and `minimum_chrome_version: "110"`. Still no `tabs`
  permission and no host permissions.
- Twenty-seven new tests, in four new files. The suite is 37 tests and still runs with no browser, no
  network and no key. `happy-dom` joins as the only new dependency, for the one suite that needs a
  DOM.
- Moved `guides/add-page-capture.md` to [page capture](how-it-works/page-capture.md) and rewrote it
  from a map of where the feature would attach into the flow as built.

Chrome now shows "Read and change all your data on all websites" when this is installed. That is
unavoidable for any extension that can see page text; Tabcake reads and never changes a page.

## 0.1.1 — 2026-09-07

- Added this guide: `docs/` now holds a complete walkthrough of the extension for someone new, indexed
  by `docs/README.md`.
- Added `CLAUDE.md` with the three working rules — keep the version current, never commit or push,
  keep these docs true — including the reminder that `tabcake.pem` must never be committed.
- Started versioning. `VERSION` is the source of truth, `package.json` matches it, and the built
  manifest reports it.
- Trimmed `README.md` to a front door. Everything it used to explain now lives in `docs/`.

No behaviour changed. No entrypoint, message type or manifest field was touched.

## 0.1.0

Reconstructed after the fact — this version was not recorded at the time. It is what the repo already
contained when versioning began.

- The extension scaffolded on WXT with React and Tailwind v4, Manifest V3, built with a pinned
  `manifest.key` so the id is `ngeaffckbmmghligcbeimhkedggfgcfa` on every machine.
- Sign-in by pairing with the dashboard: the popup opens the connect page, the background trades a
  one-time code for a Convex Auth session of its own, and stores it in extension storage. The
  extension deliberately does not share the dashboard's session, because a refresh token used from
  two places invalidates both.
- The background service worker as the only holder of tokens, with single-flight renewal, a rejected
  renewal clearing the session, and a network failure keeping it.
- A popup with five states: loading, signed out, signed in, account deleted, and unreachable. It holds
  no state of its own and asks the background on every open.
- `externally_connectable` limited to the dashboard origin, plus a second origin check in the
  background, so no other page can sign this browser into an account.
- Ten tests over the session logic, running against a fake browser with no Chrome and no network.
- The design system from `assets/design.md` as tokens in `entrypoints/popup/style.css`, with fonts
  bundled so the popup does not flash on every open.
- No page capture: no content script, and no capture mutation on the backend to call.
