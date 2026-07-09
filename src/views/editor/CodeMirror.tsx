import { useEffect, useRef } from "react";
import { EditorView, keymap, placeholder, type ViewUpdate } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

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
  { tag: tags.contentSeparator, color: "var(--faint)" },
  { tag: tags.meta, color: "var(--faint)" },
  { tag: tags.processingInstruction, color: "var(--faint)" },
]);

const editorTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "var(--ink)" },
  ".cm-content": {
    padding: "16px 4px 45vh",
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
  ".cm-scroller": { overflow: "auto" },
});

export interface CodeMirrorProps {
  value: string;
  onChange: (value: string) => void;
  onSaveShortcut?: () => void;
  viewRef: React.MutableRefObject<EditorView | null>;
}

export function CodeMirror({ value, onChange, onSaveShortcut, viewRef }: CodeMirrorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSaveShortcut);
  onChangeRef.current = onChange;
  onSaveRef.current = onSaveShortcut;

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
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(mdHighlight),
          editorTheme,
          EditorView.lineWrapping,
          placeholder("Paste or write your content here…"),
          EditorView.updateListener.of((u: ViewUpdate) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
    // The view owns the document after mount; external value changes are
    // synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply external changes (AI apply, restore) without recreating the view.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value, viewRef]);

  return <div ref={hostRef} className="h-full min-h-0" />;
}
