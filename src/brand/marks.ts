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
 * Diagonal page watermark — an HTML lockup (vector temple + real text)
 * rotated with CSS, so both the browser's print engine and the PDF
 * transcriber reproduce it as vector art using the document fonts.
 */
export function watermarkHtml(text: string): string {
  return `<div class="page-watermark" aria-hidden="true">
  <div class="page-watermark__lockup">
    ${templeMarkSvg("34pt", "page-watermark__mark")}
    <span class="page-watermark__text">${escapeHtml(text)}</span>
  </div>
</div>`;
}

/**
 * Full-bleed cover pattern layer, generated as inline SVG (mm units) so
 * it stays vector in print and in the PDF engine — CSS repeating
 * gradients would be rasterized by the browser's print pipeline.
 *
 * Every pattern is deliberately sparse — wide spacing, a hairline
 * stroke and a low caller-supplied opacity — so covers read as
 * minimal and premium rather than a dense technical texture once
 * exported to vector PDF (see Improvement 4.4 in the design brief).
 */
export function coverPatternSvg(style: "grid" | "rings" | "weave" | "lines", wMm: number, hMm: number, color: string): string {
  const parts: string[] = [];
  if (style === "grid") {
    const step = 19;
    for (let x = step; x < wMm; x += step) parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${hMm}"/>`);
    for (let y = step; y < hMm; y += step) parts.push(`<line x1="0" y1="${y}" x2="${wMm}" y2="${y}"/>`);
  } else if (style === "lines") {
    // Laid-paper texture: fine horizontal rules only.
    const step = 11;
    for (let y = step; y < hMm; y += step) parts.push(`<line x1="0" y1="${y}" x2="${wMm}" y2="${y}"/>`);
  } else if (style === "rings") {
    const cx = wMm * 0.82;
    const cy = hMm * 0.1;
    const max = Math.hypot(wMm, hMm);
    for (let r = 9; r < max; r += 9) parts.push(`<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none"/>`);
  } else {
    // Gentle horizontal wave lines — one continuous bezier curve per
    // row, spaced generously. Lighter and more elegant than the old
    // crosshatch (which drew twice as many strokes for the same area).
    const step = 15;
    const amp = 3;
    const seg = 24;
    for (let y = step; y < hMm; y += step) {
      let d = `M 0 ${y}`;
      let up = true;
      for (let x = 0; x < wMm; x += seg) {
        const cx1 = x + seg / 2;
        const x2 = Math.min(x + seg, wMm);
        d += ` Q ${cx1.toFixed(1)} ${(y + (up ? -amp : amp)).toFixed(1)} ${x2.toFixed(1)} ${y}`;
        up = !up;
      }
      parts.push(`<path d="${d}" fill="none"/>`);
    }
  }
  return `<svg class="cv-pattern" viewBox="0 0 ${wMm} ${hMm}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" stroke="${color}" stroke-width="0.14">${parts.join("")}</svg>`;
}
