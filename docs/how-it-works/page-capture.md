# Page capture

For anyone changing what gets remembered, or working out why a page was not. By the end you will know
the two halves capture is split into, every reason a page can be skipped, and where the per-tab dot
comes from.

This is the feature the extension exists for. Everything else here is in service of it.

## Two halves, and why

```
the tab                              the background                    tabcake-server
───────────────────────────────      ──────────────────────────        ──────────────────
entrypoints/content.ts               lib/capture.ts                    pages.ingest.capture
  is this a search page?               signed in?
  did it 404?                          paused?
  15 seconds of visible dwell          blocked domain?
  extract the text                     ──────────────────────────▶     "captured"
  enough of it?                                                        "updated"
  or is it mostly a form?              ◀──────────────────────────     "revisited"
  ──────────────────────────▶          storage.session, and the dot    "skipped"
```

The split is not arbitrary. **Dwell and layout only exist in the tab**: how long you looked at a page,
whether it was on screen, how many form fields are visible. **The session only exists in the
background**, which is the only holder of tokens and the only context allowed to write
`storage.session`. Neither side can do the other's job, so each does its own and they meet over one
message.

The content script therefore decides whether a page is *worth* sending. The background decides whether
it is *allowed* to leave. The first thing it asks, after whether you are signed in, is whether you
have accepted the popup's first-run agreement; until you have, nothing about any page leaves
([Privacy controls](privacy-controls.md#the-first-run-agreement)).

## What the content script checks, in order

It stops at the first thing that disqualifies the page, and every stop is recorded so the popup can
say what happened.

| Check | Why |
|---|---|
| not the top frame | An advert or an embedded player is not what you are reading. This one is silent. |
| the page returned 400 or worse | A 404 is a real page with real text on it. Asked once per document, because it describes that document's own navigation. |
| the Tabcake dashboard itself | Its screens show what was read; a memory holding them would come back in searches and be cited in answers. Checked against `WXT_DASHBOARD_URL` (`lib/dashboard.ts`), in the content script and again in the background. **Not waived by allowing the site.** |
| not an `https:` address | Plain HTTP now skews towards development boxes and intranets. **Waived for an origin you allowed.** |
| a private or nameless host | `isPrivateHost` in `lib/rules.ts`: every IP literal, v4 and v6; any host with no dot at all; anything ending `.localhost`, `.local`, `.internal`, `.lan` or `.home.arpa`. **Waived for an origin you allowed.** |
| a search results page | You did not read it, and remembering your own queries buries the pages you did read. `lib/rules.ts` matches a known search host, a first path segment of `search` or `results`, or a `q` parameter on a shallow path. |
| fifteen seconds of **visible** dwell, or what the account set | The line between reading a page and landing on it, and the cheapest filter there is. Time on a hidden tab does not count, so twenty tabs opened at once are not twenty pages. Since 0.33.0 the length is the account's **Time on a page** setting, 5 to 120 seconds (below). |
| under 500 characters of text | A cookie wall, a redirect stub, a bare heading. |
| mostly a form | Six or more visible fields **and** more fields than paragraphs. A checkout reads as an article otherwise; an article with a comment box does not trip it, because it has far more paragraphs. Since 0.33.0 the account's **Skip form-heavy pages** can turn this check off. |

The dwell timer fires once per address, so sitting on a page does not send it twice.

**Allowing a site waives the two address rules and nothing else.** The checks below them say you
did not read the page — a search result, an error, too little text, a form — and allowing the site
does not change that. The origins you have allowed are cached in `local.grants`, read once when the
script starts and kept current by `storage.onChanged`, so the answer is there synchronously and a
site allowed in the popup reaches the tab you are standing on without a reload. The account is what
decides; this is a cache, and `tabcake-server/docs/how-it-works/allowing-a-site.md` is the whole
story.

**Two of the checks are the account's to set** (0.33.0): the dwell length and whether the form
check runs, from the dashboard's Settings, Capture tab (`users.profile.setCapture`). The background
reads them off `users.profile.me` in `syncCapture` (`lib/settings.ts`), on every sync and when the
dashboard sends `refresh` after a change, and caches them under `local.capture`. The content script
reads that key the way it reads `local.grants`, at start and through `storage.onChanged`, so an
open tab follows a change from the next address it watches. `parseCapture` in
`lib/capture-settings.ts` reads anything missing or out of range as the old fixed behaviour: fifteen
seconds, forms skipped.

**PDFs are not checked here, on purpose.** Chrome renders a PDF in a privileged viewer that runs no
content script, so this file never sees one and a check would be dead code. The backend refuses them
as well, and that is what covers anything calling the API directly.

### Every check runs again when the route changes

A single-page app calls `history.pushState` and replaces nothing — the content script is not run
again. Until 0.9.0 that meant one capture per document ever, and something worse: the checks above
ran against the address at load, while the address was read again *at send time*, fifteen seconds
later. Land on an article, route into search inside that window, and the search page was sent under
a gate that never saw it.

`lib/route.ts` compares `location.href` once a second. A change cancels the dwell timer in flight
and starts the whole list again on the new address, and the address a page is sent under is the one
its checks ran against.

Polling rather than listening, for three reasons in this order. A content script runs in an isolated
world, so patching `history.pushState` cannot see the page's own calls. `webNavigation` would answer
it properly and costs the "read your browsing history" install warning, for something observable here
for free. And the Navigation API's behaviour inside an isolated world is not a thing to bet a privacy
gate on. A second's delay is nothing against a fifteen-second dwell.

The whole address is compared, fragment included, because a hash-routed app's `#/settings` is a real
route change. An ordinary in-page anchor therefore restarts the timer too, which costs fifteen
seconds and a page the server answers `"revisited"` for.

## What the text is

`lib/extract.ts`, ported from the retired prototype in `tabcake_app/extension/`. It walks the
semantic blocks — `p`, `h1` to `h5`, `li`, `pre`, `blockquote` — under `article`, then `main`, then
`body`, keeping the outermost of any nested pair so a list inside a blockquote is not counted twice.

When the walk falls back to `body`, nobody marked up the content, so the page furniture is still in
the way: anything inside `nav`, `header`, `footer` or `aside` is dropped.

Below 500 characters the walk has failed, and the whole root is taken instead. That is the one path
where the furniture comes back, and the reason `extract.ts` carries a `ponytail:` note naming
Mozilla's Readability as the upgrade.

The text is capped at 100,000 characters here and again at 120,000 on the server.

**Then it is redacted, and that happens here rather than on the server on purpose.** `lib/redact.ts`
takes out API keys and JWTs, email addresses, IBANs, social security numbers, card numbers that pass
a Luhn check, phone numbers, and any remaining run of ten or more digits. Text redacted in the tab
never travels at all, which is a different promise from text the backend redacts on arrival. It runs
before the 500-character floor is measured, because redacting shortens it.

The Luhn check is what stops it mangling ordinary pages: "order 5567" and "total 1200" survive, a
real card number does not. The ten-digit rule is the one with a cost, and it is a real one — ISBNs,
long order numbers and epoch timestamps go with it. It stays because a bare bank account number has
no checksum and no separators, so nothing else would catch it, and `lib/redact.test.ts` writes the
losses down as losses so they cannot be undone by accident.

It is honest about its limit: regular expressions catch shapes, not meaning, so a name or a street
address written in prose goes straight through. The classifier refusing whole pages that are *about*
personal data is what covers that, and it is a weaker guarantee.

## What the background checks, in order

`lib/capture.ts`. The order is the order of certainty: a fact about the browser, then a decision you
made, then a decision you made about that site, and only then is a network call worth spending.

| Check | Status recorded |
|---|---|
| no stored session | `skipped: signed-out` |
| `pauseUntil` is `-1` or in the future | `skipped: paused` |
| a rule in force blocks the host | `skipped: blocked` |
| `pages.classify.verdict` judged the page private | `skipped: sensitive` |
| `pages.classify.verdict` could not answer | `skipped: unchecked` |
| otherwise, `pages.ingest.capture` on the backend | `remembered`, carrying the word the server answered with |
| the call threw | `failed`, carrying the reason |

**The decision is asked for before the text is sent, and that order is the point.** A page the
classifier refuses has only ever had its address, its title and its headings leave this browser —
never the page itself. What it is shown is built by `lib/signal.ts`: an object of counts and
headings with no body text and no query string in it. The backend then requires the decision it
stored before it will write anything, so a yes here is not something this browser decides on its
own. The whole layer is `tabcake-server/docs/how-it-works/classifying-a-page.md`.

Both settings, and every way to change them, are [privacy controls](privacy-controls.md). The short
version: pause has three shapes and an alarm that ends it; the blocklist defaults apply whenever
nothing is stored, so a reinstall or cleared storage cannot leave a browser capturing with nothing
blocking it.

A rule is in force when it is switched on and either it is loose or its group is switched on. A
`domain`-scoped rule on `paypal.com` blocks `www.paypal.com` and does not block `notpaypal.com` —
a hostname match, not a suffix match. A `host`-scoped one blocks `paypal.com` alone.

## The dot, and where status lives

The background writes a `TabState` — `{ host, status }` — to `browser.storage.session` under
`tab:<id>`. That is the only per-tab state there is, and the background is the only thing that writes
it.

The hostname is in there so the popup can offer to block the site. Reading `tab.url` would work too
and would cost the `tabs` permission and its install warning, for a string the content script already
has and sends for free.

On `remembered` — and only then — the tab's toolbar icon gets a `•` badge in Butter. design.md allows
one live element per screen and reserves it for exactly this: live, new, currently captured. Every
other outcome is text in the popup and nothing on the icon.

**The tooltip names the state** (since 0.23.0, audit E-14). The badge can only draw a dot, so the
same write sets the tab's action title from `titleFor` in `lib/toolbar-title.ts`: "Tabcake — remembered",
"— reading", "— skipped this page", "— blocked here by your rule", "— could not save this page".
While capture is paused every tab but a remembered one says "Tabcake — paused". That has to be
written onto each tab, not left to the default underneath: Chrome lets a tab's own title override
the default and has no way to clear one, so `applyPauseBadge` rewrites every open tab's title when a
pause starts or ends (tab ids need no permission). The badge is the other way round — a tab that is
not remembered sets its badge text to `null`, which clears it back to the global one, where `""`
would be a value of its own and hide the `II`. The words live in `lib/toolbar-title.ts`. The Butter ring the audit suggested for "reading" is not possible: the badge API takes
text and a colour, nothing else.

The popup reads that key directly and subscribes to `storage.onChanged`, so the line updates while
the popup is open without a poll and without a second message. It never asks the background for it.

The status is cleared when a tab starts loading, when it closes, and when its address changes
without a load. That last one is the single-page-app case: a route change reports the new address
and never reports `loading`, so without it the dot from the previous route would sit on a page
nothing has looked at yet. Clearing comes first and the content script announces the new route
within a second, which is the right order.

Drawing the badge is best-effort. A tab can close between the moment something decides to draw and
the moment it draws, and `tabs.onRemoved` fires *after* the tab has gone, so the call for it always
fails. `setBadge` in `lib/capture.ts` swallows that: a tab that does not exist has no icon to draw
on. The session entry is still written and removed either way.

Status is cleared when the tab navigates and when it closes. A content script that runs overwrites it
anyway; the two tab listeners cover the pages where none runs — a `chrome://` page, a PDF, a download.
A stale dot is worse than no dot.

## What the server does with it

`pages.ingest.capture` normalises the address, refuses text under 200 characters, and answers with one of
four words. A page you have read before with the same text costs one index lookup and no AI call. The
rest of that story is `tabcake-server/docs/how-it-works/capture-pipeline.md`.

## What is deliberately not here

Each of these has a `ponytail:` note naming what would bring it in.

- **Scroll depth.** Dwell already removes bounces, and scroll wrongly penalises a short page.
- **A hash computed in the browser**, to skip sending a page the server already has. It saves nothing
  without a round trip first to ask.
- **A retry queue** for a send that failed. Add it when someone on a flaky network reports losses.
- **A PDF check.** Chrome's viewer runs no content script, so there would be nothing to check.
- **Incognito.** The manifest says `not_allowed`, so there is no code to get wrong.

---

**Before this:** [The session](the-session.md) · **See also:**
[Signing in](signing-in.md) · [Adding a message type](../guides/add-a-message-type.md) ·
[Conventions](../reference/conventions.md) · [Index](../README.md)

The backend side: `tabcake-server/docs/how-it-works/capture-pipeline.md`.
