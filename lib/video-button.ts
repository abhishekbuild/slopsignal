/**
 * The one thing Tabcake puts into a page.
 *
 * A video's text is the sidebar, the comments and the up-next list, so the page is never read. What
 * is worth remembering is what was said, and the only person who knows whether this video is worth
 * remembering is the one watching it. So: a button, on the video, and nothing happens until it is
 * pressed.
 *
 * Plain DOM in a shadow root. No React — a hundred and forty kilobytes on every https page for one
 * button — and no stylesheet, which would mean `cssInjectionMode` and a build entry for a few rules.
 * The shadow root is what keeps YouTube's stylesheet and ours from reaching each other.
 */
import type { PageStatus } from "./messages";
import { openTranscript, readTranscript, videoMeta } from "./transcript";
import { PALETTE } from "./palette";

/** The id the host element carries, so a second mount can find the first and leave. */
const HOST_ID = "tabcake-video-button";

/**
 * Which page the button is on, and what pressing it means there.
 *
 * A watch page reads the transcript and saves it. A Short cannot: the Shorts player has no
 * transcript panel, and YouTube's transcript endpoint refuses anything that is not its own player.
 * So a Short's button asks the background, which opens the Short's video page in a tab you never
 * see (`lib/shorts.ts`), and `remember` answers with what that page's button ended up saying. That
 * page is a watch page with `pressAtOnce`, and `report` is how its button hands its words back.
 */
export type Mode =
  | { kind: "watch"; pressAtOnce: boolean; report?: (label: Label) => void }
  | { kind: "short"; remember: () => Promise<Label | undefined> };

/** Where each kind of page has room for one more button, and which end of it. */
const ANCHORS: Record<Mode["kind"], { selectors: string[]; where: "append" | "prepend" }> = {
  // The centred flex row holding the avatar, the channel name and Subscribe: after Subscribe, in
  // the gap before the like button, where a button about this video reads as being about it.
  watch: { selectors: ["ytd-watch-metadata #owner"], where: "append" },
  // The column of round buttons beside the active Short: above Like. `[is-active]`, because YouTube
  // keeps the neighbouring Shorts rendered — and keeps the last watch page's row in the DOM, hidden,
  // which is why each kind looks only for its own anchor.
  //
  // The column is `reel-action-bar-view-model` since 2026; `#actions` was the one before it. The
  // `:has()` lines are the safety net for the next rename: whatever the column is called, it is the
  // element the Like button sits in. One per name, because not every engine takes a list in there.
  short: {
    selectors: [
      "ytd-reel-video-renderer[is-active] reel-action-bar-view-model",
      "ytd-reel-video-renderer[is-active] ytd-reel-player-overlay-renderer #buttons",
      "ytd-reel-video-renderer[is-active] #actions",
      "ytd-reel-video-renderer[is-active] *:has(> like-button-view-model)",
      "ytd-reel-video-renderer[is-active] *:has(> ytd-like-button-renderer)",
      "ytd-reel-video-renderer[is-active] *:has(> #like-button)",
      "reel-action-bar-view-model",
      "#actions.ytd-reel-player-overlay-renderer",
    ],
    where: "prepend",
  },
};

/** How long to keep looking for the anchor before settling for the corner of the window. */
const ANCHOR_TIMEOUT_MS = 10_000;

/** How often to look, and how often to check the anchor has not been rebuilt without the button. */
const ANCHOR_POLL_MS = 1000;

/**
 * How long after the row renders before a watch page opened from a Short presses its own button.
 * ponytail: a fixed wait. The description renders with the row, and waiting on its own selector is
 * one more selector to keep.
 */
const PRESS_DELAY_MS = 2000;

/**
 * Where the button sits, written inline on the host and marked important.
 *
 * **Found by polling, with the corner of the window as the fallback.** The content script runs at
 * `document_idle` and YouTube renders the page after that, so the anchor is not there when this
 * runs. 0.13.0 looked once, found nothing, fell back to the top of `<body>` and sat under the fixed
 * masthead; 0.13.1 gave up on anchoring and fixed the button bottom-left, where it sat on top of the
 * channel avatar. So: once a second for ten seconds, look for the anchor. When it appears the host
 * moves into it, and if YouTube rebuilds it the host is put back. After ten seconds without one —
 * an element YouTube has renamed — the button goes where 0.13.1 put it. Bottom **left**, because
 * the right edge is where YouTube's own controls live on both surfaces.
 *
 * **Inline rather than `:host`, because the host is not in the shadow tree.** The shadow root hides
 * the button's insides from the page, but the host element itself is an ordinary div in the page's
 * own DOM, and a page rule that matches it beats `:host` outright — that is the cascade, not a
 * specificity contest. Inline and important is the one declaration a stylesheet cannot reach.
 * `all: initial` clears whatever the page had already applied; the rest re-states what is needed.
 */
const ROW_STYLE = [
  "all: initial !important",
  "display: inline-flex !important",
  "align-items: center !important",
  "margin-left: 8px !important",
].join("; ");

