import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { openSearchPanel } from "@codemirror/search";
import { navigate } from "../lib/router";
import { flushSaves, updateDoc, useApp } from "../lib/store";
import { contentStats, cx, estimatePages } from "../lib/utils";
import { imageFileToMarkdown, isImageFile } from "../lib/image";
import type { Doc } from "../lib/types";
import { Button, DropOverlay, IconButton, Segmented, useFileDrop, useToast } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { openPalette } from "../components/CommandPalette";
import { stageAndReviewForInsert } from "../components/ImportReview";
import { saveLastSession } from "../lib/session";
import { StudioNav } from "../components/StudioNav";
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
const RESIZER_W = 8;
const RAIL_W = 18;

const DEFAULT_SETTINGS_WIDTH = 300;
const DEFAULT_PREVIEW_WIDTH = 440;

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

const RESIZE_KEY_STEP = 24;

/** Drag-to-resize divider between two panes. Pointer events unify mouse,
    trackpad and touch so it works the same on a tablet as a laptop; arrow
    keys give the same control to keyboard users (the divider is a real
    `tabIndex`-reachable separator, not just a mouse target). */
function PaneResizer({ onDrag, label }: { onDrag: (deltaX: number) => void; label: string }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      className="group relative hidden w-2 flex-none cursor-col-resize touch-none select-none focus-visible:outline-none md:block"
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
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onDrag(-RESIZE_KEY_STEP);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onDrag(RESIZE_KEY_STEP);
        }
      }}
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-edge transition-colors group-hover:bg-accent group-focus-visible:bg-accent group-focus-visible:w-0.5" />
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

