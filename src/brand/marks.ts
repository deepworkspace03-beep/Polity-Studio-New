import { escapeHtml } from "../lib/utils";

/**
 * Every brand graphic is vector, generated from these helpers — no
 * raster assets anywhere in the app or the PDFs. The temple mark is the
 * Polity Made Simple emblem used on covers, footers and the closing page.
 */

/** A rounded rectangle as clockwise SVG path data (circular corners,
    clamped to the short side) — lets the temple mark ship as one compound
    <path> instead of a <path> + five <rect> nodes. The whole emblem is
    then a single node wherever it appears; on a 1000-page document it is
    cloned into every footer and watermark, so collapsing six nodes to one
    removes tens of thousands of DOM nodes (lower pagination memory) and,
    since the transcriber walks multi-subpath paths as one fill, the same
    count of PDF fill operators — with pixel-identical output. */
function roundRectSubpath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return (
    `M ${x + rr} ${y} L ${x + w - rr} ${y} A ${rr} ${rr} 0 0 1 ${x + w} ${y + rr} ` +
    `L ${x + w} ${y + h - rr} A ${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h} ` +
    `L ${x + rr} ${y + h} A ${rr} ${rr} 0 0 1 ${x} ${y + h - rr} ` +
    `L ${x} ${y + rr} A ${rr} ${rr} 0 0 1 ${x + rr} ${y} Z`
  );
}

/** The Polity Made Simple temple emblem as a single compound path (roof
    triangle + lintel + three pillars + base), all filled with currentColor.
    Geometry is unchanged from the former path+5-rect form. */
export const TEMPLE_PATH =
  `<path d="M 20 40 L 50 26 L 80 40 Z ` +
  `${roundRectSubpath(18, 43, 64, 6, 3)} ` +
  `${roundRectSubpath(26, 52, 7, 19, 3.5)} ` +
  `${roundRectSubpath(46.5, 52, 7, 19, 3.5)} ` +
  `${roundRectSubpath(67, 52, 7, 19, 3.5)} ` +
  `${roundRectSubpath(14, 74, 72, 6, 3)}"/>`;

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

export type CoverPatternKind = "geometry" | "abstract" | "globe";

/**
 * Full-bleed cover pattern layer, generated as inline SVG (mm units) so
 * it stays vector in print and in the PDF engine — CSS repeating
 * gradients would be rasterized by the browser's print pipeline.
 *
 * A curated, publication-grade set: `geometry` (a sparse constellation of
 * outlined academic shapes), `abstract` (soft sweeping corner arcs) and
 * `globe` (a large, quiet meridian wireframe — an International-Relations /
 * humanities motif). `density` (0.5–2) tunes element spacing; `size`
 * (0.5–2.5) tunes stroke/shape scale. Both default to 1.
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
  if (style === "globe") {
    // A quiet meridian wireframe — latitude ellipses + longitude ellipses
    // inside an outline circle, placed large in the upper-right so it bleeds
    // off two edges and reads as texture rather than an icon. Full ellipses
    // keep it curved without any clip-path (which the PDF engine avoids).
    const cx = wMm * 0.86;
    const cy = hMm * 0.26;
    const R = Math.min(wMm, hMm) * (0.62 * s);
    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${R.toFixed(1)}" fill="none"/>`);
    const rings = Math.max(2, Math.round(3 * d));
    for (let i = 1; i <= rings; i++) {
      const k = i / (rings + 1);
      parts.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(R * Math.cos(k * Math.PI / 2)).toFixed(1)}" ry="${R.toFixed(1)}" fill="none"/>`);
      parts.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${R.toFixed(1)}" ry="${(R * Math.cos(k * Math.PI / 2)).toFixed(1)}" fill="none"/>`);
    }
    parts.push(`<line x1="${cx.toFixed(1)}" y1="${(cy - R).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(cy + R).toFixed(1)}"/>`);
    parts.push(`<line x1="${(cx - R).toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx + R).toFixed(1)}" y2="${cy.toFixed(1)}"/>`);
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
    // geometry — sparse outlined shapes (circles, diamonds, triangles) on a
    // staggered grid with deterministic size drift: a designed, non-repeating
    // feel without any randomness.
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
  }
  const stroke = (0.16 * s).toFixed(3);
  return `<svg class="cv-pattern" viewBox="0 0 ${wMm} ${hMm}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" stroke="${color}" stroke-width="${stroke}">${parts.join("")}</svg>`;
}
