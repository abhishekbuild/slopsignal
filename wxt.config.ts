import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";
import { defineConfig } from "wxt";

// The dashboard origin comes from the same env files the code reads, so the manifest and
// lib/dashboard.ts cannot disagree. `npm run dev` gets .env (localhost:3000); `npm run build` gets
// .env.production on top (app.tabcake.com), which keeps localhost out of the store build.
function dashboardOrigin(mode: string): string {
  const url = loadEnv(mode, process.cwd(), "WXT_").WXT_DASHBOARD_URL;
  if (!url) throw new Error(`WXT_DASHBOARD_URL is not set for mode "${mode}". See .env.example.`);
  return new URL(url).origin;
}

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // Chrome 137+ ignores --load-extension in branded builds, so an auto-opened Chrome would come up
  // without the extension. `wxt dev` still rebuilds on save; load .output/chrome-mv3-dev unpacked
  // once. Point `webExt.binaries.chrome` at Chromium or Chrome for Testing to get auto-open back.
  webExt: { disabled: true },
  // The dashboard owns localhost:3000, the port its own docs pin: the development build's
  // externally_connectable names it, and pairing fails on any other origin. WXT's dev server
  // defaults to the first free port from 3000 up, so the two race for it — and the loser fails
  // silently. Whoever loses, the dev build ends up fetching its popup from Next and its content
  // script is never registered, which looks exactly like a dead extension. Pin the dev server
  // somewhere neither wants.
  dev: { server: { port: 3100 } },
  manifest: ({ mode }) => ({
    name: "Tabcake",
    description: "Everything you have read, searchable by meaning.",
    // Pins the extension ID to ngeaffckbmmghligcbeimhkedggfgcfa on every machine, so the dashboard
    // (NEXT_PUBLIC_EXTENSION_ID) can message it. This is the public half; tabcake.pem stays out of git.
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4TJRzvVdFZFJ7dD+Ad2diTajQXw9Xqk30Ia/dOgXbCAPDUjyY1+NA6SnSsrMi103TnPqwGpwFCb8FkpfRLBMzx36YL9YKFkGXLfrKg+w6jNNX+97CLIII52iHywkb25Uadgu8ZtVabfGrJtJMZfRhVdEN63vChnPKkrMWyxMf+xVQfbAh4w8+o6d1zfw36X05THIT/ikEUvnSsOPJD0XeqXApxpnfDXdlXGokT/NVeYhj+WvZ5rzCzhFMJifkrBGgCOXs84ckld6ormlSoTBvon4CRqhNo0tLk47iicEOVkACP6xGmPWF03uXYjR/QSNaFfiqrjWCkUpOUPC3PpLYQIDAQAB",
    // `alarms` ends a timed pause on time; without it the "paused" badge could outlive the pause.
    // `activeTab` lets the popup's "Report a bug" screenshot the tab you are on and read its address
    // (docs/reference/permissions.md). None of the three shows an install warning.
    permissions: ["storage", "alarms", "activeTab"],
    // The only web origin allowed to message the extension: the dashboard, which hands over the
    // one-time link code.
    externally_connectable: { matches: [`${dashboardOrigin(mode)}/*`] },
    // Incognito is meant to leave no trace, so the honest answer is to not run there at all.
    // "not_allowed" makes Chrome enforce it; the alternative is code that has to be right forever.
    incognito: "not_allowed",
    // Opens the popup with its search field focused, from any tab. `_execute_action` is Chrome's
    // own command for this, so it needs no permission and no code — and it is the whole reason
    // search belongs in the popup rather than only on the dashboard.
    commands: {
      _execute_action: {
        suggested_key: { default: "Ctrl+Shift+K", mac: "Command+Shift+K" },
        description: "Search your Tabcake memory",
      },
      // Pauses capture with no end, or resumes it (0.33.0). Alt rather than Ctrl: Ctrl+Shift+P is a
      // private window in Firefox and Edge users carry the habit, and a suggested key the browser
      // already uses is silently left unassigned. Change it at chrome://extensions/shortcuts.
      "pause-capture": {
        suggested_key: { default: "Alt+Shift+P", mac: "Alt+Shift+P" },
        description: "Pause or resume Tabcake",
      },
    },
    // setBadgeTextColor, which is what puts readable text on the amber capture dot.
    minimum_chrome_version: "110",
  }),
  vite: () => ({ plugins: [tailwindcss()] }),
});
