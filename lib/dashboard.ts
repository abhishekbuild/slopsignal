/**
 * Where the dashboard lives, read once from the build's `WXT_DASHBOARD_URL`.
 *
 * Three things hang off it and they must agree: the background trusts messages from this origin
 * alone, the popup opens it, and the content script refuses to read it — the dashboard shows what
 * was read, and a memory that contains its own screens is a memory that cites itself. The manifest's
 * `externally_connectable` is built from the same variable in `wxt.config.ts`, so Chrome lets
 * through exactly the origin the background trusts.
 */
export const DASHBOARD_URL: string = import.meta.env.WXT_DASHBOARD_URL;
export const DASHBOARD_ORIGIN = new URL(DASHBOARD_URL).origin;
