import { useEffect, useRef, useState } from "react";
import { EditorView, keymap, placeholder, type ViewUpdate } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import { insertLink, wrapSelection } from "./commands";
import { smartPaste } from "../../lib/importer";
import { EditorScrollbar } from "./EditorScrollbar";
import { searchHighlightField } from "./searchHighlight";

/** Markdown syntax colors driven by the app theme variables, so the
    editor follows dark/light mode automatically. */
const mdHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "var(--accent)", fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700", color: "var(--ink)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.link, color: "var(--accent)" },
  { tag: tags.url, color: "var(--faint)" },
  { tag: tags.monospace, fontFamily: "var(--font-mono)", color: "var(--ink-2)" },
  { tag: tags.quote, color: "var(--faint)", fontStyle: "italic" },
  { tag: tags.list, color: "var(--accent)", fontWeight: "700" },
  { tag: tags.contentSeparator, color: "var(--faint)" },
  { tag: tags.meta, color: "var(--faint)" },
  { tag: tags.processingInstruction, color: "var(--faint)" },
]);

const editorTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "var(--ink)" },
  ".cm-content": {
    // Right gutter leaves room for the custom draggable scrollbar overlay
    // (EditorScrollbar) so long unbroken tokens never slide under it.
    padding: "16px 14px 45vh 4px",
    caretColor: "var(--accent)",
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    lineHeight: "1.75",
  },
  ".cm-line": { padding: "0 12px" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent) !important",
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--raised) 55%, transparent)" },
  ".cm-placeholder": { color: "var(--faint)" },
  // Hide the thin native scrollbar — the custom EditorScrollbar overlay
  // replaces it with a fat, touch-friendly thumb. Wheel/touch/keyboard
  // scrolling on the scroller are untouched, so nothing is lost.
  ".cm-scroller": { overflow: "auto", scrollbarWidth: "none" },
  ".cm-scroller::-webkit-scrollbar": { display: "none" },
  // Find & replace panel — matches the app's own inputs/buttons instead
  // of CodeMirror's unstyled defaults.
  ".cm-panels": { backgroundColor: "var(--surface)", color: "var(--ink)" },
  ".cm-panels-top": { borderBottom: "1px solid var(--edge)" },
  ".cm-search": { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", padding: "8px 12px" },
  ".cm-search label": { display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "12px", color: "var(--ink-2)" },
  ".cm-textfield": {
    backgroundColor: "var(--bg)",
    color: "var(--ink)",
    border: "1px solid var(--edge)",
    borderRadius: "6px",
    padding: "4px 8px",
    fontSize: "13px",
  },
  ".cm-textfield:focus-visible": { outline: "1px solid var(--accent)" },
  ".cm-button": {
    backgroundColor: "var(--raised)",
    color: "var(--ink)",
    border: "1px solid var(--edge)",
    borderRadius: "6px",
    padding: "4px 9px",
    fontSize: "12px",
    backgroundImage: "none",
  },
  ".cm-button:hover": { backgroundColor: "var(--edge)" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--accent) 25%, transparent)" },
  ".cm-searchMatch-selected": { backgroundColor: "color-mix(in srgb, var(--accent) 55%, transparent)" },
  // Search Navigator highlights — every match softly, the active one strong
  // with an underline so it reads even when the editor isn't focused.
  ".cm-nav-match": { backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)", borderRadius: "2px" },
  ".cm-nav-match-active": {
    backgroundColor: "color-mix(in srgb, var(--accent) 48%, transparent)",
    boxShadow: "inset 0 -2px 0 var(--accent)",
  },
});

export interface CodeMirrorProps {
  value: string;
  onChange: (value: string) => void;
  /** 1-based line number of the primary cursor — drives preview sync. */
  onCursorLine?: (line: number) => void;
  onSaveShortcut?: () => void;
  /** Fired when a paste was auto-converted/tidied, with a summary line. */
  onSmartPaste?: (summary: string) => void;
  /** Fired when image files are pasted — the host inserts them at the cursor. */
  onImageFiles?: (files: File[]) => void;
  /** Ctrl/⌘+F — opens the host's Search Navigator instead of CodeMirror's
      own find panel (which stays available through the rest of searchKeymap). */
  onFind?: () => void;
  /** Estimated total pages for the scrollbar's position readout. */
  estimatedPages?: number;
  /** Fires (rAF-throttled) with the scroll position as a 0–1 fraction so
      the host can sync the preview to the same document position. */
  onScrollFraction?: (pct: number) => void;
  viewRef: React.MutableRefObject<EditorView | null>;
}

