import { Monogram } from "@/components/monogram";
import { DASHBOARD_URL } from "@/lib/dashboard";
import { formatRelative } from "@/lib/format";
import type { MemoryRow } from "@/lib/messages";

/**
 * One remembered page, as a row: the site's mark, the title, and the site and when you read it.
 *
 * It was a card until 0.22.0 — a 150px `<button>` holding an `<h3>`, the summary and the tags —
 * so the popup showed two and a half pages, and a screen reader heard the whole card as one
 * forty-word button name (audit #18, #25, E-01, E-10). Now the title is a link, and the link is the
 * row's name. The dashboard's list rows (`tabcake_dashboard/components/list-row.tsx`) are the same
 * shape; if you change one, look at the other.
 *
 * The link has a real `href` into the dashboard, so it can be middle-clicked or copied. A plain
 * click goes through `onOpen` instead, which opens the tab and closes the popup.
 *
 * - **No favicon.** {@link Monogram} instead, because fetching one tells a third party what you
 *   have been reading. design.md §1 and §9 (Monogram) make this the rule.
 * - **No match score.** `search.queries.hybrid` returns `relevance` and `lib/search.ts` drops it: a
 *   fused rank orders one result set and means nothing outside it.
 */
export function ResultRow({ row, onOpen }: { row: MemoryRow; onOpen: (pageId: string) => void }) {
  return (
    <div className="page-in group relative flex min-h-12 items-center gap-3 rounded-md px-2 py-2 transition-colors duration-120 ease-out hover:bg-muted">
      <Monogram domain={row.domain} size={24} />
      <div className="min-w-0 flex-1">
        <a
          href={`${DASHBOARD_URL}/memory/${row.pageId}`}
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
            event.preventDefault();
            onOpen(row.pageId);
          }}
          className="block truncate text-ui font-medium text-foreground underline-offset-2 after:absolute after:inset-0 after:rounded-md group-hover:underline"
        >
          {row.title || row.domain}
        </a>
        <p className="flex min-w-0 items-center gap-2 text-meta text-muted-foreground">
          <span className="min-w-0 truncate font-mono">{row.domain}</span>
          <span className="numeric shrink-0">{formatRelative(row.lastVisited)}</span>
          {row.status === "pending" ? (
            <span className="shrink-0">Indexing</span>
          ) : row.status === "failed" ? (
            <span className="shrink-0 text-destructive">Not indexed</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
