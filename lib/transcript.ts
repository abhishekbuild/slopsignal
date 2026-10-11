/**
 * Reading what was said in a YouTube video, out of YouTube's own transcript panel.
 *
 * **This is scraping, and it will break.** It is here because every alternative is worse: the
 * `timedtext` endpoint has needed a proof-of-origin token since April 2026 and answers with an
 * empty 200 without one, `youtubei/v1/get_transcript` answers `FAILED_PRECONDITION` to anything
 * that is not YouTube's own player (tested September 2026), the official API only serves captions
 * for videos you own, and a third-party transcript service would mean every video address you open
 * leaving this browser. Clicking the button a person would click is the only route left that keeps
 * the promise the rest of this extension makes.
 *
 * ponytail: DOM scraping, and the ceiling is YouTube's markup. It already changed once in February
 * 2026, which is why there are three readers and two panel ids. The symptom of a break is an empty
 * transcript and the fix is a new selector — never a wrong transcript, because nothing here can
 * return the sidebar by mistake. If the selectors become too much to keep up with, the upgrade is a
 * same-origin `fetch(location.href)` and parsing `ytInitialPlayerResponse` out of the HTML for the
 * metadata. Not `timedtext` or `get_transcript`, which are the doors that are actually shut.
 *
 * The page carries **both** panels at once, each with its own close button, and which one opens is
 * YouTube's choice. So nothing here acts on "the panel" by id: `openPanel` finds the one that is
 * open — the one holding the cues — and the reading and the closing happen there. Until 0.24.0 the
 * close went to the first id's button, which was the other panel's, and the open one stayed on
 * screen.
 */

/** How long to wait for a lazily-loaded transcript panel before giving up. */
const PANEL_TIMEOUT_MS = 4000;

/** How often to look for it while waiting. */
const POLL_MS = 100;

/** A cue's timestamp, which is stripped: it is noise in a summary and noise in an embedding. */
const TIMESTAMP = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}\s*/;

/** The classic markup, and the modern one YouTube moved to in February 2026. */
const SEGMENTS = ["ytd-transcript-segment-renderer", "transcript-segment-view-model"];

/** Anything that looks like an open transcript panel, for the reader that trusts no class name. */
const PANEL = "ytd-transcript-renderer, ytd-engagement-panel-section-list-renderer";

/** The element every engagement panel is, whatever its id: what the cues sit inside, and what closes. */
const ENGAGEMENT_PANEL = "ytd-engagement-panel-section-list-renderer";

/**
 * The panel itself, by the ids YouTube has given it: the classic one, and the one the February 2026
 * UI opens instead. Both are named everywhere the panel is acted on, never where it is read from.
 */
const TRANSCRIPT_PANELS = [
  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
  'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]',
  'ytd-engagement-panel-section-list-renderer[data-target-id="PAmodern_transcript_view"]',
];
const TRANSCRIPT_PANEL = TRANSCRIPT_PANELS.join(", ");

/** What YouTube writes on the panel while it is open, and what closes it when no button will. */
const PANEL_EXPANDED = "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED";
const PANEL_HIDDEN = "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN";

/** The id of the style that keeps the panel off screen while it is in use. */
const HIDE_ID = "tabcake-transcript-hide";

/**
 * Off screen, not gone. Out of flow so nothing below it moves, in the viewport at its natural size
 * so anything YouTube renders only for a visible panel still renders, and invisible.
 */
const HIDE_CSS = `${TRANSCRIPT_PANEL} { position: fixed !important; top: 0 !important; left: 0 !important; opacity: 0 !important; pointer-events: none !important; z-index: -1 !important; }`;

/** The description's "...more" and "Show less", which are two buttons and not one toggle. */
const EXPAND = ["#description-inline-expander #expand", "tp-yt-paper-button#expand", "#expand"];
const COLLAPSE = ["#description-inline-expander #collapse", "tp-yt-paper-button#collapse", "#collapse"];

/** The description carries this attribute while it is open. */
const EXPANDED = "#description-inline-expander[is-expanded], ytd-text-inline-expander[is-expanded]";

/**
 * Most specific first. The loose one is the last resort for a relabelled button, and it must not
 * match the panel's own "Close transcript": pressing that on a video with no transcript button used
 * to open nothing, wait four seconds for cues that never came, and then say "No transcript".
 */
const SHOW_TRANSCRIPT = [
  'button[aria-label*="Show transcript" i]',
  "ytd-video-description-transcript-section-renderer button",
  'button[aria-label*="transcript" i]:not([aria-label*="close" i])',
];

/** The X in a panel's header. Only ever looked for inside the open panel, so nothing else with "close" on it is pressed. */
const CLOSE_BUTTON = '#visibility-button button, button[aria-label*="close" i]';