export function CodeMirror({ value, onChange, onCursorLine, onSaveShortcut, onSmartPaste, onImageFiles, onFind, estimatedPages, onScrollFraction, viewRef }: CodeMirrorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // The scroller element + a revision counter feed the custom scrollbar
  // overlay; revision bumps on doc changes so the thumb resizes as content
  // grows/shrinks (scroll and resize are observed directly by the overlay).
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [revision, setRevision] = useState(0);
  const onChangeRef = useRef(onChange);
  const onCursorRef = useRef(onCursorLine);
  const onSaveRef = useRef(onSaveShortcut);
  const onSmartPasteRef = useRef(onSmartPaste);
  const onImageFilesRef = useRef(onImageFiles);
  const onFindRef = useRef(onFind);
  const onScrollFractionRef = useRef(onScrollFraction);
  // Timestamp of the last cursor/doc change — lets scroll-sync defer to the
  // precise cursor→preview sync while the author is actively editing.
  const lastCursorTsRef = useRef(0);
  onChangeRef.current = onChange;
  onCursorRef.current = onCursorLine;
  onSaveRef.current = onSaveShortcut;
  onSmartPasteRef.current = onSmartPaste;
  onImageFilesRef.current = onImageFiles;
  onFindRef.current = onFind;
  onScrollFractionRef.current = onScrollFraction;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                onSaveRef.current?.();
                return true;
              },
            },
            {
              key: "Mod-f",
              run: () => {
                if (!onFindRef.current) return false; // fall through to CodeMirror's own find
                onFindRef.current();
                return true;
              },
            },
            { key: "Mod-b", run: (v) => (wrapSelection(v, "**"), true) },
            { key: "Mod-i", run: (v) => (wrapSelection(v, "*"), true) },
            { key: "Mod-u", run: (v) => (wrapSelection(v, "++"), true) },
            { key: "Mod-k", run: (v) => (insertLink(v), true) },
            { key: "Mod-Shift-h", run: (v) => (wrapSelection(v, "=="), true) },
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
          ]),
          search({ top: true }),
          searchHighlightField,
          // Smart Paste: rich clipboard content (Word, Google Docs, web,
          // AI chats) is converted to the app's Markdown before insert.
          // Returns false when conversion adds nothing, so the default
          // paste happens; the paste is one transaction, so Ctrl+Z
          // always restores the raw text.
          EditorView.domEventHandlers({
            paste: (event, view) => {
              const dt = event.clipboardData;
              if (!dt) return false;
              // Screenshot / copied image on the clipboard → insert inline.
              // Handled before text so pasting an image never falls through
              // to (empty) text handling.
              const images = [...(dt.files ?? [])].filter((f) => f.type.startsWith("image/"));
              if (images.length) {
                event.preventDefault();
                onImageFilesRef.current?.(images);
                return true;
              }
              const result = smartPaste(dt.getData("text/html"), dt.getData("text/plain"));
              if (!result) return false;
              event.preventDefault();
              view.dispatch({ ...view.state.replaceSelection(result.markdown), scrollIntoView: true });
              onSmartPasteRef.current?.(result.summary);
              return true;
            },
          }),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(mdHighlight),
          editorTheme,
          EditorView.lineWrapping,
          placeholder("Paste or write your Markdown here…"),
          EditorView.updateListener.of((u: ViewUpdate) => {
            if (u.docChanged) {
              onChangeRef.current(u.state.doc.toString());
              setRevision((r) => r + 1); // refresh the custom scrollbar geometry
            }
            if (u.selectionSet || u.docChanged) {
              lastCursorTsRef.current = performance.now();
              onCursorRef.current?.(u.state.doc.lineAt(u.state.selection.main.head).number);
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    view.scrollDOM.id = "editor-scroller";
    setScroller(view.scrollDOM);

    // Report scroll position (0–1) so the host can keep the preview at the
    // same document position — throttled to one report per frame, and only
    // when it actually moved, so it stays cheap on a long document. When the
    // scroll was caused by typing or a cursor jump (which auto-scrolls to
    // keep the caret visible), the more precise cursor→preview line sync
    // already handles it, so the coarser fraction sync stands down to avoid
    // the two fighting over the preview's scroll position.
    let scrollRaf = 0;
    let lastPct = -1;
    const reportScroll = () => {
      scrollRaf = 0;
      if (performance.now() - lastCursorTsRef.current < 250) return;
      const el = view.scrollDOM;
      const max = el.scrollHeight - el.clientHeight;
      const pct = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
      if (Math.abs(pct - lastPct) < 0.004) return;
      lastPct = pct;
      onScrollFractionRef.current?.(pct);
    };
    const onScroll = () => {
      if (!scrollRaf) scrollRaf = requestAnimationFrame(reportScroll);
    };
    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      viewRef.current = null;
      setScroller(null);
      view.scrollDOM.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(scrollRaf);
      view.destroy();
    };
    // The view owns the document after mount; external value changes are
    // synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply external changes (restore, template swap) without recreating the view.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value, viewRef]);

  return (
    <div className="relative h-full min-h-0">
      <div ref={hostRef} className="h-full min-h-0" />
      <EditorScrollbar scroller={scroller} revision={revision} estimatedPages={estimatedPages} />
    </div>
  );
}
