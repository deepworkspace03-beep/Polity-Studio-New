import { PDFHexString, PDFName, type PDFDocument, type PDFRef } from "pdf-lib";
import { PageCanvas, roundedRectPath, type CornerRadii, type PathPoint, type StrokeStyle } from "./canvas";
import { FontResolver, type LoadedFace } from "./fonts";
import { parseGradient } from "./gradient";
import { isVisible, multiply, parseColor, parseCssMatrix, translation, type Rgba } from "./geometry";
import { materializePseudos } from "./materialize";
import { transcribeSvg } from "./svg";

/**
 * Transcribes a Paged.js-paginated document into vector PDF pages.
 *
 * The browser already did the hard part — layout. This module walks the
 * laid-out DOM in paint order and replays it: backgrounds, borders,
 * gradients, inline SVG, images and word-positioned text runs measured
 * with Range.getClientRects(), so the PDF reproduces the preview
 * geometry exactly while staying fully vector, selectable and tiny.
 */

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "HEAD", "TITLE", "META", "LINK", "BR", "WBR"]);

interface Decoration {
  line: "underline" | "line-through";
  color: Rgba;
  thickness: number | null; // CSS px, null → derive from font
}

interface PendingLink {
  pageIndex: number;
  rect: { x: number; y: number; w: number; h: number };
  href: string;
}

interface OutlineItem {
  title: string;
  level: number;
  pageIndex: number;
  cssY: number;
}

interface WalkCtx {
  opacity: number;
  decorations: Decoration[];
}

export interface TranscribeResult {
  pages: number;
  warnings: string[];
}

export async function transcribePaginated(
  srcDoc: Document,
  pdf: PDFDocument,
  onProgress?: (done: number, total: number) => void,
): Promise<TranscribeResult> {
  const win = srcDoc.defaultView;
  if (!win) throw new Error("Document is detached");
  const pagesRoot = srcDoc.querySelector<HTMLElement>(".pagedjs_pages");
  const pageEls = [...srcDoc.querySelectorAll<HTMLElement>(".pagedjs_page")];
  if (!pagesRoot || pageEls.length === 0) throw new Error("No paginated pages found");

  // Measure at 1:1 — the preview zoom scales every client rect.
  const prevZoom = pagesRoot.style.zoom;
  pagesRoot.style.zoom = "1";

  const warnings: string[] = [];
  const runStats = { total: 0, failed: 0 };
  const fonts = new FontResolver(pdf, "");
  const links: PendingLink[] = [];
  const outline: OutlineItem[] = [];
  const pageRefs: PDFRef[] = [];
  const canvases: PageCanvas[] = [];
  const K = 72 / 96;

  try {
    await materializePseudos(srcDoc);

    for (let p = 0; p < pageEls.length; p++) {
      const box = pageEls[p].querySelector<HTMLElement>(".pagedjs_pagebox") ?? pageEls[p];
      const origin = box.getBoundingClientRect();
      const page = pdf.addPage([origin.width * K, origin.height * K]);
      pageRefs.push(page.ref);
      const canvas = new PageCanvas(pdf, page, origin.height);
      canvases.push(canvas);

      const t = new Transcriber(win, canvas, { x: origin.left, y: origin.top }, p, links, warnings, fonts, runStats);
      await t.walk(box, { opacity: 1, decorations: [] });
      collectOutline(box, p, origin, outline);
      canvas.flush();
      onProgress?.(p + 1, pageEls.length);
      // Yield so the progress UI can paint between pages.
      await new Promise((r) => setTimeout(r, 0));
    }

    resolveLinks(srcDoc, links, canvases, pageEls, pageRefs);
    buildOutline(pdf, outline, pageRefs, pageEls);
  } finally {
    pagesRoot.style.zoom = prevZoom;
  }

  // A handful of failed runs is a cosmetic omission the warnings surface;
  // widespread failure means the PDF would ship visibly gutted — only then
  // is aborting (and reaching the caller's fallback) the better outcome.
  if (runStats.failed > 2 && runStats.failed > runStats.total * 0.02) {
    throw new Error(`text transcription failed for ${runStats.failed} of ${runStats.total} runs: ${warnings[warnings.length - 1] || "unknown"}`);
  }

  return { pages: pageEls.length, warnings };
}

/* ── helpers on the paginated DOM ──────────────────────────────────── */

