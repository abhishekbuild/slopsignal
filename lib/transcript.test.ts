// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { openTranscript, pickEnglish, readTranscript, videoMeta } from "./transcript";

/**
 * Reading YouTube's transcript panel.
 *
 * Three readers, because YouTube changed this markup in February 2026 and will again. The property
 * every one of these tests is really checking is the same: a reader that cannot find a transcript
 * returns nothing, never something else off the page.
 *
 * The opening, hiding, language and restore tests run against a stand-in for YouTube's markup. They
 * pin what this module does to a page, not what YouTube's page looks like: a change there shows up
 * as an empty transcript on a real video, and the fix is a selector.
 */

const parse = (html: string): Document =>
  new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");

test("the classic markup is read, and the timestamps come off", () => {
  const doc = parse(`
    <ytd-transcript-segment-renderer>0:00 Cake begins with flour.</ytd-transcript-segment-renderer>
    <ytd-transcript-segment-renderer>0:04 Then the eggs.</ytd-transcript-segment-renderer>
    <ytd-transcript-segment-renderer>1:12:30 And much later, icing.</ytd-transcript-segment-renderer>
  `);

  // Newlines rather than spaces: the backend chunks on newlines, and one unbroken paragraph gets
  // hard-split mid-sentence every 1,200 characters.
  expect(readTranscript(doc)).toBe("Cake begins with flour.\nThen the eggs.\nAnd much later, icing.");
});

test("the markup YouTube moved to in February 2026 is read the same way", () => {
  const doc = parse(`
    <transcript-segment-view-model>0:00 Cake begins with flour.</transcript-segment-view-model>
    <transcript-segment-view-model>0:04 Then the eggs.</transcript-segment-view-model>
  `);

  expect(readTranscript(doc)).toBe("Cake begins with flour.\nThen the eggs.");
});

test("when both markups are gone, every timestamped line in the panel is a line", () => {
  // The reader that trusts no class name. YouTube renames elements; it has not yet shipped a
  // transcript with no timestamps in it.
  const doc = parse(`
    <ytd-transcript-renderer>
      <div>Transcript</div>
      <div>0:00 Cake begins with flour.</div>
      <div>0:04 Then the eggs.</div>
      <div>English (auto-generated)</div>
    </ytd-transcript-renderer>
  `);

  expect(readTranscript(doc)).toBe("Cake begins with flour.\nThen the eggs.");
});

test("no panel reads as no transcript, never as the rest of the page", () => {
  // The failure that matters. A reader that fell back to the document would store the sidebar, the
  // comments and the up-next list as if somebody had said them.
  const doc = parse(`
    <h1>How cake is made</h1>
    <div id="comments">0:15 great video</div>
    <div id="secondary">Up next: How bread is made</div>
  `);

  expect(readTranscript(doc)).toBe("");
});

test("an open but empty panel reads as nothing", () => {
  // This is the markup-changed case: the panel is there, so the video has captions, and no reader
  // could find them. It must come back empty so the button can say so.
  expect(readTranscript(parse(`<ytd-transcript-renderer></ytd-transcript-renderer>`))).toBe("");
});

test("the title, channel and description are read from the page", () => {
  const doc = parse(`
    <h1 class="ytd-watch-metadata">How cake is made</h1>
    <div id="owner"><div id="channel-name"><a>A Baker</a></div></div>
    <div id="description-inline-expander">Everything I know about cake.</div>
  `);

  expect(videoMeta(doc)).toEqual({
    title: "How cake is made",
    channel: "A Baker",
    description: "Everything I know about cake.",
  });
});

test("a missing field is empty rather than wrong", () => {
  const doc = parse(`<h1 class="ytd-watch-metadata">How cake is made</h1>`);
  const meta = videoMeta(doc);

  expect(meta.title).toBe("How cake is made");
  expect(meta.channel).toBe("");
  expect(meta.description).toBe("");
});

test("the document title is the last resort, without YouTube's own suffix", () => {
  const doc = parse(`<div></div>`);
  doc.title = "(3) How cake is made - YouTube";

  expect(videoMeta(doc).title).toBe("(3) How cake is made");
});

