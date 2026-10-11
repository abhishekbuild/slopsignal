/**
 * Taking the personal data out of a page before any of it leaves this browser.
 *
 * Runs on the extracted text, the title and every heading, so it covers both what gets stored and
 * what the classifier is shown. It runs in the tab rather than on the server on purpose: text that
 * has been redacted here never travels at all, and that is a different promise from text the server
 * redacts on arrival.
 *
 * ponytail: regular expressions catch shapes, not meaning. A person's name, a street address or a
 * diagnosis written in prose goes straight through, and nothing here will ever catch them. What
 * covers that case is the classifier refusing whole pages that are *about* personal data — a much
 * weaker guarantee than a pattern match, and worth being honest about rather than implying this
 * file makes a page safe.
 */

/** One token for everything. A label per kind would leak the kind. */
const REDACTED = "[redacted]";

/**
 * Patterns that identify themselves, applied before anything that guesses.
 *
 * Order matters only where two could overlap: a card number is tried before the bare-digit rule at
 * the bottom so a spaced one is caught while its spaces are still there.
 */
const NAMED: RegExp[] = [
  // A JWT: three base64url segments, the first starting `eyJ`, which is `{"` encoded — every JWT
  // header begins that way. Sessions, API tokens and password-reset links all look like this.
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g,
  // Keys that announce themselves with a prefix. Far safer than guessing at entropy.
  /\b[sprk]k-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  /\bxox[baprse]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  // An IBAN: two country letters, two check digits, then the account.
  /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g,
  // A US social security number. Its own rule because nine digits with those separators is
  // otherwise indistinguishable from an ordinary number.
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // Phone numbers, in the two shapes that cannot be much else: an international number, and the
  // 3-3-4 grouping. A plain four-digit year or a date does not match either.
  /\+\d[\d\s().-]{7,}\d/g,
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
];

/** A run of 13 to 19 digits, optionally spaced or hyphenated, which is the shape of a card number. */
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;

/**
 * Anything else ten digits or longer.
 *
 * This is the rule that catches a bare bank account number, which has no checksum and no separators
 * to recognise it by. It is also the rule with a cost, and the cost is real: an ISBN, a long order
 * number, an epoch timestamp and a tracking number all go with it. That trade was made deliberately
 * — a page you can still find, with one number missing from it, beats a stored account number.
 */
const LONG_DIGITS = /\d{10,}/g;

/**
 * The checksum every card number carries, and the reason ordinary numbers survive this file.
 *
 * Without it, any thirteen-digit run would be treated as a card. With it, "order 5567" and
 * "total 1200" are left alone and a real number is not.
 */
function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = digits.charCodeAt(i) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

/** The same text with everything that looks like personal data replaced. */
export function redact(text: string): string {
  let out = text;
  for (const pattern of NAMED) out = out.replace(pattern, REDACTED);

  out = out.replace(CARD, (match) => {
    const digits = match.replace(/\D/g, "");
    return digits.length >= 13 && luhn(digits) ? REDACTED : match;
  });

  return out.replace(LONG_DIGITS, REDACTED);
}
