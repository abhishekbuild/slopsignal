/**
 * design.md §3 values for the places that paint without a stylesheet: the toolbar badge
 * (`chrome.action` has no CSS to read) and the video button (inside a shadow root on YouTube,
 * where the popup's tokens do not exist). Each is the same value as the token it is named after in
 * entrypoints/popup/style.css; change them together.
 */
export const PALETTE = {
  butter: "#f5c542", // --butter, the live signal
  ink: "#1c1714", // --ink-rgb
  cream: "#faf6ee", // --background
  mutedForeground: "#6e645c", // --muted-foreground
  muted: "#f1eadd", // --muted
} as const;
