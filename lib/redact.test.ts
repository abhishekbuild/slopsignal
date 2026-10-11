import { expect, test } from "vitest";
import { redact } from "./redact";

/**
 * What must never reach the backend, and what must survive.
 *
 * The second table matters as much as the first: this file damages page text on purpose, and the
 * only way to keep the damage deliberate is to write down what is allowed to be damaged.
 */

/** Every value here must be unrecognisable in the output. */
const SECRETS: [string, string][] = [
  ["a JWT", "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r"],
  ["an OpenAI-shaped key", "key sk-proj-abcdefghijklmnop0123456789"],
  ["a GitHub token", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
  ["a Slack token", "xoxb-123456789012-abcdefghijkl"],
  ["an AWS access key", "AKIAIOSFODNN7EXAMPLE"],
  ["an email address", "write to alice.smith+tag@example.co.uk today"],
  ["an IBAN", "GB33BUKB20201555555555"],
  ["a social security number", "SSN 123-45-6789"],
  ["an international phone number", "call +44 20 7946 0958"],
  ["a grouped phone number", "call 555-123-4567"],
  ["a card number with spaces", "card 4242 4242 4242 4242"],
  ["a card number without spaces", "card 4242424242424242"],
  ["a bare account number", "account 00123456789"],
];

test.each(SECRETS)("%s is redacted", (_name, text) => {
  const out = redact(text);
  expect(out).toContain("[redacted]");
  // The value itself, in whatever shape it was written, is not in what comes out.
  for (const word of text.split(" ").slice(1)) {
    if (/\d{4,}|@|eyJ|sk-|ghp_|xox|AKIA/.test(word)) expect(out).not.toContain(word);
  }
});

/** Ordinary text that must come through untouched. The cost of getting this wrong is a worse product. */
const KEPT = [
  "order 5567 total 1200",
  "Chapter 12, page 344",
  "Published on 2026-09-22 at 19:42",
  "The 1990s were 30 years ago",
  "version 1.2.3, build 4567",
  "£19.99 including VAT",
];

test.each(KEPT)("%s survives", (text) => {
  expect(redact(text)).toBe(text);
});

test("the digit rule starts at ten, and is tested at ten", () => {
  // Nine digits is an order number. Ten is where a bank account starts looking like one, and the
  // line has to be somewhere.
  expect(redact("ref 123456789")).toBe("ref 123456789");
  expect(redact("ref 1234567890")).toBe("ref [redacted]");
});

test("a thirteen-digit run that fails the checksum is still caught by the digit rule", () => {
  // Not a card — but ten or more digits, so it goes anyway. The two rules overlap on purpose.
  expect(redact("ref 1111111111111")).toBe("ref [redacted]");
});

test("what this knowingly costs", () => {
  // These are the documented losses, asserted so that nobody quietly "fixes" them and reopens the
  // hole the ten-digit rule exists to close. If you want them back, the decision changes first.
  expect(redact("ISBN 9780140449136")).toBe("ISBN [redacted]");
  expect(redact("captured at 1789738314123")).toBe("captured at [redacted]");
});

test("a page with nothing to hide is returned exactly as it was", () => {
  const article = "Tabcake remembers the pages you read so you can find them again later.";
  expect(redact(article)).toBe(article);
});

test("several secrets in one page all go", () => {
  const out = redact("mail a@b.com or call +44 20 7946 0958, card 4242 4242 4242 4242");
  expect(out).not.toContain("a@b.com");
  expect(out).not.toContain("7946");
  expect(out).not.toContain("4242");
});
