import { parseColor, type Rgba } from "./geometry";

/**
 * Parses computed-style CSS gradients (the subset the print styles use:
 * linear with angle/side keywords, radial with explicit ellipse size and
 * position) into a resolved geometric spec the canvas can turn into PDF
 * axial/radial shadings. All output coordinates are CSS-space, relative
 * to the painted box.
 */

export interface GradientStop {
  offset: number; // 0..1
  color: Rgba;
}

export type GradientSpec =
  | { kind: "linear"; x0: number; y0: number; x1: number; y1: number; stops: GradientStop[] }
  | { kind: "radial"; cx: number; cy: number; rx: number; ry: number; stops: GradientStop[] };

/** Splits a gradient argument list at top-level commas. */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseStops(parts: string[], lineLength: number): GradientStop[] | null {
  const raw: { color: Rgba; offset: number | null }[] = [];
  for (const part of parts) {
    const m = part.match(/^((?:rgba?|color)\([^)]*\)|transparent|#[0-9a-fA-F]{3,8})\s*(.*)$/);
    if (!m) return null;
    const color = parseColor(m[1]);
    if (!color) return null;
    const positions = m[2].trim() ? m[2].trim().split(/\s+/) : [];
    if (positions.length === 0) {
      raw.push({ color, offset: null });
    } else {
      for (const pos of positions) {
        let off: number | null = null;
        if (pos.endsWith("%")) off = parseFloat(pos) / 100;
        else if (pos.endsWith("px")) off = lineLength > 0 ? parseFloat(pos) / lineLength : 0;
        raw.push({ color, offset: off });
      }
    }
  }
  if (raw.length < 2) return null;
  // Fill in missing positions per spec: clamp to be non-decreasing,
  // first defaults to 0, last to 1, gaps distribute evenly.
  if (raw[0].offset === null) raw[0].offset = 0;
  if (raw[raw.length - 1].offset === null) raw[raw.length - 1].offset = 1;
  let last = raw[0].offset!;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].offset !== null) {
      raw[i].offset = Math.max(raw[i].offset!, last);
      last = raw[i].offset!;
    } else {
      let j = i;
      while (raw[j].offset === null) j++;
      const span = (raw[j].offset! - last) / (j - i + 1);
      for (let k = i; k < j; k++) {
        raw[k].offset = last + span * (k - i + 1);
      }
      i = j;
      last = raw[j].offset!;
    }
  }
  const stops = raw.map((r) => ({ offset: r.offset!, color: r.color }));
  // CSS interpolates premultiplied: keep fully transparent stops from
  // dragging the ramp toward black by copying the neighbour's rgb.
  for (let i = 0; i < stops.length; i++) {
    if (stops[i].color.a === 0) {
      const n = stops[i + 1] ?? stops[i - 1];
      if (n) stops[i] = { offset: stops[i].offset, color: { ...n.color, a: 0 } };
    }
  }
  return stops;
}

const SIDE_ANGLES: Record<string, number> = {
  "to top": 0, "to right": 90, "to bottom": 180, "to left": 270,
  "to top right": NaN, "to right top": NaN, // resolved from box below
};

/** Parses ONE gradient function (already isolated). Box is the painted
    area in CSS coordinates; output geometry is relative to it. */
