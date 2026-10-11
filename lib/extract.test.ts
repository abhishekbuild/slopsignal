// @vitest-environment happy-dom
// The only suite here that needs a DOM. Kept per-file rather than in vitest.config.ts so the other
// three keep running in plain node.
import { beforeEach, expect, test } from "vitest";
import { extractText } from "./extract";

beforeEach(() => {
  document.body.innerHTML = "";
});

/** Long enough that the semantic walk clears the 500-character fallback threshold. */
const body = (n: number) => `<p>Paragraph ${n}. ${"Words that make up the page. ".repeat(4)}</p>`;

test("takes the prose and leaves the furniture", () => {
  document.body.innerHTML = `
    <nav><p>Home</p><p>About</p></nav>
    <header><h1>A site</h1></header>
    ${body(1)}${body(2)}${body(3)}${body(4)}${body(5)}
    <footer><p>Copyright someone</p></footer>
    <aside><p>Related reading</p></aside>
  `;

  const text = extractText(document);

  expect(text).toContain("Paragraph 1.");
  expect(text).toContain("Paragraph 5.");
  expect(text).not.toContain("Home");
  expect(text).not.toContain("Copyright someone");
  expect(text).not.toContain("Related reading");
});

test("inside an article, the furniture filter stays out of the way", () => {
  // An author who marked up their content gets to keep whatever is inside it.
  document.body.innerHTML = `
    <nav><p>Home</p></nav>
    <article>
      ${body(1)}${body(2)}${body(3)}${body(4)}${body(5)}
      <aside><p>A pull quote the author put here on purpose.</p></aside>
    </article>
  `;

  const text = extractText(document);

  expect(text).toContain("Paragraph 1.");
  expect(text).toContain("A pull quote the author put here on purpose.");
  expect(text).not.toContain("Home");
});

test("a nested block is counted once, not twice", () => {
  document.body.innerHTML = `<article><blockquote><p>Quoted once.</p></blockquote></article>`;
  expect(extractText(document).match(/Quoted once\./g)).toHaveLength(1);
});

test("a page with no semantic markup falls back to everything", () => {
  const sentence = "A page built entirely out of divs. ";
  document.body.innerHTML = `<nav><div>Home</div></nav><div>${sentence.repeat(30)}</div>`;

  const text = extractText(document);

  // No p, h1-h5, li, pre or blockquote anywhere, so the walk finds nothing and takes the lot.
  expect(text).toContain("A page built entirely out of divs.");
  // And the furniture comes with it. That is the known cost of the fallback, and the reason the
  // ponytail note in extract.ts names Readability as the upgrade.
  expect(text).toContain("Home");
});

test("caps what leaves the browser", () => {
  document.body.innerHTML = `<article><p>${"word ".repeat(30_000)}</p></article>`;
  expect(extractText(document)).toHaveLength(100_000);
});

test("an empty page yields nothing rather than throwing", () => {
  expect(extractText(document)).toBe("");
});
