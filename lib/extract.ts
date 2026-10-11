/**
 * Turning a rendered page into the text a person actually read.
 *
 * Ported from the retired prototype at `tabcake_app/extension/content.js`, which is plain
 * JavaScript and predates all of the auth work. It walks semantic blocks rather than taking
 * everything, because navigation, cookie banners and footers are most of a modern page by
 * character count and none of it is what you were reading.
 */

/** The blocks that hold prose. Deliberately not `div`, `span` or `section`. */
const BLOCKS = "p,h1,h2,h3,h4,h5,li,pre,blockquote";

/** Page furniture. Only stripped when the walk fell back to `body` and swept the whole document. */
const FURNITURE = "nav,header,footer,aside";

/** Shorter than this and the semantic walk found nothing useful, so try the whole thing instead. */
const FALLBACK_BELOW = 500;

/** Caps what leaves the browser. The server truncates again at 120,000; this saves the round trip. */
const MAX_CHARS = 100_000;

/**
 * The readable text of `doc`, or an empty string when there is none.
 *
 * ponytail: a hand-rolled walker, not Mozilla's Readability. Switch when a twenty-page spot check
 * shows more than a fifth of what is captured is boilerplate.
 */
export function extractText(doc: Document): string {
  const root = doc.querySelector("article") ?? doc.querySelector("main") ?? doc.body;
  if (root === null) return "";

  // Falling back to body means no author marked up the content, so the furniture is still in it.
  const fellBack = root === doc.body;

  const text = [...root.querySelectorAll(BLOCKS)]
    // A list inside a blockquote would otherwise be counted by both. Keep the outermost only.
    .filter((el) => el.parentElement?.closest(BLOCKS) == null)
    .filter((el) => !fellBack || el.closest(FURNITURE) === null)
    .map((el) => readText(el).trim())
    .filter(Boolean)
    .join("\n");

  return tidy(text.length < FALLBACK_BELOW ? readText(root) : text);
}

/**
 * `innerText` is what the reader sees — laid out, with hidden elements gone. `textContent` is the
 * raw tree and includes text that is not on screen. Prefer the first; happy-dom and older engines
 * only have the second.
 */
function readText(el: Element): string {
  return (el as HTMLElement).innerText ?? el.textContent ?? "";
}

function tidy(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_CHARS);
}
