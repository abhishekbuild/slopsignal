import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { link, me, readTokens, signOut } from "@/lib/auth";
import { capture, clearStatus, setStatus } from "@/lib/capture";
import { clearConsent, giveConsent, hasConsent } from "@/lib/consent";
import type { ExternalMessage, ExternalReply, InternalMessage, PageStatus } from "@/lib/messages";
import { flattenHosts, SCHEMA } from "@/lib/rules";
import { forget, pageInfo, recent, search } from "@/lib/search";
import { stashShot, takeShot } from "@/lib/shot";
import { finishPageJob, indexUrl, isPageJob } from "@/lib/manual";
import { finishJob, isJob, rememberShort } from "@/lib/shorts";
import { labelFor } from "@/lib/video-button";
import {
  applyPauseBadge,
  isPaused,
  clearBlocklistCache,
  migrateBlocklist,
  readSettings,
  RESUME_ALARM,
  setAllowed,
  setBlocked,
  setBlocklist,
  setPause,
  startBlocklistSync,
  SYNC_ALARM,
  syncAutoBlocks,
  syncBlocklist,
  syncCapture,
  syncGrants,
  togglePause,
  touchDevice,
} from "@/lib/settings";

import { DASHBOARD_ORIGIN } from "@/lib/dashboard";

export default defineBackground(() => {
  // Dashboard → extension. The manifest's externally_connectable already decides who can reach
  // this listener; checking the origin again is the trust boundary for accepting a session, so a
  // page that somehow got a channel cannot log this browser into an attacker's account.
  browser.runtime.onMessageExternal.addListener(
    (message: ExternalMessage, sender, respond) => {
      if (sender.origin !== DASHBOARD_ORIGIN) return;
      void fromDashboard(message)
        .catch(() => ({ ok: false }))
        .then(respond);
      return true; // keep the channel open for the async reply (Chrome MV3)
    },
  );

  // The pause shortcut (0.33.0), `pause-capture` in wxt.config.ts. Chrome delivers it here from
  // any tab; nothing else listens for commands, since `_execute_action` is Chrome's own.
  browser.commands.onCommand.addListener((command) => {
    if (command === "pause-capture") void togglePause();
  });

  // Popup and content script → background. Everything needing the session happens on this side.
  browser.runtime.onMessage.addListener((message: InternalMessage, sender, respond) => {
    // A handler that throws would otherwise leave the sender waiting for a reply that never comes,
    // and an unhandled rejection in the worker. Caught here rather than in each handler, the way
    // the external channel above already does it.
    void route(message, sender.tab?.id)
      .catch(() => ({ ok: false }))
      .then(respond);
    return true;
  });

  // A tab that has navigated away or closed must not keep wearing the last page's dot. The content
  // script overwrites the status on any page it runs on; these two cover the pages it cannot —
  // a chrome:// page, a PDF, a download.
  //
  // `changeInfo.url` is the single-page-app case: a route change inside one document reports the
  // new address without ever reporting `loading`, so without it the dot from the previous route
  // would sit on a page nothing has looked at yet. The content script announces the new route
  // within a second, which is the right order — clear first, then say what this one is.
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading" || changeInfo.url !== undefined) void clearStatus(tabId);
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    void clearStatus(tabId);
    // A tab reading a Short that someone closed first: its answer is no answer, and not in 45 seconds.
    finishJob(tabId, undefined);
    finishPageJob(tabId, undefined);
  });

  // Two alarms now, so this has to read the name. Without the check, every blocklist refresh would
  // also redraw the pause badge — harmless today, and exactly the kind of thing that stops being
  // harmless the moment a third alarm arrives.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RESUME_ALARM) void applyPauseBadge();
    if (alarm.name === SYNC_ALARM) void refresh();
  });

  // A fresh profile, an update, or a browser restart. The blocklist belongs to the account now, so
  // each of those is a moment this browser might be holding a stale copy — or none at all.
  browser.runtime.onStartup.addListener(() => void warmUp());
  browser.runtime.onInstalled.addListener(() => void warmUp());

  // Listeners first, then the badge: badge state does not survive a browser restart but the pause
  // does, so the worker starting is the moment to make the toolbar agree with storage again.
  void applyPauseBadge();
  void warmUp();
});

/**
 * Everything this browser should do about the blocklist when it wakes up: hand over whatever it had
 * stored locally if it never has, refresh the cache, and make sure the repeating refresh is armed.
 *
 * Migration goes first, so a browser upgrading for the first time uploads its own list before it
 * pulls the account's down over the top of it.
 *
 * Silent throughout. A worker starting while offline or signed out keeps the cache it has,
 * which still blocks the presets — the failure mode is a list that is behind, never one that is
 * empty.
 */
async function warmUp(): Promise<void> {
  await migrateBlocklist();
  await refresh();
  await startBlocklistSync();
}

/**
 * All three cached lists, from the account, and this session's name for the dashboard's list of
 * browsers. Quiet throughout: any one failing leaves that cache as it was, which is a list that is
 * behind rather than one that is empty.
 */
async function refresh(): Promise<void> {
  await syncBlocklist();
  await syncGrants();
  await syncAutoBlocks();
  await syncCapture();
  await touchDevice();
}