/** The language menu at the foot of the panel. YouTube renders it only when there is a choice. */
const LANGUAGE_MENU = [
  "ytd-transcript-footer-renderer yt-dropdown-menu",
  "ytd-transcript-footer-renderer tp-yt-paper-dropdown-menu",
  "ytd-transcript-footer-renderer tp-yt-paper-menu-button",
  ...TRANSCRIPT_PANELS.map((panel) => `${panel} yt-dropdown-menu`),
];

/** Inside that menu: what opens it, what it currently says, and the choices. */
const MENU_TRIGGER = "#label, #trigger, tp-yt-paper-button, button";
const MENU_LABEL = "#label-text, #label";
const MENU_OPTIONS = "a.yt-dropdown-menu, tp-yt-paper-item, tp-yt-paper-listbox > *";

const ENGLISH = /\benglish\b/i;

/** happy-dom has textContent and not innerText, and so does an older engine. Same rule as extract.ts. */
function readText(el: Element): string {
  return ((el as HTMLElement).innerText ?? el.textContent ?? "").trim();
}

/**
 * The transcript as flowing lines, or `""` when none of the readers finds one.
 *
 * Cues are joined with newlines rather than spaces because `chunkText` on the backend splits on
 * newlines: given one unbroken paragraph it hard-splits every 1,200 characters, mid-sentence, and
 * every chunk embeds worse for it.
 */
export function readTranscript(doc: Document): string {
  // Inside the open panel when there is one: the page keeps the other panel too, and a cue left
  // rendered in it belongs to whatever was read there last.
  const scope = openPanel(doc) ?? doc;
  for (const selector of SEGMENTS) {
    const lines = [...scope.querySelectorAll(selector)]
      .map((el) => readText(el).replace(TIMESTAMP, "").trim())
      .filter(Boolean);
    if (lines.length > 0) return lines.join("\n");
  }
  return fallback(doc);
}

/**
 * The reader that trusts no class name: every `m:ss` in the panel starts a line.
 *
 * YouTube renames things. It has not yet shipped a transcript without timestamps in it, and if it
 * does this returns nothing rather than something wrong.
 */
function fallback(doc: Document): string {
  const panel = openPanel(doc) ?? doc.querySelector(PANEL);
  if (panel === null) return "";

  const text = readText(panel);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => TIMESTAMP.test(line))
    .map((line) => line.replace(TIMESTAMP, "").trim())
    .filter(Boolean);

  return lines.join("\n");
}

/** What a video is, beside what was said in it. Empty strings where the page did not say. */
export type VideoMeta = { title: string; channel: string; description: string };

/**
 * The title, the channel and the description.
 *
 * Read while `openTranscript` has the page as it left it and before its restore. The description is
 * whatever YouTube is showing: the whole of it if it was expanded, else the first lines, which is
 * the description's own summary of itself. Several selectors each, oldest last, for the same
 * reason the transcript has three readers.
 */
export function videoMeta(doc: Document): VideoMeta {
  const first = (...selectors: string[]): string => {
    const el = find(doc, ...selectors);
    return el === null ? "" : readText(el);
  };

  return {
    // `document.title` carries " - YouTube" and the unread-notification count, so the heading first.
    title:
      first("h1.ytd-watch-metadata", "#title h1", "yt-formatted-string.ytd-watch-metadata") ||
      doc.title.replace(/\s*-\s*YouTube\s*$/, "").trim(),
    channel: first("#owner #channel-name a", "ytd-channel-name#channel-name a", "#upload-info a"),
    description: first("#description-inline-expander", "#description", "ytd-text-inline-expander"),
  };
}

/**
 * Opens the transcript panel, off screen, and hands back the way to put the page back.
 *
 * `null` means **this video has no transcript**, which is the honest answer rather than a failure:
 * YouTube only renders its Show transcript button when captions exist, so its absence is the check.
 * Nothing extra is fetched to find that out.
 *
 * Otherwise the panel is open — but not on screen: a style keeps it out of the flow and invisible
 * while it is read, so nothing on the page moves or appears — and on its English track when the
 * video has one. The function returned undoes only what this call did: closes the panel, drops the
 * style, and collapses the description if this call expanded it. Expanding it is the last resort,
 * because it is the one thing here a person can see. YouTube renders the Show transcript button
 * inside the collapsed description too, and a hidden button still takes a click, so the description
 * is only opened on a build of YouTube that does not. A panel someone already had open is left
 * open, and on screen.
 *
 * It does not promise `readTranscript` will find anything. The two together are what tell a video
 * with no captions apart from markup that has changed underneath us.
 */
export async function openTranscript(doc: Document): Promise<(() => void) | null> {
  const wasOpen = panelOpen(doc);
  let opened = false;
  let expanded = false;
  const unhide = wasOpen ? () => {} : hidePanel(doc);
  const restore = () => {
    if (opened) closePanel(doc);
    unhide();
    if (expanded) click(doc, ...COLLAPSE);
  };

  if (!wasOpen) {
    opened = click(doc, ...SHOW_TRANSCRIPT);
    if (!opened) {
      // Not in the DOM while collapsed, on this build of YouTube. Open the description and look again.
      expanded = doc.querySelector(EXPANDED) === null && click(doc, ...EXPAND);
      opened = click(doc, ...SHOW_TRANSCRIPT);
    }
    if (!opened || !(await waitFor(() => hasSegments(doc)))) {
      restore();
      return null;
    }
  }

  await pickEnglish(doc);
  return restore;
}

