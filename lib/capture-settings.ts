/**
 * How this browser decides a page was read (0.33.0): the account's two capture settings, as the
 * extension caches them. Set on the dashboard's Settings, Capture tab; read from `users.profile.me`
 * on every sync and whenever the dashboard says one changed.
 *
 * Pure, so the content script can read it without a round trip, and junk in storage reads as the
 * defaults, which are what capture did before the settings existed.
 */

/** Where the cached settings live in `storage.local`. The content script reads it raw. */
export const CAPTURE_KEY = "capture";

export type CaptureSettings = {
  /** Seconds a page must be looked at before it counts as read. */
  dwellSeconds: number;
  /** Whether a page that is mostly a form (a checkout, a sign-up) is skipped. */
  skipForms: boolean;
};

/** The backend's range for `dwellSeconds` (`users.profile.setCapture`). */
const DWELL_MIN = 5;
const DWELL_MAX = 120;

/** Fifteen seconds of looking at a page is the line between reading it and landing on it. */
export const DEFAULT_CAPTURE: CaptureSettings = { dwellSeconds: 15, skipForms: true };

/** Whatever is in storage, or the account's user row, read as capture settings. */
export function parseCapture(raw: unknown): CaptureSettings {
  const value = (raw ?? {}) as { dwellSeconds?: unknown; skipForms?: unknown };
  const dwell = value.dwellSeconds;
  return {
    dwellSeconds:
      typeof dwell === "number" && Number.isInteger(dwell) && dwell >= DWELL_MIN && dwell <= DWELL_MAX
        ? dwell
        : DEFAULT_CAPTURE.dwellSeconds,
    skipForms: typeof value.skipForms === "boolean" ? value.skipForms : DEFAULT_CAPTURE.skipForms,
  };
}
