# Privacy controls

For anyone changing what capture will and will not touch, or answering "why did it not remember
this". By the end you will know how the first-run agreement, pause and the blocklist work, where each is stored, which copy of
the blocklist decides, and the exact words the popup uses for every reason a page was skipped.

These ship with capture rather than after it. A tool that quietly reads every page you open has to be
one you can stop, and stopping it has to be visible.

## The first-run agreement

Nothing is sent until you have agreed to it. After you sign in, the popup shows **Before Tabcake
starts** instead of the usual view: what is sent to your account, that servers and the AI services
they use process it, what is never sent, a link to the privacy policy, and **Start remembering
pages**. Until you press that, every page is skipped as "Tabcake is not turned on yet", and the
YouTube button says "Turn on Tabcake in its popup first". **Not now** closes the popup and changes
nothing.

Why a screen and not a sentence somewhere: since 1 August 2026 the Chrome Web Store requires every
kind of data collection to be disclosed inside the product and agreed to with an action, even
collection that is the product's whole point. The listing and the privacy policy do not count.

`lib/consent.ts` holds the answer in `browser.storage.local` under `consent`, as the version agreed
to and the moment. Three rules follow from where it lives and how it is checked:

| Rule | Why |
|---|---|
| Checked in the background, second only to the session | `lib/capture.ts` refuses before anything about the page — not even its address — is sent. The popup screen is how you answer; the gate is what makes the answer hold. |
| Cleared on sign-out | Another person signing in on the same profile has agreed to nothing. |
| `CONSENT_VERSION` goes up when what is collected changes | Every browser then sees the screen again and capture stops until it is accepted. The store requires telling people when data handling changes, and this is how. Change the wording in `App.tsx` in the same change. |

A Short's button is refused before its background tab opens, rather than when that tab reports back,
so YouTube is not loaded for nothing.

## Pause

`pauseUntil` in `browser.storage.local`, and three values it can take:

| Value | Means |
|---|---|
| `0`, or absent | Not paused. The default. |
| a moment in the future | Paused until then. |
| `-1` (`PAUSED_INDEFINITELY`) | Paused until you resume it. |

The popup's capture row offers 15 minutes, 1 hour, and "Until I resume", and says "Capturing" while
it is not paused. While paused it shows when it ends and a Resume button, the toolbar icon carries
`II` on ink (grey until 0.23.0, which told it from the remembered dot by colour alone — audit E-07),
and the toolbar's tooltip reads "Tabcake — paused" on every tab but a remembered one. A page that
starts being read during a pause is recorded as skipped, "capture is paused", rather than
"Reading…": the content script does not know about the pause, so the background says it when the
page is announced.

**A keyboard shortcut toggles it** (0.33.0): `pause-capture` in `wxt.config.ts`, suggested as
`Alt+Shift+P` on every platform, pauses until you resume or resumes (`togglePause` in
`lib/settings.ts`). Alt rather than Ctrl, because a suggested key the browser already uses is
silently left unassigned. Chrome owns the binding, so it is changed at
`chrome://extensions/shortcuts`, and the dashboard's Settings, Capture tab names it.

**The gate is checked when a page is sent, not when its timer starts.** Pausing has to stop the page
you are already fifteen seconds into, not only the next one. That is why `lib/capture.ts` reads the
setting inside `decide()` rather than the content script reading it once at load.

### Why there is an alarm

A badge is drawn once. Nothing redraws it when a timed pause runs out, so without help the toolbar
would go on saying "paused" until something else happened to write a badge — which might be never, on
a browser you leave open.

So `setPause` schedules an `alarms` alarm for the moment the pause ends, and the alarm calls
`applyPauseBadge`. A pause with no end schedules nothing, because it has no end. `alarms` is the
second and last permission in the manifest, and it shows no install warning.

There are two alarms now — the other refreshes the cached blocklist — so the listener reads
`alarm.name` before doing anything. It used to redraw the badge for any alarm at all, which was
correct while there was only one and would have been quietly wrong the moment there were two.

`applyPauseBadge` also runs once when the service worker starts. Badge state does not survive a
browser restart but `pauseUntil` does, and a badge missing while capture really is paused is as
dishonest as one left behind after it resumed.

The pause badge is the **default** badge, so a tab already wearing the Butter dot keeps it. That is
right: the dot says that page is remembered, which stays true while capture is paused.

