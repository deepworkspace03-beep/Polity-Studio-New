import { escapeHtml } from "../lib/utils";

/**
 * Every brand graphic is vector, generated from these helpers — no
 * raster assets anywhere in the app or the PDFs. The temple mark is the
 * Polity Made Simple emblem used on covers, footers and the closing page.
 */

export const TEMPLE_PATH =
  '<path d="M 20 40 L 50 26 L 80 40 Z"/><rect x="18" y="43" width="64" height="6" rx="3"/><rect x="26" y="52" width="7" height="19" rx="3.5"/><rect x="46.5" y="52" width="7" height="19" rx="3.5"/><rect x="67" y="52" width="7" height="19" rx="3.5"/><rect x="14" y="74" width="72" height="6" rx="3"/>';

/** Inline temple mark sized in any CSS unit; inherits currentColor. */
export function templeMarkSvg(width: string, className = ""): string {
  return `<svg${className ? ` class="${className}"` : ""} viewBox="12 20 76 66" width="${width}" aria-hidden="true" fill="currentColor">${TEMPLE_PATH}</svg>`;
}

/** Full-bleed emblem for cover backgrounds (0 0 100 100 viewBox). */
export function templeEmblemSvg(className: string): string {
  return `<svg class="${className}" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">${TEMPLE_PATH}</svg>`;
}

/**
 * Diagonal page watermark — pure vector, rendered inline so the text
 * uses the document's embedded fonts and adds zero bytes per page.
 * Preserves the original diagonal "© Polity Made Simple" treatment.
 */
export function watermarkSvg(text: string): string {
  return `<svg class="page-watermark__art" viewBox="0 0 500 500" aria-hidden="true">
  <g fill="#808080" opacity="0.11" transform="translate(250, 250) rotate(-35)">
    <g transform="translate(-115, -12)">
      <g transform="translate(0, -2)">
        <path d="M 3 10 L 12 3 L 21 10 Z" />
        <rect x="3" y="11.5" width="18" height="2" rx="1" />
        <rect x="5.5" y="14.5" width="2" height="5" rx="0.75" />
        <rect x="11" y="14.5" width="2" height="5" rx="0.75" />
        <rect x="16.5" y="14.5" width="2" height="5" rx="0.75" />
        <rect x="3" y="20.5" width="18" height="2" rx="1" />
      </g>
      <text x="32" y="20" font-family="Manrope, sans-serif" font-size="15" font-weight="600" letter-spacing="0.8">${escapeHtml(text)}</text>
    </g>
  </g>
</svg>`;
}
