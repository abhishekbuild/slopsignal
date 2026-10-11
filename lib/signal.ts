import { redact } from "./redact";

/**
 * The small description of a page that the classifier is shown, and the only thing about a page
 * that reaches a model before the page has been approved.
 *
 * **There is no body text in here, and no query string.** Those are the two rules this file exists
 * to keep, and the backend's validator refuses anything else, so adding a field means changing both.
 * What does leave is the address, the title and the headings of pages you read — which is browsing
 * data, and the price of having a classifier at all. `docs/how-it-works/privacy-controls.md` says so
 * in those words.
 *
 * A sign-in page, a checkout, a bank statement and a log console all announce themselves in exactly
 * these places, which is why the text is not needed.
 */
export type PageSignal = {
  origin: string;
  path: string;
  title: string;
  headings: string[];
  /** A log-out link means you are signed in. The one signal here that cannot be wrong. */
  hasLogout: boolean;
  noindex: boolean;
  passwordFields: number;
  formFields: number;
  paragraphs: number;
  hasCurrency: boolean;
};

const HEADINGS = "h1,h2,h3,h4,h5,h6";

/** Enough to tell what a page is. More would be the page. */
const MAX_HEADINGS = 12;
const MAX_HEADING_CHARS = 120;
const MAX_TITLE_CHARS = 200;

/** `Log out`, `Sign out`, `Logout`, `Sign off`. Not `Blog out of hours` — the word boundary sees to that. */
const LOGOUT = /\b(?:log|sign)\s?(?:out|off)\b/i;

const CURRENCY = /[$€£¥₹]/;

/** `offsetParent` is null for anything `display:none`, and for nothing that is on screen. */
export function isVisible(el: Element): boolean {
  return (el as HTMLElement).offsetParent !== null;
}

/** True when any link or button on the page offers to sign you out. Stops at the first one. */
function hasLogout(doc: Document): boolean {
  for (const el of doc.querySelectorAll("a,button")) {
    if (LOGOUT.test(el.textContent ?? "")) return true;
  }
  return false;
}

/**
 * Describes one page for the classifier.
 *
 * `formFields` and `paragraphs` are passed in rather than counted here, because the content script
 * has already counted both for its own form heuristic and counting them twice would be two more
 * walks of the document for numbers it is holding.
 *
 * `text` is the already-redacted page text, and it is used for one boolean and then dropped.
 */
export function pageSignal(
  doc: Document,
  url: URL,
  text: string,
  counts: { formFields: number; paragraphs: number },
): PageSignal {
  const headings = [...doc.querySelectorAll(HEADINGS)]
    .slice(0, MAX_HEADINGS)
    .map((el) => redact((el.textContent ?? "").trim()).slice(0, MAX_HEADING_CHARS))
    .filter(Boolean);

  return {
    // `origin` and `pathname`, never `href`: that would carry the query string.
    origin: url.origin,
    path: url.pathname,
    title: redact(doc.title).slice(0, MAX_TITLE_CHARS),
    headings,
    hasLogout: hasLogout(doc),
    noindex: (doc.querySelector('meta[name="robots" i]')?.getAttribute("content") ?? "")
      .toLowerCase()
      .includes("noindex"),
    passwordFields: doc.querySelectorAll('input[type="password"]').length,
    formFields: counts.formFields,
    paragraphs: counts.paragraphs,
    hasCurrency: CURRENCY.test(text),
  };
}