## The blocklist

**Your account holds it, and what is in `browser.storage.local` is a cache.** That changed in 0.8.0;
before it, this browser's storage was the only copy anywhere.

The cache lives under the same `blocklist` key it always did, and **absent still means the
defaults** — webmail, chat, the sign-in pages that carry your address, money and health. They are in
`lib/rules.ts`.

Localhost used to be a fourth default and is not one any more. `isPrivateHost` refuses every private
address above the list and has no switch, so the group's switch would have changed nothing. A stored
copy of it is dropped when the list is read, and so is any other preset a later version stops
shipping. Groups of your own are never touched.

Nothing is seeded on install. A default that is read as a default cannot fail to seed, cannot be lost
by an upgrade or by cleared storage, and leaves no state where capture is on with nothing blocking it.

### Why there is a cache at all

`lib/capture.ts` asks whether a host is blocked on the way out of every page you read. That gate has
to answer instantly and it has to answer offline, so it cannot wait on a round trip to the server to
decide whether to make a round trip to the server. It reads the cache.

### Why a stale cache is safe

`pages.ingest.capture` checks the account's list too, before it writes anything, and answers
`"blocked"` if the host is on it. So the copy in this browser is never the thing that decides — it is
the thing that saves a call. A cache that is an hour old, a build that has not synced, or anything
else calling the backend directly all reach the same refusal.

That is what makes the write order in `setBlocked` allowed to be optimistic: the cache is written
first so the popup's label flips at once, and put back if the account refuses.

### Keeping it fresh

`syncBlocklist` in `lib/settings.ts` pulls the list and writes the cache. It runs when the service
worker starts, when the popup opens, after any edit made here, and on a `sync-blocklist` alarm every
thirty minutes. Polling, because the background holds a `ConvexHttpClient` and that has no
subscriptions — a live connection would be torn down and rebuilt all day for a value that changes
about never.

A sync that fails leaves the cache exactly as it was. The failure mode is a list that is behind,
never an empty one.

**Signing out clears the cache and the migration flag.** Two accounts can share a browser profile,
and a list left behind would block the next one's pages using the last one's rules, with nothing on
screen to say where they came from.

### What a blocked site is

One rule:

```ts
type BlockRule = { host: string; scope: "domain" | "host"; reason?: string; enabled: boolean };
```

**Scope** is the only field that changes what gets blocked, and it has two values because there are
only two useful answers:

| Scope | Written as | Blocks |
|---|---|---|
| `domain` | `*.paypal.com` | `paypal.com` and every subdomain |
| `host` | `mail.google.com` | that hostname, and nothing under it |

`*.paypal.com` covers `www.paypal.com` and does not cover `notpaypal.com`. That is a hostname match,
not a suffix match, and the difference is a different company. `host` is for the case where the
wider reach is wrong: blocking your webmail without blocking the rest of the company's site.

Two places decide which scope a new rule gets, and they deliberately disagree:

| Where | Scope |
|---|---|
| Typed into the dashboard | The pattern says. `*.x` is `domain`, a bare `x` is `host`. |
| Migrated from an older flat list | Always `domain`. |
| The popup's block-this-site toggle | Always `domain`. |

Migration never narrows, because narrowing silently unblocks subdomains somebody was relying on —
the worst thing this file could do. The popup is one click on a site you are looking at, and one
click should cover the site.

**The note** is yours. It is shown back to you and never matched on, so it can say anything.

**The switch** is what makes a block liftable. A rule that is off is kept and not enforced, so
changing your mind does not mean losing the rule and typing it again in a month.

### Groups

Several rules under one name and one switch:

```ts
type BlockGroup = { id: string; name: string; rules: BlockRule[]; enabled: boolean; preset?: true };
```

Four ship with the extension — Webmail & Chat, Banking & Finance, Health Portals, and Social & Video.
A preset can be switched off and cannot be deleted, and it keeps its `id` through a rename, which is
how it stays recognisable. Since 0.28.0 its hosts are whatever the account's list holds — the
dashboard can add to and edit a preset — and only its name is forced back to the shipped one. Groups of your own work the same way without the `preset` flag.

