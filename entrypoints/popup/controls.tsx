import { useEffect, useState } from "react";
import { Pause } from "lucide-react";
import { browser } from "wxt/browser";
import type { PageInfoReply, SkipReason, TabState } from "@/lib/messages";
import { thisPageControl } from "@/lib/this-page";
import { isAllowed, parseGrants } from "@/lib/grants";
import { isBlocked, toBlocklist } from "@/lib/rules";
import { isPaused, PAUSED_INDEFINITELY } from "@/lib/settings";
import { Button } from "@/components/button";
import { ask } from "./ask";

/**
 * The two rows above the search: what happened to the tab behind the popup, and whether capture is
 * running at all.
 *
 * Both read storage directly and subscribe to changes, which is the convention here — the popup
 * reads storage to display something and sends a message to cause something. Reading gives live
 * updates for free; a message would be a round trip and a stale view the moment anything changed.
 */

/**
 * Reads one storage key and keeps it current for as long as the popup is open. `LOADING` until the
 * first read lands, so "absent" and "not read yet" are not the same answer.
 */
const LOADING = Symbol("loading");

function useStoredOrLoading<T>(area: "local" | "session", key: string | null): T | undefined | typeof LOADING {
  const [value, setValue] = useState<T | undefined | typeof LOADING>(LOADING);

  useEffect(() => {
    if (key === null) return;
    void browser.storage[area].get(key).then((stored) => setValue(stored[key] as T | undefined));

    const onChanged = (changes: Record<string, { newValue?: unknown }>, changed: string) => {
      if (changed !== area || !(key in changes)) return;
      setValue(changes[key]?.newValue as T | undefined);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [area, key]);

  return value;
}

function useStored<T>(area: "local" | "session", key: string | null): T | undefined {
  const value = useStoredOrLoading<T>(area, key);
  return value === LOADING ? undefined : value;
}

/** The active tab's id. Needs no permission at all; only `tab.url` would, and we never read it. */
function useActiveTabId(): number | null {
  const [tabId, setTabId] = useState<number | null>(null);
  useEffect(() => {
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => setTabId(tab?.id ?? null));
  }, []);
  return tabId;
}

/**
 * The page you are looking at, first in the popup: one sentence saying what Tabcake did with it,
 * and the one control that fits (audit §B, E-05). `thisPageControl` in `lib/this-page.ts` decides
 * which; everything else about a site's rules is on the dashboard's Reading rules page.
 *
 * It renders in every state. A page Tabcake never looks at — a new tab, a chrome:// page — has no
 * entry, and until 0.23.0 that drew nothing at all, which read as the popup being broken.
 */
export function ThisPage({ onForget }: { onForget: () => void }) {
  const tabId = useActiveTabId();
  const read = useStoredOrLoading<TabState>("session", tabId === null ? null : `tab:${tabId}`);
  const tab = read === LOADING ? undefined : read;
  // The raw stored value, whatever shape it is in, read through the one function that knows the
  // shapes. Reading storage rather than asking the background is what keeps this line live when
  // the button below changes it.
  const stored = useStored<unknown>("local", "blocklist");
  const grants = parseGrants(useStored<unknown>("local", "grants"));

  const remembered = tab?.status.state === "remembered";
  const fetched = usePageInfo(remembered ? (tab?.url ?? null) : null);
  // What the server said is about the remembered page; once the tab reads or skips something else,
  // an old answer would put "read 3 times · Indexed" beside "Reading…".
  const info = remembered ? fetched : null;
  // The rules belong to the account, so a toggle can fail in a way it never could when it only
  // wrote storage. The line not changing is the first signal; this says why.
  const [failed, setFailed] = useState(false);
  // Forget cannot be undone and the popup has no dialog, so the first press asks (audit #16).
  const [confirming, setConfirming] = useState(false);

  // Nothing until the tab's entry has been read: saying "Tabcake does not read this kind of page"
  // for the moment before storage answers was a sentence that was usually untrue.
  if (read === LOADING) return <section aria-hidden className="min-h-12 shrink-0 border-b border-border" />;
  if (tab === undefined) {
    return (
      <section className="flex min-h-12 shrink-0 items-center border-b border-border px-4 py-3">
        <p role="status" className="text-meta font-semibold text-foreground">
          Tabcake does not read this kind of page.
        </p>
      </section>
    );
  }

  const blocked = isBlocked(tab.host, toBlocklist(stored));
  const origin = originOf(tab.url);
  const allowed = origin !== null && isAllowed(origin, grants);
  const control = thisPageControl(tab, { blocked, allowed, known: info !== null });
  const { line, live } = describe(tab.status, blocked);

  function send(message: Parameters<typeof ask>[0]) {
    setFailed(false);
    void ask<{ ok: boolean }>(message).then((reply) => setFailed(reply?.ok === false));
  }

  return (
    <section className="shrink-0 border-b border-border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {/* design.md §1: amber is live capture and nothing else is warm, and there is one of it
                per viewport. `bg-live`, never a raw amber stop — §3, "Reach for the token". */}
            {live && (
              <span
                className="live-dot size-2 shrink-0 rounded-full bg-live"
                aria-hidden="true"
              />
            )}
            {/* A status region, so a block, an allow, a forget or a pause is heard when it lands
                (audit A-09), not only seen. */}
            <span role="status" title={line} className="numeric truncate text-meta font-semibold text-foreground">
              {line}
              {tab.status.state === "watching" ? <Dwell startedAt={tab.status.startedAt} /> : null}
              {/* The exact count when the server answered, and the flag already in `TabState` when
                  it did not — offline, "read before" is still true and still worth saying. */}
              {info !== null && info.visitCount > 1
                ? ` · read ${info.visitCount} times`
                : info === null && tab.status.state === "remembered" && tab.status.result === "revisited"
                  ? " · read before"
                  : ""}
            </span>
          </div>

          {tab.title ? (
            <p className="mt-0.5 truncate text-ui font-medium text-foreground" title={tab.title}>
              {tab.title}
            </p>
          ) : null}

          <div className="numeric mt-1 flex items-center gap-2 text-meta text-muted-foreground">
            <span className="truncate font-mono">{tab.host}</span>
            {allowed ? (
              <>
                <Separator />
                <span>allowed</span>
              </>
            ) : null}
            {info?.status === "ready" ? (
              <>
                <Separator />
                <span className="text-foreground">Indexed</span>
              </>
            ) : info?.status === "pending" ? (
              <>
                <Separator />
                <span>Indexing</span>
              </>
            ) : null}
          </div>
        </div>

        {/* One control, 32px, secondary (design.md §10). */}
        <div className="flex shrink-0 items-center gap-1">
          {control === "forget" && info !== null ? (
            confirming ? (
              <>
                <Button
                  variant="danger"
                  onClick={() => {
                    void ask({ type: "forget", pageId: info.pageId }).then(onForget);
                  }}
                >
                  Forget it
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setConfirming(true)}>
                Forget this page
              </Button>
            )
          ) : control === "unblock" ? (
            <Button
              variant="secondary"
              onClick={() => send({ type: "setBlocked", host: tab.host, blocked: false })}
            >
              Remove the rule
            </Button>
          ) : control === "block" ? (
            <Button
              variant="secondary"
              onClick={() => send({ type: "setBlocked", host: tab.host, blocked: true })}
            >
              Block this site
            </Button>
          ) : control === "allow" && origin !== null ? (
            <Button
              variant="secondary"
              onClick={() => send({ type: "setAllowed", origin, allowed: true })}
            >
              Read it anyway
            </Button>
          ) : null}
        </div>
      </div>

      {failed ? (
        <p role="alert" className="mt-1 text-meta text-destructive">
          Could not save that. Check your connection and try again.
        </p>
      ) : null}
    </section>
  );
}

