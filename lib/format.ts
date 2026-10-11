/**
 * How long ago, in words, for the result cards.
 *
 * A deliberate copy of `tabcake_dashboard/lib/format.ts`, like `components/button.tsx`,
 * `monogram.tsx`, `stack.tsx` and `mark.tsx`. If you change one, change the other. The dashboard's
 * copy also exports `formatDate`; nothing in the popup shows an absolute date, so it is not here.
 *
 * design.md §2 renders timestamps as sans `meta` with `numeric` — mono is for strings that are data.
 */

/** Descending, so the first unit the gap fills is the one worth saying. */
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

const RELATIVE = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

/**
 * "2 hours ago", "yesterday". For a list you scan rather than read, where how long ago is the
 * question and the date is not.
 */
export function formatRelative(ms: number, now = Date.now()): string {
  const elapsed = ms - now;
  for (const [unit, size] of UNITS) {
    if (Math.abs(elapsed) >= size) return RELATIVE.format(Math.round(elapsed / size), unit);
  }
  return "just now";
}
