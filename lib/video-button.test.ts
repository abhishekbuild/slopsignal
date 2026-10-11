// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { openTranscript, readTranscript, videoMeta } from "./transcript";
import { ICONS, mountVideoButton, type Label, type Mode, type SaveVideo } from "./video-button";

/**
 * Where the button goes, that it goes away again, and what it says.
 *
 * happy-dom has no layout, so **nothing here can prove the button is visible** — which is exactly
 * how 0.13.0 shipped a button nobody could see. These tests pin the decisions that replaced that:
 * each kind of page has its own anchor and looks only for that one, found by polling because
 * YouTube renders it after the content script runs, and the corner of the window when ten seconds
 * pass without one.
 *
 * The transcript module is mocked: what YouTube's panel looks like is `transcript.test.ts`'s job.
 */

vi.mock("./transcript", () => ({
  openTranscript: vi.fn(),
  readTranscript: vi.fn(),
  videoMeta: vi.fn(),
}));

const save = vi.fn<SaveVideo>();
const restore = vi.fn();
const remember = vi.fn<() => Promise<Label | undefined>>();
const report = vi.fn<(label: Label) => void>();

const WATCH: Mode = { kind: "watch", pressAtOnce: false };
const SHORT: Mode = { kind: "short", remember };

const SAVED: Label = { text: "Remembered in Tabcake", again: false, icon: "saved" };

const ROW = `<ytd-watch-metadata><div id="owner"><a id="avatar"></a><div id="subscribe-button"></div></div></ytd-watch-metadata>`;
/** The Shorts overlay as YouTube builds it in 2026: view models, and the column holds the Like button. */
const COLUMN = `<ytd-reel-video-renderer is-active><reel-player-overlay-view-model><reel-action-bar-view-model><like-button-view-model></like-button-view-model><div id="share-button"></div></reel-action-bar-view-model></reel-player-overlay-view-model></ytd-reel-video-renderer>`;
/** The one before it, which 0.15.0 was written against. */
const OLD_COLUMN = `<ytd-reel-video-renderer is-active><ytd-reel-player-overlay-renderer><div id="actions"><div id="like-button"></div><div id="share-button"></div></div></ytd-reel-player-overlay-renderer></ytd-reel-video-renderer>`;

const hosts = () => document.querySelectorAll("#tabcake-video-button");
const host = () => hosts()[0] as HTMLElement;
const button = () => host().shadowRoot?.querySelector("button") as HTMLButtonElement;
const iconPath = () => button().querySelector("path")?.getAttribute("d");
const spinning = () => button().querySelector("svg")?.classList.contains("busy");

/** A panel that opens, a transcript that reads, a page that says who made it. */
function readable() {
  vi.mocked(openTranscript).mockResolvedValue(restore);
  vi.mocked(readTranscript).mockReturnValue("Cake begins with flour.");
  vi.mocked(videoMeta).mockReturnValue({ title: "How cake is made", channel: "A Baker", description: "" });
}

