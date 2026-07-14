import { Fragment, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { Button, HintBubble, IconButton, Modal, Segmented, useLongPressHint, useToast } from "../../components/ui";
import { Icon, type IconName } from "../../components/Icon";
import { CALLOUTS } from "../../markdown/renderer";
import { IMPORT_ACCEPT, smartFormatDocument, smartPaste } from "../../lib/importer";
import { imageFileToMarkdown } from "../../lib/image";
import { stageAndReviewForInsert } from "../../components/ImportReview";
import {
  CODE_SNIPPET,
  TABLE_SNIPPET,
  clearFormatting,
  copyAll,
  cutAll,
  findImageAtCursor,
  insertBlock,
  insertLink,
  pasteFromClipboard,
  replaceFromClipboard,
  setHeading,
  setImageLayout,
  toggleLinePrefix,
  wrapSelection,
  type ImageAtCursor,
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
    { id: "undo", icon: "undo", label: "Undo (Ctrl+Z) — step back one edit", run: (v) => void undo(v) },
    { id: "redo", icon: "redo", label: "Redo (Ctrl+Y) — reapply an undone edit", run: (v) => void redo(v) },
  ],
  [
    { id: "h1", icon: "h1", label: "Chapter heading (#) — starts a new chapter/section in the table of contents", run: (v) => setHeading(v, 1) },
    { id: "h2", icon: "h2", label: "Section heading (##) — also sets the running page-header topic", run: (v) => setHeading(v, 2) },
    { id: "h3", icon: "h3", label: "Subsection heading (###) — for a sub-point within a section", run: (v) => setHeading(v, 3) },
  ],
  [
    { id: "bold", icon: "bold", label: "Bold (Ctrl+B) — emphasize key terms or a short phrase", run: (v) => wrapSelection(v, "**") },
    { id: "italic", icon: "italic", label: "Italic (Ctrl+I) — for titles, foreign terms or light emphasis", run: (v) => wrapSelection(v, "*") },
    { id: "underline", icon: "underline", label: "Underline (Ctrl+U)", run: (v) => wrapSelection(v, "++") },
    { id: "highlight", icon: "highlighter", label: "Highlight (Ctrl+Shift+H) — marks a must-remember phrase, not for whole sentences", run: (v) => wrapSelection(v, "==") },
    { id: "strike", icon: "strikethrough", label: "Strikethrough — shows a correction or a superseded fact", run: (v) => wrapSelection(v, "~~") },
    { id: "sup", icon: "superscript", label: "Superscript — for x^2^ or footnote-style marks", run: (v) => wrapSelection(v, "^", "^", "2") },
    { id: "sub", icon: "subscript", label: "Subscript — for chemical formulas like H~2~O", run: (v) => wrapSelection(v, "~", "~", "2") },
    { id: "codeInline", icon: "code", label: "Inline code — for a short literal term or value within a sentence", run: (v) => wrapSelection(v, "`") },
    { id: "clear", icon: "eraser", label: "Clear formatting — strips bold/italic/highlight/etc. from the selection, keeps the text", run: clearFormatting },
  ],
  [
    { id: "list", icon: "list", label: "Bullet list — for unordered points", run: (v) => toggleLinePrefix(v, "- ") },
    { id: "listOrdered", icon: "listOrdered", label: "Numbered list — for ranked or sequential steps", run: (v) => toggleLinePrefix(v, "", true) },
    { id: "checklist", icon: "checklist", label: "Checklist — for a to-do list or a tick-box comparison", run: (v) => toggleLinePrefix(v, "- [ ] ") },
    { id: "quote", icon: "quote", label: "Quote — for a citation or an excerpted line", run: (v) => toggleLinePrefix(v, "> ") },
  ],
  [
    { id: "link", icon: "link", label: "Link (Ctrl+K) — select a URL first to link its text automatically", run: insertLink },
    { id: "table", icon: "table", label: "Insert table — for structured comparisons", run: (v) => insertBlock(v, TABLE_SNIPPET) },
    { id: "codeBlock", icon: "file", label: "Code block — for multi-line literal text or actual code", run: (v) => insertBlock(v, CODE_SNIPPET) },
    { id: "hr", icon: "minus", label: "Divider line — a visual break between unrelated sections", run: (v) => insertBlock(v, "---") },
    { id: "pagebreak", icon: "pagebreak", label: "Page break — forces the next content onto a new PDF page", run: (v) => insertBlock(v, "\\pagebreak") },
  ],
  [{ id: "findReplace", icon: "replace", label: "Find & replace (Ctrl+F) — leave “Replace” blank to find & delete", run: (v) => void openSearchPanel(v) }],
];

