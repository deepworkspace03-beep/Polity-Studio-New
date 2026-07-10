import type { PageCanvas, PathPoint } from "./canvas";
import { parseColor, isVisible, type Matrix } from "./geometry";

/**
 * Transcribes inline SVG artwork (brand marks, icons, callout glyphs,
 * cover patterns) into vector PDF operators. The browser resolves all
 * the hard parts for us: getScreenCTM() flattens viewBox + transforms,
 * and computed styles resolve currentColor / CSS overrides.
 */

const SHAPES = "path,rect,circle,ellipse,line,polyline,polygon";

export function transcribeSvg(
  svg: SVGSVGElement,
  canvas: PageCanvas,
  pageOrigin: { x: number; y: number },
  baseOpacity: number,
): void {
  const win = svg.ownerDocument.defaultView!;
  for (const shape of svg.querySelectorAll<SVGGraphicsElement>(SHAPES)) {
    const ctm = shape.getScreenCTM();
    if (!ctm) continue;
    const cs = win.getComputedStyle(shape);
    if (cs.display === "none" || cs.visibility === "hidden") continue;

    // Cumulative opacity of the shape's <g> ancestors up to (but not
    // including) the <svg> root — the root's own opacity is already
    // folded into baseOpacity by the caller, so re-reading it here would
    // double-count it (e.g. a 12%-opacity mark would render at ~1.4%).
    let opacity = baseOpacity;
    for (let el: Element | null = shape; el && el !== svg; el = el.parentElement) {
      const o = parseFloat(win.getComputedStyle(el).opacity);
      if (o < 1) opacity *= o;
    }

    const path = shapePath(shape);
    if (path.length === 0) continue;

    const m: Matrix = [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e - pageOrigin.x, ctm.f - pageOrigin.y];
    canvas.save();
    canvas.transform(m);

    const fill = cs.fill === "none" ? null : parseColor(cs.fill);
    if (isVisible(fill)) {
      canvas.fillPath(path, fill, opacity * parseFloat(cs.fillOpacity || "1"), cs.fillRule === "evenodd");
    }
    const stroke = cs.stroke === "none" ? null : parseColor(cs.stroke);
    if (isVisible(stroke)) {
      const dash = cs.strokeDasharray && cs.strokeDasharray !== "none"
        ? cs.strokeDasharray.split(/[,\s]+/).map((v) => parseFloat(v)).filter((v) => !Number.isNaN(v))
        : undefined;
      canvas.strokePath(path, stroke, {
        width: parseFloat(cs.strokeWidth) || 1,
        cap: (cs.strokeLinecap as "butt" | "round" | "square") || "butt",
        join: (cs.strokeLinejoin as "miter" | "round" | "bevel") || "miter",
        dash,
      }, opacity * parseFloat(cs.strokeOpacity || "1"));
    }
    canvas.restore();
  }
}

/* ── shape → path points (in SVG user units) ───────────────────────── */

const KAPPA = 0.5522847498;

function ellipsePath(cx: number, cy: number, rx: number, ry: number): PathPoint[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    { op: "M", x: cx + rx, y: cy },
    { op: "C", x1: cx + rx, y1: cy + ky, x2: cx + kx, y2: cy + ry, x: cx, y: cy + ry },
    { op: "C", x1: cx - kx, y1: cy + ry, x2: cx - rx, y2: cy + ky, x: cx - rx, y: cy },
    { op: "C", x1: cx - rx, y1: cy - ky, x2: cx - kx, y2: cy - ry, x: cx, y: cy - ry },
    { op: "C", x1: cx + kx, y1: cy - ry, x2: cx + rx, y2: cy - ky, x: cx + rx, y: cy },
    { op: "Z" },
  ];
}

