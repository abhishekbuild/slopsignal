# Running the tests

For anyone changing `lib/`. By the end you will know how the suite runs with no browser, and the five
pieces of setup you would not guess.

```
npm test
```

A hundred and forty-nine tests across twelve files in `lib/`. Under a second, no browser, no network, no deployment,
no API key.

Everything tested lives in `lib/`, and that is the point of the split: `entrypoints/` is wiring a test
could only restate, `lib/` is the decisions. The session code still has the worst failure modes — a
wrong turn there signs people out, or keeps a session it should have dropped — and the capture gates
are a close second, because a gate that fails open sends a page nobody meant to send.

## The five pieces of setup

### The fake browser

`fakeBrowser` from `wxt/testing/fake-browser` is an in-memory implementation of the extension APIs.
`browser.storage.local` actually stores things, so the tests can assert on what was written.

It persists between tests, so **`fakeBrowser.reset()` in `beforeEach`** is not optional. Without it,
tokens written by one test leak into the next and the failures make no sense.

### WXT's vitest plugin

`vitest.config.ts` loads `WxtVitest()`. That is what supplies the path aliases, the `WXT_*` values from
`.env`, and the `browser` global. Ordinary vitest would fail on the first import.

### The Convex client, mocked whole

`lib/auth.ts` builds a `ConvexHttpClient` per call. The tests replace the class outright:

```ts
const convex = vi.hoisted(() => ({ action: vi.fn(), query: vi.fn(), setAuth: vi.fn() }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class { setAuth = convex.setAuth; action = convex.action; query = convex.query; },
}));
```

`vi.hoisted` is what makes it work: `vi.mock` is moved to the top of the file, so anything it closes
over has to be hoisted too. Declaring those mocks with a plain `const` gives you an
initialisation error.

Because every instance shares the same three functions, a test can assert on calls without caring
which instance made them — which is how the pairing test checks that the **old** token was used to
sign the previous session out.

## Building a token

Tokens are JWTs and the code reads their expiry, so a test needs one with a real payload. The helper
is three lines:

```ts
const jwt = (expiresAtMs: number) =>
  `h.${btoa(JSON.stringify({ exp: Math.floor(expiresAtMs / 1000), sub: "u|s" })).replace(/=+$/, "")}.sig`;
```

The header and signature are junk, because nothing here verifies them — only the backend does. `exp`
is in **seconds**, which is the detail to get right.

### A DOM, for the one suite that needs one

`lib/extract.test.ts` opens with a pragma rather than a line in `vitest.config.ts`:

```ts
// @vitest-environment happy-dom
```

Only the extractor touches a document. Setting the environment globally would make the other four
suites pay for a DOM they never use, and would hide the fact that they do not need one.

### Fake timers, for the one that waits

`lib/dwell.test.ts` and `lib/route.test.ts` run their timers in microseconds:

```ts
beforeEach(() => vi.useFakeTimers());
vi.advanceTimersByTime(14_000);
```

`startDwell` takes a visibility predicate rather than reading `document.hidden`, which is why this
suite needs no DOM either — the "hidden tab" test flips a local boolean.

## What the ten session tests pin down

The expiry check on a good token, a nearly-expired one, and a malformed one. `getToken` when signed
out, with a fresh token, and with a stale one that needs renewing. And then the three that matter
most, because each encodes a decision rather than a mechanism:

| Test | The decision it protects |
|---|---|
| a refresh the server rejects clears the session | a revoked session must not linger |
| a refresh that fails on the network **keeps** the session | flaky wifi must not sign anyone out |
| pairing stores the new session and signs the old one out | reconnecting leaves no orphan session on the server |

Those three are the ones to read before changing anything, and the ones most likely to fail for a good
reason if you change behaviour deliberately. If one goes red, work out which of the two behaviours you
actually want before editing the test.

## What the capture tests pin down

`lib/capture.test.ts` walks the gate order one gate at a time, and asserts twice each time: the status
returned, and that `convex.mutation` was **not** called. A gate that silently fails open still returns
the right word while sending the page anyway, and only the second assertion catches that.

The other three suites are ordinary unit tests over pure functions. The ones worth reading are
`notpaypal.com` not being blocked by `paypal.com` — a suffix match would block it — `docs.google.com`
not counting as a search page, and the extractor's fallback keeping the page furniture, which is a
known limitation pinned as a test so it reads as intent rather than an oversight.

## When you add to `lib/`

Add a test in the same file. Anything with an expiry, a retry, a decision about clearing storage, or a
decision about whether a page leaves the browser earns one — those are the paths where a plausible
change silently does the wrong thing, and none of them crash.

---

**Before this:** [Getting it running](install-and-run.md) · **Next:**
[Where output goes](debugging.md) · **See also:** [The session](../how-it-works/the-session.md) ·
[Index](../README.md)
