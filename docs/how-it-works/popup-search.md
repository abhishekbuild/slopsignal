# Popup search

For anyone changing the popup's search field or the two calls behind it. By the end you will know
why the popup searches on Enter rather than as you type, why it shows letters instead of favicons,
and where the work actually happens.

## Why search is in the popup at all

The dashboard already has a search page and a ⌘K palette. The popup has search because the popup is
where you already are: the extension is what captured the page, so it is what you are looking at
when you think "I read something about this". Ctrl+Shift+K opens it from any tab, typing.

## The shape of it

```
┌─ 480px ─────────────────────────────────────────┐
│ ▰ Tabcake                       (A) Ada   [⎋]   │  40px: who, and Sign out
├─────────────────────────────────────────────────┤
│ ● Remembered · read 3 times  [Forget this page] │  the tab behind the popup,
│   Why bridges hum                               │  with the one control that
│   example.com · Indexed                         │  fits what happened to it
├─────────────────────────────────────────────────┤
│ ● Capturing   Pause for [15 min][1 hour][Until…]│  in every state
├─────────────────────────────────────────────────┤
│ [⌕ Search your memory                        ↵ ]│  h44, autofocused
│ Recent                                          │  an h2; the count is announced
│ (A) Why bridges hum                             │  the only part that scrolls:
│     example.com  4h ago                         │  one 52px row per page
│ (B) Beam resonance notes                        │
│     notes.example  2d ago                       │
├─────────────────────────────────────────────────┤
│ We’re listening. Your feedback shapes Tabcake.  │  feedback: two quiet
│ [Report a bug] [Share feedback]                 │  buttons to /feedback
├─────────────────────────────────────────────────┤
│ Open Tabcake ↗                  Reading rules ↗ │  36px
└─────────────────────────────────────────────────┘
                                             600px
```

Fixed at 480×600 once you are signed in, and only the list scrolls. Chrome caps a popup at 800×600
and scrolls the whole document, which would carry the search field off the top; scrolling the list
alone leaves the field where you put it. It was 400 wide until 0.23.0, half Chrome's maximum, and the
list showed two and a half pages (audit R-07). Every other state — loading, unreachable, signed
out, a deleted account — is one card, and stays content-sized, because a single card in a 600px
frame looks broken.

The order is fixed, and the tab comes first (audit §B): this page, capture, find, recent, feedback,
footer. There is no navigation. Anything with a list longer than eight is the dashboard's, and the
footer is the way in: **Open Tabcake** and **Reading rules**. Until 0.23.0 there were three ways to
the dashboard's Home — a header icon, the footer and every result — and none to the rules (E-12).

**Feedback** is one line and two quiet buttons, and both open the dashboard's /feedback page, which
has the annotation editor. The popup is not the place to write a report; it is the place you are
when something breaks. **Share feedback** opens /feedback. **Report a bug** first screenshots the tab
behind the popup, so the picture is of the page that went wrong rather than of the dashboard:

1. The popup calls `tabs.captureVisibleTab` and reads the tab's address and title with `tabs.query`.
   Both work because opening the popup granted `activeTab` for that tab
   ([Permissions](../reference/permissions.md)).
2. It sends `stashShot` to the background, which keeps the picture in `storage.session` under one
   key (`lib/shot.ts`). A second report replaces the first.
3. It opens `/feedback?shot=extension`. The page sends `takeShot` over the external channel and gets
   `{ok, shot?}`. The shot is handed over once, then deleted, and not at all after ten minutes.

The picture is JPEG at quality 90, not PNG. `storage.session` holds 10 MB, and a PNG of a 4K screen
full of photos can pass that once it is base64 text. A JPEG at 90 is a few MB and looks the same in
a bug report. Chrome refuses to capture its own pages and the Web Store; when capture or the stash
fails, the button opens plain `/feedback` and says nothing, because the popup closes as the tab
opens anyway.