export function Toolbar({ getView }: { getView: () => EditorView | null }) {
  const [calloutsOpen, setCalloutsOpen] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [imageLayoutOpen, setImageLayoutOpen] = useState(false);
  const [currentImage, setCurrentImage] = useState<ImageAtCursor | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const imageMenuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const calloutHint = useLongPressHint();
  const imageLayoutHint = useLongPressHint();

  function openImageLayout() {
    const view = getView();
    setCurrentImage(view ? findImageAtCursor(view) : null);
    setImageLayoutOpen(true);
  }

  function applyImageLayout(patch: Parameters<typeof setImageLayout>[1]) {
    const view = getView();
    if (!view || !setImageLayout(view, patch)) return;
    setCurrentImage(findImageAtCursor(view));
  }

  async function doReplaceFromClipboard() {
    const view = getView();
    if (!view) return;
    const result = await replaceFromClipboard(view, (text) => smartPaste("", text)?.markdown ?? null);
    if (result === "denied") toast("Clipboard access blocked — use Ctrl+V after selecting all instead", "error");
    else if (result === "empty") toast("Clipboard is empty", "info");
    else toast("Document replaced from clipboard", "ok");
  }

  function runSmartFormat() {
    const view = getView();
    if (!view) return;
    const result = smartFormatDocument(view.state.doc.toString());
    if (!result) {
      toast("Already looks clean — nothing to format", "info");
      return;
    }
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: result.markdown } });
    view.focus();
    toast(`Smart Format — ${result.summary}`, "ok");
  }

  useEffect(() => {
    if (!calloutsOpen) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setCalloutsOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [calloutsOpen]);

  useEffect(() => {
    if (!imageLayoutOpen) return;
    const close = (e: PointerEvent) => {
      if (!imageMenuRef.current?.contains(e.target as Node)) setImageLayoutOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [imageLayoutOpen]);

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
          className="relative flex items-center gap-1 rounded-lg p-2 text-ink-2 transition-colors hover:bg-raised hover:text-ink"
          {...calloutHint.handlers}
        >
          <Icon name="callout" size={16} />
          <Icon name="chevronDown" size={11} />
          <HintBubble show={calloutHint.show} text="Insert callout box" />
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
      <span className="mx-1 h-5 w-px flex-none bg-edge" />
      <IconButton label="Smart Format — cleans up structure (headings, spacing, question fields) across the whole document; safe to undo with Ctrl+Z" name="sparkles" onClick={runSmartFormat} />
      <span className="mx-1 h-5 w-px flex-none bg-edge" />
      <IconButton
        label="Copy entire document"
        name="copy"
        onClick={withView(async (v) => {
          const ok = await copyAll(v);
          toast(ok ? "Copied entire document" : "Clipboard access blocked", ok ? "ok" : "error");
        })}
      />
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
        label="Paste from clipboard at cursor — inserts without replacing anything"
        name="clipboard"
        onClick={withView(async (v) => {
          const result = await pasteFromClipboard(v, (text) => smartPaste("", text)?.markdown ?? null);
          if (result === "denied") toast("Clipboard access blocked — use Ctrl+V instead", "error");
          else if (result === "empty") toast("Clipboard is empty", "info");
          else toast("Pasted from clipboard", "ok");
        })}
      />
      <IconButton
        label="Replace from Clipboard — swaps the whole document for the clipboard contents, useful after generating a document with an AI tool"
        name="refresh"
        onClick={() => {
          const view = getView();
          if (!view) return;
          if (view.state.doc.length === 0) void doReplaceFromClipboard();
          else setConfirmReplace(true);
        }}
      />
      <span className="mx-1 h-5 w-px flex-none bg-edge" />
      <IconButton
        label="Insert image — upload a picture; also paste or drag & drop into the editor"
        name="image"
        onClick={() => imageRef.current?.click()}
      />
      <div className="relative" ref={imageMenuRef}>
        <button
          title="Image layout — place your cursor on an image line, then set its alignment and width"
          aria-label="Image layout"
          aria-expanded={imageLayoutOpen}
          onClick={openImageLayout}
          className="relative flex items-center gap-1 rounded-lg p-2 text-ink-2 transition-colors hover:bg-raised hover:text-ink"
          {...imageLayoutHint.handlers}
        >
          <Icon name="focus" size={16} />
          <Icon name="chevronDown" size={11} />
          <HintBubble show={imageLayoutHint.show} text="Image layout — place your cursor on an image line, then set its alignment and width" />
        </button>
        {imageLayoutOpen && (
          <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-edge bg-surface p-3 shadow-xl">
            {currentImage ? (
              <div className="space-y-3">
                <p className="truncate text-xs text-faint">{currentImage.alt || "Image"}</p>
                <div>
                  <span className="mb-1 block text-xs font-semibold text-ink-2">Alignment</span>
                  <Segmented
                    size="sm"
                    value={currentImage.align}
                    onChange={(align) => applyImageLayout({ align })}
                    options={[
                      { value: "left", label: "Left" },
                      { value: "center", label: "Center" },
                      { value: "right", label: "Right" },
                    ]}
                  />
                </div>
                <div>
                  <span className="mb-1 block text-xs font-semibold text-ink-2">Width</span>
                  <Segmented
                    size="sm"
                    value={currentImage.width ?? "auto"}
                    onChange={(width) => applyImageLayout({ width: width === "auto" ? null : width })}
                    options={[
                      { value: "auto", label: "Auto" },
                      { value: "50%", label: "50%" },
                      { value: "75%", label: "75%" },
                      { value: "100%", label: "100%" },
                    ]}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-faint">Place your cursor on an image line (a line with just <code className="font-mono">![alt](…)</code>), then reopen this to set its alignment and width.</p>
            )}
          </div>
        )}
      </div>
      <IconButton
        label="Insert file — Markdown, text, HTML or Word (.docx) at the cursor"
        name="upload"
        onClick={() => fileRef.current?.click()}
      />
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

      <Modal open={confirmReplace} onClose={() => setConfirmReplace(false)} title="Replace this document?">
        <p className="text-sm text-ink-2">The clipboard contents will replace everything currently in the editor. Ctrl+Z undoes this in one step.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmReplace(false)}>Cancel</Button>
          <Button
            variant="primary"
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
