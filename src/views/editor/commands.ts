import type { EditorView } from "@codemirror/view";

/**
 * Editing commands shared by the toolbar and the keyboard shortcuts.
 * All operate on the live CodeMirror view and keep the selection
 * useful after the edit (so repeated formatting feels natural).
 */

/** Splits a selection's surrounding whitespace out of an inline wrap so the
    markers sit flush against visible text. markdown-it's inline rules
    (`**`, `*`, `==`, `++`, `~~`) treat a marker that touches whitespace —
    `== word ==` — as literal text, not formatting, so a selection that
    happens to include a leading/trailing space (very common when
    double-clicking or dragging) would otherwise render the raw markers
    instead of the highlight. Wrapping only the trimmed core keeps the
    applied formatting aligned exactly with the words the author picked.
    Pure and side-effect-free so it can be unit-tested without a live view. */
export function computeWrap(selected: string, before: string, after: string, placeholder: string): { insert: string; coreFrom: number; coreTo: number } {
  const lead = selected.match(/^\s*/)![0];
  const rest = selected.slice(lead.length);
  const trail = rest.match(/\s*$/)![0];
  const core = rest.slice(0, rest.length - trail.length) || placeholder;
  const coreFrom = lead.length + before.length;
  return { insert: lead + before + core + after + trail, coreFrom, coreTo: coreFrom + core.length };
}

/** Wraps the selection in markers; toggles them off when already applied. */
export function wrapSelection(view: EditorView, before: string, after = before, placeholder = "text"): void {
  const r = view.state.selection.main;
  const selected = view.state.sliceDoc(r.from, r.to);

  // Toggle off when the selection is already wrapped.
  const outerFrom = Math.max(0, r.from - before.length);
  const outerTo = Math.min(view.state.doc.length, r.to + after.length);
  if (selected && view.state.sliceDoc(outerFrom, r.from) === before && view.state.sliceDoc(r.to, outerTo) === after) {
    view.dispatch({
      changes: { from: outerFrom, to: outerTo, insert: selected },
      selection: { anchor: outerFrom, head: outerFrom + selected.length },
    });
    view.focus();
    return;
  }

  const { insert, coreFrom, coreTo } = computeWrap(selected, before, after, placeholder);
  view.dispatch({
    changes: { from: r.from, to: r.to, insert },
    selection: { anchor: r.from + coreFrom, head: r.from + coreTo },
  });
  view.focus();
}

/** Adds (or removes, when already present) a prefix on every selected line. */
export function toggleLinePrefix(view: EditorView, prefix: string, numbered = false): void {
  const r = view.state.selection.main;
  const first = view.state.doc.lineAt(r.from).number;
  const last = view.state.doc.lineAt(r.to).number;
  const changes: { from: number; to?: number; insert?: string }[] = [];
  let n = 1;
  for (let ln = first; ln <= last; ln++) {
    const line = view.state.doc.line(ln);
    if (numbered) {
      const m = line.text.match(/^\d+\.\s/);
      if (m) changes.push({ from: line.from, to: line.from + m[0].length });
      else changes.push({ from: line.from, insert: `${n++}. ` });
    } else if (line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from + prefix.length });
    } else {
      changes.push({ from: line.from, insert: prefix });
    }
  }
  view.dispatch({ changes });
  view.focus();
}

