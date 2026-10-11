import { browser } from "wxt/browser";

/**
 * The screenshot behind "Report a bug", parked between the popup and the dashboard's /feedback page.
 *
 * The popup captures the tab and then closes as the dashboard opens, so it cannot hand the image
 * over itself. It leaves it here; the dashboard asks for it with `takeShot` once it has loaded.
 *
 * `storage.session` because it is memory only, cleared when the browser closes, and a picture of
 * somebody's screen has no business on disk. One key, so a second report replaces the first.
 */
export type Shot = { dataUrl: string; pageUrl?: string; title?: string; at: number };

const SHOT_KEY = "shot";

/** Long enough to load the dashboard and sign in first; short enough that a forgotten one is gone. */
export const SHOT_TTL_MS = 10 * 60 * 1000;

export async function stashShot(shot: Omit<Shot, "at">, now = Date.now()): Promise<void> {
  const value: Shot = { ...shot, at: now };
  await browser.storage.session.set({ [SHOT_KEY]: value });
}

/** The stashed shot if it is fresh, and never twice: it is deleted on the way out either way. */
export async function takeShot(now = Date.now()): Promise<Shot | undefined> {
  const shot = (await browser.storage.session.get(SHOT_KEY))[SHOT_KEY] as Shot | undefined;
  if (shot === undefined) return undefined;
  await browser.storage.session.remove(SHOT_KEY);
  return typeof shot.dataUrl === "string" && now - shot.at < SHOT_TTL_MS ? shot : undefined;
}
