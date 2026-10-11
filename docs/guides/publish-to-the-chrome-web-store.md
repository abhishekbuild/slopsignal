# Publishing to the Chrome Web Store

For whoever is putting Tabcake in the Chrome Web Store, first time or any time after. By the end you
will know what to fix before you upload, how to keep the extension id, what to type into every tab
of the developer dashboard, and why each answer is the one a reviewer expects.

Tabcake is the kind of extension the store looks at hardest: it reads the text of every page you
visit and sends some of it to a server. That is fine — it is the product — but it means a person
will review the code, not only a scanner. Every answer below is written so that person finds what
the listing promised and nothing it did not.

## Before you build

`npm run build` is the store build. It reads `.env.production`, so it signs in through
`https://app.tabcake.com` and its manifest's `externally_connectable` allows that origin and no
other — `localhost` stays out, so no program on a user's machine can hand the extension a link code.
Check both before every upload:

- `.env.production.local` does not exist. It overrides `.env.production`, and it is how you point a
  demo build at your local dashboard ([Getting it running](../setup/install-and-run.md)).
- `.output/chrome-mv3/manifest.json` lists `https://app.tabcake.com/*` under
  `externally_connectable`.
- `https://app.tabcake.com` is up and talks to the same Convex deployment as `.env.production`.
  If it does not, every user fails to sign in and the reviewer rejects it as "functionality not
  working" (`Yellow Magnesium`).