/** Presses the button and waits for it to stop saying it is reading. */
async function press() {
  button().click();
  await vi.waitFor(() => expect(button().textContent).not.toBe("Reading the transcript…"));
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

test("on a watch page it sits in the owner row, after Subscribe", () => {
  document.body.innerHTML = ROW;

  mountVideoButton(document, save, WATCH);

  const owner = document.getElementById("owner");
  expect(hosts()).toHaveLength(1);
  expect(host().parentElement).toBe(owner);
  expect(owner?.lastElementChild).toBe(host());
  expect(host().style.getPropertyValue("display")).toBe("inline-flex");
  expect(host().style.getPropertyValue("position")).toBe("");
  expect(button().className).toBe("pill");
});

test("on a Short it sits above Like in the action column, round, and ignores a leftover watch row", () => {
  // YouTube keeps the last watch page's row in the DOM, hidden, after you move to Shorts. A button
  // placed in it is a button nobody can see — which is how 0.15.0 lost the button on Shorts.
  document.body.innerHTML = ROW + COLUMN;

  mountVideoButton(document, save, SHORT);

  const column = document.querySelector("reel-action-bar-view-model");
  expect(host().parentElement).toBe(column);
  expect(column?.firstElementChild).toBe(host());
  expect(host().style.getPropertyValue("width")).toBe("48px");
  expect(button().className).toBe("round");
  // The round one shows its words only on hover, so they are on the button for everything else.
  expect(button().getAttribute("aria-label")).toBe("Remember this video's transcript");
  expect(iconPath()).toBe(ICONS.idle);
});

test("the Shorts column YouTube used before 2026 is still found", () => {
  document.body.innerHTML = OLD_COLUMN;

  mountVideoButton(document, save, SHORT);

  const actions = document.getElementById("actions");
  expect(host().parentElement).toBe(actions);
  expect(actions?.firstElementChild).toBe(host());
});

test("a column YouTube has renamed again is still found: it is wherever the Like button is", () => {
  // The safety net for the next rename. Whatever the column is called, Like sits in it.
  document.body.innerHTML = `<ytd-reel-video-renderer is-active><div class="whatever-next"><like-button-view-model></like-button-view-model><div id="share-button"></div></div></ytd-reel-video-renderer>`;

  mountVideoButton(document, save, SHORT);

  const column = document.querySelector(".whatever-next");
  expect(host().parentElement).toBe(column);
  expect(column?.firstElementChild).toBe(host());
});

test("on a watch page a leftover Shorts column is ignored the same way", () => {
  document.body.innerHTML = COLUMN + ROW;

  mountVideoButton(document, save, WATCH);

  expect(host().parentElement).toBe(document.getElementById("owner"));
});

test("it finds the anchor when YouTube renders it after the script has run", () => {
  // The real case: the content script runs at document_idle and the page is built later.
  vi.useFakeTimers();
  mountVideoButton(document, save, WATCH);
  expect(hosts()).toHaveLength(0);

  document.body.innerHTML = ROW;
  vi.advanceTimersByTime(1000);

  expect(host().parentElement).toBe(document.getElementById("owner"));
});

test("it goes back into an anchor YouTube has rebuilt without it", () => {
  vi.useFakeTimers();
  document.body.innerHTML = ROW;
  mountVideoButton(document, save, WATCH);

  document.body.innerHTML = ROW;
  expect(hosts()).toHaveLength(0);
  vi.advanceTimersByTime(1000);

  expect(host().parentElement).toBe(document.getElementById("owner"));
});

test("without an anchor for ten seconds it takes the corner of the window", () => {
  // An element YouTube has renamed. Nothing is shown until then: a button that appears in the
  // corner and then jumps into place would be worse.
  vi.useFakeTimers();
  document.body.innerHTML = `<ytd-app></ytd-app>`;
  mountVideoButton(document, save, WATCH);

  vi.advanceTimersByTime(9000);
  expect(hosts()).toHaveLength(0);

  vi.advanceTimersByTime(1000);
  expect(host().parentElement).toBe(document.body);
  expect(document.body.lastElementChild).toBe(host());
  expect(document.body.firstElementChild?.tagName.toLowerCase()).toBe("ytd-app");
  expect(host().style.getPropertyValue("position")).toBe("fixed");
});

test("mounting twice leaves one button, not two", () => {
  // Two buttons would mean only one of them was ever removed, and the other would go on offering to
  // save a video you had scrolled away from.
  document.body.innerHTML = ROW;
  const first = mountVideoButton(document, save, WATCH);
  mountVideoButton(document, save, WATCH);

  expect(hosts()).toHaveLength(1);
  first();
});

test("the cancel removes it, stops it coming back, and is safe to call twice", () => {
  vi.useFakeTimers();
  document.body.innerHTML = ROW;
  const remove = mountVideoButton(document, save, WATCH);
  expect(hosts()).toHaveLength(1);

  remove();
  expect(hosts()).toHaveLength(0);

  // The poll that puts the button back into a rebuilt anchor must die with the mount, or the button
  // for the last video would come back on the next one.
  vi.advanceTimersByTime(20_000);
  expect(hosts()).toHaveLength(0);

  // `watchAddress` cancels on every address change, and a short changes address on every scroll.
  expect(() => remove()).not.toThrow();
});

test("a cancel after the page has already dropped the button does not throw", () => {
  document.body.innerHTML = ROW;
  const remove = mountVideoButton(document, save, WATCH);
  document.body.innerHTML = "";

  expect(() => remove()).not.toThrow();
});

test("the button carries its label and is pressable", () => {
  document.body.innerHTML = ROW;
  mountVideoButton(document, save, WATCH);

  expect(button().textContent).toBe("Remember this video's transcript");
  expect(button().disabled).toBe(false);
});

test("a saved video says so, and a revisit is a save", async () => {
  // The bug that was reported: every save said "Couldn't save that" while the background saved it,
  // because the reply never reached the button. A second press is a revisit, and that is saved too.
  document.body.innerHTML = ROW;
  readable();
  save.mockResolvedValue({ state: "remembered", result: "revisited" });
  mountVideoButton(document, save, WATCH);

  await press();

  expect(button().textContent).toBe("Remembered in Tabcake");
  expect(button().disabled).toBe(true);
  expect(iconPath()).toBe(ICONS.saved);
  expect(spinning()).toBe(false);
  expect(save).toHaveBeenCalledWith({
    title: "How cake is made",
    channel: "A Baker",
    description: "",
    transcript: "Cake begins with flour.",
  });
});

test("while it reads, the icon spins", async () => {
  document.body.innerHTML = ROW;
  readable();
  let answer: (status: undefined) => void = () => {};
  save.mockReturnValue(new Promise((resolve) => (answer = resolve)));
  mountVideoButton(document, save, WATCH);

  button().click();
  await vi.waitFor(() => expect(save).toHaveBeenCalled());

  expect(button().textContent).toBe("Reading the transcript…");
  expect(iconPath()).toBe(ICONS.busy);
  expect(spinning()).toBe(true);
  expect(button().disabled).toBe(true);
  answer(undefined);
});

test("no answer from the background is the one thing that reads as a failure", async () => {
  document.body.innerHTML = ROW;
  readable();
  save.mockResolvedValue(undefined);
  mountVideoButton(document, save, WATCH);

  await press();

  expect(button().textContent).toBe("Could not remember that");
  expect(button().disabled).toBe(false);
  expect(iconPath()).toBe(ICONS.alert);
});

test("signed out says what to do about it, and can be pressed again after", async () => {
  document.body.innerHTML = ROW;
  readable();
  save.mockResolvedValue({ state: "skipped", reason: "signed-out" });
  mountVideoButton(document, save, WATCH);

  await press();

  expect(button().textContent).toBe("Sign in to Tabcake first");
  expect(button().disabled).toBe(false);
});

test("the page is put back before the save is sent", async () => {
  // The promise that saving a video changes nothing you can see except the button. Restoring
  // before the round trip means the panel is back in about a second whatever the account then says.
  document.body.innerHTML = ROW;
  readable();
  save.mockResolvedValue({ state: "remembered", result: "captured" });
  mountVideoButton(document, save, WATCH);

  await press();

  expect(restore).toHaveBeenCalledTimes(1);
  expect(restore.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0] ?? 0);
});