function collectOutline(box: HTMLElement, pageIndex: number, origin: DOMRect, outline: OutlineItem[]): void {
  for (const h of box.querySelectorAll<HTMLElement>(".pagedjs_area h1[id], .pagedjs_area h2[id]")) {
    const text = (h.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    outline.push({
      title: text,
      level: h.tagName === "H1" ? 1 : 2,
      pageIndex,
      cssY: h.getBoundingClientRect().top - origin.top,
    });
  }
}

function resolveLinks(
  srcDoc: Document,
  links: PendingLink[],
  canvases: PageCanvas[],
  pageEls: HTMLElement[],
  pageRefs: PDFRef[],
): void {
  for (const link of links) {
    const canvas = canvases[link.pageIndex];
    if (/^https?:/i.test(link.href)) {
      canvas.linkExternal(link.rect, link.href);
    } else if (link.href.startsWith("#")) {
      let target: HTMLElement | null = null;
      try {
        target = srcDoc.getElementById(decodeURIComponent(link.href.slice(1)));
      } catch {
        /* malformed */
      }
      const targetPage = target?.closest<HTMLElement>(".pagedjs_page");
      if (!target || !targetPage) continue;
      const idx = pageEls.indexOf(targetPage);
      if (idx < 0) continue;
      const pb = (targetPage.querySelector(".pagedjs_pagebox") ?? targetPage).getBoundingClientRect();
      canvas.linkInternal(link.rect, pageRefs[idx], target.getBoundingClientRect().top - pb.top, pb.height);
    }
  }
}

function buildOutline(pdf: PDFDocument, items: OutlineItem[], pageRefs: PDFRef[], pageEls: HTMLElement[]): void {
  if (items.length === 0) return;
  const ctx = pdf.context;
  interface Node {
    item: OutlineItem;
    ref: PDFRef;
    children: Node[];
  }
  const K = 72 / 96;
  const rootRef = ctx.nextRef();
  const nodes: Node[] = [];
  const stack: Node[] = [];
  for (const item of items) {
    const node: Node = { item, ref: ctx.nextRef(), children: [] };
    while (stack.length && stack[stack.length - 1].item.level >= item.level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else nodes.push(node);
    stack.push(node);
  }

  const emit = (list: Node[], parent: PDFRef): void => {
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const pageBox = (pageEls[n.item.pageIndex].querySelector(".pagedjs_pagebox") ?? pageEls[n.item.pageIndex]).getBoundingClientRect();
      const destY = (pageBox.height - n.item.cssY) * K + 14;
      const dict: Record<string, unknown> = {
        Title: PDFHexString.fromText(n.item.title),
        Parent: parent,
        Dest: [pageRefs[n.item.pageIndex], "XYZ", null, destY, null],
      };
      if (i > 0) dict.Prev = list[i - 1].ref;
      if (i < list.length - 1) dict.Next = list[i + 1].ref;
      if (n.children.length) {
        dict.First = n.children[0].ref;
        dict.Last = n.children[n.children.length - 1].ref;
        dict.Count = n.children.length;
        emit(n.children, n.ref);
      }
      ctx.assign(n.ref, ctx.obj(dict as never));
    }
  };
  emit(nodes, rootRef);
  ctx.assign(
    rootRef,
    ctx.obj({ Type: "Outlines", First: nodes[0].ref, Last: nodes[nodes.length - 1].ref, Count: items.length }),
  );
  pdf.catalog.set(PDFName.of("Outlines"), rootRef);
}

/* ── the walker ────────────────────────────────────────────────────── */

class Transcriber {
  private range: Range;

  constructor(
    private win: Window,
    private canvas: PageCanvas,
    private pageOrigin: { x: number; y: number },
    private pageIndex: number,
    private links: PendingLink[],
    private warnings: string[],
    private fonts: FontResolver,
    private runStats: { total: number; failed: number },
  ) {
    this.range = win.document.createRange();
  }

  private toPage(r: DOMRect): { x: number; y: number; w: number; h: number } {
    return { x: r.left - this.pageOrigin.x, y: r.top - this.pageOrigin.y, w: r.width, h: r.height };
  }

  async walk(el: Element, ctx: WalkCtx): Promise<void> {
    if (SKIP_TAGS.has(el.tagName)) return;
    const cs = this.win.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;

    const opacity = ctx.opacity * (parseFloat(cs.opacity) || 1);
    if (opacity < 0.004) return;

    // CSS transforms: measure the subtree untransformed and replay the
    // matrix as a PDF transform (origin-adjusted).
    if (cs.transform && cs.transform !== "none") {
      const m = parseCssMatrix(cs.transform);
      const htmlEl = el as HTMLElement;
      const prior = htmlEl.style.transform;
      htmlEl.style.transform = "none";
      try {
        const rectU = el.getBoundingClientRect();
        const [ox, oy] = cs.transformOrigin.split(" ").map((v) => parseFloat(v));
        const ax = rectU.left - this.pageOrigin.x + (ox || 0);
        const ay = rectU.top - this.pageOrigin.y + (oy || 0);
        const full = multiply(multiply(translation(ax, ay), m), translation(-ax, -ay));
        this.canvas.save();
        this.canvas.transform(full);
        await this.walkInner(el, cs, { ...ctx, opacity });
      } finally {
        this.canvas.restore();
        htmlEl.style.transform = prior;
      }
      return;
    }

    await this.walkInner(el, cs, { ...ctx, opacity });
  }

  private async walkInner(el: Element, cs: CSSStyleDeclaration, ctx: WalkCtx): Promise<void> {
    const tag = el.tagName.toLowerCase();

    if (tag === "svg") {
      transcribeSvg(el as SVGSVGElement, this.canvas, this.pageOrigin, ctx.opacity);
      return;
    }
    if (tag === "img") {
      await this.drawImage(el as HTMLImageElement, cs, ctx);
      return;
    }
    if (tag === "input" && (el as HTMLInputElement).type === "checkbox") {
      this.drawCheckbox(el as HTMLInputElement, cs, ctx);
      return;
    }

    const isInline = cs.display === "inline";
    const boxes = isInline ? [...el.getClientRects()] : [el.getBoundingClientRect()];
    const radii: CornerRadii = isInline
      ? [0, 0, 0, 0]
      : [
          parseFloat(cs.borderTopLeftRadius) || 0,
          parseFloat(cs.borderTopRightRadius) || 0,
          parseFloat(cs.borderBottomRightRadius) || 0,
          parseFloat(cs.borderBottomLeftRadius) || 0,
        ];

    for (const raw of boxes) {
      if (raw.width <= 0 || raw.height <= 0) continue;
      const b = this.toPage(raw);
      this.paintBackground(cs, b, radii, ctx.opacity);
      this.paintBorders(cs, b, radii, ctx.opacity);
    }

    // Track link areas (rectangles per fragment).
    const href = tag === "a" ? (el as HTMLAnchorElement).getAttribute("href") : null;
    if (href) {
      for (const raw of el.getClientRects()) {
        if (raw.width > 0 && raw.height > 0) {
          this.links.push({ pageIndex: this.pageIndex, rect: this.toPage(raw), href });
        }
      }
    }

    // Decorations propagate to descendant text.
    const decorations = ctx.decorations;
    let nextDecorations = decorations;
    const decoLine = cs.textDecorationLine;
    if (decoLine && decoLine !== "none") {
      const color = parseColor(cs.textDecorationColor) ?? parseColor(cs.color)!;
      const thickness = cs.textDecorationThickness && cs.textDecorationThickness.endsWith("px")
        ? parseFloat(cs.textDecorationThickness)
        : null;
      nextDecorations = [...decorations];
      for (const line of decoLine.split(" ")) {
        if (line === "underline" || line === "line-through") {
          nextDecorations.push({ line, color, thickness });
        }
      }
    }

    // Clip children when the element hides overflow.
    const clips = !isInline && cs.overflow !== "visible" && boxes[0].width > 0;
    if (clips) {
      const b = this.toPage(boxes[0]);
      this.canvas.save();
      this.canvas.clipPath(roundedRectPath(b.x, b.y, b.w, b.h, radii));
    }

    const childCtx: WalkCtx = { opacity: ctx.opacity, decorations: nextDecorations };
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        await this.emitText(node as Text, cs, childCtx);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        await this.walk(node as Element, childCtx);
      }
    }

    if (clips) this.canvas.restore();
  }

  /* ── boxes ── */

  private paintBackground(cs: CSSStyleDeclaration, b: { x: number; y: number; w: number; h: number }, radii: CornerRadii, opacity: number): void {
    const path = roundedRectPath(b.x, b.y, b.w, b.h, radii);
    const bg = parseColor(cs.backgroundColor);
    if (isVisible(bg)) this.canvas.fillPath(path, bg, opacity);
    if (cs.backgroundImage && cs.backgroundImage !== "none") {
      // Layers are listed top-first in CSS; paint bottom-up.
      for (const layer of splitLayers(cs.backgroundImage).reverse()) {
        const spec = parseGradient(layer, b.w, b.h);
        if (spec) this.canvas.paintGradient(spec, path, b, opacity);
        else if (!layer.startsWith("url(")) this.warn(`unsupported background: ${layer.slice(0, 60)}`);
      }
    }
  }

  private paintBorders(cs: CSSStyleDeclaration, b: { x: number; y: number; w: number; h: number }, radii: CornerRadii, opacity: number): void {
    interface Side {
      w: number;
      style: string;
      color: Rgba | null;
      path: () => PathPoint[];
    }
    const wTop = parseFloat(cs.borderTopWidth) || 0;
    const wRight = parseFloat(cs.borderRightWidth) || 0;
    const wBottom = parseFloat(cs.borderBottomWidth) || 0;
    const wLeft = parseFloat(cs.borderLeftWidth) || 0;
    if (wTop <= 0 && wRight <= 0 && wBottom <= 0 && wLeft <= 0) return;

    const sides: Side[] = [
      { w: wTop, style: cs.borderTopStyle, color: parseColor(cs.borderTopColor), path: () => [{ op: "M", x: b.x, y: b.y + wTop / 2 }, { op: "L", x: b.x + b.w, y: b.y + wTop / 2 }] },
      { w: wRight, style: cs.borderRightStyle, color: parseColor(cs.borderRightColor), path: () => [{ op: "M", x: b.x + b.w - wRight / 2, y: b.y }, { op: "L", x: b.x + b.w - wRight / 2, y: b.y + b.h }] },
      { w: wBottom, style: cs.borderBottomStyle, color: parseColor(cs.borderBottomColor), path: () => [{ op: "M", x: b.x, y: b.y + b.h - wBottom / 2 }, { op: "L", x: b.x + b.w, y: b.y + b.h - wBottom / 2 }] },
      { w: wLeft, style: cs.borderLeftStyle, color: parseColor(cs.borderLeftColor), path: () => [{ op: "M", x: b.x + wLeft / 2, y: b.y }, { op: "L", x: b.x + wLeft / 2, y: b.y + b.h }] },
    ];
    const active = sides.filter((s) => s.w > 0 && s.style !== "none" && s.style !== "hidden" && isVisible(s.color));
    if (active.length === 0) return;

    const dashFor = (s: Side): number[] | undefined =>
      s.style === "dashed" ? [s.w * 3, s.w * 3] : s.style === "dotted" ? [0.01, s.w * 2] : undefined;
    const capFor = (s: Side): StrokeStyle["cap"] => (s.style === "dotted" ? "round" : "butt");

    const uniform =
      active.length === 4 &&
      active.every((s) => s.w === active[0].w && s.style === active[0].style &&
        JSON.stringify(s.color) === JSON.stringify(active[0].color));

    if (uniform) {
      const s = active[0];
      const inset = s.w / 2;
      const innerRadii = radii.map((r) => Math.max(0, r - inset)) as CornerRadii;
      this.canvas.strokePath(
        roundedRectPath(b.x + inset, b.y + inset, b.w - s.w, b.h - s.w, innerRadii),
        s.color!,
        { width: s.w, dash: dashFor(s), cap: capFor(s), join: "miter" },
        opacity,
      );
      return;
    }
    for (const s of active) {
      this.canvas.strokePath(s.path(), s.color!, { width: s.w, dash: dashFor(s), cap: capFor(s) }, opacity);
    }
  }

  /* ── replaced elements ── */

  private async drawImage(img: HTMLImageElement, cs: CSSStyleDeclaration, ctx: WalkCtx): Promise<void> {
    const rect = this.toPage(img.getBoundingClientRect());
    if (rect.w <= 0 || rect.h <= 0) return;
    try {
      const res = await fetch(img.currentSrc || img.src);
      if (!res.ok) throw new Error(String(res.status));
      let bytes = new Uint8Array(await res.arrayBuffer());
      let kind: "png" | "jpg" | null =
        bytes[0] === 0x89 && bytes[1] === 0x50 ? "png" : bytes[0] === 0xff && bytes[1] === 0xd8 ? "jpg" : null;

      // Re-encode exotic formats and downscale oversized rasters: cap at
      // 2× the displayed CSS size (≈192 dpi in print terms).
      const maxW = Math.ceil(rect.w * 2);
      if (!kind || img.naturalWidth > maxW * 1.25) {
        const scale = Math.min(1, maxW / img.naturalWidth);
        const canvas = this.win.document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const c2d = canvas.getContext("2d")!;
        c2d.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, kind === "png" ? "image/png" : "image/jpeg", 0.85));
        if (!blob) throw new Error("re-encode failed");
        bytes = new Uint8Array(await blob.arrayBuffer());
        kind = kind === "png" ? "png" : "jpg";
      }
      await this.canvas.drawImage(bytes, kind, rect.x, rect.y, rect.w, rect.h, ctx.opacity);
      const radius = parseFloat(cs.borderTopLeftRadius) || 0;
      void radius; // image corner rounding is not clipped — acceptable for photos
    } catch (err) {
      this.warn(`image skipped (${img.src.slice(0, 60)}…): ${String(err).slice(0, 80)}`);
      this.canvas.fillPath(roundedRectPath(rect.x, rect.y, rect.w, rect.h, [4, 4, 4, 4]), { r: 0.93, g: 0.94, b: 0.95, a: 1 }, ctx.opacity);
    }
  }

  private drawCheckbox(input: HTMLInputElement, cs: CSSStyleDeclaration, ctx: WalkCtx): void {
    const rect = this.toPage(input.getBoundingClientRect());
    const size = Math.min(rect.w, rect.h);
    const x = rect.x + (rect.w - size) / 2;
    const y = rect.y + (rect.h - size) / 2;
    const accent = parseColor(cs.accentColor) ?? parseColor(cs.color) ?? { r: 0.1, g: 0.6, b: 0.55, a: 1 };
    const r: CornerRadii = [size * 0.2, size * 0.2, size * 0.2, size * 0.2];
    if (input.checked) {
      this.canvas.fillPath(roundedRectPath(x, y, size, size, r), accent, ctx.opacity);
      const check: PathPoint[] = [
        { op: "M", x: x + size * 0.24, y: y + size * 0.52 },
        { op: "L", x: x + size * 0.44, y: y + size * 0.72 },
        { op: "L", x: x + size * 0.78, y: y + size * 0.3 },
      ];
      this.canvas.strokePath(check, { r: 1, g: 1, b: 1, a: 1 }, { width: size * 0.14, cap: "round", join: "round" }, ctx.opacity);
    } else {
      this.canvas.strokePath(
        roundedRectPath(x + 0.5, y + 0.5, size - 1, size - 1, r),
        { ...accent, a: 0.8 },
        { width: 1 },
        ctx.opacity,
      );
    }
  }

  /* ── text ── */

  private async emitText(node: Text, cs: CSSStyleDeclaration, ctx: WalkCtx): Promise<void> {
    const raw = node.data;
    if (!raw || !raw.trim()) return;

    const fontSize = parseFloat(cs.fontSize);
    if (!fontSize) return;
    const stackKey = cs.fontFamily;
    const stack = stackKey.split(",");
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const italic = cs.fontStyle.includes("italic") || cs.fontStyle.includes("oblique");
    const letterSpacing = cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing) || 0;
    const color = parseColor(cs.color) ?? { r: 0, g: 0, b: 0, a: 1 };
    const textTransform = cs.textTransform;

    for (const token of raw.matchAll(/\S+/g)) {
      const start = token.index!;
      const text = token[0];
      // Split the token into runs of a single concrete face.
      let runStart = 0;
      let runFace: LoadedFace | null | undefined;
      const flush = async (endIdx: number) => {
        if (endIdx <= runStart) return;
        await this.drawRun(node, start + runStart, start + endIdx, text.slice(runStart, endIdx), runFace ?? null, {
          fontSize, color, letterSpacing, textTransform, ctx, cs,
        });
        runStart = endIdx;
      };
      let idx = 0;
      for (const ch of text) {
        const cp = ch.codePointAt(0)!;
        // Hot loop: probe the synchronous memo first — awaiting the
        // resolver allocates a microtask per character otherwise.
        let face = this.fonts.cached(stackKey, weight, italic, cp);
        if (face === undefined) face = await this.fonts.resolve(stack, weight, italic, cp, stackKey);
        if (runFace === undefined) runFace = face;
        else if (face !== runFace) {
          await flush(idx);
          runFace = face;
        }
        idx += ch.length;
      }
      await flush(text.length);
    }
  }

  private async drawRun(
    node: Text,
    from: number,
    to: number,
    text: string,
    face: LoadedFace | null,
    opt: { fontSize: number; color: Rgba; letterSpacing: number; textTransform: string; ctx: WalkCtx; cs: CSSStyleDeclaration },
  ): Promise<void> {
    if (!face) {
      this.warn(`no font for "${text.slice(0, 20)}"`);
      return;
    }
    this.range.setStart(node, from);
    this.range.setEnd(node, to);
    const rects = [...this.range.getClientRects()].filter((r) => r.width > 0);
    if (rects.length === 0) return;
    this.runStats.total++;

    const drawAt = (str: string, rect: DOMRect) => {
      const baseline = rect.top - this.pageOrigin.y + face.ascent * opt.fontSize;
      const x = rect.left - this.pageOrigin.x;
      this.canvas.drawText(
        applyTransform(str, opt.textTransform),
        x,
        baseline,
        face,
        opt.fontSize,
        opt.color,
        opt.ctx.opacity,
        opt.letterSpacing,
        face.def.italic === false && (opt.cs.fontStyle.includes("italic") || opt.cs.fontStyle.includes("oblique")),
      );
      this.drawDecorations(rect, face, opt);
    };

    // One exotic glyph must not abort the whole export into the print
    // fallback — record the miss and keep transcribing; the caller decides
    // whether failures were widespread enough to abort.
    try {
      if (rects.length === 1 && opt.letterSpacing === 0) {
        // pdf-lib's encodeText lays glyphs out with the font's raw,
        // un-kerned advance widths — it doesn't replay GPOS kerning
        // pairs the way the browser does. Measured directly: a short,
        // heavily-kerned pair ("To", "Ta") can land 2-3px wider than the
        // browser rendered it at heading sizes, visible as the pair
        // reading loosely spaced against its neighbors. But kerning
        // divergence *accumulates* across a run's length, not just its
        // "badness" — an ordinary 11-letter word like "Fundamental"
        // measured a similar 3.4px total divergence despite having no
        // single dramatic pair and looking visually fine, because that
        // divergence is spread thin across many small pair adjustments
        // instead of concentrated in one visible gap. A whole-run
        // width-divergence check can't tell those two cases apart, so
        // checking it for every run (this session's first attempt)
        // sent the *majority* of multi-syllable words through the
        // character-by-character fallback below — each character its
        // own PDF text-positioning operator instead of one per word —
        // measurably inflating both export time and file size on real
        // documents. Limiting the check to short runs targets exactly
        // the case it was meant for (a single dominant pair, most
        // visible as the first few characters of a word) without
        // paying for it on the long words that make up most real text.
        const KERNING_CHECK_MAX_LEN = 6;
        let useFastPath = true;
        if (text.length <= KERNING_CHECK_MAX_LEN) {
          const predicted = face.pdfFont.widthOfTextAtSize(text, opt.fontSize);
          useFastPath = Math.abs(predicted - rects[0].width) < 0.15;
        }
        if (useFastPath) {
          drawAt(text, rects[0]);
          return;
        }
      }
      // Letter-spaced, kerning-diverged, or fragmented runs: position
      // character by character with exact browser rects.
      let idx = from;
      for (const ch of text) {
        this.range.setStart(node, idx);
        this.range.setEnd(node, idx + ch.length);
        const r = this.range.getClientRects()[0];
        if (r && r.width >= 0) drawAt(ch, r);
        idx += ch.length;
      }
    } catch (err) {
      this.runStats.failed++;
      this.warn(`text run failed ("${text.slice(0, 20)}"): ${String(err).slice(0, 100)}`);
    }
  }

  private drawDecorations(
    rect: DOMRect,
    face: LoadedFace,
    opt: { fontSize: number; ctx: WalkCtx },
  ): void {
    for (const deco of opt.ctx.decorations) {
      const baseline = rect.top - this.pageOrigin.y + face.ascent * opt.fontSize;
      const thickness = deco.thickness ?? Math.max(0.6, face.underlineThickness * opt.fontSize);
      const y = deco.line === "underline"
        ? baseline - face.underlinePosition * opt.fontSize + thickness / 2
        : baseline - 0.3 * opt.fontSize;
      this.canvas.strokePath(
        [
          { op: "M", x: rect.left - this.pageOrigin.x, y },
          { op: "L", x: rect.right - this.pageOrigin.x, y },
        ],
        deco.color,
        { width: thickness },
        opt.ctx.opacity,
      );
    }
  }

  private warn(msg: string): void {
    if (this.warnings.length < 40 && !this.warnings.includes(msg)) this.warnings.push(msg);
  }
}

/* ── small utilities ───────────────────────────────────────────────── */

function splitLayers(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
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

function applyTransform(text: string, transform: string): string {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") return text.replace(/(^|\s)(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());
  return text;
}
