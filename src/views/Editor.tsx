import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { navigate } from "../lib/router";
import { flushSaves, updateDoc, useApp } from "../lib/store";
import { contentStats, cx } from "../lib/utils";
import type { Doc } from "../lib/types";
import { Button, IconButton, Segmented, useToast } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { CodeMirror } from "./editor/CodeMirror";
import { Toolbar } from "./editor/Toolbar";
import { Preview, type InlineEdit } from "./editor/Preview";
import { Details, DetailsPane } from "./editor/Details";
import { Publish } from "./editor/Publish";

type Tab = "write" | "preview";

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const SETTINGS_MIN = 240;
const SETTINGS_MAX = 480;
const PREVIEW_MIN = 320;
const PREVIEW_MAX = 720;
const EDITOR_MIN = 300;
const RESIZER_W = 6;
const RAIL_W = 16;

/** Reads/writes a UI preference to localStorage, falling back silently in
    private-browsing contexts where storage access throws. */
function usePersisted<T extends number | boolean>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      return (typeof initial === "boolean" ? raw === "1" : Number(raw)) as T;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
    } catch {
      /* private mode */
    }
  }, [key, value]);
  return [value, setValue];
}

/** Drag-to-resize divider between two panes. Pointer events unify mouse,
    trackpad and touch so it works the same on a tablet as a laptop. */
