import { Fragment, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { Button, HintBubble, IconButton, Modal, useLongPressHint, useToast } from "../../components/ui";
import { Icon, type IconName } from "../../components/Icon";
import { CALLOUTS } from "../../markdown/renderer";
import { IMPORT_ACCEPT } from "../../lib/importer";
import { imageFileToMarkdown } from "../../lib/image";
import { cx } from "../../lib/utils";
import { stageAndReviewForInsert } from "../../components/ImportReview";
import {
  TABLE_SNIPPET,
  clearFormatting,
  copyAll,
  cutAll,
  insertBlock,
  insertLink,
  insertWrappedBlock,
  pasteFromClipboard,
  replaceAllFromClipboard,
  setHeading,
  toggleLinePrefix,
  wrapSelection,
} from "./commands";
import { smartPaste } from "../../lib/importer";

/**
 * Formatting toolbar — the everyday tools stay one tap away; everything
 * else lives behind the More (⋯) menu so the bar stays scannable on a
 * tablet. Every action is a thin call into commands.ts so the same
 * operations back the keyboard shortcuts.
 *
 * The toolbar is selection-aware rather than shipping a floating
 * selection menu (which fought Android's native selection UI): with text
 * selected, callouts and the code block wrap the selected lines, headings/
 * lists/quote transform them, inline styles wrap the exact selection, and
 * the clipboard paste replaces it.
 */

interface Action {
  id: string;
  icon: IconName;
  label: string;
  run: (view: EditorView) => void;
  /** Whether this starts out pinned to the always-visible bar. The author
      can flip any action's pin state from the More menu; the override
      persists in localStorage (see `usePinnedActions` below). */
  defaultPinned: boolean;
}

interface ActionGroup {
  title: string;
  items: Action[];
}

/** Undo/redo aren't part of the customizable set — they're not a
    "formatting preference," they're baseline editing controls every
    author needs, so they stay fixed at the head of the bar. */
const HISTORY_ACTIONS: Action[] = [
  { id: "undo", icon: "undo", label: "Undo (Ctrl+Z)", run: (v) => void undo(v), defaultPinned: true },
  { id: "redo", icon: "redo", label: "Redo (Ctrl+Y)", run: (v) => void redo(v), defaultPinned: true },
];

/** Every formatting action, grouped for both the bar's separators and the
    More menu's headings. `defaultPinned` reproduces today's toolbar/More
    split exactly; from here on it's just the starting point — pin/unpin
    (in More) is what actually decides what shows in the bar. */
const ACTION_GROUPS: ActionGroup[] = [
  {
    title: "Headings",
    items: [
      { id: "h1", icon: "h1", label: "Chapter heading", run: (v) => setHeading(v, 1), defaultPinned: true },
      { id: "h2", icon: "h2", label: "Section heading", run: (v) => setHeading(v, 2), defaultPinned: true },
      { id: "h3", icon: "h3", label: "Subsection heading", run: (v) => setHeading(v, 3), defaultPinned: true },
    ],
  },
  {
    title: "Emphasis",
    items: [
      { id: "bold", icon: "bold", label: "Bold (Ctrl+B)", run: (v) => wrapSelection(v, "**"), defaultPinned: true },
      { id: "italic", icon: "italic", label: "Italic (Ctrl+I)", run: (v) => wrapSelection(v, "*"), defaultPinned: true },
      { id: "highlight", icon: "highlighter", label: "Highlight (Ctrl+Shift+H)", run: (v) => wrapSelection(v, "=="), defaultPinned: true },
      { id: "underline", icon: "underline", label: "Underline (Ctrl+U)", run: (v) => wrapSelection(v, "++"), defaultPinned: false },
      { id: "strike", icon: "strikethrough", label: "Strikethrough", run: (v) => wrapSelection(v, "~~"), defaultPinned: false },
      { id: "sup", icon: "superscript", label: "Superscript — x^2^", run: (v) => wrapSelection(v, "^", "^", "2"), defaultPinned: false },
      { id: "sub", icon: "subscript", label: "Subscript — H~2~O", run: (v) => wrapSelection(v, "~", "~", "2"), defaultPinned: false },
      { id: "codeInline", icon: "code", label: "Inline code", run: (v) => wrapSelection(v, "`"), defaultPinned: false },
      { id: "clear", icon: "eraser", label: "Clear formatting from selection", run: clearFormatting, defaultPinned: false },
    ],
  },
  {
    title: "Lists",
    items: [
      { id: "list", icon: "list", label: "Bullet list", run: (v) => toggleLinePrefix(v, "- "), defaultPinned: true },
      { id: "listOrdered", icon: "listOrdered", label: "Numbered list", run: (v) => toggleLinePrefix(v, "", true), defaultPinned: true },
      { id: "checklist", icon: "checklist", label: "Checklist", run: (v) => toggleLinePrefix(v, "- [ ] "), defaultPinned: false },
      { id: "quote", icon: "quote", label: "Quote", run: (v) => toggleLinePrefix(v, "> "), defaultPinned: false },
    ],
  },
  {
    title: "Link",
    items: [{ id: "link", icon: "link", label: "Link (Ctrl+K)", run: insertLink, defaultPinned: true }],
  },
  {
    title: "Insert",
    items: [
      { id: "hr", icon: "minus", label: "Divider line", run: (v) => insertBlock(v, "---"), defaultPinned: true },
      { id: "pagebreak", icon: "pagebreak", label: "Page break (starts a new PDF page)", run: (v) => insertBlock(v, "\\pagebreak"), defaultPinned: true },
      { id: "table", icon: "table", label: "Insert table", run: (v) => insertBlock(v, TABLE_SNIPPET), defaultPinned: false },
      { id: "codeBlock", icon: "file", label: "Code block — wraps the selection", run: (v) => insertWrappedBlock(v, "```", "```", "code"), defaultPinned: false },
    ],
  },
  {
    title: "Find & replace",
    items: [
      {
        id: "findReplace",
        icon: "replace",
        label: "Find & replace (Ctrl+F) — leave “Replace” blank to find & delete",
        run: (v) => void openSearchPanel(v),
        defaultPinned: true,
      },
    ],
  },
];

const PIN_OVERRIDES_KEY = "ps2:toolbar:pinOverrides";

/** Pin state is stored as overrides against `defaultPinned` (not a full
    list) so a future new action just falls back to its own default
    instead of needing a migration. Lightweight — a single small JSON
    object in localStorage, no drag-and-drop, no reordering. */
function loadPinOverrides(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(PIN_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function usePinnedActions() {
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() => loadPinOverrides());

  const isPinned = (a: Action) => overrides[a.id] ?? a.defaultPinned;

  const togglePin = (a: Action) => {
    setOverrides((prev) => {
      const next = { ...prev, [a.id]: !isPinned(a) };
      try {
        localStorage.setItem(PIN_OVERRIDES_KEY, JSON.stringify(next));
      } catch {
        /* private mode — pin still works for this session */
      }
      return next;
    });
  };

  const visibleGroups = ACTION_GROUPS.map((g) => ({ title: g.title, items: g.items.filter(isPinned) })).filter((g) => g.items.length > 0);

  return { isPinned, togglePin, visibleGroups };
}

export function Toolbar({ getView }: { getView: () => EditorView | null }) {
  const [calloutsOpen, setCalloutsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const calloutHint = useLongPressHint();
  const moreHint = useLongPressHint();
  const { isPinned, togglePin, visibleGroups } = usePinnedActions();

  useEffect(() => {
    if (!calloutsOpen && !moreOpen) return;
    const close = (e: PointerEvent) => {
      if (calloutsOpen && !menuRef.current?.contains(e.target as Node)) setCalloutsOpen(false);
      if (moreOpen && !moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [calloutsOpen, moreOpen]);

  const withView = (fn: (v: EditorView) => void) => () => {
    const view = getView();
    if (view) fn(view);
  };

  function insertFile(file: File) {
    void stageAndReviewForInsert([file], toast, (markdown) => {
      const view = getView();
      if (!view) return;
      view.dispatch({ ...view.state.replaceSelection(markdown), scrollIntoView: true });
    });
  }

  async function insertImages(files: File[]) {
    const view = getView();
    if (!view || files.length === 0) return;
    try {
      const parts = await Promise.all(files.map((f) => imageFileToMarkdown(f)));
      view.dispatch({ ...view.state.replaceSelection(parts.join("")), scrollIntoView: true });
      toast(`Inserted ${files.length} image${files.length === 1 ? "" : "s"}`, "ok");
    } catch {
      toast("Couldn't read that image — try a PNG, JPEG or SVG", "error");
    }
  }

  async function doReplaceFromClipboard() {
    const view = getView();
    if (!view) return;
    const result = await replaceAllFromClipboard(view, (text) => smartPaste("", text)?.markdown ?? null);
    if (result === "denied") toast("Clipboard access blocked — use Ctrl+V instead", "error");
    else if (result === "empty") toast("Clipboard is empty", "info");
    else toast("Document replaced with clipboard contents", "ok");
  }

  return (
    <div className="flex items-center gap-0.5 border-b border-edge bg-surface px-1.5 py-1">
      {/* Scrolls on its own — an overflow-x-auto container also clips
          vertical overflow (a long-standing CSS quirk), so it can't wrap
          anything that opens a dropdown below it. Everything that does
          (callouts, More) lives outside this div, pinned and always reachable. */}
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
        {HISTORY_ACTIONS.map((a) => (
          <IconButton key={a.id} label={a.label} name={a.icon} onClick={withView(a.run)} />
        ))}
        {visibleGroups.length > 0 && <span className="mx-1 h-5 w-px flex-none bg-edge" />}
        {visibleGroups.map((group, gi) => (
          <Fragment key={group.title}>
            {gi > 0 && <span className="mx-1 h-5 w-px flex-none bg-edge" />}
            {group.items.map((a) => (
              <IconButton key={a.id} label={a.label} name={a.icon} onClick={withView(a.run)} />
            ))}
          </Fragment>
        ))}
        <span className="mx-1 h-5 w-px flex-none bg-edge" />
        <IconButton
          label="Cut entire document"
          name="cut"
          onClick={withView(async (v) => {
            const result = await cutAll(v);
            if (result === "empty") toast("Nothing to cut", "info");
            else if (result === "denied") toast("Clipboard access blocked — document left untouched", "error");
            else toast("Cut entire document to clipboard", "ok");
          })}
        />
        <IconButton
          label="Copy entire document"
          name="copy"
          onClick={withView(async (v) => {
            const ok = await copyAll(v);
            toast(ok ? "Copied entire document" : "Clipboard access blocked", ok ? "ok" : "error");
          })}
        />
        <IconButton
          label="Paste clipboard — replaces the selected text, or inserts at the cursor"
          name="clipboard"
          onClick={withView(async (v) => {
            const result = await pasteFromClipboard(v, (text) => smartPaste("", text)?.markdown ?? null);
            if (result === "denied") toast("Clipboard access blocked — use Ctrl+V instead", "error");
            else if (result === "empty") toast("Clipboard is empty", "info");
            else toast("Pasted from clipboard", "ok");
          })}
        />
      </div>

      <span className="mx-1 h-5 w-px flex-none bg-edge" />
      <div className="relative" ref={menuRef}>
        <button
          title="Callout box — wraps the selected text, or inserts a template"
          aria-label="Callout box — wraps the selected text, or inserts a template"
          aria-expanded={calloutsOpen}
          onClick={() => setCalloutsOpen((v) => !v)}
          className="relative flex items-center gap-1 rounded-lg p-2 text-ink-2 transition-colors hover:bg-raised hover:text-ink"
          {...calloutHint.handlers}
        >
          <Icon name="callout" size={16} />
          <Icon name="chevronDown" size={11} />
          <HintBubble show={calloutHint.show} text="Callout box — wraps the selection" />
        </button>
        {calloutsOpen && (
          <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-edge bg-surface py-1 shadow-xl">
            {Object.entries(CALLOUTS).map(([type, def]) => (
              <button
                key={type}
                onClick={() => {
                  setCalloutsOpen(false);
                  withView((v) => insertWrappedBlock(v, `::: ${type}`, ":::", "Your text here."))();
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

      <IconButton
        label="Insert image — upload a picture; also paste or drag & drop into the editor"
        name="image"
        onClick={() => imageRef.current?.click()}
      />

      <span className="mx-1 h-5 w-px flex-none bg-edge" />
      <div className="relative" ref={moreRef}>
        <button
          title="More tools"
          aria-label="More tools"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
          className="relative flex items-center rounded-lg p-2 text-ink-2 transition-colors hover:bg-raised hover:text-ink"
          {...moreHint.handlers}
        >
          <Icon name="moreHorizontal" size={16} />
          <HintBubble show={moreHint.show} text="More tools" />
        </button>
        {moreOpen && (
          <div className="absolute right-0 top-full z-30 mt-1 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-edge bg-surface py-1.5 shadow-xl">
            <p className="px-3 pb-1.5 text-[11px] leading-snug text-faint">Tap an action to run it, or tap the pin to add/remove it from the toolbar.</p>
            {ACTION_GROUPS.map((group) => (
              <div key={group.title} className="border-b border-edge py-1 last:border-0">
                <span className="block px-3 py-1 text-[10.5px] font-bold uppercase tracking-wide text-faint">{group.title}</span>
                {group.items.map((a) => {
                  const pinned = isPinned(a);
                  return (
                    <div key={a.id} className="flex items-center gap-1 pr-1.5">
                      <button
                        onClick={() => {
                          setMoreOpen(false);
                          withView(a.run)();
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink-2 hover:bg-raised hover:text-ink"
                      >
                        <Icon name={a.icon} size={15} className="flex-none" />
                        <span className="truncate">{a.label}</span>
                      </button>
                      <button
                        onClick={() => togglePin(a)}
                        title={pinned ? "Remove from Toolbar" : "Pin to Toolbar"}
                        aria-label={`${a.label} — ${pinned ? "Remove from Toolbar" : "Pin to Toolbar"}`}
                        aria-pressed={pinned}
                        className={cx(
                          "flex-none rounded-lg p-1.5 transition-colors",
                          pinned ? "text-accent hover:bg-accent/10" : "text-faint hover:bg-raised hover:text-ink-2",
                        )}
                      >
                        <Icon name="pin" size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="border-b border-edge py-1 last:border-0">
              <span className="block px-3 py-1 text-[10.5px] font-bold uppercase tracking-wide text-faint">Document</span>
              <button
                onClick={() => {
                  setMoreOpen(false);
                  fileRef.current?.click();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink-2 hover:bg-raised hover:text-ink"
              >
                <Icon name="upload" size={15} className="flex-none" />
                Insert file — Markdown, text, HTML or Word (.docx)
              </button>
              <button
                onClick={() => {
                  setMoreOpen(false);
                  const view = getView();
                  if (!view) return;
                  if (view.state.doc.length === 0) void doReplaceFromClipboard();
                  else setConfirmReplace(true);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink-2 hover:bg-raised hover:text-ink"
              >
                <Icon name="refresh" size={15} className="flex-none" />
                Replace with clipboard…
              </button>
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={IMPORT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void insertFile(file);
        }}
      />
      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void insertImages(files);
        }}
      />

      <Modal open={confirmReplace} onClose={() => setConfirmReplace(false)} title="Replace document with clipboard?">
        <p className="text-sm text-ink-2">
          This overwrites the entire document with your clipboard's text. Ctrl+Z restores it if you change your mind.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmReplace(false)}>Cancel</Button>
          <Button
            variant="primary"
            className="bg-danger text-white"
            onClick={() => {
              setConfirmReplace(false);
              void doReplaceFromClipboard();
            }}
          >
            Replace
          </Button>
        </div>
      </Modal>
    </div>
  );
}