const EXPANDED = "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED";
const HIDDEN = "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN";
const CUE = `<transcript-segment-view-model>0:00 Cake.</transcript-segment-view-model>`;
const SHOW = `<button aria-label="Show transcript">Show transcript</button>`;

/**
 * A stand-in for the watch page: a description holding the Show transcript button, and a panel
 * that fills with cues when it opens and empties when it closes. Each click does what YouTube's
 * would, and every click is recorded.
 *
 * `button` is where YouTube keeps the Show transcript button: in the DOM whether or not the
 * description is expanded ("always"), only once it is ("afterExpand"), or nowhere ("never").
 */
function watchPage(
  options: {
    button?: "always" | "afterExpand" | "never";
    expanded?: boolean;
    open?: boolean;
    panel?: "classic" | "modern" | "noClose";
  } = {},
) {
  const { button = "always", expanded = false, open = false, panel = "classic" } = options;
  const targetId = panel === "modern" ? "PAmodern_transcript_view" : "engagement-panel-searchable-transcript";
  const doc = parse(`
    <div id="description-inline-expander" ${expanded ? "is-expanded" : ""}>
      <tp-yt-paper-button id="expand">...more</tp-yt-paper-button>
      <tp-yt-paper-button id="collapse">Show less</tp-yt-paper-button>
      <div id="section">${button === "always" ? SHOW : ""}</div>
    </div>
    <ytd-engagement-panel-section-list-renderer target-id="${targetId}" visibility="${open ? EXPANDED : HIDDEN}">
      ${panel === "noClose" ? "" : `<div id="visibility-button"><button aria-label="Close transcript">X</button></div>`}
      <div id="segments">${open ? CUE : ""}</div>
    </ytd-engagement-panel-section-list-renderer>
  `);
  const expander = doc.getElementById("description-inline-expander") as HTMLElement;
  const section = doc.getElementById("section") as HTMLElement;
  const segments = doc.getElementById("segments") as HTMLElement;
  const panelEl = doc.querySelector("ytd-engagement-panel-section-list-renderer") as HTMLElement;
  const clicks: string[] = [];
  const on = (selector: string, action: () => void) => {
    doc.querySelector(selector)?.addEventListener("click", () => {
      clicks.push(selector);
      action();
    });
  };
  const wireShow = () =>
    on('button[aria-label="Show transcript"]', () => {
      panelEl.setAttribute("visibility", EXPANDED);
      segments.innerHTML = CUE;
    });
  on("#expand", () => {
    expander.setAttribute("is-expanded", "");
    if (button === "afterExpand" && section.innerHTML === "") {
      section.innerHTML = SHOW;
      wireShow();
    }
  });
  on("#collapse", () => expander.removeAttribute("is-expanded"));
  if (button === "always") wireShow();
  on('button[aria-label="Close transcript"]', () => {
    panelEl.setAttribute("visibility", HIDDEN);
    segments.innerHTML = "";
  });
  const hidden = () => doc.getElementById("tabcake-transcript-hide") !== null;
  return { doc, expander, panel: panelEl, clicks, hidden };
}

test("the panel is opened off screen without touching the description, and closed again", async () => {
  const page = watchPage();

  const restore = await openTranscript(page.doc);

  expect(restore).not.toBeNull();
  expect(readTranscript(page.doc)).toBe("Cake.");
  // Off screen while it is in use: the style is on the page, and the description was never opened.
  expect(page.hidden()).toBe(true);
  expect(page.expander.hasAttribute("is-expanded")).toBe(false);

  restore?.();

  // The promise: nothing on the page you can see is different afterwards, except the button.
  expect(page.panel.getAttribute("visibility")).toBe(HIDDEN);
  expect(page.hidden()).toBe(false);
  expect(readTranscript(page.doc)).toBe("");
  expect(page.clicks).toEqual(['button[aria-label="Show transcript"]', 'button[aria-label="Close transcript"]']);
});

