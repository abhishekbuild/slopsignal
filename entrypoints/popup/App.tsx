import { useEffect, useState, type ReactNode } from "react";
import { Bug, FileUp, LogOut, MessageSquare } from "lucide-react";
import { browser } from "wxt/browser";
import { Button } from "@/components/button";
import { TabcakeLogo } from "@/components/brand";
import { Monogram } from "@/components/monogram";
import { Loader } from "@/components/loader";
import type { User } from "@/lib/api";
import type { MeReply, PageStatus } from "@/lib/messages";
import { ask } from "./ask";
import { CaptureRow, describe, ThisPage } from "./controls";
import { MemoryList, SearchField } from "./search";

import { PRIVACY_URL } from "@/lib/consent";
import { DASHBOARD_URL } from "@/lib/dashboard";

/** Opens a dashboard path in a tab and closes the popup; the tab is where the work happens. */
function openDashboard(path = "") {
  void browser.tabs.create({ url: DASHBOARD_URL + path });
  window.close();
}

export default function App() {
  // null = waiting on the background. The background owns the session; this is a view of it.
  const [state, setState] = useState<MeReply | null>(null);
  // Signing out also passes through `null`; this says which of the two the loader is for.
  const [leaving, setLeaving] = useState(false);
  const load = () => {
    void ask<MeReply>({ type: "me" }).then(setState);
  };
  useEffect(load, []);

  async function signOut() {
    setLeaving(true);
    setState(null);
    await ask({ type: "signOut" });
    setLeaving(false);
    setState({ signedOut: true });
  }

  // Still a card until the disclosure is accepted: the 600px window is for the list.
  const signedIn =
    state !== null &&
    !("error" in state) &&
    !state.signedOut &&
    state.user !== null &&
    state.consented !== false;

  return (
    // design.md §10: the popup is 480 wide and at most 600 tall, with a radius-lg frame and no
    // shadow — Chrome draws the popup's own, and a second one under it reads as a bug. It was 400,
    // half Chrome's maximum, and the list showed two and a half pages (audit R-07).
    //
    // Only the signed-in window is a fixed 600: it has a list to scroll and a footer to pin. Every
    // other state is one card, and a card in a half-empty 600px window looks broken.
    <main
      className={`w-120 overflow-hidden rounded-lg bg-card ${
        signedIn ? "flex h-150 flex-col" : "p-3"
      }`}
    >
      {state === null ? (
        // After 300ms, and with its words (audit #30): a quick answer draws nothing.
        <div className="appear-late flex flex-col items-center gap-2 py-10">
          <Loader width={24} label={leaving ? "Signing out" : "Checking"} />
          <p aria-hidden className="text-meta text-muted-foreground">
            {leaving ? "Signing out…" : "Checking…"}
          </p>
        </div>
      ) : "error" in state ? (
        <Notice
          title="Could not reach Tabcake"
          // One instruction, not the heading again (audit E-11).
          body="Check your connection and try again."
          action={
            <Button variant="secondary" onClick={load}>
              Try again
            </Button>
          }
        />
      ) : state.signedOut ? (
        <SignedOut />
      ) : state.user === null ? (
        <Notice
          title="This account no longer exists"
          body="Sign out here, then connect again from the dashboard."
          action={
            <Button variant="secondary" onClick={() => void signOut()}>
              Sign out
            </Button>
          }
        />
      ) : state.consented === false ? (
        <Consent onAgree={() => void ask({ type: "consent" }).then(load)} />
      ) : (
        <SignedIn user={state.user} onSignOut={() => void signOut()} />
      )}
    </main>
  );
}

/**
 * The signed-in popup, top to bottom (design.md §10, audit §B): who you are, what happened to the
 * tab behind this, whether capture is running, the search field, the list, and the two ways into
 * the full app. No navigation: anything with a list longer than eight is the dashboard's.
 *
 * Only the list scrolls: Chrome caps the popup at 600px and would scroll the whole document,
 * carrying the rows above it off the top with it.
 */
