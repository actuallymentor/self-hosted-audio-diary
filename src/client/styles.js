import { createGlobalStyle } from "styled-components"

export const GlobalStyle = createGlobalStyle`
  :root {
    color-scheme: light;
    font-family: "Nunito Variable", Nunito, system-ui, sans-serif;
    font-size: var(--font-scale, 100%);
    font-synthesis: none;
    line-height: var(--line-height, 1.55);
    text-rendering: optimizeLegibility;
    --accent: #397c8d;
    --accent-soft: #c9e8ef;
    --body: #fafbfc;
    --border: #d9e0e4;
    --danger: #a82c3c;
    --ink: #17252a;
    --muted: #53656b;
    --surface: #ffffff;
    --shadow: 0 12px 32px rgb(23 37 42 / 8%);
  }

  * { box-sizing: border-box; }

  html, body, #root { min-height: 100%; }

  body {
    background: var(--body);
    color: var(--ink);
    letter-spacing: var(--letter-spacing, 0);
    margin: 0;
  }

  body, button, input, textarea, select { font: inherit; }

  button, input, textarea, select {
    border: 1px solid var(--border);
    border-radius: .8rem;
    min-height: 3rem;
  }

  button, a { -webkit-tap-highlight-color: transparent; }

  button {
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
    font-weight: 700;
    padding: .7rem 1rem;
  }

  button:hover { border-color: var(--accent); }
  button:disabled { cursor: wait; opacity: .55; }

  input, textarea, select {
    background: var(--surface);
    color: var(--ink);
    padding: .75rem .9rem;
    width: 100%;
  }

  input[type="checkbox"] { min-height: 1.5rem; width: auto; }

  textarea { min-height: 8rem; resize: vertical; }

  :focus-visible {
    outline: 3px solid #7ec0d0;
    outline-offset: 2px;
  }

  h1, h2, h3 {
    font-family: "Montserrat Variable", Montserrat, system-ui, sans-serif;
    line-height: 1.15;
  }

  a { color: #245e6c; }

  mark { background: #ffedaa; color: inherit; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; }
  }
`
