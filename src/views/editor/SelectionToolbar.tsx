import { useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { Icon, type IconName } from "../../components/Icon";
import { useToast } from "../../components/ui";
import { cx } from "../../lib/utils";
import { smartPaste } from "../../lib/importer";
import {
  clearFormatting,
  copySelection,
  cutSelection,
  insertBlock,
  insertLink,
  pasteFromClipboard,
  setHeading,
  toggleLinePrefix,
  wrapSelection,
} from "./commands";

/** Container-relative anchor for the floating toolbar. `below` flips it to
    sit under the selection when there isn't room above. */
export type SelBox = { left: number; top: number; below: boolean };

interface MenuItem {
  id: string;
  icon: IconName;
  label: string;
  run: (view: EditorView) => void;
}

/** The "More" menu — the remaining inline/line operations, one tap away
    without crowding the first row. */
const MORE_ITEMS: MenuItem[] = [
  { id: "italic", icon: "italic", label: "Italic", run: (v) => wrapSelection(v, "*") },
  { id: "underline", icon: "underline", label: "Underline", run: (v) => wrapSelection(v, "++") },
  { id: "strike", icon: "strikethrough", label: "Strikethrough", run: (v) => wrapSelection(v, "~~") },
  { id: "sup", icon: "superscript", label: "Superscript", run: (v) => wrapSelection(v, "^", "^", "2") },
  { id: "sub", icon: "subscript", label: "Subscript", run: (v) => wrapSelection(v, "~", "~", "2") },
  { id: "code", icon: "code", label: "Inline code", run: (v) => wrapSelection(v, "`") },
  { id: "link", icon: "link", label: "Link", run: insertLink },
  { id: "clear", icon: "eraser", label: "Clear formatting", run: clearFormatting },
  { id: "bullet", icon: "list", label: "Bullet list", run: (v) => toggleLinePrefix(v, "- ") },
  { id: "number", icon: "listOrdered", label: "Numbered list", run: (v) => toggleLinePrefix(v, "", true) },
  { id: "checklist", icon: "checklist", label: "Checklist", run: (v) => toggleLinePrefix(v, "- [ ] ") },
  { id: "quote", icon: "quote", label: "Quote", run: (v) => toggleLinePrefix(v, "> ") },
];

/** The "Insert" menu — the Markdown templates the Studio already supports.
    Each item just drops the existing syntax; no AI, no heavy logic. */
const INSERT_ITEMS: MenuItem[] = [
  { id: "heading", icon: "h2", label: "Heading", run: (v) => setHeading(v, 2) },
  { id: "definition", icon: "callout", label: "Definition", run: (v) => insertBlock(v, "::: definition\nYour text here.\n:::") },
  { id: "example", icon: "callout", label: "Example", run: (v) => insertBlock(v, "::: example\nYour text here.\n:::") },
  { id: "important", icon: "callout", label: "Important", run: (v) => insertBlock(v, "::: important\nYour text here.\n:::") },
  { id: "tip", icon: "callout", label: "Tip", run: (v) => insertBlock(v, "::: tip\nYour text here.\n:::") },
  { id: "warning", icon: "callout", label: "Warning", run: (v) => insertBlock(v, "::: warning\nYour text here.\n:::") },
  { id: "summary", icon: "callout", label: "Summary", run: (v) => insertBlock(v, "::: summary\nYour text here.\n:::") },
  { id: "note", icon: "callout", label: "Note", run: (v) => insertBlock(v, "::: note\nYour text here.\n:::") },
  { id: "pagebreak", icon: "pagebreak", label: "Page break", run: (v) => insertBlock(v, "\\pagebreak") },
  { id: "divider", icon: "minus", label: "Divider", run: (v) => insertBlock(v, "---") },
];

/**
 * A compact floating toolbar over the current editor selection — the
 * Google-Docs / Notion pattern. The first row carries the everyday actions
 * (copy, cut, replace-from-clipboard, bold, highlight); "More" and "Insert"
 * hold the rest. Every action is a thin call into commands.ts, so it's
 * exactly what the toolbar and shortcuts already do — no new formatting
 * logic, no AI.
 *
 * It doesn't manage its own visibility: it renders only while the host has
 * a live selection box, so it appears with the selection and dismisses when
 * the selection is cleared or an action collapses it. A mousedown here is
 * prevented from stealing focus, so clicking a button never blurs the
 * editor or drops the selection out from under the command.
 */
export function SelectionToolbar({ box, getView }: { box: SelBox; getView: () => EditorView | null }) {
  const toast = useToast();
  const [menu, setMenu] = useState<null | "more" | "insert">(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close an open submenu on any pointer down outside the toolbar.
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  // A fresh box means the selection moved — collapse any open submenu so it
  // never lingers detached from the new selection.
  useEffect(() => {
    setMenu(null);
  }, [box.left, box.top]);

  const run = (fn: (view: EditorView) => void) => {
    const view = getView();
    if (view) fn(view);
    setMenu(null);
  };

  const convert = (text: string) => smartPaste("", text)?.markdown ?? null;

  return (
    <div
      ref={rootRef}
      // Keep the editor focused and the selection intact when a control is
      // pressed — the whole point of a selection toolbar.
      onMouseDown={(e) => e.preventDefault()}
      className="absolute z-30 -translate-x-1/2 select-none"
      style={{
        left: box.left,
        top: box.top,
        transform: box.below ? "translate(-50%, 8px)" : "translate(-50%, calc(-100% - 8px))",
      }}
    >
      <div className="flex items-center gap-0.5 rounded-xl border border-edge bg-surface p-1 shadow-xl">
        <ToolButton
          icon="copy"
          label="Copy selection"
          onClick={async () => {
            const view = getView();
            if (!view) return;
            const ok = await copySelection(view);
            toast(ok ? "Copied selection" : "Clipboard access blocked", ok ? "ok" : "error");
          }}
        />
        <ToolButton
          icon="cut"
          label="Cut selection"
          onClick={async () => {
            const view = getView();
            if (!view) return;
            const r = await cutSelection(view);
            if (r === "denied") toast("Clipboard access blocked — selection left untouched", "error");
            else if (r === "ok") toast("Cut selection", "ok");
          }}
        />
        <ToolButton
          icon="clipboard"
          label="Replace with clipboard"
          onClick={async () => {
            const view = getView();
            if (!view) return;
            const r = await pasteFromClipboard(view, convert);
            if (r === "denied") toast("Clipboard access blocked — use Ctrl+V instead", "error");
            else if (r === "empty") toast("Clipboard is empty", "info");
          }}
        />
        <Divider />
        <ToolButton icon="bold" label="Bold" onClick={() => run((v) => wrapSelection(v, "**"))} />
        <ToolButton icon="highlighter" label="Highlight" onClick={() => run((v) => wrapSelection(v, "=="))} />
        <Divider />
        <MenuButton icon="moreHorizontal" label="More" open={menu === "more"} onClick={() => setMenu((m) => (m === "more" ? null : "more"))} />
        <MenuButton icon="plus" label="Insert" open={menu === "insert"} onClick={() => setMenu((m) => (m === "insert" ? null : "insert"))} />
      </div>

      {menu && (
        <div className="absolute right-0 top-full z-10 mt-1 max-h-64 w-52 overflow-y-auto rounded-xl border border-edge bg-surface py-1 shadow-xl">
          {(menu === "more" ? MORE_ITEMS : INSERT_ITEMS).map((it) => (
            <button
              key={it.id}
              onClick={() => run(it.run)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink-2 hover:bg-raised hover:text-ink"
            >
              <Icon name={it.icon} size={15} className="flex-none" />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-raised hover:text-ink"
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

function MenuButton({ icon, label, open, onClick }: { icon: IconName; label: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      onClick={onClick}
      className={cx(
        "flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors",
        open ? "bg-raised text-ink" : "text-ink-2 hover:bg-raised hover:text-ink",
      )}
    >
      <Icon name={icon} size={15} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px flex-none bg-edge" />;
}
