import type { EditorView } from "@codemirror/view";

/**
 * Editing commands shared by the toolbar and the keyboard shortcuts.
 * All operate on the live CodeMirror view and keep the selection
 * useful after the edit (so repeated formatting feels natural).
 */

/** Wraps the selection in markers; toggles them off when already applied. */
export function wrapSelection(view: EditorView, before: string, after = before, placeholder = "text"): void {
  const r = view.state.selection.main;
  const selected = view.state.sliceDoc(r.from, r.to);

  // Toggle off when the selection is already wrapped.
  const outerFrom = Math.max(0, r.from - before.length);
  const outerTo = Math.min(view.state.doc.length, r.to + after.length);
  if (view.state.sliceDoc(outerFrom, r.from) === before && view.state.sliceDoc(r.to, outerTo) === after) {
    view.dispatch({
      changes: { from: outerFrom, to: outerTo, insert: selected },
      selection: { anchor: outerFrom, head: outerFrom + selected.length },
    });
    view.focus();
    return;
  }

  const txt = selected || placeholder;
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: before + txt + after },
    selection: { anchor: r.from + before.length, head: r.from + before.length + txt.length },
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

export const TABLE_SNIPPET = `| Column 1 | Column 2 | Column 3 |
|---|---|---|
| Cell | Cell | Cell |
| Cell | Cell | Cell |`;

export const CODE_SNIPPET = "```\ncode\n```";
