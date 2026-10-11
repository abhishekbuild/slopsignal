// @vitest-environment happy-dom
// Needs a DOM, like extract.test.ts. Kept per-file so the rest of the suite stays in plain node.
import { beforeEach, expect, test } from "vitest";
import { pageSignal, type PageSignal } from "./signal";

/**
 * What the classifier is shown about a page.
 *
 * The last test in this file is the important one: it is the only automated thing standing between
 * a change to this file and page text leaving the browser.
 */

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.title = "";
});

const COUNTS = { formFields: 0, paragraphs: 10 };

const signalFor = (url = "https://example.com/an-article"): PageSignal =>
  pageSignal(document, new URL(url), document.body.textContent ?? "", COUNTS);

test("the address arrives split, and without its query string", () => {
  const signal = signalFor("https://example.com/settings/billing?token=secret-value&id=7");
  expect(signal.origin).toBe("https://example.com");
  expect(signal.path).toBe("/settings/billing");
});

test("at most twelve headings, h6 included", () => {
  document.body.innerHTML = Array.from({ length: 20 }, (_, n) => `<h2>Heading ${n}</h2>`).join("");
  expect(signalFor().headings).toHaveLength(12);

  document.body.innerHTML = "<h6>The sixth level counts too</h6>";
  expect(signalFor().headings).toEqual(["The sixth level counts too"]);
});

test("the title and the headings are redacted like the text is", () => {
  document.title = "Inbox for alice@example.com";
  document.body.innerHTML = "<h1>Account 00123456789</h1>";

  const signal = signalFor();
  expect(signal.title).toBe("Inbox for [redacted]");
  expect(signal.headings).toEqual(["Account [redacted]"]);
});

test("a log-out control is found whether it is a link or a button", () => {
  document.body.innerHTML = `<a href="/out">Log out</a>`;
  expect(signalFor().hasLogout).toBe(true);

  document.body.innerHTML = `<button>Sign Out</button>`;
  expect(signalFor().hasLogout).toBe(true);

  document.body.innerHTML = `<a href="/x">Logout</a>`;
  expect(signalFor().hasLogout).toBe(true);
});

test("a log-out control is not found in a word that merely contains one", () => {
  // The word boundary earning its keep. Reading this as a signed-in page would refuse a blog.
  document.body.innerHTML = `<a href="/x">Blog out of hours</a><a href="/y">Catalogue</a>`;
  expect(signalFor().hasLogout).toBe(false);
});

test("noindex is read from the robots tag, and absent means false", () => {
  expect(signalFor().noindex).toBe(false);

  document.head.innerHTML = `<meta name="robots" content="noindex, nofollow">`;
  expect(signalFor().noindex).toBe(true);

  document.head.innerHTML = `<meta name="robots" content="index, follow">`;
  expect(signalFor().noindex).toBe(false);
});

test("password fields are counted, visible or not", () => {
  document.body.innerHTML = `<input type="password"><input type="password"><input type="text">`;
  expect(signalFor().passwordFields).toBe(2);
});

test("the counts the content script already has are passed through, not recounted", () => {
  document.body.innerHTML = "<p>One</p>";
  const signal = pageSignal(document, new URL("https://example.com/a"), "", {
    formFields: 7,
    paragraphs: 3,
  });
  expect(signal).toMatchObject({ formFields: 7, paragraphs: 3 });
});

test("a currency symbol in the text is noticed", () => {
  const url = new URL("https://example.com/a");
  expect(pageSignal(document, url, "Total: £19.99", COUNTS).hasCurrency).toBe(true);
  expect(pageSignal(document, url, "Total: nineteen pounds", COUNTS).hasCurrency).toBe(false);
});

test("no page text and no query string are anywhere in the signal", () => {
  // The rule this whole file exists to keep. Asserted against the serialised whole rather than
  // field by field, so a field added later cannot get out without failing this.
  document.title = "An article";
  document.head.innerHTML = `<meta name="robots" content="index">`;
  document.body.innerHTML = `
    <h1>How cake is made</h1>
    <p>The body of the page, which the classifier must never be shown.</p>
  `;

  const text = document.body.textContent ?? "";
  const signal = pageSignal(
    document,
    new URL("https://example.com/an-article?token=secret-value"),
    text,
    COUNTS,
  );

  const serialised = JSON.stringify(signal);
  expect(serialised).not.toContain("The body of the page");
  expect(serialised).not.toContain("secret-value");
  expect(serialised).not.toContain("?");
});
