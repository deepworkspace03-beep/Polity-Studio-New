import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

/**
 * Highlight decorations for the Search Navigator. The panel owns the
 * matching; this extension only paints the ranges it reports — every match
 * softly, the active one strongly — so the editor mirrors the results list
 * without the navigator having to reach into CodeMirror internals. The
 * decoration set maps through document edits, so highlights track the text
 * they mark until the panel refreshes them.
 */

export interface HighlightRange {
  from: number;
  to: number;
}

export const setSearchMatches = StateEffect.define<{ ranges: HighlightRange[]; active: number }>();
export const clearSearchMatches = StateEffect.define<null>();

const matchMark = Decoration.mark({ class: "cm-nav-match" });
const activeMark = Decoration.mark({ class: "cm-nav-match cm-nav-match-active" });

export const searchHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(clearSearchMatches)) return Decoration.none;
      if (e.is(setSearchMatches)) {
        const { ranges, active } = e.value;
        const marks = ranges
          .filter((r) => r.to > r.from)
          .map((r, i) => (i === active ? activeMark : matchMark).range(r.from, r.to));
        return Decoration.set(marks, true);
      }
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});