function PaneResizer({ onDrag, label }: { onDrag: (deltaX: number) => void; label: string }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      className="group relative hidden w-1.5 flex-none cursor-col-resize touch-none select-none md:block"
      onPointerDown={(e) => {
        dragging.current = true;
        lastX.current = e.clientX;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        onDrag(e.clientX - lastX.current);
        lastX.current = e.clientX;
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-edge transition-colors group-hover:bg-accent" />
    </div>
  );
}

/** The thin strip a collapsed pane shrinks to — near-zero footprint, but
    always there to tap or click to bring the pane back. */
function CollapsedRail({ label, icon, side, onExpand }: { label: string; icon: IconName; side: "left" | "right"; onExpand: () => void }) {
  return (
    <button
      onClick={onExpand}
      title={`Show ${label}`}
      aria-label={`Show ${label}`}
      className={cx(
        "hidden flex-none flex-col items-center justify-center gap-2 bg-raised text-faint transition-colors hover:bg-accent/10 hover:text-accent md:flex",
        side === "left" ? "border-r border-edge" : "border-l border-edge",
      )}
      style={{ width: RAIL_W }}
    >
      <Icon name={icon} size={12} />
    </button>
  );
}

/** Rewrites the text of one heading source line, preserving its `#`s. */
function patchHeadingLine(body: string, line: number, text: string): string {
  const lines = body.split("\n");
  if (line < 1 || line > lines.length) return body;
  const m = lines[line - 1].match(/^(\s*#{1,6}\s+)/);
  if (!m) return body;
  lines[line - 1] = m[1] + text;
  return lines.join("\n");
}

export function Editor({ id }: { id: string }) {
  const { docs, brand, settings } = useApp();
  const toast = useToast();
  const doc = docs.find((d) => d.id === id);

  const viewRef = useRef<EditorView | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("write");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);

  const [settingsWidth, setSettingsWidth] = usePersisted<number>("ps2:pane:settingsWidth", 300);
  const [previewWidth, setPreviewWidth] = usePersisted<number>("ps2:pane:previewWidth", 440);
  const [settingsCollapsed, setSettingsCollapsed] = usePersisted<boolean>("ps2:pane:settingsCollapsed", false);
  const [previewCollapsed, setPreviewCollapsed] = usePersisted<boolean>("ps2:pane:previewCollapsed", false);

  // Keep the persisted pane widths honest against whatever room the
  // workspace actually has — on mount, on window resize, and on tablet
  // orientation changes. The editor always wins the space it needs;
  // settings shrinks first, then preview, then either collapses to a
  // rail rather than being squeezed to the point of being unusable.
  const paneStateRef = useRef({ settingsWidth, previewWidth, settingsCollapsed, previewCollapsed, fullscreen });
  paneStateRef.current = { settingsWidth, previewWidth, settingsCollapsed, previewCollapsed, fullscreen };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const fit = () => {
      const s = paneStateRef.current;
      if (s.fullscreen) return;
      const avail = el.clientWidth;
      if (avail <= 0) return;

      let sw = s.settingsWidth;
      let pw = s.previewWidth;
      let sc = s.settingsCollapsed;
      let pc = s.previewCollapsed;
      const footprint = () => (sc ? RAIL_W : sw) + (pc ? RAIL_W : pw) + (sc ? 0 : RESIZER_W) + (pc ? 0 : RESIZER_W) + EDITOR_MIN;

      if (footprint() > avail && !sc) sw = SETTINGS_MIN;
      if (footprint() > avail && !pc) pw = PREVIEW_MIN;
      if (footprint() > avail && !sc) sc = true;
      if (footprint() > avail && !pc) pc = true;

      if (sw !== s.settingsWidth) setSettingsWidth(sw);
      if (pw !== s.previewWidth) setPreviewWidth(pw);
      if (sc !== s.settingsCollapsed) setSettingsCollapsed(sc);
      if (pc !== s.previewCollapsed) setPreviewCollapsed(pc);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resizeSettings = useCallback(
    (dx: number) => {
      const avail = wrapRef.current?.clientWidth ?? 2000;
      const rightTaken = previewCollapsed ? RAIL_W : previewWidth;
      const max = Math.max(SETTINGS_MIN, Math.min(SETTINGS_MAX, avail - rightTaken - EDITOR_MIN - RESIZER_W * 2));
      setSettingsWidth((w) => clamp(w + dx, SETTINGS_MIN, max));
    },
    [previewCollapsed, previewWidth, setSettingsWidth],
  );

  const resizePreview = useCallback(
    (dx: number) => {
      const avail = wrapRef.current?.clientWidth ?? 2000;
      const leftTaken = settingsCollapsed ? RAIL_W : settingsWidth;
      const max = Math.max(PREVIEW_MIN, Math.min(PREVIEW_MAX, avail - leftTaken - EDITOR_MIN - RESIZER_W * 2));
      setPreviewWidth((w) => clamp(w - dx, PREVIEW_MIN, max));
    },
    [settingsCollapsed, settingsWidth, setPreviewWidth],
  );

  const onChange = useCallback((patch: Partial<Doc>) => updateDoc(id, patch), [id]);

  const onInlineEdit = useCallback(
    (edit: InlineEdit) => {
      if ("field" in edit) {
        if (edit.field === "title" || edit.field === "subtitle") updateDoc(id, { [edit.field]: edit.text });
      } else {
        const current = docs.find((d) => d.id === id);
        if (current) updateDoc(id, { body: patchHeadingLine(current.body, edit.line, edit.text) });
      }
    },
    [id, docs],
  );

  /** Preview → editor: move the CodeMirror cursor to the clicked
      element's source line, focusing the editor unless the click landed
      on something the preview itself is already editing inline. */
  const onFocusLine = useCallback((line: number, focusEditor: boolean) => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc;
    const ln = Math.max(1, Math.min(doc.lines, line));
    const pos = doc.line(ln).from;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    if (focusEditor) {
      setTab("write"); // surface the editor pane on the mobile write/preview toggle
      requestAnimationFrame(() => view.focus());
    }
  }, []);

  // Word-count is a full-text scan — defer it so it never competes with
  // a keystroke on very large documents.
  const deferredBody = useDeferredValue(doc?.body ?? "");
  const stats = useMemo(() => contentStats(deferredBody), [deferredBody]);

  if (!doc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-faint">
        <p className="text-sm">This document doesn’t exist anymore.</p>
        <Button icon="back" onClick={() => navigate("library")}>
          Back to library
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-edge bg-surface px-2.5 py-2 sm:px-4">
        <IconButton label="Back to library" name="back" size={18} onClick={() => navigate("library")} />
        <input
          value={doc.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="min-w-0 flex-1 truncate bg-transparent text-[15px] font-bold outline-none placeholder:text-faint"
          placeholder="Untitled document"
          aria-label="Document title"
        />
        <span className="hidden text-xs text-faint lg:inline">{stats.words.toLocaleString()} words · autosaved</span>
        <IconButton label="Markdown guide" name="help" size={17} onClick={() => navigate("help")} />
        <IconButton
          label="Document details & layout"
          name="sliders"
          active={!settingsCollapsed}
          onClick={() => {
            setDetailsOpen(true); // mobile: opens the slide-over modal
            setSettingsCollapsed(false); // md+: expands (or focuses) the persistent pane
          }}
        />
        <Button
          variant="primary"
          icon="export"
          onClick={() => {
            flushSaves();
            setPublishOpen(true);
          }}
          className="px-2.5 sm:px-3"
        >
          <span className="hidden sm:inline">Publish PDF</span>
        </Button>
      </header>

      {/* Write / Preview switch below the `md` pane breakpoint (hidden in full-screen preview) */}
      {!fullscreen && (
        <div className="flex justify-center border-b border-edge bg-surface py-1.5 md:hidden">
          <Segmented
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: "write", label: "Write", icon: "edit", hint: "The Markdown source — formatting toolbar, syntax highlighting." },
              { value: "preview", label: "Preview", icon: "eye", hint: "See the formatted document as it will publish." },
            ]}
          />
        </div>
      )}

      <div ref={wrapRef} className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Settings pane — md and up only; the mobile equivalent is the <Details> modal below. */}
        {!fullscreen &&
          (settingsCollapsed ? (
            <CollapsedRail label="settings panel" icon="chevronRight" side="left" onExpand={() => setSettingsCollapsed(false)} />
          ) : (
            <>
              <div className="hidden md:flex md:min-h-0 md:flex-none md:flex-col md:border-r md:border-edge" style={{ width: settingsWidth }}>
                <DetailsPane doc={doc} onChange={onChange} onCollapse={() => setSettingsCollapsed(true)} />
              </div>
              <PaneResizer label="Resize settings panel" onDrag={resizeSettings} />
            </>
          ))}

        {/* Markdown editor — always the primary pane, fills whatever space the side panes leave. */}
        <div
          className={cx(
            "min-w-0 flex-1 flex-col md:border-r md:border-edge",
            fullscreen ? "hidden" : "md:flex",
            tab === "write" ? "flex" : "hidden",
          )}
        >
          <Toolbar getView={() => viewRef.current} />
          <div className="min-h-0 flex-1">
            <CodeMirror
              value={doc.body}
              onChange={(body) => onChange({ body })}
              onCursorLine={setCursorLine}
              onSaveShortcut={() => {
                flushSaves();
                toast("Saved", "ok");
              }}
              viewRef={viewRef}
            />
          </div>
        </div>

        {/* Live preview */}
        {!fullscreen && !previewCollapsed && <PaneResizer label="Resize preview panel" onDrag={resizePreview} />}
        <div
          className={cx(
            "min-w-0 flex-1",
            fullscreen ? "block md:w-full" : "md:block md:flex-none",
            tab === "preview" || fullscreen ? "block" : "hidden",
            !fullscreen && previewCollapsed && "md:hidden",
          )}
          style={!fullscreen && !previewCollapsed ? { width: previewWidth } : undefined}
        >
          <Preview
            doc={doc}
            brand={brand}
            theme={settings.docTheme}
            cursorLine={cursorLine}
            onInlineEdit={onInlineEdit}
            onFocusLine={onFocusLine}
            fullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen((v) => !v)}
            onCollapse={() => setPreviewCollapsed(true)}
          />
        </div>
        {!fullscreen && previewCollapsed && (
          <CollapsedRail label="preview panel" icon="chevronLeft" side="right" onExpand={() => setPreviewCollapsed(false)} />
        )}
      </div>

      <Details open={detailsOpen} onClose={() => setDetailsOpen(false)} doc={doc} onChange={onChange} />

      {publishOpen && <Publish doc={doc} brand={brand} settings={settings} onClose={() => setPublishOpen(false)} />}
    </div>
  );
}