/** The origin a grant would be for, or null when the tab never sent a readable address. */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const Separator = () => <span aria-hidden="true">·</span>;

/**
 * How long you have been on this page while the fifteen seconds are still counting.
 *
 * `startedAt` is wall-clock and the dwell timer only counts seconds the tab is visible, so a tab
 * left in the background reads high. It ticks once a second here rather than being pushed, because
 * a message per second per tab to say "still reading" would be the expensive way to draw a number
 * nobody acts on.
 */
function Dwell({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <> {Math.max(0, Math.floor((now - startedAt) / 1000))} s</>;
}

/**
 * How often the server has seen this address, and whether it finished indexing.
 *
 * One round trip, and only for a tab that was remembered. The free alternative is the `revisited`
 * flag already in `TabState`, which says "seen before" without the count — reach for that instead
 * if this ever reads as too much.
 */
function usePageInfo(url: string | null): PageInfoReply {
  const [info, setInfo] = useState<PageInfoReply>(null);

  useEffect(() => {
    if (url === null) return;
    let current = true;
    void ask<PageInfoReply>({ type: "pageInfo", url }).then((next) => {
      if (current) setInfo(next);
    });
    return () => {
      current = false;
    };
  }, [url]);

  return info;
}

/** How long a pause lasts. The last one has no end, which is what `PAUSED_INDEFINITELY` means. */
const DURATIONS = [
  { label: "15 min", ms: 15 * 60_000 },
  { label: "1 hour", ms: 60 * 60_000 },
  { label: "Until I resume", ms: PAUSED_INDEFINITELY },
] as const;

/**
 * Whether capture is running, in every signed-in state, and the control named for what pressing
 * it does (audit E-06). It said "Pause capture:" and three bare durations until 0.23.0, so the
 * resting state never said capture was on. The three stay inline rather than behind a menu: 480px
 * has room, and a menu would be a dependency for three buttons.
 */
export function CaptureRow() {
  const pauseUntil = useStored<number>("local", "pauseUntil") ?? 0;
  const paused = isPaused(pauseUntil);

  const pause = (ms: number) =>
    void ask({ type: "pause", until: ms === PAUSED_INDEFINITELY ? ms : Date.now() + ms });

  return (
    <section
      aria-label="Capture"
      className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-1"
    >
      <p role="status" className="flex min-w-0 cursor-default items-center gap-2 text-meta font-semibold text-foreground">
        {paused ? (
          <Pause size={13} strokeWidth={1.5} className="shrink-0 text-subtle" aria-hidden="true" />
        ) : (
          <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
        )}
        <span className="truncate">
          {paused
            ? pauseUntil === PAUSED_INDEFINITELY
              ? "Paused until you resume"
              : `Paused until ${new Date(pauseUntil).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
            : "Capturing"}
        </span>
      </p>

      {paused ? (
        <Button variant="secondary" onClick={() => void ask({ type: "pause", until: 0 })}>
          Resume
        </Button>
      ) : (
        <div role="group" aria-label="Pause for" className="flex shrink-0 items-center gap-1">
          <span aria-hidden="true" className="mr-1 text-meta text-muted-foreground">
            Pause for
          </span>
          {DURATIONS.map(({ label, ms }) => (
            <Button key={label} variant="secondary" onClick={() => pause(ms)}>
              {label}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}

/** One sentence per outcome. A page that was skipped always says why; silence is what breaks trust. */
export function describe(status: TabState["status"], blocked: boolean): { line: string; live: boolean } {
  if (blocked || (status.state === "skipped" && status.reason === "blocked")) {
    return { line: "Blocked by your rule", live: false };
  }
  switch (status.state) {
    case "watching":
      return { line: "Reading…", live: false };
    case "remembered":
      return { line: "Remembered", live: true };
    case "failed":
      return { line: `Could not save this page: ${status.error}`, live: false };
    case "skipped":
      return { line: `Skipped: ${SKIPPED[status.reason]}`, live: false };
  }
}

const SKIPPED: Record<SkipReason, string> = {
  "signed-out": "not connected to an account",
  "no-consent": "Tabcake is not turned on yet",
  paused: "capture is paused",
  blocked: "blocked domain",
  dashboard: "this is Tabcake itself",
  insecure: "not a secure address",
  private: "a private or local address",
  sensitive: "this looks like a private page",
  video: "a video. Remember its transcript from the page",
  "auto-skipped": "Tabcake stopped reading this site",
  unchecked: "could not check this page",
  search: "a search results page",
  "error-page": "the page did not load",
  "too-short": "not enough to read",
  form: "mostly a form",
  pdf: "a PDF. Upload the file in Tabcake instead",
};
