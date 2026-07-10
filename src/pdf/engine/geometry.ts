/**
 * Small geometry + color helpers for the PDF transcription engine.
 * A Matrix is a 2D affine transform [a b c d e f] — the same layout as
 * CSS matrix() and the PDF `cm` operator.
 */

export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function translation(tx: number, ty: number): Matrix {
  return [1, 0, 0, 1, tx, ty];
}

export function apply(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2];
  const ia = m[3] / det;
  const ib = -m[1] / det;
  const ic = -m[2] / det;
  const id = m[0] / det;
  return [ia, ib, ic, id, -(ia * m[4] + ic * m[5]), -(ib * m[4] + id * m[5])];
}

/** Parses a CSS `matrix(a, b, c, d, e, f)` string ("none" → identity). */
export function parseCssMatrix(value: string): Matrix {
  const m = value.match(/matrix\(([^)]+)\)/);
  if (!m) return IDENTITY;
  const p = m[1].split(",").map((v) => parseFloat(v));
  return p.length === 6 ? (p as Matrix) : IDENTITY;
}

/* ── Colors ────────────────────────────────────────────────────────── */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parses computed-style colors: rgb()/rgba() and color(srgb …). */
export function parseColor(value: string): Rgba | null {
  if (!value) return null;
  let m = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?\s*\)/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a };
  }
  m = value.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\)/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  return null;
}

export function isVisible(c: Rgba | null): c is Rgba {
  return !!c && c.a > 0.001;
}
