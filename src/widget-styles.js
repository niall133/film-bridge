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
      --action: #147348;
      --action-ink: #ffffff;
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
      --action: #e7edf1;
      --action-ink: #1f2930;
      color-scheme: dark;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
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
      min-width: 92px;
      min-height: 56px;
      padding: 8px 12px 7px;
      grid-template-columns: auto 1fr;
      grid-template-rows: auto auto;
      column-gap: 4px;
      align-items: baseline;
      border-left: 3px solid var(--rating-color, var(--ink));
      border-radius: 4px;
      background: var(--panel);
    }

    .rating[hidden], .ratings[hidden] {
      display: none !important;
    }

    .rating-name {
      grid-column: 1 / -1;
      color: var(--muted);
      font-family: "Courier New", "Noto Sans Mono CJK SC", monospace;
      font-size: 10px;
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

    .actions {
      flex: 0 0 auto;
      padding-left: 16px;
      border-left: 1px solid var(--line);
    }

    .jump {
      display: inline-flex;
      min-width: 122px;
      min-height: 40px;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 13px;
      border-radius: 4px;
      background: var(--action);
      color: var(--action-ink);
      font-family: "Noto Sans SC", "Microsoft YaHei UI", sans-serif;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.15;
      text-decoration: none !important;
      transition: transform 150ms ease, filter 150ms ease;
    }

    .ticket[data-source="letterboxd"] .jump:hover {
      filter: brightness(1.08);
    }

    .jump:hover {
      color: var(--action-ink);
      filter: brightness(1.08);
      transform: translateY(-1px);
      text-decoration: none !important;
    }

    .jump:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }

    .jump svg {
      width: 14px;
      height: 14px;
      flex: 0 0 auto;
      transition: transform 150ms ease;
    }

    .jump:hover svg {
      transform: translate(2px, -2px);
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

      .actions {
        padding: 11px 0 0;
        border-top: 1px solid var(--line);
        border-left: 0;
      }

      .jump {
        width: 100%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ticket, .rating[data-loading="true"] .rating-value {
        animation: none;
      }

      .jump, .jump svg {
        transition: none;
      }
    }
  `;
})(typeof globalThis !== "undefined" ? globalThis : this);