test("an unreadable panel is still closed, and nothing is sent", async () => {
  document.body.innerHTML = ROW;
  readable();
  vi.mocked(readTranscript).mockReturnValue("");
  mountVideoButton(document, save, WATCH);

  await press();

  expect(button().textContent).toBe("Could not read the transcript");
  expect(restore).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
});

test("a video with no transcript says so and sends nothing", async () => {
  document.body.innerHTML = ROW;
  vi.mocked(openTranscript).mockResolvedValue(null);
  mountVideoButton(document, save, WATCH);

  await press();

  expect(button().textContent).toBe("No transcript for this video");
  expect(button().disabled).toBe(true);
  expect(iconPath()).toBe(ICONS.alert);
  expect(save).not.toHaveBeenCalled();
});

test("pressing the Shorts button reads nothing here, and says what the hidden tab's button said", async () => {
  // The Shorts player has no transcript panel. The background reads on the video page, in a tab you
  // never see, and this button repeats the words that page's button ended on.
  document.body.innerHTML = COLUMN;
  let answer: (label: Label | undefined) => void = () => {};
  remember.mockReturnValue(new Promise((resolve) => (answer = resolve)));
  mountVideoButton(document, save, SHORT);

  button().click();

  expect(remember).toHaveBeenCalledTimes(1);
  expect(button().getAttribute("aria-label")).toBe("Reading the transcript…");
  expect(spinning()).toBe(true);
  expect(button().disabled).toBe(true);
  expect(openTranscript).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();

  answer(SAVED);
  await vi.waitFor(() => expect(button().textContent).toBe("Remembered in Tabcake"));
  expect(button().disabled).toBe(true);
  expect(iconPath()).toBe(ICONS.saved);
  expect(spinning()).toBe(false);
});