**Social & Video** holds the feeds and the video sites that have no transcript feature. A feed is
different every time you open it, so indexing the page gives you dozens of near-identical rows that
bury the pages you actually read. `x.com`, `reddit.com` and `linkedin.com` are deliberately not in it,
and neither is YouTube — that one is refused by `isVideoWatch` instead, because the blocked list is
checked above everything and a host on it could never show the button described below.

**A preset a stored list has never heard of is added when it is read.** That is the mirror of
dropping one this version stopped shipping, and without it a group added in a later version would
reach nobody who had ever synced a list. A group you switched off is still there by id, so this never
switches one back on.

A rule blocks a page when it is enabled **and** either it is loose or its group is enabled.
`activeRules` is that sentence in code, and `isBlocked` is the only thing that asks.

### Handing this browser's list to the account

Every browser running a version before 0.8.0 has a list of its own, so each one hands it over once,
the first time its service worker starts after the upgrade, and then sets a flag.

Two shapes, and the difference is the whole reason `migrate` is not just a whole-document write:

- **The account has no list yet.** This browser's document is all there is, so it becomes the
  account's, groups and all.
- **The account already has one.** Only the loose rules merge. The account's groups are left exactly
  as they are.

The second rule is there because a browser where nobody ever opened the settings reports all four
preset groups as switched on — that is the default here, not a decision anyone made. Merging it
would switch Banking back on for someone who deliberately switched it off on another machine. Loose
rules are the part somebody typed, so they are the part worth rescuing.

`migrateBlocklist` reads the raw storage key rather than calling `readSettings`, for exactly that
reason: `readSettings` would hand back the defaults for a browser that has never been edited, and
uploading those is the thing this avoids. Nothing stored means nothing to migrate.

A browser that stored the retired `Localhost & Intranet` group before 0.9.0 sends it like anything
else, and it is dropped on the way in rather than refused, so nothing else in that list is lost.

### Reading a list from an older version

`toBlocklist` reads whatever is in storage, and a `string[]` left by a version before 0.5.0 becomes
`domain`-scoped rules on the spot.

Two details of that carry weight:

- **Every old entry becomes `domain` scope.** Reading them as `host` would silently stop blocking
  `www.paypal.com` for everyone with `paypal.com` on their list, and a block getting narrower with
  nobody told is the worst outcome this file can produce.
- **The presets arrive switched off.** An old stored list replaced the defaults outright, so
  someone may have removed one on purpose. Switching the presets on would put it back.

Anything `toBlocklist` cannot read falls back to the defaults. "I could not parse your settings"
must never mean "so nothing is blocked".

## Allowing a site on purpose

Every control above is a refusal. This is the one that says yes, and without it each refusal is a
one-way door — a page skipped wrongly is gone for good.

The popup offers it as the this-page row's one control, **Read it anyway**, on a page that was skipped
for a reason allowing the site can lift: the classifier judged it private, the classifier could not
answer, Tabcake stopped reading the whole site on its own, it was not a secure address, it was a
private one, or it was a video watch page (`WAIVABLE` in `lib/this-page.ts`).
Not on a blocked page — the row offers to remove the rule instead, and a rule you wrote outranks a
click here. Not on a page you did not read, because allowing the site does not make a search result
worth keeping. Once allowed, the row's meta line says "allowed"; taking it back is the dashboard's
Allowed anyway tab.

It is scoped to the **origin**, so `https://example.com` and `http://example.com` are different
permissions, and so is a different port or subdomain. That is stricter than the blocklist on purpose:
blocking wants to cover a site, allowing wants to cover exactly what you looked at.

`setAllowed` writes the cache first and the account second, the same order and for the same reason as
`setBlocked`. Removing the rule from here never forgets pages — one click has no room to explain what
would go, so the dashboard is where that is asked.

### Two ways to change it

**From the popup**, one site at a time. While a page is being read the this-page row offers **Block
this site**; on a page your rule blocked it says "Blocked by your rule" and offers **Remove the
rule**. So the undo is on the same row, and the sentence above it, a `role="status"` region, says
what changed. The words are the product's two reading verbs, Block and Allow, the same as the
dashboard's (audit #16), and the button is 32px.

Blocking adds a loose `domain` rule. Removing the rule removes that hostname from the loose rules **and
from every group, presets included** — a rule left inside a group would go on blocking a site the
popup has just said is no longer blocked. It removes the hostname itself and nothing else, so a site
blocked only because its parent domain is blocked stays blocked.

