import type { EditorView } from "@codemirror/view";
import { type FigureAttrs, parseFigureAttrs, serializeFigureAttrs } from "../../markdown/figure";

/**
 * Recognizes a Markdown source line that is *only* a standalone image
 * (the shape `renderer.ts`'s `studio_figures` rule turns into a
 * `<figure>`) so the editor can offer layout/style controls without
 * touching the renderer or the PDF engine. The attribute grammar is owned
 * by markdown/figure.ts, so what the controls write is exactly what the
 * renderer reads back.
 */
const IMAGE_LINE_RE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)(?:\s*\{([^}]*)\})?\s*$/;

export interface ImageLineInfo extends FigureAttrs {
  line: number;
  alt: string;
  src: string;
  title: string;
}

/** Fields the image controls can patch on a line. */
export type ImageLinePatch = Partial<FigureAttrs & { src: string; title: string }>;

/** Reads the line at `lineNumber`, returning image details if it matches
    the standalone-figure shape, else null. */
export function parseImageLine(view: EditorView, lineNumber: number): ImageLineInfo | null {
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) return null;
  const text = view.state.doc.line(lineNumber).text;
  const m = IMAGE_LINE_RE.exec(text);
  if (!m) return null;
  const attrs = parseFigureAttrs(m[4] ?? "");
  return { ...attrs, line: lineNumber, alt: m[1], src: m[2], title: m[3] ?? "" };
}

/** Rewrites the image line with a patched layout/style/src/caption,
    preserving the alt text and any attribute this UI doesn't own.
    `opts.focus: false` keeps focus where it is — the width slider patches
    live while dragging, and yanking focus to the editor mid-drag would
    end the drag. */
export function patchImageLine(view: EditorView, lineNumber: number, patch: ImageLinePatch, opts: { focus?: boolean } = {}): void {
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) return;
  const line = view.state.doc.line(lineNumber);
  const m = IMAGE_LINE_RE.exec(line.text);
  if (!m) return;
  const [, alt, srcCur, titleCur] = m;
  const attrs = parseFigureAttrs(m[4] ?? "");
  const next: FigureAttrs = {
    width: patch.width ?? attrs.width,
    align: patch.align ?? attrs.align,
    gap: patch.gap ?? attrs.gap,
    border: patch.border ?? attrs.border,
    round: patch.round ?? attrs.round,
    shadow: patch.shadow ?? attrs.shadow,
    cover: patch.cover ?? attrs.cover,
  };
  const src = patch.src ?? srcCur;
  const title = patch.title !== undefined ? patch.title : titleCur ?? "";
  const attrsOut = serializeFigureAttrs(next);
  const titlePart = title ? ` "${title.replace(/"/g, "'")}"` : "";
  const newText = `![${alt}](${src}${titlePart})${attrsOut ? `{${attrsOut}}` : ""}`;
  view.dispatch({ changes: { from: line.from, to: line.to, insert: newText } });
  if (opts.focus !== false) view.focus();
}

/** Removes the image line, merging away the one blank line it was
    padded with so a delete doesn't leave a growing gap behind. */
export function removeImageLine(view: EditorView, lineNumber: number): void {
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) return;
  const line = view.state.doc.line(lineNumber);
  const hasNext = lineNumber < view.state.doc.lines;
  const from = line.from;
  const to = hasNext ? view.state.doc.line(lineNumber + 1).from : line.to;
  view.dispatch({ changes: { from, to } });
  view.focus();
}