// A 48px square in the column, the size of YouTube's own round buttons. `relative`, so the button
// inside can grow out of it to the right without the column moving.
const COLUMN_STYLE = [
  "all: initial !important",
  "display: block !important",
  "position: relative !important",
  "width: 48px !important",
  "height: 48px !important",
  "margin-bottom: 16px !important",
].join("; ");

const CORNER_STYLE = [
  "all: initial !important",
  "position: fixed !important",
  "left: 24px !important",
  "bottom: 24px !important",
  // Above YouTube's own overlays, which go high.
  "z-index: 2147483647 !important",
  "display: block !important",
].join("; ");

/**
 * Only the button needs this: it is inside the shadow root, where the page cannot reach it.
 *
 * Ink with cream text, the product's primary, since 0.23.0 (audit E-15). It was a Butter pill, which
 * in YouTube's palette read as a warning-yellow button, and it said "Save" where everything else
 * says "remember".
 *
 * Two shapes. The pill is thirty-six pixels tall with an eighteen-pixel radius, YouTube's own, so it
 * sits in the owner row as one of them. The round one is YouTube's Shorts button: a 48px circle
 * showing only its icon, which grows to the right on hover or focus to show its text — over empty
 * space, so nothing beside it moves.
 */
const STYLE = `
  button {
    display: inline-flex; align-items: center; gap: 8px;
    height: 36px; padding: 0 16px; border: 0; border-radius: 18px;
    background: ${PALETTE.ink}; color: ${PALETTE.cream};
    font-family: Roboto, Arial, sans-serif;
    font-size: 14px; font-weight: 500; line-height: 1; white-space: nowrap; cursor: pointer;
  }
  button[disabled] { background: ${PALETTE.muted}; color: ${PALETTE.mutedForeground}; cursor: default; }
  button:focus-visible { outline: 2px solid ${PALETTE.ink}; outline-offset: 2px; }
  svg { width: 24px; height: 24px; flex: none; fill: currentColor; }
  .pill svg { display: none; }
  .round {
    position: absolute; left: 0; top: 0; box-sizing: border-box;
    height: 48px; max-width: 48px; padding: 0 12px; border-radius: 24px;
    overflow: hidden; transition: max-width 0.25s ease;
  }
  .round span { opacity: 0; transition: opacity 0.15s ease 0.1s; }
  .round:hover, .round:focus-visible { max-width: 320px; }
  .round:hover span, .round:focus-visible span { opacity: 1; }
  @keyframes spin { to { transform: rotate(360deg); } }
  svg.busy { animation: spin 1s linear infinite; }
`;

/** One icon per state, as 24px Material paths. The pill hides its icon; the round button is its icon. */
export const ICONS = {
  idle: "M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z",
  busy: "M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z",
  saved: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  alert:
    "M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z",
};
export type Icon = keyof typeof ICONS;

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * What the button does when pressed, and what the background said about it. `undefined` is no
 * answer at all: the background asleep, the extension reloaded under this tab, a handler that threw.
 */
export type SaveVideo = (video: {
  title: string;
  channel: string;
  description: string;
  transcript: string;
}) => Promise<PageStatus | undefined>;

/** What the button shows: its words, whether pressing it again could help, and its icon. */
export type Label = { text: string; again: boolean; icon: Icon };

/**
 * What the button says once the background has answered.
 *
 * The answer is the same `PageStatus` the popup shows for the tab, so the two never disagree about
 * what happened to a video. A revisit is a save: the video was already there, and it still is.
 *
 * ponytail: six sentences, not one per `SkipReason`. Signing in, agreeing to the disclosure and
 * unpausing are the three a person can do from the popup right now, so they are named; the rest are decisions the popup already
 * explains, and the popup is one click away.
 */
export function labelFor(status: PageStatus | undefined): Label {
  if (status?.state === "remembered") return { text: "Remembered in Tabcake", again: false, icon: "saved" };
  if (status?.state === "skipped") {
    if (status.reason === "signed-out") return { text: "Sign in to Tabcake first", again: true, icon: "alert" };
    if (status.reason === "no-consent") return { text: "Turn on Tabcake in its popup first", again: true, icon: "alert" };
    if (status.reason === "paused") return { text: "Tabcake is paused", again: true, icon: "alert" };
    return { text: "Tabcake skipped this video", again: false, icon: "alert" };
  }
  return { text: "Could not remember that", again: true, icon: "alert" };
}

/** What it says before a press and during one, and the two ends a watch page reaches before anything is sent. */
const IDLE: Label = { text: "Remember this video's transcript", again: true, icon: "idle" };
const READING: Label = { text: "Reading the transcript…", again: false, icon: "busy" };
const NO_TRANSCRIPT: Label = { text: "No transcript for this video", again: false, icon: "alert" };
const UNREADABLE: Label = { text: "Could not read the transcript", again: true, icon: "alert" };