The popup knows that hostname because the content script sent it. Reading `tab.url` instead would
need the `tabs` permission and the install warning that comes with it, for a string the extension
already has.

**From the dashboard**, straight to the backend. It does not message this extension about the
blocklist any more, which is why its blocked screen works in a browser with no extension installed.

`getSettings` and `setSettings` still answer on the external channel — same pinned origin, same
`sender.origin` check — because the two apps ship separately and a dashboard older than 0.8.0 still
calls them. `setSettings` now writes to the account rather than to storage.

Anything arriving that way is hostile until proven otherwise. `parseBlocklist` checks every host
against `^[a-z0-9.-]+$`, every scope against the two values, every note against 120 characters, and
the whole document against 500 rules and 20 groups. It returns nothing at all when any one of those
fails. A partly-stored list would silently stop blocking a site the user believes is blocked, which
is the worst thing this code could do.

It still accepts a plain `string[]`, because a dashboard built before 0.5.0 sends one. That means
what it has always meant — this is the whole list — so it replaces the groups too. For the same
reason `getSettings` answers with three things: the document, a flat `hosts` list of every blocked
hostname, and `schema`. An older dashboard reads `hosts` and carries on; a current one reads
`schema` first, and only offers the rule controls when it finds one.

**Reset to defaults sends `null`**, and `setBlocklist` then removes the stored key rather than
writing the defaults back. Storing them would work today and would rot the moment the defaults
changed; forgetting the key cannot, and it means the dashboard never has to know what the defaults
are. They stay in `lib/rules.ts`, in one repo, forever.

## Sites Tabcake stopped reading by itself

The one refusal here that nobody asked for. After the backend has judged three different paths on
one host private, with none judged public, it stops asking about that host at all — and this browser
caches the list so the check happens before anything is sent.

**Why the cache is in front of the verdict call, not behind it.** `lib/capture.ts` checks it
immediately after the blocklist and before it asks `pages.classify.verdict`. A page on a host that
has already been decided about must not have its title and headings sent out only to be told the
same thing again. That is a smaller promise than it sounds and it is the whole reason the check is
duplicated here.

`syncAutoBlocks` in `lib/settings.ts` keeps the list fresh on the same `sync-settings` alarm as the
other two, and signing out clears it with them — these are guesses made from one account's browsing,
and the next account in this profile must not inherit them.

**Junk reads as nothing blocked**, which is the opposite of the way `toBlocklist` falls back and the
same way `parseGrants` does. Forgetting one of these costs a call the backend refuses anyway;
forgetting a blocked rule would read a site somebody banned. Nothing here decides — `capture` checks
the account's copy before it writes.

**Allow still works on one.** An auto-block is a conclusion the classifier
reached, and a grant has waived the classifier since 0.11.0, so one click is the way back from a
guess Tabcake got wrong. The dashboard has the other undo — the one that makes it stop guessing about
the site for good, which is permanent and so belongs where there is room to say so.

## Videos, and the one button

A video's text is the sidebar, the comments and the up-next list. None of it is what you were
watching, so the page is never read. What is worth remembering is what was said, and the only person
who knows whether this video is worth remembering is the one watching it — so there is a button, and
nothing happens until it is pressed.

**This is the first and only thing Tabcake puts into a page.** Plain DOM in a shadow root. No
React: a hundred and forty kilobytes on every https page for one button. It goes on when a video
address is recognised and comes off when you leave, and `docs/reference/permissions.md` says so
rather than keeping a promise the code stopped keeping.

**On a watch page it sits in the owner row, right after Subscribe.** The row is `#owner`, the
centred flex line holding the avatar, the channel name and Subscribe. The button goes in as its last
child, sized like YouTube's own pills so it reads as one of them. The gap before the like button is
where a button about this video reads as being about this video.

**On a Short it sits above Like, in the column of round buttons beside the video.** It is a round
button like the others, 48 pixels, showing only its icon — a bookmark, a spinner while it works, a
tick, or an exclamation mark — and it grows to the right on hover or keyboard focus to show its
words, over empty space, so nothing beside it moves. The words are on the button as its
`aria-label` the whole time, so a screen reader never needs the hover.