function SignedIn({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [query, setQuery] = useState("");
  // What the last Enter actually ran, kept apart from `query` so typing costs nothing: a search
  // embeds the query on the server, which would be a paid request per keystroke otherwise.
  const [submitted, setSubmitted] = useState("");
  // Bumped after a forget, so the row and the list both go and fetch themselves again.
  const [revision, setRevision] = useState(0);

  return (
    <>
      <Header user={user} onSignOut={onSignOut} />
      <ThisPage key={`page-${revision}`} onForget={() => setRevision((n) => n + 1)} />
      <CaptureRow />

      <div className="shrink-0 px-4 pt-3">
        <SearchField
          value={query}
          onChange={(value) => {
            setQuery(value);
            // An emptied field is back to Recent, without an Enter.
            if (value.trim() === "") setSubmitted("");
          }}
          onSubmit={() => setSubmitted(query.trim())}
        />
      </div>

      <MemoryList
        key={`list-${revision}`}
        submitted={submitted}
        onOpen={(pageId) => openDashboard(`/memory/${pageId}`)}
        // Memory's own address, not `/search`, which only redirected there.
        onSeeAll={() => openDashboard(`/memory?q=${encodeURIComponent(submitted)}`)}
      />

      <AddLink />
      <Feedback />
      <Footer />
    </>
  );
}

/**
 * Remembering a link without opening it (`lib/manual.ts`): the background reads it in a hidden tab
 * under every rule a page you open is read under, minus the fifteen-second wait, and the answer is
 * the same sentence the tab row above would say. Documents are uploaded on the dashboard instead,
 * because a file picker takes focus and Chrome closes a popup that loses it.
 */
function AddLink() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState("");

  const submit = async () => {
    if (url.trim() === "" || busy) return;
    setBusy(true);
    setLine("Reading the page…");
    try {
      const status = await ask<PageStatus>({ type: "indexUrl", url });
      setLine(describe(status, false).line);
      if (status.state === "remembered") setUrl("");
    } catch {
      setLine("Could not reach Tabcake. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="add-link-label" className="shrink-0 border-t border-border px-4 py-2">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex items-center gap-2"
      >
        <label id="add-link-label" htmlFor="add-link" className="shrink-0 text-meta font-semibold text-foreground">
          Add a link
        </label>
        <input
          id="add-link"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://"
          spellCheck={false}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-secondary px-3 text-ui text-foreground transition-colors duration-120 ease-out placeholder:text-muted-foreground focus:border-ring focus:bg-card"
        />
        <Button type="submit" variant="secondary" disabled={busy || url.trim() === ""}>
          Add
        </Button>
      </form>
      <div className="-ml-3 mt-1 flex items-center justify-between gap-2">
        <Button variant="quiet" onClick={() => openDashboard("/memory#add")}>
          <FileUp size={14} strokeWidth={1.5} /> Upload a document
        </Button>
        <p role="status" className="min-w-0 wrap-anywhere text-right text-meta text-muted-foreground">
          {line}
        </p>
      </div>
    </section>
  );
}

/**
 * Two ways to tell us something, above the footer. Not a screen: both open the dashboard's
 * /feedback page, which has the editor. "Report a bug" brings a picture of the tab with it.
 */
function Feedback() {
  return (
    <section className="shrink-0 border-t border-border px-4 py-2">
      <p className="text-meta text-muted-foreground">We’re listening. Your feedback shapes Tabcake.</p>
      {/* Pulled left by the buttons' own padding, so their labels line up with the sentence. */}
      <div className="-ml-3 mt-1 flex items-center gap-1">
        <Button variant="quiet" onClick={() => void reportBug()}>
          <Bug size={14} strokeWidth={1.5} /> Report a bug
        </Button>
        <Button variant="quiet" onClick={() => openDashboard("/feedback")}>
          <MessageSquare size={14} strokeWidth={1.5} /> Share feedback
        </Button>
      </div>
    </section>
  );
}

/**
 * Screenshots the tab behind the popup and parks it in the background, which hands it to
 * /feedback once (`lib/shot.ts`). Captured here, not in the background, because `activeTab` is
 * granted by opening the popup and the popup is where that grant is plainly in use.
 *
 * JPEG at 90, not PNG: a 4K screen of photos can make a PNG data URL bigger than the 10 MB
 * `storage.session` holds, and JPEG at 90 lands at a few MB with no visible loss for a bug report.
 *
 * Chrome refuses to capture its own pages, the Web Store and some viewers. Any failure, here or in
 * the stash, opens /feedback without the picture rather than showing an error in a popup that is
 * about to close.
 */
async function reportBug() {
  try {
    const dataUrl = await browser.tabs.captureVisibleTab({ format: "jpeg", quality: 90 });
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const reply = await ask<{ ok: boolean }>({
      type: "stashShot",
      dataUrl,
      pageUrl: tab?.url,
      title: tab?.title,
    });
    openDashboard(reply.ok ? "/feedback?shot=extension" : "/feedback");
  } catch {
    openDashboard("/feedback");
  }
}

/**
 * The lockup, who is signed in, and signing out. 40px.
 *
 * No version, count or dashboard icon since 0.23.0: the version was clipped under the account pill
 * and belongs on an About line (audit #29), the count is the dashboard's Home, and the footer is the
 * way into the dashboard (E-12).
 */
function Header({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const who = user.name ?? user.email ?? "Signed in";
  return (
    <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border pr-2 pl-4">
      {/* The page's one h1, for a screen reader's heading list; the lockup already says it. */}
      <h1 className="sr-only">Tabcake</h1>
      <TabcakeLogo size="sm" />

      <div className="flex min-w-0 items-center gap-1">
        {/* Display only, so it takes the arrow rather than an I-beam. design.md §9, Cursors. */}
        <span className="flex min-w-0 cursor-default items-center gap-2" title={user.email ?? who}>
          {user.image ? (
            <img
              src={user.image}
              alt=""
              className="size-5 shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <Monogram domain={who} size={20} />
          )}
          <span className="max-w-40 truncate text-meta font-medium text-muted-foreground">{who}</span>
        </span>
        <Button variant="quiet" size="icon" onClick={onSignOut} aria-label="Sign out" title="Sign out">
          <LogOut size={14} strokeWidth={1.5} />
        </Button>
      </div>
    </header>
  );
}

/**
 * The two ways into the full app (audit E-12): the dashboard, and the rules this popup only adds to
 * one at a time. There were three ways to Home and none to the rules until 0.23.0.
 */
function Footer() {
  return (
    <footer className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border px-2">
      <FooterLink onClick={() => openDashboard()}>Open Tabcake</FooterLink>
      <FooterLink onClick={() => openDashboard("/blocked")}>Reading rules</FooterLink>
    </footer>
  );
}

/** 32px tall: they were 17 and 22 (audit #24, E-04). */
function FooterLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-meta font-semibold text-accent-strong underline-offset-2 transition-colors duration-120 ease-out hover:underline"
    >
      {children} <span aria-hidden="true">↗</span>
    </button>
  );
}

function SignedOut() {
  return (
    <section className="rounded-lg border border-border bg-card px-5 py-8 text-center">
      <TabcakeLogo size="md" />
      <h1 className="mt-4 text-h2 font-semibold text-foreground">Connect this browser</h1>
      <p className="mt-2 text-ui text-muted-foreground">
        Sign in on the Tabcake dashboard to link this extension to your account.
      </p>
      <Button className="mt-5 w-full" onClick={() => openDashboard("/connect-extension")}>
        Sign in with Tabcake
      </Button>
      {/* So you can confirm the install, and see where you are about to be sent (audit §B). */}
      <p className="numeric mt-3 text-meta text-muted-foreground">
        Installed in this browser · v{browser.runtime.getManifest().version}
      </p>
      <p className="mt-1 text-meta text-muted-foreground">
        Opens <span className="font-mono">{DASHBOARD_URL.replace(/^https?:\/\//, "")}</span>
      </p>
    </section>
  );
}

/**
 * What Tabcake collects, said inside the product before it collects any of it, and agreed to with a
 * press. The Chrome Web Store requires both (`lib/consent.ts`); a sentence in the listing or the
 * privacy policy does not count. Until the button is pressed, `lib/capture.ts` refuses every page.
 *
 * The wording is a promise, so it changes only alongside the code it describes — and then
 * `CONSENT_VERSION` goes up, so everyone reads the new version before capture starts again.
 */
function Consent({ onAgree }: { onAgree: () => void }) {
  return (
    // The longest card the popup has, so the small lockup: it must stay inside Chrome's 600px.
    <section className="rounded-lg border border-border bg-card px-5 py-5">
      <TabcakeLogo size="sm" />
      <h1 className="mt-3 text-h2 font-semibold text-foreground">Before Tabcake starts</h1>
      <p className="mt-2 text-ui text-muted-foreground">
        Tabcake remembers what you read so you can search it later. Here is what that means.
      </p>

      <h2 className="mt-4 text-meta font-semibold text-foreground">Sent to your Tabcake account</h2>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-ui text-muted-foreground">
        <li>The address, title and text of pages you read for 15 seconds</li>
        <li>A YouTube transcript, when you press Tabcake’s button on the video</li>
        <li>What you search for here</li>
      </ul>
      <p className="mt-2 text-meta text-muted-foreground">
        Tabcake’s servers, including the AI services they use, process it to make it searchable.
      </p>

      <h2 className="mt-4 text-meta font-semibold text-foreground">Never</h2>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-ui text-muted-foreground">
        <li>In incognito, on sites you block, or while paused</li>
        <li>Card numbers, phone numbers, emails and keys (removed in your browser first)</li>
        <li>Sold, or used for advertising</li>
      </ul>

      <Button className="mt-5 w-full" onClick={onAgree}>
        Start remembering pages
      </Button>
      <div className="mt-2 flex items-center justify-between gap-2">
        <FooterLink
          onClick={() => {
            void browser.tabs.create({ url: PRIVACY_URL });
            window.close();
          }}
        >
          Privacy policy
        </FooterLink>
        {/* Nothing is sent until the button above is pressed, so leaving is a real answer. */}
        <Button variant="quiet" onClick={() => window.close()}>
          Not now
        </Button>
      </div>
    </section>
  );
}

function Notice({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 text-center">
      <h1 className="text-h3 font-medium text-foreground">{title}</h1>
      <p className="mt-2 text-ui text-muted-foreground">{body}</p>
      <div className="mt-4 flex justify-center">{action}</div>
    </section>
  );
}
