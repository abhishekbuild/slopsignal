import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// design.md §2: Inter 400/500/600 for the interface, JetBrains Mono 400 for data, and Manrope 800
// for the wordmark alone (§4). Nothing in the interface is 700 — a weight that is not loaded is
// synthesised as faux bold. Bundled rather than fetched: every popup open is a fresh document, and a
// remote font would flash on each one.
//
// No Newsreader since 0.22.0. It arrived with the result cards' summaries; the list is rows now,
// title and site only, and nothing in the popup is set in the serif. The token stays in style.css,
// whose :root is the dashboard's byte for byte.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/manrope/800.css";
import App from "./App";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
