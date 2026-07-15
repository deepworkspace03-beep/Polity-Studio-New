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

export type CoverPatternKind = "grid" | "dots" | "lines" | "rings" | "weave" | "abstract" | "waves" | "mesh" | "geometry";

/**
 * Full-bleed cover pattern layer, generated as inline SVG (mm units) so
 * it stays vector in print and in the PDF engine — CSS repeating
 * gradients would be rasterized by the browser's print pipeline.
 *
 * `density` (0.5–2) tightens or loosens the element spacing; `size`
 * (0.5–2.5) scales stroke width / dot radius. Both default to 1 so
 * existing covers render exactly as before.
 */
export function coverPatternSvg(
  style: CoverPatternKind,
  wMm: number,
  hMm: number,
  color: string,
  opts: { density?: number; size?: number } = {},
): string {
  const d = Math.min(2, Math.max(0.5, opts.density ?? 1));
  const s = Math.min(2.5, Math.max(0.5, opts.size ?? 1));
  const parts: string[] = [];
  if (style === "grid") {
    const step = 12 / d;
    for (let x = step; x < wMm; x += step) parts.push(`<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${hMm}"/>`);
    for (let y = step; y < hMm; y += step) parts.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${wMm}" y2="${y.toFixed(1)}"/>`);
  } else if (style === "dots") {
    // Even dot grid — filled circles so the size control reads clearly.
    const step = 9 / d;
    const r = (0.5 * s).toFixed(2);
    for (let y = step; y < hMm; y += step)
      for (let x = step; x < wMm; x += step) parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${color}" stroke="none"/>`);
  } else if (style === "lines") {
    // Laid-paper texture: fine horizontal rules only.
    const step = 7 / d;
    for (let y = step; y < hMm; y += step) parts.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${wMm}" y2="${y.toFixed(1)}"/>`);
  } else if (style === "rings") {
    const cx = wMm * 0.82;
    const cy = hMm * 0.1;
    const max = Math.hypot(wMm, hMm);
    const step = 6.4 / d;
    for (let r = step; r < max; r += step) parts.push(`<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none"/>`);
  } else if (style === "waves") {
    // Stacked gentle sine waves — calm, editorial texture.
    const step = 11 / d;
    const wl = 26;
    const amp = 2.4;
    for (let y = step; y < hMm + amp; y += step) {
      let path = `M ${-wl} ${y.toFixed(1)} q ${(wl / 4).toFixed(1)} ${(-amp * 2).toFixed(1)} ${(wl / 2).toFixed(1)} 0`;
      for (let x = -wl / 2; x < wMm + wl; x += wl / 2) path += ` t ${(wl / 2).toFixed(1)} 0`;
      parts.push(`<path d="${path}" fill="none"/>`);
    }
  } else if (style === "mesh") {
    // Isometric triangle mesh: horizontal rows plus both diagonal
    // families — an architectural, engineered texture.
    const step = 16 / d;
    const run = hMm * 0.577; // ~30° from vertical, equilateral-ish cells
    for (let y = step; y < hMm; y += step) parts.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${wMm}" y2="${y.toFixed(1)}"/>`);
    for (let x = -run; x < wMm + run; x += step) {
      parts.push(`<line x1="${x.toFixed(1)}" y1="0" x2="${(x + run).toFixed(1)}" y2="${hMm}"/>`);
      parts.push(`<line x1="${(x + run).toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${hMm}"/>`);
    }
  } else if (style === "geometry") {
    // Sparse outlined shapes — circles, diamonds, triangles — on a
    // staggered grid with deterministic size drift: a designed,
    // non-repeating feel without any randomness.
    const step = 30 / d;
    const r0 = 4.6 * s;
    let row = 0;
    for (let y = step * 0.7; y < hMm + r0; y += step) {
      for (let x = step * (0.55 + (row % 2) * 0.5); x < wMm + r0; x += step * 1.3) {
        const kind = (row + Math.round(x / step)) % 3;
        const r = r0 * (0.68 + ((row * 7 + Math.round(x)) % 5) * 0.13);
        const [cx, cy, rr] = [x.toFixed(1), y.toFixed(1), r.toFixed(1)];
        if (kind === 0) parts.push(`<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none"/>`);
        else if (kind === 1)
          parts.push(`<polygon points="${(x - r).toFixed(1)},${cy} ${cx},${(y - r).toFixed(1)} ${(x + r).toFixed(1)},${cy} ${cx},${(y + r).toFixed(1)}" fill="none"/>`);
        else
          parts.push(`<polygon points="${cx},${(y - r).toFixed(1)} ${(x + r * 0.87).toFixed(1)},${(y + r / 2).toFixed(1)} ${(x - r * 0.87).toFixed(1)},${(y + r / 2).toFixed(1)}" fill="none"/>`);
      }
      row++;
    }
  } else if (style === "abstract") {
    // A few large, soft sweeping arcs from two corners — a modern,
    // premium "designed" texture rather than a repeating pattern.
    const step = 13 / d;
    const max = Math.hypot(wMm, hMm);
    for (let r = step * 2; r < max * 1.05; r += step) {
      parts.push(`<circle cx="${(wMm * 0.05).toFixed(1)}" cy="${(hMm * 0.98).toFixed(1)}" r="${r.toFixed(1)}" fill="none"/>`);
      parts.push(`<circle cx="${(wMm * 0.98).toFixed(1)}" cy="${(hMm * 0.06).toFixed(1)}" r="${(r * 0.72).toFixed(1)}" fill="none"/>`);
    }
  } else {
    const step = 5.8 / d;
    for (let dd = -hMm; dd < wMm + hMm; dd += step) {
      parts.push(`<line x1="${dd.toFixed(1)}" y1="0" x2="${(dd + hMm).toFixed(1)}" y2="${hMm}"/>`);
      parts.push(`<line x1="${dd.toFixed(1)}" y1="${hMm}" x2="${(dd + hMm).toFixed(1)}" y2="0"/>`);
    }
  }
  const stroke = (0.16 * s).toFixed(3);
  return `<svg class="cv-pattern" viewBox="0 0 ${wMm} ${hMm}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" stroke="${color}" stroke-width="${stroke}">${parts.join("")}</svg>`;
}
