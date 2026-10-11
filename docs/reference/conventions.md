# Conventions

The rules this repo follows, and the reason for each. Most exist because Manifest V3 or the shared
design system leaves no choice.

## Structure

**The background owns the session. The popup asks.** The popup never imports `lib/auth.ts` and never
touches `chrome.storage` for tokens. One holder, one refresher, no race — see
[The session](../how-it-works/the-session.md).

**Per-tab display state lives in `browser.storage.session` under `tab:<id>`, and nowhere else.**
The background is the only writer. Service worker memory does not survive a sleep, and a status the
popup cannot find reads as "nothing happened", which is the one thing capture must never do.

**The popup reads storage to display something; it sends a message to cause something.** Asking for
the capture status over a message would mean a round trip and no live updates. Reading
`storage.session` and subscribing to `storage.onChanged` gives both for less code. Tokens are still
the exception — the popup never reads those, at all. Searching is the other side of the rule: it is
a network call with a reply, so it goes over a message, through `entrypoints/popup/ask.ts`.

**A new permission is a product decision.** Check what warning it triggers before adding it, and
write the answer into [permissions](permissions.md). `favicon` was rejected on exactly that basis —
it is a warning permission, and the result rows use a letter instead.

**The badge is one dot, set per tab, cleared on navigation and on close.** Only a page that was
actually remembered gets it. A stale dot claims something untrue about the page you are looking at.

**Per-tab `browser.action` calls are best-effort and every one of them is caught.** The tab can be
gone by the time the call lands — on `tabs.onRemoved` it always is — and the rejection then becomes
an unhandled promise that buries every real error in the console. The badge is cosmetic; storage is
the part that has to succeed.

**Logic goes in `lib/`, wiring goes in `entrypoints/`.** A handler in `background.ts` should be one
line that calls something testable. `lib/` runs under vitest with a fake browser; entrypoints do not.

**Messages live in `lib/messages.ts`**, as discriminated unions, both directions in one file. It is the
contract the popup, the background and the dashboard's page all read.

## Manifest V3

**A content script outlives its extension, and every send from one is caught.** Reloading or
updating the extension destroys the context of a content script already injected into an open page,
but the script keeps running. `browser.runtime.sendMessage` then **throws** instead of rejecting, so
a `.catch` alone does not help — `lib/send.ts` awaits the call inside a `try`, which is the one
wrapper that covers both. Without it, every tab that was open across a reload shows an uncaught error.

**Register listeners at the top level, synchronously.** One added after an `await` may not exist when
a cold worker receives a message, and the message is dropped with no error.

**`return true` in every message listener.** It keeps the channel open for an async reply. Returning a
promise works in Firefox and not in Chrome.

**Write to storage the moment you have something worth keeping.** The worker can be killed at any
point. Nothing in memory survives.

**Assume the popup is gone.** It is destroyed on every close, so nothing may depend on it staying open
to finish.

## Security

**An external reply never carries tokens.** `ping` answers a boolean; `link` answers `{ok}`. A page
that can ask who is signed in can fingerprint the user. `getSettings` still answers with the
blocklist, for a dashboard older than 0.8.0 that has no other way to read it — and the pinned origin
is what makes that safe. A current dashboard reads it from the backend and ignores that half.

**Validate an external payload whole, or refuse it whole.** `setSettings` types its `blocklist` as
`unknown` and `parseBlocklist` rejects the lot unless every rule, every group and every limit
passes. A half-stored setting would silently stop blocking a site the user believes is blocked,
which is worse than storing nothing.

**An external reply outlives the page that reads it.** The two apps ship separately, so a reply has
to make sense to a dashboard older than the extension. `getSettings` sends `schema` so a current
page can tell, and a flat `hosts` list so an older one still works instead of showing an empty
editor one Save away from clearing the blocklist.

**Check `sender.origin` in every external handler**, even though the manifest already restricts it.
That check is the trust boundary for accepting a session.

**`externally_connectable` is derived from `WXT_DASHBOARD_URL`, never written by hand.** One decides
who Chrome lets through, the other who the background trusts, and when they disagreed pairing failed
as "extension not found". `wxt.config.ts` reads the same env files as the code, so they cannot.

**Never commit `tabcake.pem`.** See [The pinned extension id](../how-it-works/the-pinned-extension-id.md).

## Versions and environment

**`package.json`'s version becomes the manifest's version.** WXT copies it, so never hand-write a
version into `wxt.config.ts`. `VERSION` at the root is the source of truth and `package.json` mirrors
it — the rules are in `CLAUDE.md`.

**`WXT_*` values are read at build time**, not run time. Changing `.env` needs a rebuild. Both are
public: they ship inside the extension, which anyone can unzip.

## Design

**Every visual value comes from `assets/design.md` v4.8** in the workspace. Its light `:root` block
is copied byte for byte into `entrypoints/popup/style.css` from the dashboard's `app/globals.css`,
which is the reference implementation, so a diff of the two shows any drift. **The popup follows the system's theme** (0.34.0): a dark block under `@media (prefers-color-scheme: dark)` holds design.md 5.5's dark palette. Unlike the dashboard's `.dark` block it names every colour token, because this light block still carries 4.x values that a partial dark block would let show through. There is no theme choice in the popup; the dashboard's Settings choice is per browser and does not reach it. Do not invent a colour, a radius or a type size. design.md §13 gives the
order a new token travels in: `design.md` first, then the dashboard, then this stylesheet. A screen
never writes a raw ramp class (`slate-*`, `stone-*`, `amber-*`), an arbitrary value (`text-[…]`,
`duration-[…]`) or a hex — `duration-120` and `ease-out` are the spellings.

