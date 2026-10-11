# The pinned extension id

For anyone wondering what that base64 blob in `wxt.config.ts` is, or what `tabcake.pem` is doing in
the repo root. By the end you will know why the id is pinned, how it was derived, and what not to do
with the key.

The id is **`ngeaffckbmmghligcbeimhkedggfgcfa`**, on every machine, in every build.

## Why it has to be stable

The dashboard addresses the extension by id:

```ts
chrome.runtime.sendMessage(EXTENSION_ID, message, callback)
```

There is no way to say "whichever extension is Tabcake". The id is the address.

By default Chrome derives that id from wherever the unpacked folder happens to be, so it differs
between machines and changes if you move the folder. The dashboard's `NEXT_PUBLIC_EXTENSION_ID` would
then be wrong for everyone but the person who set it, and pairing would fail as "extension not
installed" — which is exactly the symptom that sends you hunting in the wrong place.

## How pinning works

Add a `key` to the manifest and Chrome derives the id from that instead. `wxt.config.ts` carries it.

The value is the **public** half of an RSA key, as base64-encoded SPKI DER. It is not a secret: it
ships inside every copy of the extension and anyone can read it out of the manifest.

The id is a straightforward function of it — SHA-256 the same DER bytes, take the first 16, and map
each nibble to the letters `a` through `p`. The full 32-character result is the id. That mapping is
why extension ids look like that, and it is why the id cannot be chosen: it falls out of the key.

## How it was generated

Once, with Node's own crypto and about ten lines:

```js
const { generateKeyPairSync, createHash } = require("node:crypto");
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const spki = publicKey.export({ type: "spki", format: "der" });
console.log("manifest.key =", spki.toString("base64"));
const h = createHash("sha256").update(spki).digest().subarray(0, 16);
console.log("id =", [...h].map(b => "abcdefghijklmnop"[b >> 4] + "abcdefghijklmnop"[b & 15]).join(""));
```

The public half went into `wxt.config.ts`. The private half was written to `tabcake.pem`.

**You should not need to run this again.** Regenerating gives a new id, which means updating the
dashboard's environment variable and re-pairing every installation.

## `tabcake.pem`

The private key. It sits in the repo root and it is gitignored by the `*.pem` line.

| Rule | Why |
|---|---|
| Never commit it | The remote is on GitHub. Committing it publishes it. |
| Never print or paste it | Including into a log, an issue, or a chat message. |
| Never move it out of this folder | It is easy to lose track of, and it cannot be regenerated without changing the id. |

What it is actually *for* is narrow: the first Chrome Web Store upload, which uses it to keep the
id, and packing a `.crx` by hand. Day-to-day development never touches it. `CLAUDE.md` restates this rule,
because "never commit" and "there is a private key in the working tree" are worth saying together.

If it were lost today, nothing would break: the public `key` in the manifest is what pins the id, and
that is committed. You would miss it at the first store upload: without it the store assigns a
new id, and the dashboard has to be pointed at that one instead.

## Publishing

The store will not take a manifest that carries `key`. On the **first** upload you remove the `key`
line from the built manifest and put `tabcake.pem` at the root of the zip as `key.pem`; the store
derives the id from it, so the store id matches the pinned one. Later uploads drop `key` and carry no
`key.pem`. The steps, and the fallback if the store refuses the key, are in
[Publishing to the Chrome Web Store](../guides/publish-to-the-chrome-web-store.md).

---

**Before this:** [The session](the-session.md) · **See also:** [Signing in](signing-in.md) ·
[Getting it running](../setup/install-and-run.md) · [Conventions](../reference/conventions.md) ·
[Index](../README.md)
