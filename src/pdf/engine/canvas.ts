import {
  PDFDocument,
  PDFName,
  type PDFRef,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  PDFPage,
  PDFString,
  appendBezierCurve,
  closePath,
  clip,
  concatTransformationMatrix,
  drawObject,
  endPath,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSpacing,
  setDashPattern,
  setFillingRgbColor,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  stroke,
  LineCapStyle,
  LineJoinStyle,
} from "pdf-lib";
import type { LoadedFace } from "./fonts";
import { needsAlphaMask, stopsToPdfFunction, type GradientSpec } from "./gradient";
import { invert, multiply, type Matrix, type Rgba } from "./geometry";

/**
 * PageCanvas — draws into one PDF page using CSS-pixel page coordinates
 * (origin top-left, y down). Every coordinate is converted through the
 * base matrix F = scale ∘ flip, so callers never think about PDF space.
 * CSS transforms are emitted as `cm` operators conjugated with F, which
 * keeps child coordinates in plain CSS space too.
 */

const K = 72 / 96; // CSS px → PDF pt

export interface PathPoint {
  op: "M" | "L" | "C" | "Z";
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export interface StrokeStyle {
  width: number; // CSS px
  cap?: "butt" | "round" | "square";
  join?: "miter" | "round" | "bevel";
  dash?: number[]; // CSS px
}

const CAPS = { butt: LineCapStyle.Butt, round: LineCapStyle.Round, square: LineCapStyle.Projecting } as const;
const JOINS = { miter: LineJoinStyle.Miter, round: LineJoinStyle.Round, bevel: LineJoinStyle.Bevel } as const;

export class PageCanvas {
  private ops: PDFOperator[] = [];
  private alphaStates = new Map<string, PDFName>();
  private fontKeys = new Map<string, PDFName>();
  private tags = 0;
  /** F: CSS px (y down) → PDF pt (y up). */
  private F: Matrix;
  private Finv: Matrix;

  constructor(
    private doc: PDFDocument,
    readonly page: PDFPage,
    cssPageHeight: number,
  ) {
    this.F = [K, 0, 0, -K, 0, cssPageHeight * K];
    this.Finv = invert(this.F);
  }

  /* ── state ── */

  save(): void {
    this.ops.push(pushGraphicsState());
  }

  restore(): void {
    this.ops.push(popGraphicsState());
  }

  /** Applies a CSS-space affine transform to everything drawn until restore(). */
  transform(m: Matrix): void {
    const k = multiply(multiply(this.F, m), this.Finv);
    this.ops.push(concatTransformationMatrix(k[0], k[1], k[2], k[3], k[4], k[5]));
  }

  private alpha(fillA: number, strokeA = fillA): void {
    const key = `${fillA.toFixed(3)}/${strokeA.toFixed(3)}`;
    let name = this.alphaStates.get(key);
    if (!name) {
      const ref = this.doc.context.register(
        this.doc.context.obj({ Type: "ExtGState", ca: fillA, CA: strokeA }),
      );
      name = this.page.node.newExtGState(`GA${this.tags++}`, ref);
      this.alphaStates.set(key, name);
    }
    this.ops.push(setGraphicsState(name));
  }

  /* ── paths ── */

  private emitPath(path: PathPoint[]): void {
    const { F } = this;
    const px = (x: number, y: number) => ({ x: F[0] * x + F[2] * y + F[4], y: F[1] * x + F[3] * y + F[5] });
    for (const p of path) {
      if (p.op === "M") {
        const t = px(p.x!, p.y!);
        this.ops.push(moveTo(t.x, t.y));
      } else if (p.op === "L") {
        const t = px(p.x!, p.y!);
        this.ops.push(lineTo(t.x, t.y));
      } else if (p.op === "C") {
        const c1 = px(p.x1!, p.y1!);
        const c2 = px(p.x2!, p.y2!);
        const t = px(p.x!, p.y!);
        this.ops.push(appendBezierCurve(c1.x, c1.y, c2.x, c2.y, t.x, t.y));
      } else {
        this.ops.push(closePath());
      }
    }
  }

  fillPath(path: PathPoint[], color: Rgba, opacity = 1, evenOdd = false): void {
    const a = color.a * opacity;
    this.save();
    if (a < 0.999) this.alpha(a);
    this.ops.push(setFillingRgbColor(color.r, color.g, color.b));
    this.emitPath(path);
    this.ops.push(evenOdd ? PDFOperator.of(PDFOperatorNames.FillEvenOdd) : fill());
    this.restore();
  }