/**
 * Puts the button on the page and hands back the way to take it off again.
 *
 * **Removing it is the half that has to be right.** Every video is its own address, and `watchAddress`
 * cancels before it re-enters, so this cancel runs on every scroll to the next short. A button left
 * behind would save the video you had just scrolled away from — the one way this feature can store
 * something wrong rather than storing nothing.
 */
export function mountVideoButton(doc: Document, save: SaveVideo, mode: Mode): () => void {
  // Mounting twice would leave two buttons, and only one of them would ever be removed.
  doc.getElementById(HOST_ID)?.remove();

  const host = doc.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "open" });

  const style = doc.createElement("style");
  style.textContent = STYLE;
  const button = doc.createElement("button");
  button.type = "button";
  button.className = mode.kind === "short" ? "round" : "pill";
  const icon = doc.createElementNS(SVG_NS, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS(SVG_NS, "path");
  icon.append(path);
  const label = doc.createElement("span");
  button.append(icon, label);
  root.append(style, button);

  let gone = false;

  /** `again` is whether pressing it a second time could do any good. */
  const say = ({ text, again, icon: shape }: Label) => {
    if (gone) return;
    label.textContent = text;
    // The round button shows its words only on hover; this is how they are read the rest of the time.
    button.setAttribute("aria-label", text);
    button.disabled = !again;
    path.setAttribute("d", ICONS[shape]);
    icon.classList.toggle("busy", shape === "busy");
  };
  // Where a watch page's press ends, whatever it says: shown here, and handed back when this page is
  // reading for a Short. Handed back even after the address has changed — the words are still the answer.
  const done = (words: Label) => {
    say(words);
    if (mode.kind === "watch") mode.report?.(words);
  };
  say(IDLE);

  // Where it is decides how it is styled. In fullscreen it is hidden either way: the anchors are
  // under the player there, and in the corner it would sit on top of the play and volume controls.
  const restyle = () => {
    host.style.cssText =
      host.parentElement === doc.body ? CORNER_STYLE : mode.kind === "short" ? COLUMN_STYLE : ROW_STYLE;
    // `!= null`: an engine without the Fullscreen API has no property at all, and no fullscreen.
    if (doc.fullscreenElement != null) host.style.setProperty("display", "none", "important");
  };
  doc.addEventListener("fullscreenchange", restyle);

  // Into the anchor if there is one, and back into it if YouTube rebuilt it without us. Only after
  // the anchor has failed to appear for long enough does the corner do; `append`, so it is the last
  // child of `body` and shifts nothing on the page.
  const anchor = ANCHORS[mode.kind];
  const startedAt = Date.now();
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  const place = () => {
    const target = first(doc, anchor.selectors);
    if (target !== null) {
      if (host.parentElement !== target) {
        target[anchor.where](host);
        restyle();
        // A watch page opened from a Short presses itself once the row is there, and once only.
        if (mode.kind === "watch" && mode.pressAtOnce && pressTimer === undefined) {
          pressTimer = setTimeout(() => button.click(), PRESS_DELAY_MS);
        }
      }
    } else if (!host.isConnected && Date.now() - startedAt >= ANCHOR_TIMEOUT_MS) {
      doc.body.append(host);
      restyle();
    }
  };
  place();
  const timer = setInterval(place, ANCHOR_POLL_MS);

  button.addEventListener("click", () => {
    say(READING);
    if (mode.kind === "short") {
      // Nothing on a Short can be read. The background reads it on the video page, in a tab you
      // never see, and this button says whatever that page's button said.
      void mode.remember().then((words) => say(words ?? labelFor(undefined)));
      return;
    }

    void (async () => {
      // No button on the page means this video has no captions. That is not a failure — nothing
      // broke, and there was never anything to read — so there is nothing to try again either.
      const restore = await openTranscript(doc);
      if (restore === null) return done(NO_TRANSCRIPT);
      // Another video by now, with its own description and panel. Neither is ours to touch.
      if (gone) return;

      const transcript = readTranscript(doc);
      // After the transcript and before the restore, so it reads what the page is showing.
      const meta = videoMeta(doc);
      // Before the round trip, so the page is back to normal in about a second whatever the account
      // says. From here on the only thing on the page that changes is this button.
      restore();

      // The panel opened and no reader found a line in it. That is YouTube having changed its markup.
      if (transcript === "") return done(UNREADABLE);

      // Saved is the end of it. Un-saving is the popup's Forget button, which already works on the
      // tab you are looking at — one button here has no room to explain what would go.
      done(labelFor(await save({ ...meta, transcript })));
    })();
  });

  return () => {
    gone = true;
    clearInterval(timer);
    clearTimeout(pressTimer);
    doc.removeEventListener("fullscreenchange", restyle);
    host.remove();
  };
}

/** The first of these that is on the page. A selector this engine cannot parse is skipped, not fatal. */
function first(doc: Document, selectors: string[]): Element | null {
  for (const selector of selectors) {
    try {
      const el = doc.querySelector(selector);
      if (el !== null) return el;
    } catch {
      // `:has()` on an engine older than it. The next selector may still be there.
    }
  }
  return null;
}
