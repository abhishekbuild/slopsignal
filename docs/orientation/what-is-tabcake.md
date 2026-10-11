# What Tabcake is, and where this repo fits

Start here on your first day. By the end you will know what the product does, which of the three
repos does what, and what this extension actually does today.

## The product

Tabcake remembers what you read on the web so you do not have to.

This extension is the part that notices. It is meant to capture the pages you actually read — the ones
you spent real time on, not every URL you touched — and send them to the backend, which understands
and stores them. Then you can ask questions in your own words: "show me the article explaining OAuth
PKCE", "what did I read about vector databases last month".

Searching by meaning is the whole point. Browser history stores URLs and titles, which is exactly why
it is useless for this.

## The three repos

Three sibling folders in one workspace, and three separate git repositories.

| Repo | What it is | What it does |
|---|---|---|
| `tabcake-server` | Convex + TypeScript | The database, every backend function, and authentication |
| `tabcake_dashboard` | Next.js 16 | The web app, and where people sign in |
| `tabcake_extension` | WXT, Manifest V3 | **This one.** The Chrome extension. |

## What this extension does today

It signs in, and it remembers what you read:

- The popup, signed out, opens the dashboard so you can pair this browser with your account
- Pairing gets the extension a Convex Auth session **of its own**, stored in extension storage
- The popup, signed in, shows the account it is connected to, opens the dashboard, and signs out
- The background worker keeps that session alive, renewing the token before it expires
- A content script watches every page and, after fifteen seconds of actually looking at it, sends
  the readable text to the backend, which summarises, tags and embeds it
- Search results, error pages, forms, short pages and a default list of private domains are never
  sent, and the popup says which of those applied
- You can pause capture for fifteen minutes, an hour or until you resume, and block the site you are
  looking at, both from the popup
- You can search everything you have read from the popup, or from Ctrl+Shift+K in any tab

What it does **not** do yet: a side panel of related reading, and the blocklist editor, which lives
on the dashboard rather than here — this repo owns the rules and enforces them, and the dashboard is
where you write them. [Page capture](../how-it-works/page-capture.md) is the
capture flow end to end, and [popup search](../how-it-works/popup-search.md) is the other half.

The retired prototype at `tabcake_app/extension/` in the workspace is where the dwell timer and the
text extractor came from. It was a starting point, never a dependency.

## Why signing in works the way it does

The extension has no sign-in form. Its popup opens a page on the dashboard, and the dashboard hands
it a one-time code that it trades for a session.

That looks roundabout until you know the constraint: a Convex Auth session is renewed with a
single-use refresh token, and using one from two places invalidates the whole session. So the
extension and the dashboard cannot share tokens — they would sign each other out. Pairing is how the
extension gets its own session without asking for a password, and it works for someone who signs in
with Google just as well.

The flow is documented in full, once, at
`tabcake-server/docs/how-it-works/extension-pairing.md`. This repo's half is
[Signing in](../how-it-works/signing-in.md).

## Where the look comes from

`assets/design.md` v4.8 in the workspace, which is **not part of this repo**. The dashboard follows
the same file, so the popup and the web app look like one product.
`entrypoints/popup/style.css` holds the light half of the dashboard's token block
(`tabcake_dashboard/app/globals.css`), which is how design.md is spelled in code.

The rule is that you do not invent a colour, a radius or a type size. See
[Conventions](../reference/conventions.md).

---

**Next:** [Chrome extensions and WXT](chrome-extensions-and-wxt.md) · **See also:**
[A tour of the repo](repo-tour.md) · [Signing in](../how-it-works/signing-in.md) ·
[Index](../README.md)
