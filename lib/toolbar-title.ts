import type { TabState } from "./messages";

/**
 * The toolbar tooltip for one tab, naming its state (audit E-14). The badge can only draw a dot, so
 * this is what says "skipped" or "blocked here" without opening the popup.
 *
 * `paused` wins over everything but a remembered page, which keeps its dot and says so. It has to be
 * part of the answer rather than a global title underneath: Chrome lets a tab's own title override
 * the default and has no way to clear one again, so a tab titled "reading" before a pause would go
 * on saying so through it. `applyPauseBadge` rewrites every tab's title when a pause starts or ends.
 *
 * `undefined` is a tab Tabcake has no state for — a new tab, a page it never reads.
 */
export function titleFor(state: TabState | undefined, paused: boolean): string {
  const status = state?.status;
  if (status?.state === "remembered") return "Tabcake: remembered";
  if (paused) return "Tabcake: paused";
  if (status === undefined) return "Tabcake";
  switch (status.state) {
    case "watching":
      return "Tabcake: reading";
    case "failed":
      return "Tabcake: could not save this page";
    case "skipped":
      return status.reason === "blocked"
        ? "Tabcake: blocked here by your rule"
        : "Tabcake: skipped this page";
  }
}