function shapePath(shape: SVGGraphicsElement): PathPoint[] {
  const num = (name: string) => parseFloat(shape.getAttribute(name) || "0");
  switch (shape.tagName.toLowerCase()) {
    case "path":
      return parsePathData(shape.getAttribute("d") || "");
    case "rect": {
      const x = num("x");
      const y = num("y");
      const w = num("width");
      const h = num("height");
      let rx = shape.hasAttribute("rx") ? num("rx") : shape.hasAttribute("ry") ? num("ry") : 0;
      rx = Math.min(rx, w / 2, h / 2);
      if (rx <= 0) {
        return [
          { op: "M", x, y }, { op: "L", x: x + w, y }, { op: "L", x: x + w, y: y + h },
          { op: "L", x, y: y + h }, { op: "Z" },
        ];
      }
      const k = rx * KAPPA;
      return [
        { op: "M", x: x + rx, y },
        { op: "L", x: x + w - rx, y },
        { op: "C", x1: x + w - rx + k, y1: y, x2: x + w, y2: y + rx - k, x: x + w, y: y + rx },
        { op: "L", x: x + w, y: y + h - rx },
        { op: "C", x1: x + w, y1: y + h - rx + k, x2: x + w - rx + k, y2: y + h, x: x + w - rx, y: y + h },
        { op: "L", x: x + rx, y: y + h },
        { op: "C", x1: x + rx - k, y1: y + h, x2: x, y2: y + h - rx + k, x, y: y + h - rx },
        { op: "L", x, y: y + rx },
        { op: "C", x1: x, y1: y + rx - k, x2: x + rx - k, y2: y, x: x + rx, y },
        { op: "Z" },
      ];
    }
    case "circle":
      return ellipsePath(num("cx"), num("cy"), num("r"), num("r"));
    case "ellipse":
      return ellipsePath(num("cx"), num("cy"), num("rx"), num("ry"));
    case "line":
      return [
        { op: "M", x: num("x1"), y: num("y1") },
        { op: "L", x: num("x2"), y: num("y2") },
      ];
    case "polyline":
    case "polygon": {
      const pts = (shape.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
      if (pts.length < 4) return [];
      const path: PathPoint[] = [{ op: "M", x: pts[0], y: pts[1] }];
      for (let i = 2; i + 1 < pts.length; i += 2) path.push({ op: "L", x: pts[i], y: pts[i + 1] });
      if (shape.tagName.toLowerCase() === "polygon") path.push({ op: "Z" });
      return path;
    }
    default:
      return [];
  }
}

/* ── SVG path data parser ──────────────────────────────────────────── */

export function parsePathData(d: string): PathPoint[] {
  const out: PathPoint[] = [];
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
  if (!tokens) return out;
  let i = 0;
  let cmd = "";
  let x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0; // current, subpath start, prev control
  let prevCmd = "";
  const read = () => parseFloat(tokens[i++]);

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    switch (C) {
      case "M": {
        const nx = read() + (rel ? x : 0);
        const ny = read() + (rel ? y : 0);
        x = sx = nx; y = sy = ny;
        out.push({ op: "M", x, y });
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": {
        x = read() + (rel ? x : 0);
        y = read() + (rel ? y : 0);
        out.push({ op: "L", x, y });
        break;
      }
      case "H": {
        x = read() + (rel ? x : 0);
        out.push({ op: "L", x, y });
        break;
      }
      case "V": {
        y = read() + (rel ? y : 0);
        out.push({ op: "L", x, y });
        break;
      }
      case "C": {
        const x1 = read() + (rel ? x : 0), y1 = read() + (rel ? y : 0);
        const x2 = read() + (rel ? x : 0), y2 = read() + (rel ? y : 0);
        const nx = read() + (rel ? x : 0), ny = read() + (rel ? y : 0);
        out.push({ op: "C", x1, y1, x2, y2, x: nx, y: ny });
        px = x2; py = y2; x = nx; y = ny;
        break;
      }
      case "S": {
        const x1 = /[CS]/.test(prevCmd) ? 2 * x - px : x;
        const y1 = /[CS]/.test(prevCmd) ? 2 * y - py : y;
        const x2 = read() + (rel ? x : 0), y2 = read() + (rel ? y : 0);
        const nx = read() + (rel ? x : 0), ny = read() + (rel ? y : 0);
        out.push({ op: "C", x1, y1, x2, y2, x: nx, y: ny });
        px = x2; py = y2; x = nx; y = ny;
        break;
      }
      case "Q": {
        const qx = read() + (rel ? x : 0), qy = read() + (rel ? y : 0);
        const nx = read() + (rel ? x : 0), ny = read() + (rel ? y : 0);
        out.push(quadToCubic(x, y, qx, qy, nx, ny));
        px = qx; py = qy; x = nx; y = ny;
        break;
      }
      case "T": {
        const qx = /[QT]/.test(prevCmd) ? 2 * x - px : x;
        const qy = /[QT]/.test(prevCmd) ? 2 * y - py : y;
        const nx = read() + (rel ? x : 0), ny = read() + (rel ? y : 0);
        out.push(quadToCubic(x, y, qx, qy, nx, ny));
        px = qx; py = qy; x = nx; y = ny;
        break;
      }
      case "A": {
        const rx = read(), ry = read(), rot = read(), laf = read(), sf = read();
        const nx = read() + (rel ? x : 0), ny = read() + (rel ? y : 0);
        out.push(...arcToCubics(x, y, rx, ry, rot, laf, sf, nx, ny));
        x = nx; y = ny;
        break;
      }
      case "Z": {
        out.push({ op: "Z" });
        x = sx; y = sy;
        break;
      }
      default:
        return out; // unknown command — bail with what we have
    }
    prevCmd = C;
  }
  return out;
}