**The header** is the lockup, the account (an avatar and a name, its email on hover) and a labelled
Sign out. The version, the page count and the dashboard icon left it in 0.23.0: the version was
clipped under the account pill, and it belongs on an About line (audit #29); the count is the
dashboard Home's heading. The signed-out card still names the version — "Installed in this
browser · v0.23.0" — and the address it will open, so you can confirm the install before you are
sent away.

**This page** is one sentence and at most one control, decided by `thisPageControl` in
`lib/this-page.ts` (audit E-05):

| The tab | The sentence | The control |
|---|---|---|
| being read | Reading… 9 s | Block this site |
| remembered | Remembered · read 3 times | Forget this page (then "Forget it" / "Keep it") |
| blocked by your rule | Blocked by your rule | Remove the rule |
| skipped for a reason allowing lifts | Skipped: this looks like a private page | Read it anyway |
| skipped for any other reason | Skipped: a search results page | none |
| could not be sent | Could not save this page: … | none |
| a page Tabcake never looks at | Tabcake does not read this kind of page. | none |

It could carry a forget icon, "Block {host}" and "Allow {host}" at once until 0.23.0. An allowed
site says "allowed" in its meta line; taking an allowance back, like every other rule, is on the
dashboard's Reading rules page.

**Capture** says whether Tabcake is reading, in every signed-in state (audit E-06): "Capturing" with
a group of three buttons named "Pause for" — 15 min, 1 hour, Until I resume — or "Paused until
18:19" with Resume. It said "Pause capture:" before three bare durations, so the resting state never
said capture was on. The three stay inline rather than behind a menu: 480px has room, and a menu
would be a dependency for three buttons.

**Find** shows up to eight results, and "No pages match" when there are none. **Open all results ↗**
opens the dashboard's `/memory?q=…` — it went through `/search`, which only redirected there. Emptying
the field goes back to **Recent**, five rows. The Ranked · Recent toggle went in 0.23.0 (E-09): two
17px words that read as a breadcrumb, for a choice the empty field already makes.

**Nothing you press is under 32px tall** (audit #24). The icon button is `Button size="icon"`, with
an `aria-label` and a matching `title`.

The signed-in popup has a visually hidden `h1` ("Tabcake"), the list's label is an `h2` at the
popup's 14/600, and a `role="status"` line announces what the list holds — "3 results for
bridges", "5 recent pages" — so a screen reader hears a search land without moving focus (audit #25,
A-09). The this-page sentence and the capture line are status regions too. While the list or the
session loads, the loader waits 300ms and then shows its words ("Searching your memory…"), so a
quick answer draws nothing (#30).

## It searches on Enter, and that is the point

Every search calls `search.queries.hybrid` on the backend, which embeds your query — a paid request to
OpenAI, per call. Searching per keystroke would multiply that by the length of what you type.

So the popup keeps two pieces of state: what is in the field, and what the last Enter actually ran.
Typing changes the first and costs nothing. Only submitting changes the second, and only that starts
a request.

The dashboard's ⌘K palette does debounce instead, at 400 ms. It can afford to: it is a bigger
surface people linger in, where the answer appearing as you type is most of the value. A popup
closes the moment you click a result.

There is a free alternative on the backend — `search.queries.keyword` is a real reactive query with
no embedding behind it — and the popup deliberately does not call it. It is the upgrade if Enter ever
feels like too much ceremony.

## Where the work happens

The popup holds no tokens, so it holds no search either. It sends a message; the background does it:

| Message | Handler | Backend call |
|---|---|---|
| `{ type: "search", query }` | `lib/search.ts` → `search()` | `search.queries.hybrid`, eight results |
| `{ type: "recent" }` | `lib/search.ts` → `recent()` | `pages.queries.list`, five rows |
| `{ type: "pageInfo", url }` | `lib/search.ts` → `pageInfo()` | `pages.ingest.status` |
| `{ type: "forget", pageId }` | `lib/search.ts` → `forget()` | `pages.forget.one` |

`entrypoints/background.ts` gets one line for each, because the rule here is that logic lives in
`lib/` where a test can reach it and entrypoints are wiring. `lib/search.test.ts` is that test.

None of them throws. The popup has to render something whatever happened, so a failure comes back as
a reply it can display.

The two lists give the three-way answer `me()` gives: signed out, the rows, or a sentence about not
reaching Tabcake. Which of the last two you get is not cosmetic — a rejected session is cleared by
`lib/auth.ts` and reads as signed out, so the popup offers to reconnect instead of a "try again"
that never would.

The other two answer `null`, or `false`. They feed the this-page row — a visit count, an index
state, the Forget button — and a figure that cannot be fetched is a figure the popup leaves out.
There is no sentence worth putting in its place. (A third, the page count for the header, went with
the header's count in 0.23.0.)

### One row shape

`search.queries.hybrid` returns rows keyed `pageId`, with a relevance score. `pages.queries.list` returns page
documents keyed `_id`, with capture fields. A reader sees one kind of thing in one list, so
`lib/search.ts` normalises both to `MemoryRow` — `{ pageId, title, domain, lastVisited, summary?,
tags?, status? }` — and the popup has one row component, `components/result-row.tsx`, rather than two.

**A result is a row, not a card** (since 0.22.0, audit #18 and #25). The card was a 150px
`<button>` with an `<h3>`, the summary and the tags inside it: the popup showed two and a half
results, and a screen reader heard each as one forty-word button. The row is 52px — a monogram, the
title, and the site and time under it — and the title is a link, so its name is the title alone. The
link's `href` is the page on the dashboard, which makes a middle-click or a copied address work; a
plain click goes through `openDashboard`, which also closes the popup. `summary` and `tags` still
arrive on the row shape and the popup does not draw them. `status` is the index state, which only `pages.queries.list` knows: a page reaches the vector index
only once it is indexed, so a search result is always `ready`.

The relevance score is the one thing dropped on the way through. It orders one result set and means
nothing outside it, so there is nothing honest to show.

## Letters, not favicons

A row carries the site's first letter on a disc, from `components/monogram.tsx`, which is a copy of
the dashboard's.

This is the rule, not a departure. design.md §1 makes "no remote favicons" a tenet of the system and
gives the reason: fetching a site's icon tells a third party what you have been reading. In this
extension it also costs Chrome's `favicon` permission, which adds *"Read the icons of the websites
you visit"* to the install dialog, next to the one the content script already costs — a second
warning at the moment someone is deciding whether to trust this. See
[permissions](../reference/permissions.md).

## The keyboard shortcut

`wxt.config.ts` declares `commands._execute_action` with Ctrl+Shift+K, or Command+Shift+K on a Mac.
`_execute_action` is Chrome's own command for opening an extension's popup, so it needs no
permission and no code. The field carries `autoFocus`, which is what turns "the popup opened" into
"you are typing".

A user can rebind or clear it at `chrome://extensions/shortcuts`, and Chrome silently drops a
suggested key another extension already claimed. Neither breaks anything — the toolbar icon still
opens the same popup.

## Nonsense results

A query that matches nothing still returns rows: the vector index returns its nearest neighbours and
the fused rank passes them on, so the popup's "No pages match." state is only
reached when the server sends zero rows. A client-side floor on the fused score cannot fix this — a
meaning-only match, which is the point of the product, scores the same as a nonsense nearest
neighbour (measured 2026-09-27; see the dashboard's `docs/how-it-works/search.md`). The honest fix is
a raw similarity from the backend, tracked as an open question.

From 0.20.0 to 0.21.0 a copy of the dashboard's `lib/summary.ts` hid a result's summary when the
model had written nonsense. The rows since 0.22.0 draw no summary at all, so the guard and its copy
were deleted.

---

**Before this:** [Page capture](page-capture.md) · **See also:**
[Privacy controls](privacy-controls.md) · [Permissions](../reference/permissions.md) ·
[Adding a message type](../guides/add-a-message-type.md) · [Index](../README.md)
