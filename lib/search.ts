import { api, type PageSummary, type SearchResult } from "./api";
import { client, readTokens, withFreshToken } from "./auth";
import type { MemoryRow, PageInfoReply, RowsReply } from "./messages";

/**
 * What the popup's search field asks the background for.
 *
 * Both calls run here rather than in `background.ts` because a handler there should be one line
 * calling something testable, and because this is where the token is — the popup never holds one.
 *
 * Neither function throws. The popup has to render something whatever happened, so a failure comes
 * back as a reply it can display, exactly as `me()` in `lib/auth.ts` does.
 */

/**
 * Eight results at 480 × 600 (design.md §10, audit R-07); five recent pages when the field is
 * empty. The dashboard's Memory search is where the rest live.
 */
const POPUP_RESULTS = 8;
const POPUP_RECENT = 5;

/**
 * `search.queries.hybrid` rows and `pages.queries.list` rows agree on most fields and disagree on the id.
 *
 * `relevance` is the one thing dropped on the way through, and that is deliberate: it is a fused
 * rank that orders one result set and means nothing outside it, so a percentage beside a card would
 * read as a confidence it is not. `lib/api.ts` says the same at its declaration.
 */
const fromResult = (row: SearchResult): MemoryRow => ({
  pageId: row.pageId,
  title: row.title,
  domain: row.domain,
  lastVisited: row.lastVisited,
  summary: row.summary,
  tags: row.tags,
  // A page only reaches the vector index once it is indexed, so a search result always is.
  status: "ready",
});

const fromPage = (row: PageSummary): MemoryRow => ({
  pageId: row._id,
  title: row.title,
  domain: row.domain,
  lastVisited: row.lastVisited,
  summary: row.summary,
  tags: row.tags,
  status: row.status,
});

/**
 * Shared by both calls below: the signed-out check, the token, and turning a failure into
 * something the popup can put on screen.
 */
async function rows(run: () => Promise<MemoryRow[]>): Promise<RowsReply> {
  if ((await readTokens()) === undefined) return { signedOut: true };
  try {
    return { signedOut: false, rows: await run() };
  } catch {
    // Either the refresh found the session revoked and cleared it, or Convex is unreachable.
    return (await readTokens()) === undefined
      ? { signedOut: true }
      : { error: "Could not reach Tabcake. Check your connection and try again." };
  }
}

export async function search(query: string): Promise<RowsReply> {
  const trimmed = query.trim();
  // Nothing to search for, and a blank query would still cost an embedding on the server.
  if (trimmed === "") return { signedOut: false, rows: [] };

  return rows(() =>
    withFreshToken(async (token) =>
      (
        await client(token).action(api.search.queries.hybrid, { query: trimmed, limit: POPUP_RESULTS })
      ).map(fromResult),
    ),
  );
}

export async function recent(): Promise<RowsReply> {
  return rows(() =>
    withFreshToken(async (token) =>
      (
        await client(token).query(api.pages.queries.list, {
          paginationOpts: { numItems: POPUP_RECENT, cursor: null },
        })
      ).page.map(fromPage),
    ),
  );
}

/**
 * The two calls the this-page row makes. Neither is worth the three-way reply the lists give: a
 * figure that cannot be fetched is left out, so a failure is `null` and the row renders without it
 * rather than explaining itself in a corner. (The page count went with the header in 0.23.0.)
 */
async function quietly<T>(run: () => Promise<T>): Promise<T | null> {
  if ((await readTokens()) === undefined) return null;
  try {
    return await run();
  } catch {
    return null;
  }
}

/**
 * What the server holds for the tab behind the popup: how many times you have been here, and
 * whether it finished indexing.
 *
 * One round trip per popup open, and only for a tab that was remembered. The free alternative is
 * the `revisited` flag already in `TabState`, which says "seen before" without the count — reach
 * for that instead if this ever reads as too much.
 */
export async function pageInfo(url: string): Promise<PageInfoReply> {
  return quietly(() => withFreshToken((token) => client(token).query(api.pages.ingest.status, { url })));
}

/** Forgets one page and the chunks it was indexed as. `false` when it did not happen. */
export async function forget(pageId: PageSummary["_id"]): Promise<boolean> {
  const done = await quietly(async () => {
    await withFreshToken((token) => client(token).mutation(api.pages.forget.one, { pageId }));
    return true;
  });
  return done ?? false;
}
