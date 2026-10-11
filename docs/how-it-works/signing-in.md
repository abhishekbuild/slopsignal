# Signing in

For anyone touching pairing from this side. By the end you will know what the background does with a
link code and what the popup shows while it happens.

The flow is documented in full, once, at
`tabcake-server/docs/how-it-works/extension-pairing.md`. Read that first if you have not: it explains
why a link code exists at all. This page is only this repo's half.

## The one-paragraph version

The extension cannot copy the dashboard's session, because a Convex Auth refresh token used from two
places invalidates the whole session. So it gets its own: the popup opens a page on the dashboard, the
dashboard mints a one-time code and hands it over directly, and the extension trades that code for its
own token pair.

## What this side does

Two listeners in `entrypoints/background.ts`, both on `onMessageExternal`, which is the channel web
pages use.

**`ping`** answers whether the extension is here and whether it already holds a session. That is all
the dashboard needs to decide what to show, and it is also how the dashboard detects the extension at
all — a page that gets no reply concludes it is not installed.

**`link`** carries the code. `lib/auth.ts` sends it to the backend as
`signIn("extension", { params: { code } })`, and on success stores the token pair in
`chrome.storage.local`.

Both reply and nothing more: `{ok: true}` or `{ok: false}`. **The reply never contains tokens.** The
dashboard has no business holding the extension's session, and keeping that boundary means a bug on
the page cannot leak one.

## The origin check

The first line of the external listener:

```ts
if (sender.origin !== DASHBOARD_ORIGIN) return;
```

`externally_connectable` in the manifest already stops other origins from opening a channel, so this
is belt and braces. It stays because it is the trust boundary for *accepting a session*: without it,
any page that somehow got a channel could sign this browser into an attacker's account. That is a
login CSRF, and it is worth one line.

`DASHBOARD_ORIGIN` comes from `WXT_DASHBOARD_URL`, and so does the manifest's
`externally_connectable`: `wxt.config.ts` reads the same env files. They used to be two copies, and
when they disagreed Chrome let the message through and this check dropped it — which the dashboard
reports as "extension not found", because that is indistinguishable from silence. In development the
origin is `http://localhost:3000`; the production build uses `https://app.tabcake.com`.

## Replacing an existing session

Pairing while already signed in is a real thing to want, usually to switch accounts. `link` handles it
in order:

1. Read the existing tokens, if any
2. Trade the code for new ones
3. Store the new ones
4. **Then** sign the old session out on the server, best effort

Signing the old one out last matters. Do it first and a failure between the two steps leaves the
extension with no session at all. Doing it last means the worst case is an orphaned server-side
session, which expires on its own.

## What the popup shows

`entrypoints/popup/App.tsx` has six states, and it holds none of them itself — it asks the background
on mount and renders the answer.

| State | What you see |
|---|---|
| waiting for the background | the loader, then "Checking…" |
| signed out | the logo, one sentence, **Sign in with Tabcake**, and "Installed in this browser · v…" with the address it opens |
| signed in, not yet agreed | **Before Tabcake starts**: what is sent, what never is, the privacy policy, **Start remembering pages** and **Not now** — see [Privacy controls](privacy-controls.md#the-first-run-agreement) |
| signed in | the account and Sign out in the header, then the page, capture, search and the list — see [Popup search](popup-search.md) |
| the account no longer exists | "This account no longer exists" and Sign out |
| could not reach Tabcake | "Check your connection and try again.", and Try again — one instruction, not the heading repeated (audit E-11) |

**Sign in with Tabcake** opens `WXT_DASHBOARD_URL + "/connect-extension"` in a tab and then closes the
popup. Opening a tab needs no permission. Closing the popup is deliberate: the work happens in the
tab, and a popup left open behind it would be showing stale information.

There is no sign-in form here and there should never be one. Adding one would mean handling passwords
in an extension and would still not work for anyone who signs in with Google.

## Signing out

The popup sends `signOut`; the background clears storage and then tells the server. Clearing first
means the popup flips to signed-out immediately even if the network call fails. While it waits, the
loader says "Signing out…" (since 0.23.1; it said "Checking…", the words for opening the popup).

Signing out here does **not** sign out the dashboard. Separate sessions, by design.

---

**Next:** [The session](the-session.md) · **See also:**
[The pinned extension id](the-pinned-extension-id.md) ·
[Where output goes](../setup/debugging.md) · [Index](../README.md)

The other two halves: `tabcake-server/docs/how-it-works/extension-pairing.md` (the canonical account)
and `tabcake_dashboard/docs/how-it-works/connect-the-extension.md`.