  strokePath(path: PathPoint[], color: Rgba, style: StrokeStyle, opacity = 1): void {
    const a = color.a * opacity;
    this.save();
    if (a < 0.999) this.alpha(a, a);
    this.ops.push(setStrokingRgbColor(color.r, color.g, color.b));
    this.ops.push(setLineWidth(style.width * K));
    if (style.cap) this.ops.push(setLineCap(CAPS[style.cap]));
    if (style.join) this.ops.push(setLineJoin(JOINS[style.join]));
    if (style.dash && style.dash.length) {
      this.ops.push(setDashPattern(style.dash.map((d) => d * K), 0));
    }
    this.emitPath(path);
    this.ops.push(stroke());
    this.restore();
  }

  /** Clips to a path until the matching restore(). Call save() first. */
  clipPath(path: PathPoint[]): void {
    this.emitPath(path);
    this.ops.push(clip(), endPath());
  }

  /* ── text ── */

  /**
   * Draws one run at an exact CSS-space baseline position measured in
   * the browser. `size` in CSS px; `charSpacing` mirrors letter-spacing.
   */
  drawText(
    text: string,
    x: number,
    baseline: number,
    face: LoadedFace,
    size: number,
    color: Rgba,
    opacity = 1,
    charSpacing = 0,
    syntheticOblique = false,
  ): void {
    if (!text) return;
    const a = color.a * opacity;
    if (a < 0.001) return;
    const font = face.pdfFont;
    let fontKey = this.fontKeys.get(font.ref.toString());
    if (!fontKey) {
      fontKey = this.page.node.newFontDictionary(font.name, font.ref);
      this.fontKeys.set(font.ref.toString(), fontKey);
    }
    const p = { x: this.F[0] * x + this.F[4], y: this.F[3] * baseline + this.F[5] };
    this.save();
    if (a < 0.999) this.alpha(a);
    const n = (v: number) => PDFNumber.of(v);
    this.ops.push(
      PDFOperator.of(PDFOperatorNames.BeginText),
      setFillingRgbColor(color.r, color.g, color.b),
      PDFOperator.of(PDFOperatorNames.SetFontAndSize, [fontKey, n(size * K)]),
    );
    if (charSpacing) this.ops.push(setCharacterSpacing(charSpacing * K));
    const shear = syntheticOblique ? 0.2 : 0;
    this.ops.push(PDFOperator.of(PDFOperatorNames.SetTextMatrix, [n(1), n(0), n(shear), n(1), n(p.x), n(p.y)]));
    this.ops.push(PDFOperator.of(PDFOperatorNames.ShowText, [font.encodeText(text)]));
    this.ops.push(PDFOperator.of(PDFOperatorNames.EndText));
    this.restore();
  }

  /* ── gradients ── */

  /**
   * Paints a CSS gradient clipped to `clipPathPts`. `bboxCss` is the
   * painted box (gradient geometry is relative to it). Translucent
   * stops get a luminosity soft mask carrying the alpha ramp.
   */
  paintGradient(
    spec: GradientSpec,
    clipPathPts: PathPoint[],
    bboxCss: { x: number; y: number; w: number; h: number },
    opacity = 1,
  ): void {
    const ctx = this.doc.context;
    const { F } = this;
    const px = (x: number, y: number) => ({ x: F[0] * x + F[4], y: F[3] * y + F[5] });
    const withAlpha = needsAlphaMask(spec.stops);

    const shadingDict = (channel: "rgb" | "alpha"): Record<string, unknown> => {
      const fn = stopsToPdfFunction(spec.stops, channel);
      const cs = channel === "rgb" ? "DeviceRGB" : "DeviceGray";
      if (spec.kind === "linear") {
        const p0 = px(bboxCss.x + spec.x0, bboxCss.y + spec.y0);
        const p1 = px(bboxCss.x + spec.x1, bboxCss.y + spec.y1);
        return { ShadingType: 2, ColorSpace: cs, Coords: [p0.x, p0.y, p1.x, p1.y], Function: fn, Extend: [true, true] };
      }
      // Radial: unit circle, stretched to the ellipse by the form's cm.
      return { ShadingType: 3, ColorSpace: cs, Coords: [0, 0, 0, 0, 0, 1], Function: fn, Extend: [true, true] };
    };

    // The ellipse map for radial shadings (identity for linear).
    let cm: Matrix | null = null;
    if (spec.kind === "radial") {
      cm = multiply(F, [spec.rx, 0, 0, spec.ry, bboxCss.x + spec.cx, bboxCss.y + spec.cy]);
    }
    const corner0 = px(bboxCss.x, bboxCss.y + bboxCss.h);
    const corner1 = px(bboxCss.x + bboxCss.w, bboxCss.y);

    const makeForm = (channel: "rgb" | "alpha", extra: Record<string, unknown> = {}) => {
      const ref = ctx.register(ctx.obj(shadingDict(channel) as never));
      const content = cm ? `q ${cm.map((v) => v.toFixed(4)).join(" ")} cm /S0 sh Q\n` : `/S0 sh\n`;
      const strm = ctx.flateStream(content, {
        Type: "XObject",
        Subtype: "Form",
        BBox: [corner0.x, corner0.y, corner1.x, corner1.y],
        Resources: { Shading: { S0: ref } },
        ...extra,
      });
      return ctx.register(strm);
    };

    this.save();
    this.clipPath(clipPathPts);
    if (withAlpha) {
      const maskForm = makeForm("alpha", { Group: { S: "Transparency", CS: "DeviceGray" } });
      const gsRef = ctx.register(
        ctx.obj({ Type: "ExtGState", SMask: { S: "Luminosity", G: maskForm }, ca: opacity, CA: opacity }),
      );
      this.ops.push(setGraphicsState(this.page.node.newExtGState(`GS${this.tags++}`, gsRef)));
    } else if (opacity < 0.999) {
      this.alpha(opacity);
    }
    this.ops.push(drawObject(this.page.node.newXObject(`XS${this.tags++}`, makeForm("rgb"))));
    this.restore();
  }

