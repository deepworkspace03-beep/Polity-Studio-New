import { Fragment, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { Button, HintBubble, IconButton, Modal, useLongPressHint, useToast } from "../../components/ui";
import { Icon, type IconName } from "../../components/Icon";
import { CALLOUTS } from "../../markdown/renderer";
import { IMPORT_ACCEPT } from "../../lib/importer";
import { imageFileToMarkdown } from "../../lib/image";
import { stageAndReviewForInsert } from "../../components/ImportReview";
import {
  CODE_SNIPPET,
  TABLE_SNIPPET,
  clearFormatting,
  copyAll,
  cutAll,
  insertBlock,
  insertLink,
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
 */

interface Action {
  id: string;
  icon: IconName;
  label: string;
  run: (view: EditorView) => void;
}

/** Always-visible groups — the tools used on nearly every document. */
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
  ],
  [
    { id: "list", icon: "list", label: "Bullet list", run: (v) => toggleLinePrefix(v, "- ") },
    { id: "listOrdered", icon: "listOrdered", label: "Numbered list", run: (v) => toggleLinePrefix(v, "", true) },
  ],
  [{ id: "link", icon: "link", label: "Link (Ctrl+K)", run: insertLink }],
  [{ id: "findReplace", icon: "replace", label: "Find & replace (Ctrl+F) — leave “Replace” blank to find & delete", run: (v) => void openSearchPanel(v) }],
];

/** Overflow menu, grouped under small headings — everything reachable,
    nothing crowding the bar. */
const MORE_GROUPS: { title: string; items: Action[] }[] = [
  {
    title: "Text style",
    items: [
      { id: "underline", icon: "underline", label: "Underline (Ctrl+U)", run: (v) => wrapSelection(v, "++") },
      { id: "highlight", icon: "highlighter", label: "Highlight (Ctrl+Shift+H)", run: (v) => wrapSelection(v, "==") },
      { id: "strike", icon: "strikethrough", label: "Strikethrough", run: (v) => wrapSelection(v, "~~") },
      { id: "sup", icon: "superscript", label: "Superscript — x^2^", run: (v) => wrapSelection(v, "^", "^", "2") },
      { id: "sub", icon: "subscript", label: "Subscript — H~2~O", run: (v) => wrapSelection(v, "~", "~", "2") },
      { id: "codeInline", icon: "code", label: "Inline code", run: (v) => wrapSelection(v, "`") },
      { id: "clear", icon: "eraser", label: "Clear formatting from selection", run: clearFormatting },
    ],
  },
  {
    title: "Lists",
    items: [
      { id: "checklist", icon: "checklist", label: "Checklist", run: (v) => toggleLinePrefix(v, "- [ ] ") },
      { id: "quote", icon: "quote", label: "Quote", run: (v) => toggleLinePrefix(v, "> ") },
    ],
  },
  {
    title: "Insert",
    items: [
      { id: "table", icon: "table", label: "Insert table", run: (v) => insertBlock(v, TABLE_SNIPPET) },
      { id: "codeBlock", icon: "file", label: "Code block", run: (v) => insertBlock(v, CODE_SNIPPET) },
      { id: "hr", icon: "minus", label: "Divider line", run: (v) => insertBlock(v, "---") },
      { id: "pagebreak", icon: "pagebreak", label: "Page break (starts a new PDF page)", run: (v) => insertBlock(v, "\\pagebreak") },
    ],
  },
];

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
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
        {GROUPS.map((group, gi) => (
          <Fragment key={gi}>
            {gi > 0 && <span className="mx-1 h-5 w-px flex-none bg-edge" />}
            {group.map((a) => (
              <IconButton key={a.id} label={a.label} name={a.icon} onClick={withView(a.run)} />
            ))}
          </Fragment>
        ))}
      </div>

      <span className="mx-1 h-5 w-px flex-none bg-edge" />
      <div className="relative" ref={menuRef}>
        <button
          title="Insert callout box"
          aria-label="Insert callout box"
          aria-expanded={calloutsOpen}
          onClick={() => setCalloutsOpen((v) => !v)}
          className="relative flex items-center gap-1 rounded-lg p-2 text-ink-2 transition-colors hover:bg-raised hover:text-ink"
          {...calloutHint.handlers}
        >
          <Icon name="callout" size={16} />
          <Icon name="chevronDown" size={11} />
          <HintBubble show={calloutHint.show} text="Insert callout box" />
        </button>
        {calloutsOpen && (
          <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-edge bg-surface py-1 shadow-xl">
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
          <div className="absolute right-0 top-full z-30 mt-1 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-edge bg-surface py-1.5 shadow-xl">
            {MORE_GROUPS.map((group) => (
              <div key={group.title} className="border-b border-edge py-1 last:border-0">
                <span className="block px-3 py-1 text-[10.5px] font-bold uppercase tracking-wide text-faint">{group.title}</span>
                {group.items.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setMoreOpen(false);
                      withView(a.run)();
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink-2 hover:bg-raised hover:text-ink"
                  >
                    <Icon name={a.icon} size={15} className="flex-none" />
                    {a.label}
                  </button>
                ))}
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
                onClick={async () => {
                  setMoreOpen(false);
                  const view = getView();
                  if (!view) return;
                  const ok = await copyAll(view);
                  toast(ok ? "Copied entire document" : "Clipboard access blocked", ok ? "ok" : "error");
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink-2 hover:bg-raised hover:text-ink"
              >
                <Icon name="copy" size={15} className="flex-none" />
                Copy entire document
              </button>
              <button
                onClick={async () => {
                  setMoreOpen(false);
                  const view = getView();
                  if (!view) return;
                  const result = await cutAll(view);
                  if (result === "empty") toast("Nothing to cut", "info");
                  else if (result === "denied") toast("Clipboard access blocked — document left untouched", "error");
                  else toast("Cut entire document to clipboard", "ok");
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink-2 hover:bg-raised hover:text-ink"
              >
                <Icon name="cut" size={15} className="flex-none" />
                Cut entire document
              </button>
              <button
                onClick={async () => {
                  setMoreOpen(false);
                  const view = getView();
                  if (!view) return;
                  const result = await pasteFromClipboard(view, (text) => smartPaste("", text)?.markdown ?? null);
                  if (result === "denied") toast("Clipboard access blocked — use Ctrl+V instead", "error");
                  else if (result === "empty") toast("Clipboard is empty", "info");
                  else toast("Pasted from clipboard", "ok");
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink-2 hover:bg-raised hover:text-ink"
              >
                <Icon name="clipboard" size={15} className="flex-none" />
                Paste from clipboard at cursor
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