test("the description is expanded only when YouTube hides the button in it, and collapsed after", async () => {
  const page = watchPage({ button: "afterExpand" });

  const restore = await openTranscript(page.doc);
  expect(readTranscript(page.doc)).toBe("Cake.");
  expect(page.expander.hasAttribute("is-expanded")).toBe(true);

  restore?.();

  expect(page.expander.hasAttribute("is-expanded")).toBe(false);
  expect(page.clicks).toEqual([
    "#expand",
    'button[aria-label="Show transcript"]',
    'button[aria-label="Close transcript"]',
    "#collapse",
  ]);
});

test("what was already open is left open, and on screen", async () => {
  // Someone reading the transcript beside the video keeps it, and it is not hidden under them.
  const page = watchPage({ expanded: true, open: true });

  const restore = await openTranscript(page.doc);
  expect(page.hidden()).toBe(false);
  restore?.();

  expect(page.expander.hasAttribute("is-expanded")).toBe(true);
  expect(page.panel.getAttribute("visibility")).toBe(EXPANDED);
  expect(readTranscript(page.doc)).toBe("Cake.");
  expect(page.clicks).toEqual([]);
});

test("no Show transcript button means no transcript, and nothing is left changed", async () => {
  const page = watchPage({ button: "never" });

  expect(await openTranscript(page.doc)).toBeNull();

  expect(page.expander.hasAttribute("is-expanded")).toBe(false);
  expect(page.hidden()).toBe(false);
  expect(page.clicks).toEqual(["#expand", "#collapse"]);
});

test("the panel the February 2026 UI opens is closed too", async () => {
  // It carries a different id. Until 0.16.0 the restore did not know it, and the panel stayed open
  // beside the video after every save.
  const page = watchPage({ panel: "modern" });

  const restore = await openTranscript(page.doc);
  expect(readTranscript(page.doc)).toBe("Cake.");
  restore?.();

  expect(page.panel.getAttribute("visibility")).toBe(HIDDEN);
  expect(page.clicks).toContain('button[aria-label="Close transcript"]');
});

test("with both panels on the page, the one that opened is the one read and closed", async () => {
  // YouTube keeps the classic panel and the February 2026 one in the DOM together, each with its own
  // close button, and opens whichever it likes. Until 0.24.0 the close went to the first id's button
  // — the other panel's — and the open one stayed on screen after every save. The classic one here
  // still holds a cue from an earlier read, which must not be the one read either.
  const doc = parse(`
    <div id="description-inline-expander"><div id="section">${SHOW}</div></div>
    <ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="${HIDDEN}">
      <div id="visibility-button"><button id="close-classic" aria-label="Close transcript">X</button></div>
      <ytd-transcript-segment-renderer>0:00 Stale cue from last time.</ytd-transcript-segment-renderer>
    </ytd-engagement-panel-section-list-renderer>
    <ytd-engagement-panel-section-list-renderer target-id="PAmodern_transcript_view" visibility="${HIDDEN}">
      <div id="visibility-button"><button id="close-modern" aria-label="Close transcript">X</button></div>
      <div id="segments"></div>
    </ytd-engagement-panel-section-list-renderer>
  `);
  const modern = doc.querySelector('[target-id="PAmodern_transcript_view"]') as HTMLElement;
  const classic = doc.querySelector('[target-id="engagement-panel-searchable-transcript"]') as HTMLElement;
  const clicks: string[] = [];
  doc.querySelector('button[aria-label="Show transcript"]')?.addEventListener("click", () => {
    modern.setAttribute("visibility", EXPANDED);
    (doc.getElementById("segments") as HTMLElement).innerHTML = CUE;
  });
  for (const id of ["close-classic", "close-modern"]) {
    doc.getElementById(id)?.addEventListener("click", () => {
      clicks.push(id);
      (id === "close-modern" ? modern : classic).setAttribute("visibility", HIDDEN);
    });
  }

  const restore = await openTranscript(doc);

  expect(restore).not.toBeNull();
  expect(readTranscript(doc)).toBe("Cake.");

  restore?.();

  expect(clicks).toEqual(["close-modern"]);
  expect(modern.getAttribute("visibility")).toBe(HIDDEN);
});

