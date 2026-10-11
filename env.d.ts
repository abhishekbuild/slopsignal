// Build-time values from .env (WXT exposes WXT_* keys on import.meta.env). All are public.
interface ImportMetaEnv {
  /** Convex deployment, e.g. https://nautical-caribou-809.convex.cloud */
  readonly WXT_CONVEX_URL: string;
  /** Dashboard origin the popup opens and the only origin allowed to hand over a link code. */
  readonly WXT_DASHBOARD_URL: string;
  /** Marketing site origin, e.g. https://tabcake.com. The privacy policy lives there. */
  readonly WXT_SITE_URL: string;
}