test("a Short whose hidden tab never answered reads as a failure, and can be pressed again", async () => {
  document.body.innerHTML = COLUMN;
  remember.mockResolvedValue(undefined);
  mountVideoButton(document, save, SHORT);

  button().click();

  await vi.waitFor(() => expect(button().textContent).toBe("Could not remember that"));
  expect(button().disabled).toBe(false);
  expect(iconPath()).toBe(ICONS.alert);
});

test("a page reading for a Short reports where its press ended, whatever that was", async () => {
  // Each of the three ends a press can reach on a watch page is handed back, so the Short's button
  // can say the same words. A page opened by hand has no `report` and hands back nothing.
  document.body.innerHTML = ROW;
  const forShort: Mode = { kind: "watch", pressAtOnce: false, report };

  vi.mocked(openTranscript).mockResolvedValue(null);
  mountVideoButton(document, save, forShort);
  await press();
  expect(report).toHaveBeenLastCalledWith({ text: "No transcript for this video", again: false, icon: "alert" });

  readable();
  vi.mocked(readTranscript).mockReturnValue("");
  mountVideoButton(document, save, forShort);
  await press();
  expect(report).toHaveBeenLastCalledWith({ text: "Could not read the transcript", again: true, icon: "alert" });

  readable();
  save.mockResolvedValue({ state: "remembered", result: "captured" });
  mountVideoButton(document, save, forShort);
  await press();
  expect(report).toHaveBeenLastCalledWith(SAVED);
  expect(report).toHaveBeenCalledTimes(3);
});

test("a video page opened from a Short presses itself once the row is there, and once only", async () => {
  vi.useFakeTimers();
  readable();
  save.mockResolvedValue({ state: "remembered", result: "captured" });
  mountVideoButton(document, save, { kind: "watch", pressAtOnce: true });

  // Nothing to press until the row renders.
  await vi.advanceTimersByTimeAsync(5000);
  expect(save).not.toHaveBeenCalled();

  document.body.innerHTML = ROW;
  await vi.advanceTimersByTimeAsync(1000);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000);
  expect(save).toHaveBeenCalledTimes(1);
  expect(button().textContent).toBe("Remembered in Tabcake");

  // A rebuilt row is re-entered without a second press.
  document.body.innerHTML = ROW;
  await vi.advanceTimersByTimeAsync(5000);
  expect(save).toHaveBeenCalledTimes(1);
});

test("a video page opened by hand does not press itself", async () => {
  vi.useFakeTimers();
  readable();
  document.body.innerHTML = ROW;
  mountVideoButton(document, save, WATCH);

  await vi.advanceTimersByTimeAsync(5000);

  expect(save).not.toHaveBeenCalled();
  expect(button().textContent).toBe("Remember this video's transcript");
});