test("the last-resort reader reads the open panel, not the first panel on the page", () => {
  // Engagement panels share one element name, and the comments panel comes first in the DOM.
  const doc = parse(`
    <ytd-engagement-panel-section-list-renderer target-id="engagement-panel-comments-section" visibility="${EXPANDED}">
      <div>Comments</div><div>0:15 great video</div>
    </ytd-engagement-panel-section-list-renderer>
    <ytd-engagement-panel-section-list-renderer target-id="PAmodern_transcript_view" visibility="${EXPANDED}">
      <div>0:00 Cake begins with flour.</div><div>0:04 Then the eggs.</div>
    </ytd-engagement-panel-section-list-renderer>
  `);

  expect(readTranscript(doc)).toBe("Cake begins with flour.\nThen the eggs.");
});

test("a panel without a close button is closed through the attribute YouTube itself reads", async () => {
  const page = watchPage({ panel: "noClose" });

  const restore = await openTranscript(page.doc);
  expect(page.panel.getAttribute("visibility")).toBe(EXPANDED);
  restore?.();

  expect(page.panel.getAttribute("visibility")).toBe(HIDDEN);
});

/** The language menu at the foot of the panel, as YouTube lays it out, with a first cue to watch change. */
function panelWithMenu(current: string, tracks: string[]) {
  const doc = parse(`
    <transcript-segment-view-model>0:00 केक आटे से शुरू होता है</transcript-segment-view-model>
    <ytd-transcript-footer-renderer>
      <yt-dropdown-menu>
        <div id="label"><span id="label-text">${current}</span></div>
        <tp-yt-paper-listbox>
          ${tracks.map((track) => `<a class="yt-dropdown-menu">${track}</a>`).join("")}
        </tp-yt-paper-listbox>
      </yt-dropdown-menu>
    </ytd-transcript-footer-renderer>
  `);
  let opens = 0;
  let chosen: string | undefined;
  doc.getElementById("label")?.addEventListener("click", () => {
    opens += 1;
  });
  for (const option of doc.querySelectorAll("a.yt-dropdown-menu")) {
    option.addEventListener("click", () => {
      chosen = option.textContent ?? "";
      // YouTube re-renders the cues in the chosen language.
      const cue = doc.querySelector("transcript-segment-view-model");
      if (cue !== null) cue.textContent = "0:00 Cake begins with flour.";
    });
  }
  return { doc, opens: () => opens, chosen: () => chosen };
}

test("the English track is chosen over the one YouTube opened with, typed over auto-generated", async () => {
  const panel = panelWithMenu("Hindi (auto-generated)", [
    "Hindi (auto-generated)",
    "English (auto-generated)",
    "English",
  ]);

  await pickEnglish(panel.doc);

  expect(panel.opens()).toBe(1);
  expect(panel.chosen()).toBe("English");
  expect(readTranscript(panel.doc)).toBe("Cake begins with flour.");
});

test("auto-generated English is still English", async () => {
  const panel = panelWithMenu("Hindi (auto-generated)", ["Hindi (auto-generated)", "English (auto-generated)"]);

  await pickEnglish(panel.doc);

  expect(panel.chosen()).toBe("English (auto-generated)");
});

test("no English track keeps the one YouTube opened with, and closes the menu again", async () => {
  // The fallback: a video with no English captions is saved as it is, and the menu is not left open.
  const panel = panelWithMenu("Hindi (auto-generated)", ["Hindi (auto-generated)", "Tamil"]);

  await pickEnglish(panel.doc);

  expect(panel.opens()).toBe(2);
  expect(panel.chosen()).toBeUndefined();
  expect(readTranscript(panel.doc)).toBe("केक आटे से शुरू होता है");
});

test("a panel already in English is left alone", async () => {
  const panel = panelWithMenu("English", ["English", "Hindi (auto-generated)"]);

  await pickEnglish(panel.doc);

  expect(panel.opens()).toBe(0);
  expect(panel.chosen()).toBeUndefined();
});

test("a video with one track has no menu, and that is fine", async () => {
  const doc = parse(`<transcript-segment-view-model>0:00 Cake.</transcript-segment-view-model>`);

  await expect(pickEnglish(doc)).resolves.toBeUndefined();
});
