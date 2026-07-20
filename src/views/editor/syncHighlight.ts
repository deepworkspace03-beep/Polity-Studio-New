import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

/**
 * Preview → editor sync highlight. When the reader clicks a sourced element
 * in either preview (flow or paged), the host moves the cursor to that
 * element's source line and calls `flashLine` to (a) scroll that line to a
 * comfortable reading band and (b) flash a full-width highlight on it — the
 * exact mirror of the editor → preview direction, which centres the target
 * and pulses `.preview-here` inside the iframe. Before this, preview → editor
 * relied on CodeMirror's default `scrollIntoView` ("nearest"), which does
 * nothing when the line is already on screen and never highlights, so the
 * click felt like it did nothing — the reliability bug this fixes at root.
 *
 * The decoration is a line decoration (not a mark) so the whole editor line
 * pulses regardless of wrapping, and it maps through edits and self-clears,
 * so it never lingers or fights a real selection.
 */

const setSyncLine = StateEffect.define<number>(); // 1-based line, 0 = clear
const lineDeco = Decoration.line({ class: "cm-sync-here" });

export const syncHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setSyncLine)) {
        if (e.value <= 0 || e.value > tr.state.doc.lines) return Decoration.none;
        const from = tr.state.doc.line(e.value).from;
        return Decoration.set([lineDeco.range(from)]);
      }
    }
    // Any document edit drops the flash — it marks a moment, not a range.
    return tr.docChanged ? Decoration.none : deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

const timers = new WeakMap<EditorView, ReturnType<typeof setTimeout>>();

/** Move the cursor to `line`, scroll it into a comfortable band and flash it.
    `focus` is false when the click landed on an inline-editable element in
    the flow preview, so moving DOM focus to CodeMirror won't blur the
    contenteditable the reader just entered. */
export function flashLine(view: EditorView, line: number, focus: boolean): void {
  const ln = Math.max(1, Math.min(view.state.doc.lines, line));
  const pos = view.state.doc.line(ln).from;
  view.dispatch({
    selection: { anchor: pos },
    effects: [setSyncLine.of(ln), EditorView.scrollIntoView(pos, { y: "center" })],
  });
  if (focus) requestAnimationFrame(() => view.focus());

  const prev = timers.get(view);
  if (prev) clearTimeout(prev);
  timers.set(
    view,
    setTimeout(() => {
      // Guard against a destroyed view (document switch mid-flash).
      try {
        view.dispatch({ effects: setSyncLine.of(0) });
      } catch {
        /* view gone */
      }
      timers.delete(view);
    }, 1600),
  );
}