/** Replaces the current heading level (or sets one) instead of stacking #s. */
export function setHeading(view: EditorView, level: number): void {
  const r = view.state.selection.main;
  const first = view.state.doc.lineAt(r.from).number;
  const last = view.state.doc.lineAt(r.to).number;
  const changes: { from: number; to?: number; insert?: string }[] = [];
  const marker = "#".repeat(level) + " ";
  for (let ln = first; ln <= last; ln++) {
    const line = view.state.doc.line(ln);
    const m = line.text.match(/^(#{1,6})\s/);
    if (m && m[1].length === level) changes.push({ from: line.from, to: line.from + m[0].length });
    else if (m) changes.push({ from: line.from, to: line.from + m[0].length, insert: marker });
    else changes.push({ from: line.from, insert: marker });
  }
  view.dispatch({ changes });
  view.focus();
}

/** Assembles a container block around already-line-expanded selected text,
    adding the blank-line padding Markdown block syntax needs on whichever
    sides have non-blank neighbours. Pure, so the padding rules are unit-
    testable without a live editor view. */
export function buildWrappedBlock(selected: string, open: string, close: string, prevLine: string, nextLine: string): string {
  let block = `${open}\n${selected}\n${close}`;
  if (prevLine.trim()) block = "\n" + block;
  if (nextLine.trim()) block = block + "\n";
  return block;
}

/** The toolbar's block templates are selection-aware: with text selected,
    the selected lines become the block's *content* (a paragraph turns into
    the callout, the snippet becomes the code block) instead of dropping an
    empty template next to it; with no selection it inserts the placeholder
    template as before. */
export function insertWrappedBlock(view: EditorView, open: string, close: string, placeholder: string): void {
  const r = view.state.selection.main;
  if (r.empty) return insertBlock(view, `${open}\n${placeholder}\n${close}`);
  const fromLine = view.state.doc.lineAt(r.from);
  let toLine = view.state.doc.lineAt(r.to);
  // A whole-line selection usually ends at the *start* of the next line —
  // that line isn't part of what the author selected, so don't wrap it.
  if (r.to === toLine.from && toLine.number > fromLine.number) toLine = view.state.doc.line(toLine.number - 1);
  const selected = view.state.sliceDoc(fromLine.from, toLine.to);
  const prev = fromLine.number > 1 ? view.state.doc.line(fromLine.number - 1).text : "";
  const next = toLine.number < view.state.doc.lines ? view.state.doc.line(toLine.number + 1).text : "";
  const insert = buildWrappedBlock(selected, open, close, prev, next);
  view.dispatch({
    changes: { from: fromLine.from, to: toLine.to, insert },
    selection: { anchor: fromLine.from + insert.length },
  });
  view.focus();
}

/** Inserts a block after the current line, with a blank line around it. */
export function insertBlock(view: EditorView, block: string): void {
  const line = view.state.doc.lineAt(view.state.selection.main.from);
  const lead = line.length ? "\n\n" : "";
  const insert = `${lead}${block}\n`;
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length },
  });
  view.focus();
}

export function insertLink(view: EditorView): void {
  const r = view.state.selection.main;
  const selected = view.state.sliceDoc(r.from, r.to);
  const isUrl = /^https?:\/\//i.test(selected);
  const text = isUrl ? "link text" : selected || "link text";
  const url = isUrl ? selected : "https://";
  const insert = `[${text}](${url})`;
  const anchor = isUrl ? r.from + 1 : r.from + insert.length - url.length - 1;
  const head = isUrl ? r.from + 1 + text.length : r.from + insert.length - 1;
  view.dispatch({ changes: { from: r.from, to: r.to, insert }, selection: { anchor, head } });
  view.focus();
}

/** Strips inline formatting markers from the selection. */
export function clearFormatting(view: EditorView): void {
  const r = view.state.selection.main;
  if (r.empty) return;
  const cleaned = view.state
    .sliceDoc(r.from, r.to)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/\+\+([^+]+)\+\+/g, "$1")
    .replace(/~([^~\s][^~]*)~/g, "$1")
    .replace(/\^([^^\s][^^]*)\^/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: cleaned },
    selection: { anchor: r.from, head: r.from + cleaned.length },
  });
  view.focus();
}

/** Copies the entire document to the clipboard, leaving it untouched. */
export async function copyAll(view: EditorView): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(view.state.doc.toString());
    view.focus();
    return true;
  } catch {
    return false;
  }
}

/** Copies the entire document, then clears it — only once the copy has
    actually landed on the clipboard, so a permission failure never
    destroys content the author can't get back. */
export async function cutAll(view: EditorView): Promise<"empty" | "denied" | "ok"> {
  const text = view.state.doc.toString();
  if (!text) return "empty";
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return "denied";
  }
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" } });
  view.focus();
  return "ok";
}

/** Reads the system clipboard and inserts it at the cursor, routed
    through the same plain-text tidy/question-bank detection as a native
    paste (Ctrl+V) — for touch users without an easy paste gesture. */
export async function pasteFromClipboard(view: EditorView, convert: (text: string) => string | null): Promise<"empty" | "denied" | "ok"> {
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return "denied";
  }
  if (!text) return "empty";
  const markdown = convert(text) ?? text;
  view.dispatch({ ...view.state.replaceSelection(markdown), scrollIntoView: true });
  view.focus();
  return "ok";
}

/** Replaces the entire document with the clipboard's text contents —
    distinct from Paste, which inserts at the cursor. Callers are expected
    to confirm with the author first when the document isn't empty. */
export async function replaceAllFromClipboard(view: EditorView, convert: (text: string) => string | null): Promise<"empty" | "denied" | "ok"> {
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return "denied";
  }
  if (!text) return "empty";
  const markdown = convert(text) ?? text;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: markdown } });
  view.focus();
  return "ok";
}

export const TABLE_SNIPPET = `| Column 1 | Column 2 | Column 3 |
|---|---|---|
| Cell | Cell | Cell |
| Cell | Cell | Cell |`;