export function parseGradient(css: string, w: number, h: number): GradientSpec | null {
  const m = css.match(/^(repeating-)?(linear|radial)-gradient\((.*)\)$/s);
  if (!m || m[1]) return null; // repeating → unsupported (drawn as SVG in our designs)
  const args = splitArgs(m[3]);
  if (m[2] === "linear") {
    let angle = 180; // CSS default: to bottom
    let stopArgs = args;
    const first = args[0];
    const degMatch = first.match(/^(-?[\d.]+)deg$/);
    if (degMatch) {
      angle = parseFloat(degMatch[1]);
      stopArgs = args.slice(1);
    } else if (first.startsWith("to ")) {
      if (first in SIDE_ANGLES && !Number.isNaN(SIDE_ANGLES[first])) angle = SIDE_ANGLES[first];
      else {
        // Corner keywords: perpendicular to the box diagonal.
        const dx = first.includes("right") ? 1 : -1;
        const dy = first.includes("top") ? -1 : 1;
        angle = (Math.atan2(dx * h, -dy * w) * 180) / Math.PI;
      }
      stopArgs = args.slice(1);
    }
    const rad = ((angle % 360) * Math.PI) / 180;
    // Gradient line length per CSS spec.
    const len = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
    const cx = w / 2;
    const cy = h / 2;
    const dx = (Math.sin(rad) * len) / 2;
    const dy = (-Math.cos(rad) * len) / 2;
    const stops = parseStops(stopArgs, len);
    if (!stops) return null;
    return { kind: "linear", x0: cx - dx, y0: cy - dy, x1: cx + dx, y1: cy + dy, stops };
  }

  // radial-gradient([<rx> <ry>] [at <x> <y>], stops…)
  let rx = Math.max(w, h);
  let ry = rx;
  let cx = w / 2;
  let cy = h / 2;
  let stopArgs = args;
  const head = args[0];
  if (!head.match(/^(rgba?|color)\(|^transparent|^#/) ) {
    stopArgs = args.slice(1);
    const at = head.split(/\s+at\s+/);
    const size = at[0].trim().split(/\s+/).filter((t) => /%|px$/.test(t));
    const dim = (token: string, base: number) => (token.endsWith("%") ? (parseFloat(token) / 100) * base : parseFloat(token));
    if (size.length >= 1) rx = dim(size[0], w);
    ry = size.length >= 2 ? dim(size[1], h) : rx;
    if (at[1]) {
      const pos = at[1].trim().split(/\s+/);
      if (pos[0]) cx = dim(pos[0], w);
      if (pos[1]) cy = dim(pos[1], h);
    }
  }
  const stops = parseStops(stopArgs, Math.max(rx, ry));
  if (!stops) return null;
  return { kind: "radial", cx, cy, rx, ry, stops };
}

/** True when any stop needs a soft mask (varying alpha). */
export function needsAlphaMask(stops: GradientStop[]): boolean {
  return stops.some((s) => s.color.a < 0.999);
}

/**
 * Builds the PDF function for a stop ramp. `channel` selects RGB color
 * output or the alpha ramp (as DeviceGray) for the soft mask.
 */
export function stopsToPdfFunction(stops: GradientStop[], channel: "rgb" | "alpha"): Record<string, unknown> {
  const val = (s: GradientStop) => (channel === "rgb" ? [s.color.r, s.color.g, s.color.b] : [s.color.a]);
  // Clamp domain and deduplicate hard stops with an epsilon.
  const pts = stops.map((s, i) => ({ ...s, offset: Math.min(1, Math.max(s.offset, i === 0 ? 0 : 0)) }));
  const segments: Record<string, unknown>[] = [];
  const bounds: number[] = [];
  const encode: number[] = [];
  let prev = pts[0];
  const first = pts[0];
  const lastPt = pts[pts.length - 1];
  // Leading/trailing pads so offsets >0 or <1 hold their edge colour.
  if (first.offset > 0) pts.unshift({ ...first, offset: 0 });
  if (lastPt.offset < 1) pts.push({ ...lastPt, offset: 1 });
  prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i];
    segments.push({ FunctionType: 2, Domain: [0, 1], C0: val(prev), C1: val(cur), N: 1 });
    if (i < pts.length - 1) bounds.push(Math.max(cur.offset, (bounds[bounds.length - 1] ?? 0) + 1e-5));
    encode.push(0, 1);
    prev = cur;
  }
  if (segments.length === 1) return segments[0];
  return { FunctionType: 3, Domain: [0, 1], Functions: segments, Bounds: bounds, Encode: encode };
}