function quadToCubic(x0: number, y0: number, qx: number, qy: number, x: number, y: number): PathPoint {
  return {
    op: "C",
    x1: x0 + (2 / 3) * (qx - x0), y1: y0 + (2 / 3) * (qy - y0),
    x2: x + (2 / 3) * (qx - x), y2: y + (2 / 3) * (qy - y),
    x, y,
  };
}

/** SVG endpoint arc → cubic beziers (standard center parameterization). */
function arcToCubics(x0: number, y0: number, rx: number, ry: number, rotDeg: number, laf: number, sf: number, x: number, y: number): PathPoint[] {
  if (rx === 0 || ry === 0) return [{ op: "L", x, y }];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (rotDeg * Math.PI) / 180;
  const cosP = Math.cos(phi), sinP = Math.sin(phi);
  const dx = (x0 - x) / 2, dy = (y0 - y) / 2;
  const x1p = cosP * dx + sinP * dy;
  const y1p = -sinP * dx + cosP * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s; ry *= s;
  }
  const sign = laf === sf ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cosP * cxp - sinP * cyp + (x0 + x) / 2;
  const cy = sinP * cxp + cosP * cyp + (y0 + y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const d = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let a = Math.acos(Math.min(1, Math.max(-1, (ux * vx + uy * vy) / d)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sf && dth > 0) dth -= 2 * Math.PI;
  if (sf && dth < 0) dth += 2 * Math.PI;

  const segs = Math.ceil(Math.abs(dth) / (Math.PI / 2));
  const out: PathPoint[] = [];
  const delta = dth / segs;
  const t = ((4 / 3) * Math.tan(delta / 4));
  let theta = th1;
  let cx0 = x0, cy0 = y0;
  for (let s = 0; s < segs; s++) {
    const theta2 = theta + delta;
    const cos1 = Math.cos(theta), sin1 = Math.sin(theta);
    const cos2 = Math.cos(theta2), sin2 = Math.sin(theta2);
    const e = (ct: number, st: number) => ({
      x: cx + rx * cosP * ct - ry * sinP * st,
      y: cy + rx * sinP * ct + ry * cosP * st,
    });
    const d1 = { x: -rx * cosP * sin1 - ry * sinP * cos1, y: -rx * sinP * sin1 + ry * cosP * cos1 };
    const d2 = { x: -rx * cosP * sin2 - ry * sinP * cos2, y: -rx * sinP * sin2 + ry * cosP * cos2 };
    const p2 = e(cos2, sin2);
    out.push({
      op: "C",
      x1: cx0 + t * d1.x, y1: cy0 + t * d1.y,
      x2: p2.x - t * d2.x, y2: p2.y - t * d2.y,
      x: p2.x, y: p2.y,
    });
    cx0 = p2.x; cy0 = p2.y;
    theta = theta2;
  }
  return out;
}