Each kind of page looks only for its own anchor. YouTube keeps the last watch page's owner row in
the DOM, hidden, after you move to Shorts, and 0.15.0 put the Shorts button into it — which is
where nobody could see it. The Shorts anchor is the action column — `reel-action-bar-view-model`
since 2026, `#actions` before it — inside `ytd-reel-video-renderer[is-active]`, the one Short that is
on screen, because the neighbours are rendered too. Behind the names is a net for the next rename:
the element the Like button sits in, found with `:has()`, whatever it is called. Until 0.24.0 only
the old name was known, and the button spent ten seconds looking before settling in the corner.

Neither anchor is there when the content script runs: it runs at `document_idle`, and YouTube renders
the page after that. 0.13.0 looked once, found nothing, fell back to the top of `<body>` and sat
under the fixed masthead. 0.13.1 gave up on anchoring and fixed the button to the bottom left, where
it sat on top of the channel avatar. Since 0.15.0 it polls: once a second for ten seconds it looks
for the anchor, moves in when it appears, and moves back in if YouTube rebuilds it without the
button. Nothing is shown until then — a button that appears in the corner and then jumps into place
would be worse than a second's wait. After ten seconds without an anchor — an element YouTube has
renamed — it takes the bottom-left corner. Bottom **left** because the right edge is where
YouTube's own controls live. It hides itself in fullscreen either way: the anchors are under the
player there, and a fixed element in the corner would sit on the play and volume controls.

**Its position is written inline and marked important**, not in the shadow stylesheet. The shadow
root hides the button's insides from the page, but the host element is an ordinary div in the page's
own DOM, and a page rule that matches it beats `:host` outright — that is the cascade, not a
specificity contest. Inline and important is the one declaration a stylesheet cannot reach.

**Both surfaces get the button at once.** It changes nothing on the page and reads nothing until it
is pressed, so there is nothing to wait for; until 0.16.0 a Short waited fifteen seconds, and a
button that appears fifteen seconds in looks like a fault.

