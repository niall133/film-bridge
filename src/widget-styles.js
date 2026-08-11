(function initializeFilmBridgeStyles(root) {
  "use strict";

  root.FilmBridgeWidgetStyles = String.raw`
    :host {
      all: initial;
      display: block;
      width: min(100%, 720px);
      max-width: 720px;
      margin: 16px 0 32px;
      color-scheme: light;
      contain: layout style;
      font-family: Georgia, "Noto Serif SC", "Songti SC", serif;
      line-height: 1.35;
    }

    :host([data-layout="imdb-critic"]) {
      width: min(52vw, 720px);
      max-width: 720px;
      margin: 0 0 26px auto;
      float: right;
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    .ticket {
      --surface: #ffffff;
      --panel: #f5f7f8;
      --ink: #27323a;
      --muted: #78838b;
      --line: rgba(39, 50, 58, 0.16);
      --accent: #007722;
      position: relative;
      display: flex;
      width: fit-content;
      max-width: 100%;
      min-height: 78px;
      align-items: center;
      gap: 18px;
      overflow: hidden;
      padding: 12px 14px 12px 17px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--surface);
      color: var(--ink);
      box-shadow: 0 5px 16px rgba(25, 34, 40, 0.09);
      isolation: isolate;
      animation: bridge-arrive 360ms cubic-bezier(.2,.75,.25,1) both;
    }

    .ticket[data-source="letterboxd"] {
      --surface: #232d35;
      --panel: #2d3942;
      --ink: #f2f4f5;
      --muted: #aab4bc;
      --line: rgba(255, 255, 255, 0.18);
      --accent: #ff8000;
      color-scheme: dark;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
    }

    .ticket[data-source="imdb"] {
      --accent: #f5c518;
    }

    .ticket[data-source="tmdb"] {
      --accent: #01b4e4;
    }

    .ticket[data-source="metacritic"] {
      --accent: #00ce7c;
    }

    .ticket[hidden] {
      display: none !important;
    }

    .ticket::before {
      content: "";
      position: absolute;
      z-index: 3;
      top: 0;
      right: 0;
      left: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent) 0 38%, #40bcf4 38% 69%, #00a13a 69% 100%);
      pointer-events: none;
    }

    .ratings {
      display: flex;
      min-width: 0;
      flex: 0 1 auto;
      align-items: stretch;
      gap: 12px;
      flex-wrap: wrap;
    }

    .rating {
      display: grid;
      position: relative;
      min-width: 112px;
      min-height: 56px;
      padding: 8px 28px 7px 12px;
      grid-template-columns: auto 1fr;
      grid-template-rows: auto auto;
      column-gap: 4px;
      align-items: baseline;
      border-left: 3px solid var(--rating-color, var(--ink));
      border-radius: 4px;
      background: var(--panel);
      color: var(--ink);
      cursor: default;
      text-decoration: none !important;
      transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
    }

    .rating[data-link="true"] {
      cursor: pointer;
    }

    .rating[data-link="true"]:hover {
      border-color: var(--rating-color, var(--ink));
      box-shadow: 0 5px 12px rgba(25, 34, 40, 0.16);
      transform: translateY(-2px);
    }

    .rating[data-link="true"]:active {
      transform: translateY(0) scale(.985);
    }

    .rating[data-link="true"].is-activating .rating-arrow {
      opacity: 1;
      transform: translate(1px, -1px) scale(1.12);
    }

    .rating[data-link="true"]:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }

    .rating-arrow {
      position: absolute;
      top: 8px;
      right: 9px;
      color: var(--rating-color, var(--ink));
      font-family: "Noto Sans SC", "Microsoft YaHei UI", sans-serif;
      font-size: 15px;
      font-weight: 800;
      line-height: 1;
      opacity: 0;
      transform: translate(-3px, 3px);
      transition: opacity 150ms ease, transform 150ms ease;
    }

    .rating[data-link="true"]:hover .rating-arrow,
    .rating[data-link="true"]:focus-visible .rating-arrow {
      opacity: 1;
      transform: translate(0, 0);
    }

    .rating[hidden], .ratings[hidden] {
      display: none !important;
    }

    .rating-name {
      grid-column: 1 / -1;
      white-space: nowrap;
      color: var(--muted);
      font-family: "Courier New", "Noto Sans Mono CJK SC", monospace;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      line-height: 1;
    }

    .rating-value {
      color: var(--ink);
      font-family: Georgia, "Noto Serif SC", "Songti SC", serif;
      font-size: 24px;
      font-variant-numeric: tabular-nums;
      font-weight: 800;
      letter-spacing: -0.045em;
      line-height: 0.98;
    }

    .rating[data-current="true"] {
      animation: bridge-current-pulse 2.1s cubic-bezier(.2,.75,.25,1) 1 both;
    }

    .rating[data-rating="metacritic"] .rating-value {
      padding: 2px 5px 3px;
      border-radius: 3px;
      color: #172126;
    }

    .rating[data-rating="metacritic"][data-score-band="high"] .rating-value {
      background: #00ce7c;
    }

    .rating[data-rating="metacritic"][data-score-band="mid"] .rating-value {
      background: #ffc107;
    }

    .rating[data-rating="metacritic"][data-score-band="low"] .rating-value {
      background: #ff6874;
    }

    .rating-scale {
      color: var(--muted);
      font-family: "Courier New", monospace;
      font-size: 9px;
      line-height: 1;
    }

    .rating[data-loading="true"] .rating-value {
      width: 30px;
      height: 14px;
      margin-top: 3px;
      border-radius: 2px;
      background: linear-gradient(90deg, rgba(125, 135, 140, .18), rgba(125, 135, 140, .42), rgba(125, 135, 140, .18));
      background-size: 200% 100%;
      color: transparent;
      animation: bridge-scan 1.15s linear infinite;
    }

    .sr-status {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    @keyframes bridge-arrive {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes bridge-scan {
      to { background-position: -200% 0; }
    }

    @keyframes bridge-current-pulse {
      0% { box-shadow: 0 0 0 0 rgba(0, 119, 34, 0); }
      28% { box-shadow: 0 0 0 4px rgba(0, 119, 34, 0.2); }
      100% { box-shadow: 0 0 0 0 rgba(0, 119, 34, 0); }
    }

    @media (max-width: 560px) {
      .ticket {
        width: 100%;
        align-items: stretch;
        flex-direction: column;
        gap: 12px;
        padding: 13px;
      }

      .ratings {
        flex: 0 0 auto;
      }

      :host([data-layout="imdb-critic"]) {
        width: 100%;
        max-width: none;
        margin: 0 0 22px;
        float: none;
      }

    }

    @media (min-width: 561px) and (max-width: 900px) {
      :host([data-layout="imdb-critic"]) {
        width: min(68vw, 720px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ticket, .rating[data-loading="true"] .rating-value {
        animation: none;
      }

      .rating, .rating-arrow {
        transition: none;
      }
    }
  `;
})(typeof globalThis !== "undefined" ? globalThis : this);
