import { useEffect, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { ResultRow } from "@/components/result-row";
import { Loader } from "@/components/loader";
import type { RowsReply } from "@/lib/messages";
import { ask } from "./ask";

/**
 * The popup's search field and the list under it.
 *
 * The list is one component with two sources: what you searched for, or — with the field empty —
 * the last five pages remembered. `lib/search.ts` normalises both to the same row shape so there is
 * one thing to render and one thing to read.
 *
 * Searching happens on Enter, not per keystroke. Every search embeds the query on the server, which
 * is a paid request; the dashboard's ⌘K palette can afford a 400 ms debounce because it is a bigger
 * surface people linger in, and this is a popup that closes the moment you click a result.
 */

export function SearchField({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      // design.md §8: h44, radius-lg, leading search icon — the one exception in the system. What
      // you type is interface, so the input is sans.
      className="flex h-11 items-center gap-2 rounded-lg border border-input bg-secondary px-3 transition-colors duration-120 ease-out focus-within:border-ring focus-within:bg-card focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
    >
      <SearchIcon size={16} strokeWidth={1.5} className="shrink-0 text-muted-foreground" />
      <input
        type="search"
        // The Ctrl+Shift+K shortcut opens the popup; this is what makes it land you typing.
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search your memory"
        aria-label="Search your memory"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-ui text-foreground outline-none placeholder:text-muted-foreground"
      />
      {/* The field searches on Enter, so the field says so. */}
      {value.trim() === "" ? null : (
        <kbd className="shrink-0 rounded-md border border-border bg-card px-2 py-0.5 font-sans text-meta font-medium text-muted-foreground">
          ↵
        </kbd>
      )}
    </form>
  );
}

/**
 * Your recent pages, or what the last search found, as rows: eight results or five recent pages.
 *
 * `null` while a request is in flight, so the loader shows without a second piece of state that
 * could drift out of step with this one.
 *
 * There is no Ranked · Recent toggle since 0.23.0 (audit E-09): it was two 17px words that read as a
 * breadcrumb, and "recent" is already what the list shows when the field is empty.
 */
export function MemoryList({
  submitted,
  onOpen,
  onSeeAll,
}: {
  /** The query the last Enter ran. Empty means the field is idle and this is the recent list. */
  submitted: string;
  onOpen: (pageId: string) => void;
  onSeeAll: () => void;
}) {
  const [reply, setReply] = useState<RowsReply | null>(null);
  const searching = submitted !== "";

  useEffect(() => {
    let current = true;
    setReply(null);
    const message = searching
      ? ({ type: "search", query: submitted } as const)
      : ({ type: "recent" } as const);
    void ask<RowsReply>(message).then((next) => {
      if (current) setReply(next);
    });
    return () => {
      current = false;
    };
  }, [submitted, searching]);

  const rows = reply !== null && !("error" in reply) && !reply.signedOut ? reply.rows : null;

  return (
    <>
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        {/* design.md §10's popup h2: 14/20 600. It was a 12px grey label with the count in it. */}
        <h2 className="cursor-default text-ui font-semibold text-foreground">
          {searching ? "Results" : "Recent"}
        </h2>
        {/* The count changes without focus moving, so it is announced (audit A-09). */}
        <p role="status" className="sr-only">
          {rows === null
            ? ""
            : searching
              ? `${rows.length} ${rows.length === 1 ? "result" : "results"} for ${submitted}`
              : `${rows.length} recent ${rows.length === 1 ? "page" : "pages"}`}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-1">
        {reply === null ? (
          // It waits 300ms before it shows, and it says what it is doing (audit #30).
          <div className="appear-late flex flex-col items-center gap-2 py-10">
            <Loader width={24} label={searching ? "Searching your memory" : "Loading your memory"} />
            <p aria-hidden className="text-meta text-muted-foreground">
              {searching ? "Searching your memory…" : "Loading your memory…"}
            </p>
          </div>
        ) : "error" in reply ? (
          <Note>{reply.error}</Note>
        ) : reply.signedOut ? null : reply.rows.length === 0 ? (
          <Note>
            {searching
              ? "No pages match."
              : "Nothing remembered yet. Read something for fifteen seconds and it will appear here."}
          </Note>
        ) : (
          <>
            <ul className="space-y-1">
              {reply.rows.map((row) => (
                <li key={row.pageId}>
                  <ResultRow row={row} onOpen={onOpen} />
                </li>
              ))}
            </ul>
            {searching ? (
              <button
                type="button"
                onClick={onSeeAll}
                className="mt-2 inline-flex h-8 w-full cursor-pointer items-center rounded-md px-2 text-left text-ui font-medium text-accent-strong transition-colors duration-120 ease-out hover:bg-muted"
              >
                Open all results <span aria-hidden="true">&nbsp;↗</span>
              </button>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-8 text-center text-ui text-muted-foreground">{children}</p>;
}