  /* ── images ── */

  async drawImage(bytes: Uint8Array, kind: "png" | "jpg", x: number, y: number, w: number, h: number, opacity = 1): Promise<void> {
    const img = kind === "png" ? await this.doc.embedPng(bytes as never) : await this.doc.embedJpg(bytes as never);
    const tag = this.page.node.newXObject(`IM${this.tags++}`, img.ref);
    this.save();
    if (opacity < 0.999) this.alpha(opacity);
    // Image space is a unit square: scale to target, in PDF coords.
    const px = this.F[0] * x + this.F[4];
    const py = this.F[3] * (y + h) + this.F[5];
    this.ops.push(concatTransformationMatrix(w * K, 0, 0, h * K, px, py));
    this.ops.push(drawObject(tag));
    this.restore();
  }

  /* ── links ── */

  linkExternal(rect: { x: number; y: number; w: number; h: number }, url: string): void {
    this.addAnnot(rect, { Type: "Annot", Subtype: "Link", Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(url) } });
  }

  linkInternal(rect: { x: number; y: number; w: number; h: number }, target: PDFRef, cssY: number, cssPageHeightTarget: number): void {
    const destY = (cssPageHeightTarget - cssY) * K + 12;
    this.addAnnot(rect, { Type: "Annot", Subtype: "Link", Border: [0, 0, 0], Dest: [target, "XYZ", null, destY, null] });
  }

  private addAnnot(rect: { x: number; y: number; w: number; h: number }, dict: Record<string, unknown>): void {
    const { F } = this;
    const x0 = F[0] * rect.x + F[4];
    const y1 = F[3] * rect.y + F[5];
    const x1 = F[0] * (rect.x + rect.w) + F[4];
    const y0 = F[3] * (rect.y + rect.h) + F[5];
    const ref = this.doc.context.register(this.doc.context.obj({ ...dict, Rect: [x0, y0, x1, y1] } as never));
    this.page.node.addAnnot(ref);
  }

  /** Writes accumulated operators into the page content stream. */
  flush(): void {
    this.page.pushOperators(...this.ops);
    this.ops = [];
  }
}

/* ── path builders ─────────────────────────────────────────────────── */

export type CornerRadii = [number, number, number, number]; // tl, tr, br, bl

const KAPPA = 0.5522847498;

/** Rounded-rect path in CSS coordinates (clockwise from top-left). */
export function roundedRectPath(x: number, y: number, w: number, h: number, r: CornerRadii = [0, 0, 0, 0]): PathPoint[] {
  const max = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = r.map((v) => Math.max(0, Math.min(v, max))) as CornerRadii;
  if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
    return [
      { op: "M", x, y },
      { op: "L", x: x + w, y },
      { op: "L", x: x + w, y: y + h },
      { op: "L", x, y: y + h },
      { op: "Z" },
    ];
  }
  const p: PathPoint[] = [{ op: "M", x: x + tl, y }];
  p.push({ op: "L", x: x + w - tr, y });
  if (tr) p.push({ op: "C", x1: x + w - tr + tr * KAPPA, y1: y, x2: x + w, y2: y + tr - tr * KAPPA, x: x + w, y: y + tr });
  p.push({ op: "L", x: x + w, y: y + h - br });
  if (br) p.push({ op: "C", x1: x + w, y1: y + h - br + br * KAPPA, x2: x + w - br + br * KAPPA, y2: y + h, x: x + w - br, y: y + h });
  p.push({ op: "L", x: x + bl, y: y + h });
  if (bl) p.push({ op: "C", x1: x + bl - bl * KAPPA, y1: y + h, x2: x, y2: y + h - bl + bl * KAPPA, x: x, y: y + h - bl });
  p.push({ op: "L", x, y: y + tl });
  if (tl) p.push({ op: "C", x1: x, y1: y + tl - tl * KAPPA, x2: x + tl - tl * KAPPA, y2: y, x: x + tl, y });
  p.push({ op: "Z" });
  return p;
}