/**
 * Switches the panel to its English track, when it is showing another language and has one.
 *
 * English first because that is what the summary and the search are in: a Hindi transcript under an
 * English question is found less often and summarised worse. The track YouTube opened with is the
 * fallback, never a refusal — a video with no English captions is saved as it is.
 *
 * Exported for its test; the button only ever reaches it through `openTranscript`.
 *
 * ponytail: "English" is matched as a word in the menu, which is in YouTube's UI language, so in a
 * browser whose YouTube is in Hindi this changes nothing and the fallback is what you get. The
 * upgrade is `captionTracks` out of `ytInitialPlayerResponse`, per the file header. The switch is
 * also left switched: re-opening the panel by hand is the one place a person would notice.
 */
export async function pickEnglish(doc: Document): Promise<void> {
  const menu = find(openPanel(doc) ?? doc, ...LANGUAGE_MENU);
  if (menu === null) return;

  const label = menu.querySelector(MENU_LABEL);
  if (label !== null && ENGLISH.test(readText(label))) return;

  const options = () => [...menu.querySelectorAll(MENU_OPTIONS)].filter((el) => readText(el) !== "");
  const trigger = (menu.querySelector(MENU_TRIGGER) as HTMLElement | null) ?? menu;

  trigger.click();
  await waitFor(() => options().length > 0);

  const english = options().filter((el) => ENGLISH.test(readText(el)));
  // A track someone typed over one a machine guessed, when the video offers both.
  const choice = english.find((el) => !/auto/i.test(readText(el))) ?? english[0];
  if (choice === undefined) return trigger.click();

  const before = firstSegment(doc);
  (choice as HTMLElement).click();
  await waitFor(() => firstSegment(doc) !== before);
}

/** Whether a transcript panel is open: what YouTube wrote on them if it wrote anything, else whether cues are on the page. */
function panelOpen(doc: Document): boolean {
  const panels = [...doc.querySelectorAll(TRANSCRIPT_PANEL)];
  if (panels.some((panel) => panel.hasAttribute("visibility"))) {
    return panels.some((panel) => panel.getAttribute("visibility") === PANEL_EXPANDED);
  }
  return hasSegments(doc);
}

/**
 * The panel that is open now: the one YouTube marks expanded, else the one the cues are in. That
 * order, because a closed panel can keep the cues it last showed. `null` before it has opened, and
 * on a page with none.
 */
function openPanel(doc: Document): Element | null {
  const expanded = [...doc.querySelectorAll(TRANSCRIPT_PANEL)].find(
    (panel) => panel.getAttribute("visibility") === PANEL_EXPANDED,
  );
  if (expanded !== undefined) return expanded;
  return doc.querySelector(SEGMENTS.join(","))?.closest(ENGAGEMENT_PANEL) ?? null;
}

/** The open panel's own close button, or the attribute YouTube itself reads when there is no button. */
function closePanel(doc: Document): void {
  const panel = openPanel(doc) ?? doc.querySelector(TRANSCRIPT_PANEL);
  if (panel === null) return;
  const button = panel.querySelector<HTMLElement>(CLOSE_BUTTON);
  if (button !== null) return button.click();
  panel.setAttribute("visibility", PANEL_HIDDEN);
}

/** Keeps the panel off screen until the function returned runs. */
function hidePanel(doc: Document): () => void {
  doc.getElementById(HIDE_ID)?.remove();
  const style = doc.createElement("style");
  style.id = HIDE_ID;
  style.textContent = HIDE_CSS;
  (doc.head ?? doc.documentElement).append(style);
  return () => style.remove();
}

function hasSegments(doc: Document): boolean {
  return doc.querySelector(SEGMENTS.join(",")) !== null;
}

/** The first cue, which is what changes when the panel re-renders in another language. */
function firstSegment(doc: Document): string {
  const el = doc.querySelector(SEGMENTS.join(","));
  return el === null ? "" : readText(el);
}

/** The first of these that is on the page, or inside the element given. */
function find(scope: ParentNode, ...selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const el = scope.querySelector(selector);
    if (el !== null) return el as HTMLElement;
  }
  return null;
}

/** Clicks the first of these that is there. Returns whether anything was clicked. */
function click(doc: Document, ...selectors: string[]): boolean {
  const el = find(doc, ...selectors);
  el?.click();
  return el !== null;
}

/** Polls until the condition holds or the timeout runs out. */
async function waitFor(ready: () => boolean): Promise<boolean> {
  const until = Date.now() + PANEL_TIMEOUT_MS;
  while (Date.now() < until) {
    if (ready()) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return ready();
}
