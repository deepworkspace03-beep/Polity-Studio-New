import { Fragment, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import { IconButton } from "../../components/ui";
import { Icon, type IconName } from "../../components/Icon";
import { CALLOUTS } from "../../markdown/renderer";
import {
  CODE_SNIPPET,
  TABLE_SNIPPET,
  clearFormatting,
  insertBlock,
  insertLink,
  setHeading,
  toggleLinePrefix,
  wrapSelection,
} from "./commands";

/**
 * Formatting toolbar — grouped, tooltipped, fully keyboard-reachable.
 * Every action is a thin call into commands.ts so the same operations
 * back the keyboard shortcuts.
 */

interface Action {
  id: string;
  icon: IconName;
  label: string;
  run: (view: EditorView) => void;
}

const GROUPS: Action[][] = [
  [
    { id: "undo", icon: "undo", label: "Undo (Ctrl+Z)", run: (v) => void undo(v) },
    { id: "redo", icon: "redo", label: "Redo (Ctrl+Y)", run: (v) => void redo(v) },
  ],
  [
    { id: "h1", icon: "h1", label: "Chapter heading", run: (v) => setHeading(v, 1) },
    { id: "h2", icon: "h2", label: "Section heading", run: (v) => setHeading(v, 2) },
    { id: "h3", icon: "h3", label: "Subsection heading", run: (v) => setHeading(v, 3) },
  ],
  [
    { id: "bold", icon: "bold", label: "Bold (Ctrl+B)", run: (v) => wrapSelection(v, "**") },
    { id: "italic", icon: "italic", label: "Italic (Ctrl+I)", run: (v) => wrapSelection(v, "*") },
    { id: "underline", icon: "underline", label: "Underline (Ctrl+U)", run: (v) => wrapSelection(v, "++") },
    { id: "highlight", icon: "highlighter", label: "Highlight (Ctrl+Shift+H)", run: (v) => wrapSelection(v, "==") },
    { id: "strike", icon: "strikethrough", label: "Strikethrough", run: (v) => wrapSelection(v, "~~") },
    { id: "sup", icon: "superscript", label: "Superscript — x^2^", run: (v) => wrapSelection(v, "^", "^", "2") },
    { id: "sub", icon: "subscript", label: "Subscript — H~2~O", run: (v) => wrapSelection(v, "~", "~", "2") },
    { id: "codeInline", icon: "code", label: "Inline code", run: (v) => wrapSelection(v, "`") },
    { id: "clear", icon: "eraser", label: "Clear formatting from selection", run: clearFormatting },
  ],
  [
    { id: "list", icon: "list", label: "Bullet list", run: (v) => toggleLinePrefix(v, "- ") },
    { id: "listOrdered", icon: "listOrdered", label: "Numbered list", run: (v) => toggleLinePrefix(v, "", true) },
    { id: "checklist", icon: "checklist", label: "Checklist", run: (v) => toggleLinePrefix(v, "- [ ] ") },
    { id: "quote", icon: "quote", label: "Quote", run: (v) => toggleLinePrefix(v, "> ") },
  ],
  [
    { id: "link", icon: "link", label: "Link (Ctrl+K)", run: insertLink },
    { id: "table", icon: "table", label: "Insert table", run: (v) => insertBlock(v, TABLE_SNIPPET) },
    { id: "codeBlock", icon: "file", label: "Code block", run: (v) => insertBlock(v, CODE_SNIPPET) },
    { id: "hr", icon: "minus", label: "Divider line", run: (v) => insertBlock(v, "---") },
    { id: "pagebreak", icon: "pagebreak", label: "Page break (starts a new PDF page)", run: (v) => insertBlock(v, "\\pagebreak") },
  ],
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
      {GROUPS.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <span className="mx-1 h-5 w-px flex-none bg-edge" />}
          {group.map((a) => (
            <IconButton key={a.id} label={a.label} name={a.icon} onClick={withView(a.run)} />
          ))}
        </Fragment>
      ))}
      <div className="relative" ref={menuRef}>
        <button
          title="Insert callout box"
          aria-label="Insert callout box"
          aria-expanded={calloutsOpen}
          onClick={() => setCalloutsOpen((v) => !v)}
          className="flex items-center gap-1 rounded-lg p-2 text-ink-2 transition-colors hover:bg-raised hover:text-ink"
        >
          <Icon name="callout" size={16} />
          <Icon name="chevronDown" size={11} />
        </button>
        {calloutsOpen && (
          <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-edge bg-surface py-1 shadow-xl">
            {Object.entries(CALLOUTS).map(([type, def]) => (
              <button
                key={type}
                onClick={() => {
                  setCalloutsOpen(false);
                  withView((v) => insertBlock(v, `::: ${type}\nYour text here.\n:::`))();
                }}
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-raised"
              >
                <span className="mt-0.5 h-4 w-4 flex-none text-accent [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: def.icon }} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{def.label}</span>
                  <span className="block truncate text-xs text-faint">{def.hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
