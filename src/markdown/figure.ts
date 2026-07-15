/**
 * Shared parsing/serialization for a standalone image's layout attributes
 * — the `{width=… align=… border round shadow gap=…}` block that trails a
 * figure image (see renderer.ts § studio_figures). One module so the
 * Markdown renderer and the in-editor image controls (imageLine.ts) never
 * drift on what an attribute means or how it's written back.
 *
 * The vocabulary is deliberately small and backward compatible: legacy
 * `{width=60% align=left}` (and `fit=cover`) parse unchanged; the new
 * book-layout options (float-wrap left/right, full-width, border, rounded
 * corners, light shadow, spacing) are additive.
 */

export type FigureAlign = "left" | "center" | "right" | "full";
export type FigureGap = "" | "sm" | "md" | "lg";

export interface FigureAttrs {
  /** CSS length ("60%", "220px", …) or "" for the image's natural size. */
  width: string;
  /** left/right float-wrap · center block · full column width. */
  align: FigureAlign;
  /** Spacing around the figure ("" = the default rhythm). */
  gap: FigureGap;
  border: boolean;
  /** Pronounced rounded corners (the base figure keeps a subtle radius). */
  round: boolean;
  shadow: boolean;
  /** Legacy `fit=cover` — crop to a 16:9 band rather than show whole. */
  cover: boolean;
}

export const DEFAULT_FIGURE_ATTRS: FigureAttrs = {
  width: "",
  align: "center",
  gap: "",
  border: false,
  round: false,
  shadow: false,
  cover: false,
};

const ALIGNS = new Set<FigureAlign>(["left", "center", "right", "full"]);
const GAPS = new Set<FigureGap>(["sm", "md", "lg"]);

/** Normalizes an author-typed size to a safe CSS length, or null if it
    isn't one (so a stray token never reaches an inline style). */
export function cssLen(v: string): string | null {
  const m = /^(\d{1,4})(%|px|mm|cm|rem|em)?$/.exec(v.trim());
  return m ? `${m[1]}${m[2] || "px"}` : null;
}

/** A bare flag (`border`) is on; `border=0`/`border=off` turns it off. */
function flagOn(v: string): boolean {
  return v !== "0" && v !== "off" && v !== "false";
}

export function parseFigureAttrs(raw: string): FigureAttrs {
  const a: FigureAttrs = { ...DEFAULT_FIGURE_ATTRS };
  for (const part of raw.trim().split(/\s+/)) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const k = eq >= 0 ? part.slice(0, eq) : part;
    const v = eq >= 0 ? part.slice(eq + 1) : "";
    if (k === "width" || k === "w") {
      const c = cssLen(v);
      if (c) a.width = c;
    } else if (k === "align" && ALIGNS.has(v as FigureAlign)) {
      a.align = v as FigureAlign;
    } else if (k === "gap" && GAPS.has(v as FigureGap)) {
      a.gap = v as FigureGap;
    } else if (k === "fit") {
      a.cover = v === "cover";
    } else if (k === "border") {
      a.border = flagOn(v);
    } else if (k === "round") {
      a.round = flagOn(v);
    } else if (k === "shadow") {
      a.shadow = flagOn(v);
    }
  }
  return a;
}

/** Writes attrs back to the compact `{…}` form, omitting everything at its
    default so a plain image stays a plain image. Returns "" when nothing
    is set (the caller then drops the braces entirely). */
export function serializeFigureAttrs(a: FigureAttrs): string {
  const parts: string[] = [];
  if (a.width) parts.push(`width=${a.width}`);
  if (a.align !== "center") parts.push(`align=${a.align}`);
  if (a.gap) parts.push(`gap=${a.gap}`);
  if (a.border) parts.push("border");
  if (a.round) parts.push("round");
  if (a.shadow) parts.push("shadow");
  if (a.cover) parts.push("fit=cover");
  return parts.join(" ");
}

/** The figure's class list + inline style, shared so preview and PDF agree.
    `full` forces the column width regardless of the author's size. */
export function figureClass(a: FigureAttrs): string {
  const classes = ["md-figure", `md-figure--${a.align}`];
  if (a.border) classes.push("md-fig--border");
  if (a.round) classes.push("md-fig--round");
  if (a.shadow) classes.push("md-fig--shadow");
  if (a.gap) classes.push(`md-fig--gap-${a.gap}`);
  return classes.join(" ");
}
