# The session

For anyone changing `lib/auth.ts`, which is the file most likely to break something a person notices.
By the end you will know where tokens live, how they are renewed, and the two decisions encoded in the
error handling.

## One holder, one refresher

**Only the background worker touches tokens.** The popup never imports `lib/auth.ts`; it sends
messages and renders answers.

This is not tidiness. A Convex Auth refresh token is single use, and using a retired one more than ten
seconds later invalidates the entire session. Two refreshers in one extension would eventually race
and sign the user out. One holder, one refresher, no race.

It also survives the popup being destroyed on every close, which it is.

## Where it lives

`chrome.storage.local`, under one key:

```
auth → { token, refreshToken }
```

The key is absent when signed out. That is the only signed-out signal there is — there is no separate
flag, and adding one would create two sources of truth.

Writes happen **the moment** a response arrives, before anything else. The worker can be killed at any
time, so anything not yet written is lost. See
[Chrome extensions and WXT](../orientation/chrome-extensions-and-wxt.md).

## Renewing

`getToken(force?)` is what everything else calls.

1. No tokens? Return `null`. Nothing else happens.
2. Token still good for more than a minute, and not forced? Return it.
3. Otherwise renew, and return the new one.

The one-minute margin exists so a call that starts now does not arrive with a token that expired in
flight.

Renewals are **single-flight**: the in-progress promise is shared, so two callers hitting a stale
token produce one network call. The comment notes the limit honestly — the promise lives in worker
memory, so a worker restart loses it. That is fine, because the server tolerates a second renewal
inside its ten-second reuse window.

`force` exists for one case: a call failed in a way that might mean the token is stale. `withFreshToken`
retries once with `force`, and gives up if the forced renewal returns the same token or nothing.

## The two decisions in the error handling

This is the part to understand before editing, because both look like small details and both are
deliberate.

**A rejected renewal clears the session.** If the server says no, the session is genuinely gone —
revoked, expired, or invalidated by a token reuse. Keeping tokens would mean retrying forever with
credentials that will never work.

**A network failure keeps it.** `fetch` throws a `TypeError` when there is no connection, and that is
not the server saying no. Clearing on it would sign people out whenever their wifi dropped, which is a
far worse bug than a popup that says it cannot reach Tabcake.

So the code branches on the error type:

```ts
if (!(error instanceof TypeError)) await clearTokens();
```

One line, two behaviours, and a test for each. If you change this, change the tests deliberately
rather than making them pass.

## Reading the user

`me()` is what the popup asks for. It returns one of three shapes:

| Shape | Meaning |
|---|---|
| `{ signedOut: true }` | no tokens, or the session was rejected and cleared |
| `{ signedOut: false, user }` | signed in. `user` may still be `null` |
| `{ error }` | tokens are intact but Convex was unreachable |

`user` being `null` while signed in is not a bug. It means the account was deleted and this token has
not expired yet — up to an hour. The popup shows "this account no longer exists" and offers sign out.
The dashboard has the same case for the same reason.

Distinguishing "signed out" from "cannot reach" is the reason `me()` re-reads storage after a failure:
if the session was cleared during the attempt, the answer is signed out, not an error.

## Naming the session

The dashboard's Extension page lists every browser signed in to the account, with a Sign out on
each (dashboard 0.65.0). A Convex Auth session carries no name, so since 0.32.0 the extension says
what it is: `touchDevice` in `lib/settings.ts` calls `users.devices.touch` with `deviceLabel()`
("Chrome on Windows", from `navigator.userAgentData.platform`, never an IP address) and `client:
"extension"`. It runs inside `refresh()` in the background, so on the worker starting and on the
thirty-minute `sync-settings` alarm, beside the three list syncs. The backend skips the write when
nothing changed. Quiet on failure, like the syncs.

Signed out from the dashboard, this session's refresh tokens are gone, so the next renewal fails
and the extension is signed out within the hour its current token has left. Nothing here has to
listen for it.

## The message contract

`lib/messages.ts` holds the shapes, as discriminated unions, in one place.

| Direction | Messages | Replies |
|---|---|---|
| dashboard → background | `ping`, `link` | `{ok, signedIn?}` |
| popup → background | `me`, `signOut` | `MeReply`, `{ok}` |
| content script → background | `capture`, `pageStatus`, `rememberShort`, `videoJob`, `videoDone` | `PageStatus`, `{ok}`, the button's `Label`, `boolean`, `{ok}` |
| popup → background | `pause`, `setBlocked` | `{ok}` |
| dashboard → background | `getSettings`, `setSettings` | `{ok, blocklist?, hosts?, schema?, pauseUntil?}` |
| dashboard → background | `pause` | `{ok, pauseUntil}` |
| popup → background | `stashShot` | `{ok}` |
| dashboard → background | `takeShot` | `{ok, shot?}` — the stashed screenshot, once, within ten minutes |
| popup → background | `indexUrl` | `PageStatus`: what became of the pasted link |
| dashboard → background | `indexUrl` | `{ok, status}` |
| dashboard → background | `refresh` | `{ok}`, after syncing every cached setting from the account (0.33.0) |
| content script → background | `pageJob` | `boolean`: whether this tab was opened to read a pasted link |

Two rules worth keeping: an external reply never carries tokens, and every listener returns `true` so
Chrome keeps the channel open for the async answer.

## Where capture hooks in

`withFreshToken()` is the seam, and it is the reason capture needed nothing in this file to change.
`lib/capture.ts` hands it a function, gets a usable token, and calls the mutation; the one retry and
the two decisions above apply to capture exactly as they do to reading the user. See
[Page capture](page-capture.md).

---

**Before this:** [Signing in](signing-in.md) · **Next:**
[The pinned extension id](the-pinned-extension-id.md) · **See also:**
[Running the tests](../setup/running-tests.md) · [Where output goes](../setup/debugging.md) ·
[Index](../README.md)
