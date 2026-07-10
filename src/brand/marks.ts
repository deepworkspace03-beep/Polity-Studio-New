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

/** Telegram paper-plane glyph — filled vector, inherits currentColor. */
export function telegramIconSvg(className = ""): string {
  return `<svg${className ? ` class="${className}"` : ""} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.9 4.1c.3-1.1-.8-2-1.8-1.6L2.5 9.4c-1.2.5-1.1 2.2.1 2.6l4.5 1.4 1.7 5.4c.3 1 1.6 1.3 2.3.5l2.5-2.6 4.6 3.4c.9.6 2.1.2 2.3-.9l3.4-15.1zM8.2 12.5l9.2-5.7c.4-.2.7.3.4.6l-7.6 7-.3 3-1.7-4.9z"/></svg>`;
}

/** WhatsApp glyph — filled vector, inherits currentColor. */
export function whatsappIconSvg(className = ""): string {
  return `<svg${className ? ` class="${className}"` : ""} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-2.9c-.3-.4 0-.6.2-.8l.5-.6c.1-.2.1-.4 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s1 2.5 1.1 2.7a11 11 0 0 0 4.2 3.7c.6.3 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.5-.3z"/></svg>`;
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