**A Short's button stays on the Short.** The Shorts player has no transcript panel — the
transcript of a Short exists only on its video page, `/watch?v=<id>` — and YouTube's transcript
endpoint (`youtubei/v1/get_transcript`) answers `FAILED_PRECONDITION` to anything that is not its
own player, so nothing on a Shorts page can be read (both checked in September 2026). So the reading
happens on the video page, in a tab you never look at. Pressing the button shows the spinner and
asks the background (`rememberShort`), which opens the video page inactive and muted
(`lib/shorts.ts`; `tabs.create`, `tabs.update` and `tabs.remove` need no permission). The content
script in that tab asks whether it is such a tab (`videoJob`), and if so its button presses itself
two seconds after the owner row renders, reads the panel off screen, saves, and reports where its
press ended (`videoDone`: the button's own words). The background closes the tab and answers the
Short, whose button says the same words. A tab that reports nothing in 45 seconds, or that you close
first, is no answer: "Could not remember that", pressable again. Until 0.24.0 the button took you to
the video page instead, with a note in `sessionStorage`, and you watched it read and save there. A
video page opened by hand never presses itself: only a tab the background opened is a job.

**Taking the button off again is the half that matters.** Every short is its own address, so
`watchAddress` cancels and re-enters on each scroll, and that cancel removes the button. One left
behind would save the video you had just scrolled away from — the only way this feature can store
something wrong rather than storing nothing.

### Reading the transcript, and why it will break

`lib/transcript.ts` clicks YouTube's own **Show transcript** button and reads the panel. Every
alternative is worse: the `timedtext` endpoint has needed a proof-of-origin token since April 2026
and answers with an empty 200 without one, the official API only serves captions for videos you own,
and a third-party service would mean every video address you open leaving this browser.

So it scrapes, and scraping breaks. YouTube changed this markup in February 2026, which is why there
are three readers — the classic element, the modern one, and a last resort that treats every `m:ss`
in the panel as the start of a line. A break shows up as an empty transcript and never as the wrong
text, because none of the three can reach outside the panel.

**English first.** When the panel offers more than one language, the button switches it to English
before reading — a track someone typed over one a machine guessed, when both exist — because English
is what the summary and the search are in. A video with no English track is saved in whatever
YouTube opened it with; that is a fallback, never a refusal. The match is on the word "English" in
YouTube's menu, so it does nothing in a browser whose YouTube is set to another language, and the
switch is left in place: re-opening the panel by hand is the one place you would notice.

**Nothing you can see changes, except the button.** Reading the transcript means opening YouTube's
panel, and until 0.15.0 it stayed open beside the video; 0.15.0 closed it a second later, and the
panel the February 2026 UI opens instead — the same element under a different id,
`PAmodern_transcript_view` next to the classic `engagement-panel-searchable-transcript` — stayed
open because the close did not know it. Now both are known, and the panel is never on screen at
all: a style added to the page for the second it is in use takes it out of the flow and makes it
invisible, so nothing moves and nothing appears, and the style comes off with the panel. Both
panels are on the page at once, each with its own close button, and YouTube opens whichever it
likes — so the reading and the closing go to the panel that is actually open, the one YouTube marks
expanded, else the one holding the cues. Until 0.24.0 the close went to the first id's button, the
other panel's, and the open one appeared beside the video the moment the style came off. The
description is not expanded either — YouTube renders the Show transcript button inside the collapsed
description, and a hidden button still takes a click — unless a build of YouTube does not, in which
case it is expanded and collapsed again. Everything the button opened is closed before the save
leaves the browser, and only what it opened: a panel you had open stays open, and on screen. From
then on the only thing on the page that changes is the button. What it can say, and each is said out
loud:

| What happened | What the button says | Press again? |
|---|---|---|
| YouTube offers no transcript button, so this video has no captions | No transcript for this video | no |
| The panel opened and no reader found a line — YouTube changed something | Could not read the transcript | yes |
| The account remembered it, or already had it | Remembered in Tabcake | no |
| You are signed out of this browser | Sign in to Tabcake first | yes |
| Capture is paused in this browser | Tabcake is paused | yes |
| The account declined it: the site is blocked, or the transcript is too short | Tabcake skipped this video | no |
| The background did not answer, or the network failed | Could not remember that | yes |

The answer is the same `PageStatus` the popup shows for the tab, so the two never disagree. Until
0.15.0 the button said "Couldn't save that" after every save, including the ones that worked: it was
reading the reply from a fire-and-forget send, which has none.

None of these is reported anywhere. The backend has a counter for transcript attempts
(`pages.video.recordAttempt`) and this extension does not call it, so a break in the scraping shows
up when somebody writes in and not before.

**Saving is one way here.** Un-saving is the popup's Forget button, which already works on the tab
you are looking at — one button on a page has no room to explain what would go.

## Adding a link by hand

You can paste a link into the popup's "Add a link" field, or into the dashboard's Memory page, and
Tabcake remembers it without you opening it. The background opens the link in a tab you never look
at, inactive and muted (`lib/manual.ts`), the same way a Short is read. The content script in that
tab asks whether it is such a tab (`pageJob`), and if so it reads the page two seconds after it
loads instead of waiting for fifteen seconds of reading. You asked for this page, so there is no
reading to wait for, and a hidden tab never counts as visible anyway.

When that page is sent, the background adds `added: true` to its `capture` (0.31.0). The page cannot
set this itself: only the background knows it opened the tab. The server then files the page as a
link, which the dashboard shows under "Added links".

**That wait is the only rule a pasted link skips.** Everything else on this page applies unchanged:
the address checks, search pages, too little text, forms, the first-run agreement, pause, your
blocked list, sites Tabcake stopped reading, the classifier, and redaction in the tab. The page is
read in your browser, with your cookies, so the server never fetches anything.

The answer is whatever the tab says about itself: the background hands every status a job tab
reports, remembered or skipped, back to the job, then closes the tab. The popup shows it as the same
sentence the table below lists. A tab that says nothing in 30 seconds, such as a browser error page
for a mistyped address, is given up on. Only an http or https address is ever opened, and a link
ending `.pdf` is turned away before a tab opens, because Chrome's PDF viewer runs no content script.
Upload the file on the dashboard instead.

## Every reason a page is skipped

The popup never says nothing. Each of these is the status line in the panel naming the page you are
on, directly under the header.

| Decided by | Reason | What the popup says |
|---|---|---|
| content script | the Tabcake dashboard itself | Skipped: this is Tabcake itself |
| content script | not an https address | Skipped: not a secure address |
| content script | an IP literal, or a name only one network resolves | Skipped: a private or local address |
| content script | not a secure address, and the site is not allowed | Skipped: not a secure address |
| background | Tabcake blocked this whole site from its own evidence | Skipped: Tabcake stopped reading this site |
| background | the classifier judged the page private | Skipped: this looks like a private page |
| background | the classifier could not answer | Skipped: could not check this page |
| content script | a video | Skipped: a video — remember its transcript from the page |
| content script | a search results page | Skipped: a search results page |
| content script | the page returned 400 or worse | Skipped: the page did not load |
| content script | under 500 characters of text | Skipped: not enough to read |
| content script | six or more visible fields, and more fields than paragraphs | Skipped: mostly a form |
| background | no session | Skipped: not connected to an account |
| background | the first-run agreement has not been accepted | Skipped: Tabcake is not turned on yet |
| background | paused | Skipped: capture is paused |
| background | the host is on the blocklist | Skipped: blocked domain |
| background | a pasted link ending `.pdf` | Skipped: a PDF. Upload the file in Tabcake instead |
| the backend | the host is on the blocklist and this browser's cache did not know | Skipped: blocked domain |

Two more never reach a status at all. An iframe is ignored silently, because it is not the page you
are reading. And incognito never runs any of this: the manifest says `not_allowed`, so there is no
code that could get it wrong.

The address checks and the blocklist are both re-run whenever a single-page app changes route, so a
public page and a private one inside the same app get different answers. That is
[page capture](page-capture.md).

## What leaves this browser, and what does not

The shortest honest answer, because it is the question this page exists for.

| Never leaves | Leaves |
|---|---|
| The text of any page that was refused | The text of a page that was allowed, redacted, to your account |
| Anything `lib/redact.ts` matched: keys, emails, card numbers, long digit runs | The address, title and headings of a page being judged, redacted |
| Nothing at all, for a page on a site you allowed — it is not judged | The origins you allowed, to your account, with a device label and never an address |
| Nothing at all, for a page on a site Tabcake stopped reading — not even its title | Nothing new: that list is built from decisions already made |
| The query string of any page, ever | Counts: password fields, form fields, paragraphs, whether there is a log-out link |
| The text of a video page — the sidebar, the comments, the up-next list | A video's transcript, title, description and channel, and only after you press the button |
| Your pause state | Your blocked list, to your account |

Two of those are worth spelling out.

**Redaction runs before anything is sent**, in the tab, over the text and over the title and
headings. So what it matches is not "removed on the server" — it never travels.

**The address, title and headings of pages you read do reach a model**, through the backend, to
decide whether the page is private. That is browsing data. It is sent asking for zero retention, it
is far less than the page, and it is the price of having the check at all. There is no version of
this layer where nothing leaves.

## What is not here

**Pause is per browser profile, and stays that way.** It lives in extension storage, so a second
computer has its own. That is right: a pause is about the browser in front of you, it has to work
offline, and a control that looked account-wide would be lying about what got read. The blocklist
used to be per profile for the same reason and it was the wrong reason — what you never want read is
a statement about you, not about a machine.

**The dashboard can pause this browser.** It sends `pause` over the external channel, the same call
the popup makes, badge and expiry alarm included. It reads `pauseUntil` back from `getSettings`.

## Forgetting one page

Blocking stops a site being read again. Forgetting removes one page that already was, and since
0.7.0 the popup offers it on the page you are looking at.

It goes straight to `pages.forget.one` on the server, which deletes the page row and the chunks it was
indexed as — the chunks are where the embeddings live, so that is the vector index cleared too.
Nothing is kept and nothing is archived.

The popup can only offer it for a page the server actually holds, and that is also how it gets the
id: a tab knows its own address and never a `pageId`, so `pages.ingest.status` returns one alongside the
visit count. No id, no button.

**It asks first** (since 0.22.0). **Forget this page** turns into two buttons, "Forget it" and "Keep it", and only
the first sends anything. Forgetting cannot be undone, and the popup has no room for a dialog, so the
question is asked in place. It used to forget on the first click.

Forgetting a page does not block the site. Read it again tomorrow and it comes back, which is the
honest split — one is about this page, the other is about this site.

---

**Before this:** [Page capture](page-capture.md) · **See also:**
[Adding a message type](../guides/add-a-message-type.md) ·
[Conventions](../reference/conventions.md) · [Index](../README.md)
