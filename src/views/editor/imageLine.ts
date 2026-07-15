import type { EditorView } from "@codemirror/view";

/**
 * Recognizes a Markdown source line that is *only* a standalone image
 * (the shape `renderer.ts`'s `studio_figures` rule turns into a
 * `<figure>`) so the editor can offer resize/align/replace/remove
 * controls without touching the renderer or the PDF engine.
 */
const IMAGE_LINE_RE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)(?:\s*\{([^}]*)\})?\s*$/;

export interface ImageLineInfo {
  line: number;
  alt: string;
  src: string;
  title: string;
  width: string;
  align: "left" | "center" | "right";
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const part of raw.split(/\s+/)) {
    if (!part) continue;
    const [k, v] = part.split("=");
    if (k && v) attrs[k] = v;
  }
  return attrs;
}

/** Reads the line at `lineNumber`, returning image details if it matches
    the standalone-figure shape, else null. */
export function parseImageLine(view: EditorView, lineNumber: number): ImageLineInfo | null {
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) return null;
  const text = view.state.doc.line(lineNumber).text;
  const m = IMAGE_LINE_RE.exec(text);
  if (!m) return null;
  const attrs = parseAttrs(m[4] ?? "");
  const align = attrs.align === "left" || attrs.align === "right" ? attrs.align : "center";
  return { line: lineNumber, alt: m[1], src: m[2], title: m[3] ?? "", width: attrs.width ?? "", align };
}

/** Rewrites the image line with a patched width/align/src/caption,
    preserving the alt text and any attribute this UI doesn't own. */
export function patchImageLine(view: EditorView, lineNumber: number, patch: Partial<Pick<ImageLineInfo, "width" | "align" | "src" | "title">>): void {
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) return;
  const line = view.state.doc.line(lineNumber);
  const m = IMAGE_LINE_RE.exec(line.text);
  if (!m) return;
  const [, alt, srcCur, titleCur] = m;
  const attrs = parseAttrs(m[4] ?? "");
  const width = patch.width !== undefined ? patch.width : attrs.width ?? "";
  const align = patch.align !== undefined ? patch.align : (attrs.align as string | undefined) ?? "center";
  const src = patch.src ?? srcCur;
  const title = patch.title !== undefined ? patch.title : titleCur ?? "";
  if (width) attrs.width = width;
  else delete attrs.width;
  if (align && align !== "center") attrs.align = align;
  else delete attrs.align;
  const attrsOut = Object.entries(attrs)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  const titlePart = title ? ` "${title.replace(/"/g, "'")}"` : "";
  const newText = `![${alt}](${src}${titlePart})${attrsOut ? `{${attrsOut}}` : ""}`;
  view.dispatch({ changes: { from: line.from, to: line.to, insert: newText } });
  view.focus();
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