/**
 * `tabId` comes from the sender, never from the message: a page must not be able to label someone
 * else's tab. It is undefined for the popup, which has no tab and sends no page message.
 */
async function route(message: InternalMessage, tabId: number | undefined): Promise<unknown> {
  switch (message.type) {
    case "me": {
      const reply = await me();
      return "user" in reply && reply.user !== null
        ? { ...reply, consented: await hasConsent() }
        : reply;
    }
    case "consent":
      await giveConsent();
      return { ok: true };
    case "signOut":
      await signOut();
      // The next person to sign in on this profile has agreed to nothing.
      await clearConsent();
      // Two accounts can share a browser profile. A list left behind would block the next one's
      // pages using the last one's rules, with nothing on screen to say where they came from.
      await clearBlocklistCache();
      return { ok: true };
    case "capture": {
      if (tabId === undefined) return { ok: false };
      const { type, ...page } = message;
      // Decided here, not by the page: only the background knows it opened this tab for a pasted link.
      const status = await capture(tabId, { ...page, added: isPageJob(tabId) });
      // A pasted link's tab is waiting for exactly this. Any other tab is not a job, and this is nothing.
      finishPageJob(tabId, status);
      return status;
    }
    case "pageStatus": {
      if (tabId === undefined) return { ok: false };
      // The content script does not know about a pause or the disclosure, and announces
      // "watching" whatever. Said here instead, so the popup does not print "Reading…" above
      // "Paused until" — the capture gate would refuse the page at fifteen seconds anyway.
      const status: PageStatus =
        message.status.state !== "watching"
          ? message.status
          : !(await hasConsent())
            ? { state: "skipped", reason: "no-consent" }
            : isPaused((await readSettings()).pauseUntil)
              ? { state: "skipped", reason: "paused" }
              : message.status;
      await setStatus(tabId, { host: message.host, url: message.url, title: message.title, status });
      // A skip is the end of a pasted link's job: the page decided it, and nothing will be sent.
      if (status.state === "skipped") finishPageJob(tabId, status);
      return { ok: true };
    }
    case "pause":
      await setPause(message.until);
      return { ok: true };
    case "setBlocked":
      return { ok: await setBlocked(message.host, message.blocked) };
    case "setAllowed":
      return { ok: await setAllowed(message.origin, message.allowed) };
    case "search":
      return search(message.query);
    case "recent":
      return recent();
    case "pageInfo":
      return pageInfo(message.url);
    case "forget":
      return { ok: await forget(message.pageId) };
    case "rememberShort":
      // Refused before the background tab opens, not when its button reports back: the tab would
      // load YouTube for nothing, and the answer would arrive seconds later than it can now.
      if (!(await hasConsent())) return labelFor({ state: "skipped", reason: "no-consent" });
      return rememberShort(message.id);
    case "indexUrl":
      return indexUrl(message.url);
    case "pageJob":
      return tabId !== undefined && isPageJob(tabId);
    case "videoJob":
      return tabId !== undefined && isJob(tabId);
    case "videoDone":
      if (tabId !== undefined) finishJob(tabId, message.label);
      return { ok: true };
    case "stashShot":
      // Over the quota, it throws, the listener answers {ok:false}, and the popup opens /feedback
      // without the promise of a picture.
      await stashShot({ dataUrl: message.dataUrl, pageUrl: message.pageUrl, title: message.title });
      return { ok: true };
  }
}

/**
 * The external channel, past the origin check. A reply never carries a token; it does carry the
 * blocklist, which is the one thing the dashboard's settings page exists to edit.
 */
async function fromDashboard(message: ExternalMessage): Promise<ExternalReply> {
  switch (message.type) {
    case "ping":
      return {
        ok: true,
        signedIn: (await readTokens()) !== undefined,
        version: browser.runtime.getManifest().version,
      };
    case "link":
      return link(message.code);
    case "getSettings": {
      const { blocklist, pauseUntil } = await readSettings();
      // `hosts` is the same answer in the shape a dashboard built before scoped rules understands.
      // Sending both is four extra bytes and it is what stops an upgrade emptying somebody's list.
      // `signedIn` lets the dashboard's pill tell an installed extension from a connected one.
      return {
        ok: true,
        signedIn: (await readTokens()) !== undefined,
        blocklist,
        hosts: flattenHosts(blocklist),
        schema: SCHEMA,
        pauseUntil,
      };
    }
    case "setSettings":
      // Assume the payload is hostile. setBlocklist stores nothing unless all of it validates.
      return { ok: await setBlocklist(message.blocklist) };
    case "pause":
      // The same call the popup makes, badge and expiry alarm included.
      await setPause(message.until);
      return { ok: true, pauseUntil: message.until };
    case "takeShot": {
      // A picture of a page you were on, so it goes to the dashboard origin only (checked above),
      // once, and not after ten minutes.
      const shot = await takeShot();
      return shot ? { ok: true, shot } : { ok: true };
    }
    case "indexUrl":
      // Validated in `indexUrl`: nothing but an http or https address is ever opened.
      return { ok: true, status: await indexUrl(message.url) };
    case "refresh":
      // A setting changed on the dashboard (0.33.0): sync now rather than at the next alarm.
      await refresh();
      return { ok: true };
  }
}
