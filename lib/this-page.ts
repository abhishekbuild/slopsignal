import type { SkipReason, TabState } from "./messages";

/**
 * The one control the popup's this-page row offers, decided from the tab's state (audit §B, E-05).
 *
 * Until 0.23.0 the row could carry three at once — a forget icon, "Block {host}" and "Allow
 * {host}" — whatever the page had done. Now it offers the one that answers what just happened:
 *
 * | The tab | The control |
 * |---|---|
 * | blocked by your rule | Remove the rule |
 * | remembered, and the server knows its id | Forget this page |
 * | being read | Block this site |
 * | skipped for a reason allowing the site lifts | Read it anyway |
 * | anything else | none |
 *
 * Anything more — every rule, every allowed site — is on the dashboard's Reading rules page, which
 * the footer links to.
 */
export type ThisPageControl = "unblock" | "forget" | "block" | "allow" | null;

export function thisPageControl(
  tab: TabState,
  { blocked, allowed, known }: { blocked: boolean; allowed: boolean; known: boolean },
): ThisPageControl {
  const status = tab.status;
  if (blocked || (status.state === "skipped" && status.reason === "blocked")) return "unblock";
  if (status.state === "remembered") return known ? "forget" : null;
  if (status.state === "watching") return "block";
  if (status.state === "skipped" && WAIVABLE.has(status.reason) && !allowed) return "allow";
  return null;
}

/**
 * The refusals that allowing the site lifts.
 *
 * Not `blocked`: that is a rule you wrote, and the row offers to remove it rather than to argue with
 * it. Not `search`, `form`, `too-short` or `error-page`: those say you did not read the page, which
 * allowing the site does not change. Not `paused` or `signed-out`, which are about this browser
 * rather than this site.
 *
 * `auto-skipped` is here because it is a conclusion the classifier reached, and a grant has waived
 * the classifier since 0.11.0. `video` is here because a grant waives the address rules and this is
 * one of them — though the button on the page is the better answer sitting right next to it.
 */
export const WAIVABLE = new Set<SkipReason>([
  "sensitive",
  "video",
  "auto-skipped",
  "unchecked",
  "insecure",
  "private",
]);
