import { useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import { IconButton } from "../../components/ui";
import { Icon, type IconName } from "../../components/Icon";
import { CALLOUTS } from "../../markdown/renderer";

/* ── Editing helpers (operate on the live CodeMirror view) ─────────── */

function wrap(view: EditorView, before: string, after = before, ph = "text") {
  const r = view.state.selection.main;
  const txt = view.state.sliceDoc(r.from, r.to) || ph;
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: before + txt + after },
    selection: { anchor: r.from + before.length, head: r.from + before.length + txt.length },
  });
  view.focus();
}

function linePrefix(view: EditorView, prefix: string, numbered = false) {
  const r = view.state.selection.main;
  const first = view.state.doc.lineAt(r.from).number;
  const last = view.state.doc.lineAt(r.to).number;
  const changes: { from: number; to?: number; insert?: string }[] = [];
  let n = 1;
  for (let ln = first; ln <= last; ln++) {
    const line = view.state.doc.line(ln);
    if (!numbered && line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from + prefix.length });
    } else {
      changes.push({ from: line.from, insert: numbered ? `${n++}. ` : prefix });
    }
  }
  view.dispatch({ changes });
  view.focus();
}

function insertBlock(view: EditorView, block: string) {
  const line = view.state.doc.lineAt(view.state.selection.main.from);
  const lead = line.length ? "\n\n" : "";
  const insert = `${lead}${block}\n`;
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length },
  });
  view.focus();
}

const TABLE_SNIPPET = `| Column 1 | Column 2 | Column 3 |
|---|---|---|
| Cell | Cell | Cell |
| Cell | Cell | Cell |`;

/* ── Toolbar ───────────────────────────────────────────────────────── */

interface Action {
  id: string;
  icon: IconName;
  label: string;
  run: (view: EditorView) => void;
}

const ACTIONS: Action[] = [
  { id: "h1", icon: "h1", label: "Heading 1", run: (v) => linePrefix(v, "# ") },
  { id: "h2", icon: "h2", label: "Heading 2", run: (v) => linePrefix(v, "## ") },
  { id: "h3", icon: "h3", label: "Heading 3", run: (v) => linePrefix(v, "### ") },
  { id: "bold", icon: "bold", label: "Bold", run: (v) => wrap(v, "**") },
  { id: "italic", icon: "italic", label: "Italic", run: (v) => wrap(v, "*") },
  { id: "quote", icon: "quote", label: "Quote", run: (v) => linePrefix(v, "> ") },
  { id: "list", icon: "list", label: "Bullet list", run: (v) => linePrefix(v, "- ") },
  { id: "listOrdered", icon: "listOrdered", label: "Numbered list", run: (v) => linePrefix(v, "", true) },
  { id: "table", icon: "table", label: "Insert table", run: (v) => insertBlock(v, TABLE_SNIPPET) },
  { id: "pagebreak", icon: "pagebreak", label: "Page break", run: (v) => insertBlock(v, "\\pagebreak") },
];

export function Toolbar({ getView }: { getView: () => EditorView | null }) {
  const [calloutsOpen, setCalloutsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!calloutsOpen) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setCalloutsOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [calloutsOpen]);

  const withView = (fn: (v: EditorView) => void) => () => {
    const view = getView();
    if (view) fn(view);
  };

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-edge bg-surface px-1.5 py-1 [scrollbar-width:none]">
      <IconButton label="Undo" name="undo" onClick={withView((v) => undo(v))} />
      <IconButton label="Redo" name="redo" onClick={withView((v) => redo(v))} />
      <span className="mx-1 h-5 w-px flex-none bg-edge" />
      {ACTIONS.map((a) => (
        <IconButton key={a.id} label={a.label} name={a.icon} onClick={withView(a.run)} />
      ))}
      <div className="relative" ref={menuRef}>
        <button
          title="Insert callout"
          aria-label="Insert callout"
          aria-expanded={calloutsOpen}
          onClick={() => setCalloutsOpen((v) => !v)}
          className="flex items-center gap-1 rounded-lg p-2 text-ink-2 transition-colors hover:bg-raised hover:text-ink"
        >
          <Icon name="callout" size={16} />
          <Icon name="chevronDown" size={11} />
        </button>
        {calloutsOpen && (
          <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-xl border border-edge bg-surface py-1 shadow-xl">
            {Object.entries(CALLOUTS).map(([type, def]) => (
              <button
                key={type}
                onClick={() => {
                  setCalloutsOpen(false);
                  withView((v) => insertBlock(v, `::: ${type}\nYour text here.\n:::`))();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-raised"
              >
                <span className="h-4 w-4 text-accent [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: def.icon }} />
                {def.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