**Chrome is 14, prose is 16.** `text-ui` for controls and labels, `text-meta` (12) for secondary
lines. Nothing in the popup is serif since its result cards became rows in 0.22.0. Mono is for strings that are data — a hostname, an
address — not whole lines; a timestamp, a count, a version, a tag and a key hint are sans with
`numeric` where they are figures (design.md 4.2). `eyebrow` is sans too.

**Corners are 8 or 12, and spacing is on the 4px grid.** `rounded-md` for a control, `rounded-lg`
for a card or the search field, `rounded-full` for a dot or disc — never `rounded-sm`, whose 6px
went in 4.2. No `1.5`, `2.5` or `3.5` steps; `0.5` (2px) is on the scale.

**Nothing you press is under 32px tall.** `Button` is 32 tall, and `size="icon"` is 32×32 for an
icon alone, which carries an `aria-label` and a matching `title`. Its variants are `primary`,
`secondary`, `ghost`, `quiet` (a ghost with a muted label, for the header and footer icons) and
`danger` (the one destructive confirm, Forget it). A control that is not a `Button` is still `h-8`.

**Loaders wait 300ms and say what they are doing.** Wrap one in `appear-late` with its words under
it, so a quick answer draws nothing (audit #30).

**Disabled is a fill, not a fade.** `Button` draws a disabled state as the muted surface and label
at full opacity. Do not add `opacity-50`.

**The focus ring does not animate.** `style.css` redefines Tailwind's `transition-colors` and
`transition` without `outline-color`, at the end of the file, so the ring is its final colour the
moment Tab lands.

**There is no `cn` here, so there is no silent-delete trap.** Class names are template strings.
design.md §13's warning about tailwind-merge applies the day a merge helper is added: register
every size and colour token in it, as the dashboard's `lib/utils.ts` does.

**The loader replaces every spinner.** `Loader` in `components/loader.tsx`. There is no spinner in
the popup. The video button's spinner on YouTube is the one exception: it lives in YouTube's page,
inside a shadow root, and uses YouTube's own icon language.

**The logo comes from `components/brand.tsx` and nowhere else.** `TabcakeLogo` in the header and on
the signed-out card. Never paste its paths or write its hexes.

**`components/{brand,loader,monogram}.tsx` and `lib/format.ts` are deliberate
copies** of the dashboard's versions, and `components/result-row.tsx` is the popup's cut of the
dashboard's `ListRow`. Small files across two repos beat a third repo to publish
and version. If you change one, change the other — they are meant to look identical.

**The live signal is amber, and one per screen.** `bg-live` is the amber `#8A5A00` since 4.2 —
the dot beside the popup's status line. Butter `#F5C542` was 1.5:1 on cream as a dot and could not
be seen. Butter stays where it carries ink: the badge on a remembered tab. The video button on YouTube was
Butter too until 0.23.0; it is ink with cream text now, the product's primary (audit E-15), and the
paused badge is ink rather than grey. Nothing else is yellow.

**Reach for the token, never a hex.** `bg-live`, not a colour. Three places cannot read the
stylesheet — the two toolbar badges (`chrome.action` paints them) and the video button (inside a
shadow root on YouTube) — and they take their colours from `lib/palette.ts`, which names the token
each value mirrors. Change the two together.

**Ink is the committed action; blue is where you are.** `Button` primary is Ink `#1C1714`
(`primary`), and stays so by decision. `accent-strong` (Harbour blue `#2B59C3`) is a link, the focus ring, or the selected
sort; there is one blue, and `accent-foreground` is ink. Ember belongs to the logo's overlap and nothing else. The chrome is
otherwise monochrome and warm: icons and dots are `subtle`, secondary text is `muted-foreground`.
There is no slate and no teal anywhere. One focus ring is declared in `style.css`; no component draws its own.

**Every cursor is deliberate.** Tailwind v4 no longer gives `<button>` a pointer, so a control only
has one if you write it. `cursor-pointer` on anything that acts when clicked — including a
row whose title link is stretched over it.
`cursor-default` on display-only text: counts, badges, status pills, the account pill. Inputs and
prose keep their own. The full table is design.md §9, Cursors; `Button` carries the pointer in its
base so callers do not have to.

**Sentence case everywhere.** The only uppercase style is `eyebrow`. Icons are Lucide at 1.5px stroke,
16px in dense interface, never filled.

**Fonts are bundled from `@fontsource`, not fetched.** The popup is a fresh document on every open, so
a remote font would flash every single time.

## Dependencies

**No shadcn, no Radix, no component library.** Two buttons and one card do not justify them.

**No Convex React client in the popup.** It asks the background once per open rather than holding a
live subscription — the popup is destroyed on close, so a subscription buys nothing and costs a
connection.

Before adding a dependency, check whether ten lines would do. Most of this repo is that check having
been made.

## `ponytail:` comments

A marker for a deliberate simplification. It names the shortcut **and** what should trigger replacing
it — `lib/auth.ts` has one on the single-flight refresh explaining why losing the promise is harmless.

Not a TODO. It says the current choice is correct for now, and why. Do not "fix" one without reading
the condition it names.

---

**See also:** [The session](../how-it-works/the-session.md) ·
[A tour of the repo](../orientation/repo-tour.md) · [Glossary](glossary.md) · [Index](../README.md)
