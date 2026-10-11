# Permissions

Every permission this extension asks for, what it buys, and what Chrome tells the user about it.
Written so it can be pasted into the Chrome Web Store listing at launch, and so a new permission is
a decision somebody has to write down rather than a line somebody adds.

## What is declared today

| Declared | Why | What Chrome shows the user |
|---|---|---|
| `storage` | The session, the blocked list, the pause, and each tab's capture status | nothing |
| `alarms` | Ends a timed pause on time. Without it a "paused" badge could outlive the pause. | nothing |
| `activeTab` | The popup's **Report a bug**: `tabs.captureVisibleTab` for the screenshot, and the tab's address and title from `tabs.query`. | nothing |
| a content script on `http://*/*` and `https://*/*` | Reads the page text after fifteen seconds of reading, and adds one button to a YouTube video. | **"Read and change all your data on all websites"** |

That last line is the one that matters, and it is unavoidable: Chrome uses the same wording for any
extension that can see page text, whether or not it writes any. The listing and the dashboard's
welcome page both answer it in one sentence — Tabcake reads, and nothing leaves the device until you
have read a page for fifteen seconds, never from a blocked domain, never while paused, never in
incognito.

**Until 0.13.0 that sentence went on to say Tabcake never changes a page, and it no longer can.** One
element is added, on YouTube videos and nowhere else: a button offering to remember the transcript, in a
shadow root so neither stylesheet can reach the other. It is removed when you leave the video.
Pressing it opens YouTube's own transcript panel to read it — off screen, under a style that is
added for the second it takes and removed with the panel — and closes the panel again. On a Short,
where YouTube has no transcript panel, pressing it opens the Short's video page in a background tab
that is closed again once the panel there has been read — a tab, not a permission: creating, muting
and removing one need none. So what is
written to a page is that button and, briefly and invisibly, YouTube's own panel. The honest version
of the sentence says so rather than claiming something a reader could disprove in a minute.

### What `activeTab` grants, and when

`activeTab` shows no install warning. The Chrome permissions list documents it as one that triggers
none, which is the reason it exists: temporary access to one tab, in place of a standing permission.

Chrome grants it when you invoke the extension: clicking the toolbar icon, or pressing Ctrl+Shift+K.
The grant covers the tab you are on, and ends when that tab navigates away or closes. So, said
exactly: the grant arrives every time you open the popup, not only when you press Report a bug. What
is true is that nothing uses it until you press Report a bug. Then the popup screenshots the visible
part of that tab and reads its address and title, to send with your report. Nothing reads them at
any other moment.

Why not the alternatives:

- **`tabs`** would make `tab.url` readable for every tab, always, and shows *"Read your browsing
  history"*. Report a bug needs one tab, once.
- **`<all_urls>` as a host permission** is what `captureVisibleTab` asks for without `activeTab`.
  It would let the extension screenshot any tab at any moment, and it adds its own warning line.
  The content script's `matches` does not count for this: it lets the script run, not the
  background capture.

Chrome refuses the screenshot on its own pages (`chrome://`), the Web Store, and some built-in
viewers, whatever the permissions. The popup then opens the feedback page without a picture.

## What is not declared, and why

**`tabs`.** Never. It would show *"Read your browsing history"*, and the only thing the popup wants
from a tab is its id — which `tabs.query` gives with no permission at all. The hostname the popup
shows comes from the content script, which knows it for free. The one exception is Report a bug,
which reads the address of the tab you are on through `activeTab` (above), not `tabs`.

**`favicon`.** Considered for the popup's search results and rejected. It would show *"Read the icons
of the websites you visit"* — the Chrome permissions list documents it as a warning permission, not a
silent one. That is a second warning line beside the content script's, at the moment a new user is
deciding whether to trust this, in exchange for 16 pixels of decoration. Results show the site's
first letter on a disc instead. Revisit only if users say the letters are genuinely hard to scan.

**`webNavigation`.** It would tell the background when a single-page app changes route, and it
shows *"Read your browsing history"* — the same warning as `tabs`, for something the content script
sees for free by comparing `location.href` once a second. `lib/route.ts` does that instead, and says
so in writing.

**`host_permissions`.** None. The content script's `matches` gives it what it needs; a host
permission would add nothing and read worse.

**`history`.** Deferred with the history-import feature itself, and when it arrives it will be an
*optional* permission requested from a button after the first capture — not at install. The
reasoning is in build_plan.md §4.3.

`commands` is not in this table because it is not a permission. `_execute_action` opens the popup on
Ctrl+Shift+K and costs nothing.

## The rule

**A new permission is a product decision, not a build detail.** Before adding one, check
[the Chrome permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list)
for the warning it triggers, and write the answer into this table. An extension that reads what you
browse is judged on this screen more than on any other.

`incognito: "not_allowed"` is the other half of the same posture: incognito is meant to leave no
trace, so the honest answer is not to run there. Chrome enforces it, which beats code that would
have to be right forever.

---

**See also:** [Privacy controls](../how-it-works/privacy-controls.md) ·
[Popup search](../how-it-works/popup-search.md) · [Page capture](../how-it-works/page-capture.md) ·
[Conventions](conventions.md) · [Index](../README.md)
