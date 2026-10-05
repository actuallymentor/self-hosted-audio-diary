import { createGlobalStyle } from "styled-components"

/*
 * Design tokens follow ~/.agents/preferences (palette, type, motion).
 * Filled actions use the approved darker fallback (#376675) because white on the
 * brand accent (#7ec0d0) is ≈2:1. The accent itself stays central: focus halo,
 * active lines, links in dark mode and artwork.
 */
export const GlobalStyle = createGlobalStyle`
  :root {
    color-scheme: light dark;
    font-family: "Nunito Variable", Nunito, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: var(--font-scale, 100%);
    font-synthesis: none;
    line-height: var(--line-height, 1.55);
    text-rendering: optimizeLegibility;

    /* Palette — light */
    --accent: #7ec0d0;
    --action: #376675;
    --action-hover: #2e5866;
    --action-ink: #ffffff;
    --link: #376675;
    --page: #fafbfc;
    --surface: #ffffff;
    --field: #ffffff;
    --ink: #1a1a2e;
    --muted: #6b7280;
    --border: #e3e7eb;
    --border-strong: #cfd6dc;
    --hover: rgb(126 192 208 / 12%);
    --halo: rgb(126 192 208 / 27%);
    --shadow: 0 10px 30px rgb(26 26 46 / 8%);
    --skeleton: #edf0f3;

    /* Semantic tints */
    --info-bg: #eaf5f8;
    --info-ink: #2b5966;
    --success-bg: #e8f5ec;
    --success-ink: #22663f;
    --warn-bg: #fdf4d9;
    --warn-ink: #6f4c00;
    --warn-line: #ecd48a;
    --danger: #a82c3c;
    --danger-bg: #fbeaec;
    --danger-ink: #9a2433;

    /* Motion */
    --ease-out: cubic-bezier(.2, .8, .2, 1);
    --quick: 160ms;
  }

  /* Solarized-style deep blue surfaces */
  @media (prefers-color-scheme: dark) {
    :root {
      --link: #7ec0d0;
      --action-hover: #417787;
      --page: #002b36;
      --surface: #073642;
      --field: #00313d;
      --ink: #e6ecf0;
      --muted: #aab6c1;
      --border: #134652;
      --border-strong: #2a5c69;
      --hover: rgb(126 192 208 / 10%);
      --halo: rgb(126 192 208 / 25%);
      --shadow: 0 10px 30px rgb(0 0 0 / 28%);
      --skeleton: #0d3f4b;

      --info-bg: rgb(126 192 208 / 14%);
      --info-ink: #a9dbe6;
      --success-bg: rgb(110 190 135 / 14%);
      --success-ink: #9bd8ae;
      --warn-bg: rgb(240 192 64 / 13%);
      --warn-ink: #f2cf74;
      --warn-line: rgb(240 192 64 / 38%);
      --danger: #c2414f;
      --danger-bg: rgb(232 110 120 / 15%);
      --danger-ink: #f3a7ae;
    }
  }

  * { box-sizing: border-box; }

  html, body, #root { min-height: 100%; }

  body {
    background: var(--page);
    color: var(--ink);
    letter-spacing: var(--letter-spacing, 0);
    margin: 0;
  }

  body, button, input, textarea, select { font: inherit; letter-spacing: inherit; }

  h1, h2, h3, h4 {
    font-family: "Montserrat Variable", Montserrat, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-weight: 400;
    line-height: 1.2;
  }

  /* Functional heading: 26px at a 16px root */
  h2 { font-size: 1.625rem; margin: .5rem 0 1.5rem; }
  h3 { font-size: 1.2rem; margin: 0 0 .75rem; }

  p { max-width: 65ch; }

  strong, b { font-weight: 600; }

  label { font-weight: 500; }

  small { color: var(--muted); }

  a {
    color: var(--link);
    text-decoration-thickness: 1px;
    text-underline-offset: .2em;
  }

  mark { background: var(--warn-bg); border-radius: .2em; color: inherit; padding: 0 .1em; }

  /* ---------- Buttons: small pill face, larger invisible hit area ---------- */

  button {
    align-items: center;
    background: transparent;
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    color: var(--ink);
    cursor: pointer;
    display: inline-flex;
    font-size: .9375rem;
    font-weight: 600;
    gap: .4em;
    justify-content: center;
    line-height: 1.2;
    min-height: 2rem;
    min-width: 2.25rem;
    padding: .3em .875rem;
    position: relative;
    transition:
      transform var(--quick) var(--ease-out),
      background-color var(--quick) ease,
      border-color var(--quick) ease,
      box-shadow var(--quick) ease;
    -webkit-tap-highlight-color: transparent;
  }

  /* 44px target from a 32px face: 6px above/below, 4px either side */
  button::before {
    content: "";
    inset: -6px -4px;
    position: absolute;
  }

  button:hover:not(:disabled) { background: var(--hover); border-color: var(--accent); transform: translateY(-1px); }
  button:active:not(:disabled) { transform: scale(.985); }
  button:disabled { cursor: not-allowed; opacity: .5; }

  button svg { flex: none; }

  /* ---------- Fields ---------- */

  input, textarea, select {
    background: var(--field);
    border: 1px solid var(--border-strong);
    border-radius: .5rem;
    color: var(--ink);
    min-height: 2.75rem;
    padding: .55rem .75rem;
    transition: border-color var(--quick) ease, box-shadow var(--quick) ease;
    width: 100%;
  }

  input::placeholder, textarea::placeholder { color: var(--muted); opacity: .85; }

  textarea { min-height: 8rem; resize: vertical; }

  input[type="range"] { accent-color: var(--action); border: 0; min-height: 1.5rem; padding: 0; }

  /* Soft focus halo meeting the surface; transparent outline keeps forced-colors focus */
  :focus-visible {
    box-shadow: 0 0 0 5px var(--halo);
    outline: 2px solid transparent;
  }

  input:focus-visible, textarea:focus-visible, select:focus-visible { border-color: var(--accent); }

  /* ---------- Utilities ---------- */

  .visually-hidden {
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    height: 1px;
    overflow: hidden;
    position: absolute;
    white-space: nowrap;
    width: 1px;
  }

  @keyframes shad-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes shad-spin { to { transform: rotate(360deg); } }

  /* Skeleton sweep: 1800ms cycle */
  @keyframes shad-sweep { from { transform: translateX(-100%); } to { transform: translateX(100%); } }

  /* Attention sheen: 3000ms start-to-start, 1400ms pass + 1600ms quiet */
  @keyframes shad-sheen {
    0% { transform: translateX(-120%) skewX(-18deg); }
    46.67%, 100% { transform: translateX(320%) skewX(-18deg); }
  }

  /* Forced colors drop decorative fills; keep the current page explicit */
  @media (forced-colors: active) {
    [aria-current="page"] { text-decoration: underline; text-underline-offset: .35em; }
  }

  /* Hidden documents pause every loop */
  :root[data-hidden] *, :root[data-hidden] *::before, :root[data-hidden] *::after { animation-play-state: paused !important; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation: none !important;
      scroll-behavior: auto !important;
      transition: none !important;
    }
  }
`