The disclosure inside the popup is built (0.26.0). See
[The disclosure the store now requires](#the-disclosure-the-store-now-requires).

The extension id does not need fixing. It does need one step on the first upload — see the next
section.

## The extension id on the first upload

The dashboard addresses the extension by id, so the store copy should keep
`ngeaffckbmmghligcbeimhkedggfgcfa`, the id everything is already configured against
([The pinned extension id](../how-it-works/the-pinned-extension-id.md)).

The store will not take a package whose `manifest.json` carries a `key` field. It takes the private
key instead, once:

1. Run `npm run build`.
2. Copy `.output/chrome-mv3` to a folder outside the repo.
3. In that copy's `manifest.json`, delete the `"key"` line.
4. Copy `tabcake.pem` into the root of that folder, renamed to `key.pem`.
5. Zip the **contents** of the folder, so `manifest.json` and `key.pem` sit at the top of the zip,
   not inside a subfolder.
6. Upload that zip. Then delete the copy and the zip, because the zip now holds the private key.

After it uploads, open the item's **Package** tab and check the id it shows. It should be
`ngeaffckbmmghligcbeimhkedggfgcfa`.

Every later upload is the build with the `key` line removed and **no** `key.pem`. The store keeps the
id from the first upload.

**If the first upload fails with a "Gallery system error".** Developers have reported this with a
`key.pem` in the zip. Upload without it and let the store assign an id. Then copy the public key
from **Package → View public key** into `manifest.key` in `wxt.config.ts`, so local builds share the
store id, and set the dashboard's `NEXT_PUBLIC_EXTENSION_ID` to the new id. You lose nothing but a
round of configuration, because no one has installed the store copy yet.

Never commit the zip, and never leave `key.pem` anywhere but this folder as `tabcake.pem`.

## Test the exact zip you will upload

Reviewers install your package, not your dev build, and an unpacked folder can behave differently
from a packed one. Unzip the file you are about to upload, load that folder from
`chrome://extensions`, and go through the whole path a new user takes:

- install, open the popup, sign in through the production dashboard
- read a page for fifteen seconds and see the Butter dot
- search from the popup with Ctrl+Shift+K
- pause, block a site, forget a page
- the YouTube button on a video and on a Short
- turn the network off and open the popup: it must say something, not hang

If any of these depends on the backend, check it is deployed and up for the whole review window.
A backend that is down while the reviewer tests is a rejection.

`version` must be higher than anything already uploaded. It comes from `package.json`, so a bump
under the repo's normal rules is enough. The store cannot edit the manifest after upload, so a typo
in the name or description costs a new version.

## The developer account

At [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole):

- **Use a company Google account**, not a personal one. The account owns the listing, and moving a
  listing to another account later is a support ticket, not a setting.
- **Turn on 2-step verification.** The store requires it to publish.
- **Pay the one-time $5 registration fee.**
- **Fill in the account page**: publisher name (`Tabcake`), a contact email you read, and verify it.
  If you sell to people in the EU you will be asked whether you are a *trader*. A company offering a
  product is a trader; the address and phone you give are shown on the listing.
- **Verify `tabcake.com`** through Google Search Console with the same account, then pick it as the
  publisher's official site. The listing then shows `tabcake.com` under the title with a verified
  mark, which matters for an extension asking to read every page.

## The Store listing tab

**Name and summary** come from the manifest: `Tabcake` and "Everything you have read, searchable by
meaning." The summary limit is 132 characters. Keyword-stuffing either one is a rejection
(`Yellow Zinc`, keyword spam).

**Description.** Open with one sentence that says what it does, then the features, then what it
reads and when. Reviewers check that every feature in the code is in the description, so name the
YouTube button — it is the one place the extension adds anything to a page. A draft:

> Tabcake remembers what you read so you can find it again by meaning, not by the exact words.
>
> Read a page for fifteen seconds and Tabcake saves its text to your private Tabcake memory. A dot on
> the toolbar icon tells you the page was remembered. Press Ctrl+Shift+K on any tab to search
> everything you have read.
>
> On YouTube, a button lets you save a video's transcript the same way.
>
> You stay in control. Pause capture for 15 minutes, an hour, or until you resume, block any site, or
> forget the page you are on, all from the toolbar. Tabcake never runs in incognito windows, skips
> pages with too little text to be worth keeping, and removes card numbers and phone numbers before
> anything leaves your browser.
>
> Tabcake needs a free Tabcake account. Sign in from the popup.

Keep the last line. An extension that needs an account must say so before install.

**Category.** Productivity → Workflow & Planning (or Tools).

**Language.** English.

**Images.**

| Asset | Size | Required | Notes |
|---|---|---|---|
| Store icon | 128×128 PNG | yes | `public/icon/128.png`. The artwork should fill about 96×96 with transparent padding, and read on light and dark backgrounds. |
| Screenshots | 1280×800 (or 640×400) | at least 1, up to 5 | Real UI at real size. One idea per screenshot: capture dot, popup search, privacy controls, YouTube button, the dashboard. |
| Small promo tile | 440×280 PNG or JPEG | yes | Logo and one line. Very little text — it is shown small. |
| Marquee tile | 1400×560 | no | Only needed to be featured. |
| Promo video | YouTube link | no | Thirty seconds of the real thing beats any tile. |

Do not put another company's logo in a screenshot or tile. Naming YouTube in the description to say
what the button does is fine; making it look like a YouTube product is not.

**Additional fields.** Official URL: `tabcake.com`. Homepage: `https://www.tabcake.com`. Support:
a page or email that a person answers.

## The Privacy practices tab

This is the tab that decides the review. Fill it in so it matches the privacy policy word for word
in substance — the store compares them, and so do users.

**Single purpose.** One sentence, one purpose:

> Tabcake saves the text of web pages you read so you can search them later by meaning.

Search, pause, the blocklist and the YouTube button all serve that one purpose. Say so in the
description, not by listing them as purposes here.

**Permission justifications.** One field per permission the manifest declares. The answers below
come from [Permissions](../reference/permissions.md); if that table changes, change these.

| Field | Answer |
|---|---|
| `storage` | Keeps the user's sign-in session, their blocked sites, whether capture is paused, and each tab's capture status. |
| `alarms` | Ends a timed pause on time, so the "paused" badge does not outlive the pause the user chose. |
| Host permission (`http://*/*`, `https://*/*`) | Tabcake's purpose is remembering any page the user reads, so it cannot know the sites in advance. The content script reads a page's text only after fifteen seconds of reading, never on blocked sites, while paused, or in incognito. On YouTube it adds one button to save a transcript. `activeTab` does not fit: it needs a click on every page, and capture is meant to happen without one. |

That last row is the one a reviewer reads twice. The broad match is why the dashboard warns that the
item "may require an in-depth review". Expect it.

**Remote code.** "No, I am not using remote code." This is true today: everything, including the
Convex client and the fonts, is bundled at build time. Keep it true — no `<script>` from a CDN, no
`eval`, no code fetched as data. Manifest V3 forbids it anyway, and it is rejection `Blue Argon`.

**Data usage — what is collected.** Tick what the extension sends or keeps, not only what feels
sensitive:

| Category | Tick | Because |
|---|---|---|
| Website content | yes | Page text and titles, and YouTube transcripts |
| Web history | yes | The address of each page captured |
| Authentication information | yes | The session tokens kept in `storage` |
| Personally identifiable information | yes, if the account holds an email or name | The account the user signs in with |
| User activity | no | Tabcake does not record clicks, keystrokes or scrolling. The fifteen-second timer runs in the tab and only its outcome leaves. |
| Health, financial, location, personal communications | no | Not collected for their own sake. Card numbers are redacted in the tab. |

Reading a page with medical or banking content still sends its text. If the privacy policy says
so plainly, the "no" above is honest; if it does not, add a line to the policy rather than guessing.

**Data usage — the three certifications.** You must tick all three: no selling or transfer outside
the allowed uses, no use unrelated to the single purpose, no use for credit or lending. Tick them
only if the backend matches. In particular, if page text is sent to an AI provider to embed or
classify it, that is a transfer "necessary to provide the single purpose", which is allowed — but
the privacy policy has to name it.

**Privacy policy URL.** `https://tabcake.com/privacy`.

## The privacy policy: what it must say

The store's [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
and Limited Use policy expect the policy to cover the following. Check
`https://tabcake.com/privacy` against each line before you submit:

- It names the extension, not only the website. Say "the Tabcake website, dashboard and Chrome
  extension".
- Exactly what the extension collects: page addresses, titles, headings, page text, YouTube
  transcripts, search queries, account details.
- When it collects: after fifteen seconds on a page; never on blocked sites, while paused, or in
  incognito.
- What is removed before sending: card numbers, phone numbers, long digit runs.
- Every third party that receives the data and why — the hosting provider (Convex) and any AI or
  embedding provider.
- How long it is kept, and how a user deletes one page, a site, or everything.
- That no human reads it except with consent, for security, or by law.
- That it is never sold or used for advertising.
- The Limited Use sentence, or one like it: "Tabcake's use of information received from the Chrome
  extension adheres to the Chrome Web Store User Data Policy, including the Limited Use
  requirements."
- A contact address and an effective date.

## The disclosure the store now requires

From **1 August 2026** the store requires every kind of data collection to be prominently disclosed
to the user, even collection that is the extension's whole point, and requires telling users when
data handling changes after install. A sentence in the listing or the privacy policy does not count:
the disclosure must be in the product's own interface, and the user must agree by taking an action.

Tabcake does this in the popup. After sign-in it shows **Before Tabcake starts**: what is sent,
that servers and AI services process it, what is never sent, the privacy policy, and **Start
remembering pages**. Nothing about any page is sent until that is pressed. How it works is in
[Privacy controls](../how-it-works/privacy-controls.md#the-first-run-agreement).

Two things keep it true after launch:

- **When what is collected changes, raise `CONSENT_VERSION` in `lib/consent.ts`** and change the
  wording in the same release. Every user sees the screen again and capture waits for them.
- **Keep the screen and the privacy policy saying the same things.** The screen names AI services;
  the policy should name which ones.

Put a screenshot of this screen in the listing. It shows the reviewer the disclosure before they
look for it.

## The Test instructions tab

Reviewers cannot test an extension they cannot sign into. Give them:

- a reviewer account on the production dashboard, with its email and password
- the sign-in steps: open the popup, press **Sign in with Tabcake**, sign in on the dashboard, return
- what to do to see it work: read any article for fifteen seconds, watch for the dot, press
  Ctrl+Shift+K and search a word from it
- where the YouTube button appears, and that a Short opens a muted background tab for a moment

Keep that account working and its password unchanged until the review ends.

## The Distribution tab

- **Payments**: free.
- **Visibility**: start with **Unlisted** if you want a few real users first — the link works, search
  does not show it — then switch to **Public**.
- **Regions**: all, unless you have a reason.

## Submit

Press **Submit for review**. In the dialog, untick "publish automatically" if you want to choose the
moment. After approval you then have **30 days** to press Publish, or the submission goes back to
draft.

Review times vary. Narrow extensions often clear in a day; one with Tabcake's host match goes to a
person and can take several days to a few weeks. If it is still pending after three weeks, contact
developer support from the dashboard. Turn on the "published" and "staged" email notices on the
account page so you hear about it.

## If it is rejected

The email names a policy and a code. The common ones for an extension like this:

| Code | Means | Usual fix here |
|---|---|---|
| `Purple Potassium` | Excessive permissions | Make the host-permission justification match the code exactly |
| `Yellow Magnesium` | Functionality not working | Production backend or dashboard was down, or the test account failed |
| `Yellow Zinc` | Missing or poor metadata | A feature in the code that the description does not mention |
| `Purple Lithium` | Privacy policy | The policy is missing, unreachable, or leaves out a data type ticked on the Privacy tab |
| `Purple Nickel` | Prominent disclosure | No in-product disclosure and consent |
| `Blue Argon` | Remote code in Manifest V3 | Something loaded from a URL at run time |
| `Red Magnesium` / `Red Copper` / `Red Lithium` | Single purpose | The listing reads as more than one product |
| `Red Nickel` / `Red Potassium` / `Red Silicon` | Deceptive behaviour | The code does something the listing does not say, such as writing to a page |
| `Purple Copper` | Insecure transmission | Data sent over plain `http` |
| `Red Titanium` | Obfuscation | Minified code is allowed; deliberately obscured code is not |

Fix, bump the version, upload, resubmit. If the email does not say enough to act on, ask developer
support which flow failed before guessing.

## Every update after the first

1. Bump the version as usual and build.
2. Remove the `key` line from the built `manifest.json`. Do not add `key.pem`.
3. Zip, upload on the **Package** tab, and submit.
4. If the update adds a permission, Chrome **disables the extension for existing users** until each
   one accepts the new warning. Treat a new permission as a release decision, as
   [Permissions](../reference/permissions.md) already says.
5. If the update changes what is collected, update the Privacy practices tab, the privacy policy,
   and the in-product disclosure in the same release.

`npm run zip` produces a zip, but it keeps the `key` line, so it is not upload-ready as it stands.
When uploads become routine, `wxt submit` can upload and submit through the Chrome Web Store API
instead of the dashboard; set that up once the first listing exists.

---

**Before this:** [Getting it running](../setup/install-and-run.md) · **See also:**
[The pinned extension id](../how-it-works/the-pinned-extension-id.md) ·
[Permissions](../reference/permissions.md) · [Privacy controls](../how-it-works/privacy-controls.md) ·
[Page capture](../how-it-works/page-capture.md) · [Index](../README.md)