export function Editor({ id, line }: { id: string; line?: number }) {
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

  const [settingsWidth, setSettingsWidth] = usePersisted<number>("ps2:pane:settingsWidth", DEFAULT_SETTINGS_WIDTH);
  const [previewWidth, setPreviewWidth] = usePersisted<number>("ps2:pane:previewWidth", DEFAULT_PREVIEW_WIDTH);
  const [settingsCollapsed, setSettingsCollapsed] = usePersisted<boolean>("ps2:pane:settingsCollapsed", false);
  const [previewCollapsed, setPreviewCollapsed] = usePersisted<boolean>("ps2:pane:previewCollapsed", false);
  // Full Workspace toggle: hides the formatting toolbar, tucks the
  // settings pane away (without disturbing its own persisted collapse
  // state, so turning it off restores exactly what was open) and — where
  // the browser allows it — requests real full-screen so tablet/laptop
  // chrome gets out of the way too. Most valuable on a tablet like the
  // Galaxy Tab S9 FE+, where the address bar otherwise eats writing room.
  const [focusMode, setFocusMode] = usePersisted<boolean>("ps2:editor:focusMode", false);
  const effSettingsCollapsed = settingsCollapsed || focusMode;
  const exitFocus = () => {
    setFocusMode(false);
    setSettingsCollapsed(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };
  const toggleFocusMode = () => {
    const next = !focusMode;
    setFocusMode(next);
    // Fullscreen support varies (iOS Safari has none); focus mode itself
    // still works without it, so a missing/rejected request is silent.
    if (next) document.documentElement.requestFullscreen?.()?.catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  // "Reset to Default Settings" — restores the three-pane workspace
  // (widths, collapse state, focus mode) to first-run defaults without
  // touching the document itself.
  const resetLayout = () => {
    setSettingsWidth(DEFAULT_SETTINGS_WIDTH);
    setPreviewWidth(DEFAULT_PREVIEW_WIDTH);
    setSettingsCollapsed(false);
    setPreviewCollapsed(false);
    setFocusMode(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    toast("Workspace layout reset", "ok");
  };

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

  // Settings-pane Undo — captures the pre-change value of each field a
  // settings edit touches so the most recent change can be reverted. Only
  // the settings pane (Details) routes through this; body/title/inline
  // edits keep their own CodeMirror/field undo, so this stack stays a
  // clean, predictable history of layout & metadata changes.
  const docRef = useRef(doc);
  docRef.current = doc;
  const undoStack = useRef<Partial<Doc>[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  useEffect(() => {
    undoStack.current = [];
    setUndoDepth(0);
  }, [id]);
  const settingsChange = useCallback(
    (patch: Partial<Doc>) => {
      const cur = docRef.current;
      if (cur) {
        const prev: Record<string, unknown> = {};
        for (const k of Object.keys(patch)) prev[k] = (cur as unknown as Record<string, unknown>)[k];
        undoStack.current.push(prev as Partial<Doc>);
        if (undoStack.current.length > 50) undoStack.current.shift();
        setUndoDepth(undoStack.current.length);
      }
      updateDoc(id, patch);
    },
    [id],
  );
  const undoSettings = useCallback(() => {
    const prev = undoStack.current.pop();
    setUndoDepth(undoStack.current.length);
    if (prev) updateDoc(id, prev);
  }, [id]);

  // Remembers the open document + cursor line for "Resume last session"
  // (debounced so rapid cursor movement doesn't spam localStorage).
  useEffect(() => {
    const timer = setTimeout(() => saveLastSession(id, cursorLine), 500);
    return () => clearTimeout(timer);
  }, [id, cursorLine]);

  // Deep link from universal search (#/edit/:id/:line): put the cursor
  // on the matched line. Child effects run first, so the view exists.
  useEffect(() => {
    const view = viewRef.current;
    if (!line || !view) return;
    const ln = Math.min(view.state.doc.lines, line);
    view.dispatch({ selection: { anchor: view.state.doc.line(ln).from }, scrollIntoView: true });
  }, [id, line]);

  /** Insert one or more images at the cursor as self-contained data-URI
      Markdown — shared by drag-drop, clipboard paste and the toolbar. */
  const insertImages = useCallback(
    async (files: File[]) => {
      const view = viewRef.current;
      if (!view || files.length === 0) return;
      try {
        const parts = await Promise.all(files.map((f) => imageFileToMarkdown(f)));
        view.dispatch({ ...view.state.replaceSelection(parts.join("")), scrollIntoView: true });
        toast(`Inserted ${files.length} image${files.length === 1 ? "" : "s"}`, "ok");
      } catch {
        toast("Couldn't read that image — try a PNG, JPEG or SVG", "error");
      }
    },
    [toast],
  );

  // Dropping files on the editor: images insert inline; .md/.txt/.html/.docx
  // go through the Import Review modal so the author can confirm or edit the
  // converted Markdown before it lands (whole-file import lives in the Library).
  const drop = useFileDrop((files) => {
    const images = files.filter(isImageFile);
    const rest = files.filter((f) => !isImageFile(f));
    if (images.length) void insertImages(images);
    if (rest.length)
      void stageAndReviewForInsert(rest, toast, (markdown) => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({ ...view.state.replaceSelection(markdown), scrollIntoView: true });
      });
  });

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

  /** The editor header's search button searches only inside the Markdown
      editor (highlight, next/previous, auto-scroll, focus stays in the
      editor) — global cross-document search stays on Ctrl+K. Surfaces the
      write pane first on mobile so the find bar is visible. */
  const searchInEditor = useCallback(() => {
    const view = viewRef.current;
    if (!view) return openPalette();
    setTab("write");
    openSearchPanel(view);
  }, []);

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
  const estPages = useMemo(
    () => estimatePages(stats.words, doc?.layout.density ?? "comfort", !!doc?.layout.cover, !!(doc?.layout.toc && stats.headings > 0)),
    [stats.words, stats.headings, doc?.layout.density, doc?.layout.cover, doc?.layout.toc],
  );

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
        <StudioNav />
        <input
          value={doc.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="min-w-0 flex-1 truncate bg-transparent text-[15px] font-bold outline-none placeholder:text-faint"
          placeholder="Untitled document"
          aria-label="Document title"
        />
        <span className="hidden text-xs text-faint lg:inline">{stats.words.toLocaleString()} words · autosaved</span>
        <IconButton label="Find in this document (Ctrl+F) — search the Markdown editor" name="search" size={17} onClick={searchInEditor} />
        <IconButton label="Markdown guide" name="help" size={17} onClick={() => navigate("help")} />
        <IconButton
          label="Document details & layout"
          name="sliders"
          active={!effSettingsCollapsed}
          onClick={() => {
            setDetailsOpen(true); // mobile: opens the slide-over modal
            exitFocus(); // md+: expands (or focuses) the persistent pane
          }}
        />
        <IconButton
          label={focusMode ? "Exit Full Workspace mode" : "Full Workspace mode — hides the toolbar, settings pane and browser chrome for distraction-free writing"}
          name="focus"
          active={focusMode}
          onClick={toggleFocusMode}
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
          (effSettingsCollapsed ? (
            <CollapsedRail label="settings panel" icon="chevronRight" side="left" onExpand={exitFocus} />
          ) : (
            <>
              <div className="hidden md:flex md:min-h-0 md:flex-none md:flex-col md:border-r md:border-edge" style={{ width: settingsWidth }}>
                <DetailsPane
                  doc={doc}
                  onChange={settingsChange}
                  onCollapse={() => setSettingsCollapsed(true)}
                  onResetLayout={resetLayout}
                  onUndo={undoSettings}
                  canUndo={undoDepth > 0}
                />
              </div>
              <PaneResizer label="Resize settings panel" onDrag={resizeSettings} />
            </>
          ))}

        {/* Markdown editor — always the primary pane, fills whatever space the side panes leave. */}
        <div
          className={cx(
            "relative min-w-0 flex-1 flex-col md:border-r md:border-edge",
            fullscreen ? "hidden" : "md:flex",
            tab === "write" ? "flex" : "hidden",
          )}
          {...drop.handlers}
        >
          {!focusMode && <Toolbar getView={() => viewRef.current} />}
          <div className="min-h-0 flex-1">
            <CodeMirror
              value={doc.body}
              onChange={(body) => onChange({ body })}
              onCursorLine={setCursorLine}
              onSaveShortcut={() => {
                flushSaves();
                toast("Saved", "ok");
              }}
              onSmartPaste={(summary) => toast(`${summary} — Ctrl+Z restores the original`, "ok")}
              onImageFiles={insertImages}
              estimatedPages={estPages}
              viewRef={viewRef}
            />
          </div>
          <DropOverlay show={drop.over} label="Drop to insert at the cursor" />
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
            estimatedPages={estPages}
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

      <Details
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        doc={doc}
        onChange={settingsChange}
        onUndo={undoSettings}
        canUndo={undoDepth > 0}
      />

      {publishOpen && <Publish doc={doc} brand={brand} settings={settings} onClose={() => setPublishOpen(false)} />}
    </div>
  );
}
