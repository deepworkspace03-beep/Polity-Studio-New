import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BrandConfig, CoverColors, CoverDesign, CoverPattern, Doc, DocLayout } from "../../lib/types";
import { saveBrand, saveSettings, useApp } from "../../lib/store";
import { DEFAULT_BRAND, DEFAULT_COVER_DESIGN, DEFAULT_LAYOUT, seedCoverDesign } from "../../brand/defaults";
import { canSavePreset, deletePreset, duplicatePreset, MAX_PRESETS, renamePreset, savePreset, usePresets } from "../../lib/presets";
import { canSaveCoverDesign, deleteCoverDesign, favoriteCoverDesigns, MAX_COVER_DESIGNS, saveCoverDesign, toggleFavoriteCoverDesign, useCoverDesigns } from "../../lib/coverDesigns";
import { canSavePalette, DEFAULT_PALETTES, deleteCustomPalette, MAX_PALETTES, samePalette, saveCustomPalette, useCustomPalettes, type PaletteColors } from "../../lib/palettes";
import { TEMPLATE_META } from "../../templates/meta";
import { parseMcq, validateMcq } from "../../markdown/mcq";
import { Button, Field, HintBubble, IconButton, Modal, Segmented, Toggle, inputClass, useFocusTrap, useLongPressHint, useToast } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { cx } from "../../lib/utils";

const COVER_STYLES: { id: Exclude<DocLayout["coverStyle"], "custom">; label: string; swatch: string }[] = [
  { id: "meridian", label: "Meridian", swatch: "linear-gradient(150deg,#0a1526,#16305a 62%,#d8b878 205%)" },
  { id: "aurora", label: "Aurora", swatch: "linear-gradient(140deg,#123c93,#0d76b2 52%,#0a9f80)" },
  { id: "eclipse", label: "Eclipse", swatch: "linear-gradient(160deg,#0c1017,#1a2434 62%,#d3a662 210%)" },
];

const COVER_COLOR_FIELDS: { key: keyof CoverColors; label: string; fallback: string }[] = [
  { key: "bg", label: "Background", fallback: "#12203a" },
  { key: "ink", label: "Heading", fallback: "#f5f2ea" },
  { key: "accent", label: "Accent", fallback: "#c9bc9e" },
];

/* ── Cover Designer (the "Custom" style) ──────────────────────────────
   Fully parameterises the shared cover skeleton — background gradient,
   ink/accent, vector pattern, title typography, alignment, frame,
   emblem and an optional uploaded logo. The flow preview is the live
   canvas: every change re-renders the cover in place. */

/* A short, curated set of subtle, publication-grade textures — elegance
   over decoration. Each stays a faint vector layer. */
const PATTERN_OPTIONS: { value: CoverPattern; label: string }[] = [
  { value: "none", label: "None" },
  { value: "geometry", label: "Geometry" },
  { value: "abstract", label: "Arcs" },
  { value: "globe", label: "Globe" },
];

/** Two cover designs are "the same" for the purpose of highlighting which
    saved design is active — a value compare over the design snapshot. */
function sameDesign(a: CoverDesign | undefined, b: CoverDesign): boolean {
  return !!a && JSON.stringify({ ...DEFAULT_COVER_DESIGN, ...a }) === JSON.stringify({ ...DEFAULT_COVER_DESIGN, ...b });
}

const TITLE_SIZES: { value: string; label: string }[] = [
  { value: "0.8", label: "S" },
  { value: "1", label: "M" },
  { value: "1.15", label: "L" },
  { value: "1.3", label: "XL" },
];

/** Remembers a section's open/closed state across reloads, falling back
    silently where storage is unavailable (private mode). */
function useDisclosure(key: string, initial: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : raw === "1";
    } catch {
      return initial;
    }
  });
  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  };
  return [open, toggle];
}

/** A titled, collapsible group in the settings pane. Keeps the everyday
    fields one tap away while letting advanced groups fold out of sight to
    cut clutter; the open/closed choice persists per group. */
function CollapsibleGroup({
  title,
  storageKey,
  defaultOpen = true,
  children,
}: {
  title: string;
  storageKey: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, toggle] = useDisclosure(storageKey, defaultOpen);
  return (
    <section className="border-t border-edge pt-4 first:border-0 first:pt-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md py-0.5 text-left"
      >
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-faint">{title}</h3>
        <Icon name="chevronDown" size={15} className={cx("flex-none text-faint transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </section>
  );
}

/** A labeled sub-group inside the Cover Designer — a hairline rule and a
    small caption keep the many controls visually balanced and scannable. */
function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5 border-t border-edge/70 pt-3 first:border-0 first:pt-0">
      <span className="block text-[10.5px] font-bold uppercase tracking-wide text-faint">{label}</span>
      {children}
    </div>
  );
}

/** Downscale an uploaded logo to ≤320 px and store it as a PNG data URI
    (PNG keeps transparency; the PDF engine embeds it as-is). */
async function fileToLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error("not an image"));
      img.src = url;
    });
    if (!img.naturalWidth) throw new Error("image has no size");
    const scale = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Icon-only swatch — title covers desktop hover, the shared long-press
    hint covers touch (Tab-class devices don't reliably show `title`). */
function SwatchButton({ label, swatch, onClick }: { label: string; swatch: string; onClick: () => void }) {
  const hint = useLongPressHint();
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="relative h-5 w-8 rounded border border-black/20"
      style={{ background: swatch }}
      {...hint.handlers}
    >
      <HintBubble show={hint.show} text={label} />
    </button>
  );
}

/** Compact inline colour control — a small swatch beside its label so a
    row of colours stays on one low line instead of a grid of tall boxes. */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5" title={label}>
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-7 flex-none cursor-pointer rounded border border-edge bg-transparent p-0"
      />
      <span className="text-[10.5px] font-medium text-ink-2">{label}</span>
    </label>
  );
}

function CoverDesigner({ doc, onChange }: { doc: Doc; onChange: (patch: Partial<Doc>) => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [savePrompt, setSavePrompt] = useState(false);
  const design: CoverDesign = { ...DEFAULT_COVER_DESIGN, ...doc.layout.coverDesign };
  const set = (patch: Partial<CoverDesign>) =>
    onChange({ layout: { ...doc.layout, coverDesign: { ...design, ...patch } } });

  return (
    <div className="space-y-4 rounded-xl border border-edge p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-faint">Start from</span>
        <div className="flex items-center gap-1.5">
          {COVER_STYLES.map((s) => (
            <SwatchButton
              key={s.id}
              label={`Reset the design to the ${s.label} palette`}
              swatch={s.swatch}
              onClick={() => onChange({ layout: { ...doc.layout, coverDesign: seedCoverDesign(s.id) } })}
            />
          ))}
        </div>
      </div>
      {/* Save the current design to the personal library so it appears beside
          the presets for one-tap reuse on any document. */}
      <button
        type="button"
        onClick={() => {
          if (!canSaveCoverDesign()) {
            toast(`Saved-design limit reached (${MAX_COVER_DESIGNS}) — delete one first`, "info");
            return;
          }
          setSavePrompt(true);
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-edge py-1.5 text-[11px] font-semibold text-ink-2 hover:border-accent hover:text-accent"
      >
        <Icon name="star" size={13} />
        Save this design
      </button>
      <NamePromptModal
        open={savePrompt}
        title="Name this cover design"
        initial="My cover"
        onClose={() => setSavePrompt(false)}
        onSubmit={(name) => {
          saveCoverDesign(name, design);
          toast(`Saved cover design “${name}”`, "ok");
        }}
      />

      <FieldGroup label="Colors">
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          <ColorField label="Background 1" value={design.bg1} onChange={(bg1) => set({ bg1 })} />
          <ColorField label="Background 2" value={design.bg2} onChange={(bg2) => set({ bg2 })} />
          <ColorField label="Text" value={design.ink} onChange={(ink) => set({ ink })} />
          <ColorField label="Accent" value={design.accent} onChange={(accent) => set({ accent })} />
        </div>
        <Field label={`Gradient angle — ${design.angle}°`}>
          <input type="range" min={0} max={360} step={5} value={design.angle} onChange={(e) => set({ angle: Number(e.target.value) })} className="w-full" />
        </Field>
      </FieldGroup>

      <FieldGroup label="Pattern">
        <div className="flex flex-wrap gap-1.5">
          {PATTERN_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => set({ pattern: o.value })}
              aria-pressed={design.pattern === o.value}
              className={cx(
                "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                design.pattern === o.value ? "border-accent text-accent" : "border-edge text-ink-2 hover:border-faint",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {design.pattern !== "none" && (
          <Field label={`Opacity — ${Math.round(design.patternOpacity * 100)}%`}>
            <input type="range" min={1} max={30} step={1} value={Math.round(design.patternOpacity * 100)} onChange={(e) => set({ patternOpacity: Number(e.target.value) / 100 })} className="w-full" />
          </Field>
        )}
      </FieldGroup>

      <FieldGroup label="Typography">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Font">
            <Segmented
              size="sm"
              value={design.titleFont}
              onChange={(titleFont) => set({ titleFont })}
              options={[
                { value: "serif", label: "Serif" },
                { value: "sans", label: "Sans" },
              ]}
            />
          </Field>
          <Field label="Size">
            <Segmented size="sm" value={String(design.titleScale)} onChange={(v) => set({ titleScale: Number(v) })} options={TITLE_SIZES} />
          </Field>
        </div>
        <Field label="Alignment">
          <Segmented
            size="sm"
            value={design.align}
            onChange={(align) => set({ align })}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Centered" },
            ]}
          />
        </Field>
      </FieldGroup>

      <FieldGroup label="Structure">
        <Field label="Hairline frame">
          <Segmented
            size="sm"
            columns={2}
            value={(design.frameStyle === ("double" as CoverDesign["frameStyle"]) ? "shaded" : design.frameStyle) ?? (design.frame ? "single" : "none")}
            onChange={(frameStyle) => set({ frameStyle, frame: frameStyle !== "none" })}
            options={[
              { value: "none", label: "None" },
              { value: "single", label: "Hairline" },
              { value: "shaded", label: "Shaded" },
              { value: "accent", label: "Accent" },
            ]}
          />
        </Field>
        <Field label="Title box">
          <Segmented
            size="sm"
            columns={2}
            value={design.titleBox ?? "none"}
            onChange={(titleBox) => set({ titleBox })}
            options={[
              { value: "none", label: "None" },
              { value: "outline", label: "Outline" },
              { value: "filled", label: "Filled" },
              { value: "premium", label: "Premium" },
            ]}
          />
        </Field>
      </FieldGroup>

      <FieldGroup label="Branding">
        <Toggle label="Temple emblem" checked={design.emblem} onChange={(emblem) => set({ emblem })} />
        <div className="flex flex-wrap items-center gap-2">
          {design.logo && <img src={design.logo} alt="Logo" className="h-8 w-8 rounded border border-edge object-contain" />}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-edge px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:border-faint"
          >
            {design.logo ? "Replace logo" : "Upload logo…"}
          </button>
          {design.logo && (
            <button type="button" onClick={() => set({ logo: undefined })} className="text-xs font-medium text-faint underline decoration-dotted">
              Remove
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                set({ logo: await fileToLogo(file) });
              } catch {
                toast("Couldn't read that image — try a PNG, JPEG or SVG", "error");
              }
            }}
          />
        </div>
        <p className="text-[10.5px] leading-relaxed text-faint">The logo replaces the temple mark next to the publication name. Everything here previews live on the cover.</p>
      </FieldGroup>
    </div>
  );
}

/** Optional per-document overrides on top of the chosen cover style's own
    palette — each field is independent and falls back to the style's own
    color until the author picks one. */
function CoverColorPicker({ doc, onChange }: { doc: Doc; onChange: (patch: Partial<Doc>) => void }) {
  const colors = doc.layout.coverColors;
  function set(key: keyof CoverColors, value: string | undefined) {
    const next: CoverColors = { ...colors };
    if (value) next[key] = value;
    else delete next[key];
    onChange({ layout: { ...doc.layout, coverColors: Object.keys(next).length ? next : undefined } });
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {COVER_COLOR_FIELDS.map((f) => {
        const active = !!colors?.[f.key];
        return (
          <div key={f.key} className="flex items-center gap-1.5" title={active ? `${f.label} (overridden)` : `${f.label} — using style default`}>
            <input
              type="color"
              aria-label={f.label}
              value={colors?.[f.key] || f.fallback}
              onChange={(e) => set(f.key, e.target.value)}
              className={cx("h-6 w-7 flex-none cursor-pointer rounded border bg-transparent p-0", active ? "border-accent" : "border-edge")}
            />
            <span className="text-[10.5px] font-medium text-ink-2">{f.label}</span>
            {active && (
              <IconButton label={`Reset ${f.label} to the style default`} name="refresh" size={11} className="p-0.5 text-faint hover:text-accent" onClick={() => set(f.key, undefined)} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Single-field name prompt (preset save/rename) — the app's own Modal
    instead of window.prompt(), so it matches the rest of the UI, keeps
    focus trapped/restored consistently and works in embedded contexts
    where the native prompt is unavailable or disabled. */
function NamePromptModal({
  open,
  title,
  initial,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  initial: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = value.trim();
          if (trimmed) onSubmit(trimmed);
          onClose();
        }}
      >
        <Field label="Name">
          <input autoFocus className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type PresetPrompt = { mode: "save" } | { mode: "rename"; id: string; current: string };

/** Named layout presets — save the current cover/TOC/watermark/size/
    density/answers set under a name and reapply it to any document.
    Reuses the shared preset store (lib/presets.ts); applying goes through
    the same onChange as every other field, so it's captured by Undo. */
function LayoutPresets({ layout, onApply }: { layout: DocLayout; onApply: (layout: DocLayout) => void }) {
  const presets = usePresets();
  const toast = useToast();
  const [prompt, setPrompt] = useState<PresetPrompt | null>(null);
  // Deleting a preset is not covered by document Undo (presets live in
  // localStorage, not the doc), so a one-tap trash icon is too easy to
  // regret — confirm first, matching the app's other destructive actions.
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="space-y-2 rounded-xl border border-edge p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-2">Layout presets</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onApply({ ...DEFAULT_LAYOUT })}
            title="Reset this document's layout to the Studio defaults"
            className="rounded-md border border-edge px-2 py-0.5 text-[11px] font-semibold text-ink-2 hover:border-faint"
          >
            Restore defaults
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canSavePreset()) {
                toast(`Preset limit reached (${MAX_PRESETS}) — delete one first`, "info");
                return;
              }
              setPrompt({ mode: "save" });
            }}
            className="rounded-md border border-edge px-2 py-0.5 text-[11px] font-semibold text-ink-2 hover:border-faint"
          >
            Save current
          </button>
        </div>
      </div>
      {presets.length === 0 ? (
        <p className="text-[10.5px] text-faint">No presets yet — “Save current” stores this document's layout for reuse.</p>
      ) : (
        <ul className="space-y-1">
          {presets.map((p) => (
            <li key={p.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onApply({ ...p.layout });
                  toast(`Applied “${p.name}”`, "ok");
                }}
                title={`Apply “${p.name}” to this document`}
                className="min-w-0 flex-1 truncate rounded-md border border-edge px-2 py-1 text-left text-[11px] font-semibold text-ink-2 hover:border-accent hover:text-accent"
              >
                {p.name}
              </button>
              <IconButton
                label="Rename preset"
                name="edit"
                size={13}
                onClick={() => setPrompt({ mode: "rename", id: p.id, current: p.name })}
              />
              <IconButton
                label="Duplicate preset"
                name="copy"
                size={13}
                onClick={() => {
                  if (!canSavePreset()) {
                    toast(`Preset limit reached (${MAX_PRESETS}) — delete one first`, "info");
                    return;
                  }
                  duplicatePreset(p.id);
                  toast(`Duplicated “${p.name}”`, "ok");
                }}
              />
              <IconButton
                label="Delete preset"
                name="trash"
                size={13}
                onClick={() => setConfirmDelete({ id: p.id, name: p.name })}
              />
            </li>
          ))}
        </ul>
      )}
      <NamePromptModal
        open={prompt !== null}
        title={prompt?.mode === "rename" ? "Rename preset" : "Name this preset"}
        initial={prompt?.mode === "rename" ? prompt.current : "My preset"}
        onClose={() => setPrompt(null)}
        onSubmit={(name) => {
          if (prompt?.mode === "rename") renamePreset(prompt.id, name);
          else {
            savePreset(name, layout);
            toast(`Saved preset “${name}”`, "ok");
          }
        }}
      />
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete ? `Delete “${confirmDelete.name}”?` : "Delete preset?"}
      >
        <p className="text-sm text-ink-2">
          This layout preset will be removed from this browser. Documents already using this layout are not
          changed, and this cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            variant="primary"
            className="bg-danger text-white"
            onClick={() => {
              if (confirmDelete) {
                deletePreset(confirmDelete.id);
                toast(`Deleted “${confirmDelete.name}”`, "info");
              }
              setConfirmDelete(null);
            }}
          >
            Delete preset
          </Button>
        </div>
      </Modal>
    </div>
  );
}

const BRAND_COLOR_LABELS: Record<keyof BrandConfig["colors"], string> = {
  primary: "Headings",
  primarySoft: "Headings (soft)",
  accent: "Accent",
  accentSoft: "Accent tint",
  gold: "Highlight",
};

/** A compact swatch chip — the shared building block for the Cover design
    and Interior palette pickers, so both read as one system and stay to a
    single low row rather than a tall grid. */
function SwatchChip({ active, swatch, label, title, onClick }: { active: boolean; swatch: string; label: string; title?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      aria-pressed={active}
      className={cx(
        "inline-flex max-w-[9.5rem] items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors",
        active ? "border-accent bg-accent/5 text-accent" : "border-edge text-ink-2 hover:border-faint",
      )}
    >
      <span className="h-3.5 w-3.5 flex-none rounded border border-black/15" style={{ background: swatch }} />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Cover design picker — compact chips instead of a tall swatch grid: the
    three built-in presets, the author's top favorited custom designs, and a
    "Custom" entry, all on one wrapping row. "Manage designs" expands the
    full saved library where any design can be starred (to surface it here)
    or deleted. */
function CoverPicker({ doc, onChange, isDark }: { doc: Doc; onChange: (patch: Partial<Doc>) => void; isDark: boolean }) {
  const savedDesigns = useCoverDesigns();
  const favorites = favoriteCoverDesigns(savedDesigns);
  const [manageOpen, setManageOpen] = useState(false);
  const set = (patch: Partial<DocLayout>) => onChange({ layout: { ...doc.layout, ...patch } });
  const isActiveCustom = (design: CoverDesign) => doc.layout.coverStyle === "custom" && sameDesign(doc.layout.coverDesign, design);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-faint">Cover design</span>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-faint" title="The cover follows the global light/dark reading theme — no separate toggle.">
          <Icon name={isDark ? "moon" : "sun"} size={11} />
          Adapts to {isDark ? "dark" : "light"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {COVER_STYLES.map((s) => (
          <SwatchChip key={s.id} active={doc.layout.coverStyle === s.id} swatch={s.swatch} label={s.label} onClick={() => set({ coverStyle: s.id })} />
        ))}
        {favorites.map((d) => (
          <SwatchChip
            key={d.id}
            active={isActiveCustom(d.design)}
            swatch={`linear-gradient(150deg, ${d.design.bg1}, ${d.design.bg2})`}
            label={d.name}
            title={`Apply “${d.name}”`}
            onClick={() => set({ coverStyle: "custom", coverDesign: { ...d.design } })}
          />
        ))}
        <button
          type="button"
          onClick={() =>
            set({
              coverStyle: "custom",
              // First visit seeds the designer from the preset the author was on.
              coverDesign: doc.layout.coverDesign ?? seedCoverDesign(doc.layout.coverStyle),
            })
          }
          aria-pressed={doc.layout.coverStyle === "custom"}
          className={cx(
            "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors",
            doc.layout.coverStyle === "custom" && !favorites.some((d) => isActiveCustom(d.design))
              ? "border-accent bg-accent/5 text-accent"
              : "border-edge text-ink-2 hover:border-faint",
          )}
        >
          <Icon name="plus" size={12} />
          Custom
        </button>
      </div>
      <button
        type="button"
        onClick={() => setManageOpen((v) => !v)}
        className="flex items-center gap-1 text-[10.5px] font-semibold text-faint hover:text-accent"
      >
        <Icon name="chevronDown" size={12} className={cx("transition-transform", !manageOpen && "-rotate-90")} />
        Manage saved designs{savedDesigns.length ? ` (${savedDesigns.length})` : ""}
      </button>
      {manageOpen &&
        (savedDesigns.length === 0 ? (
          <p className="text-[10.5px] text-faint">No saved designs yet — open Custom and “Save this design” to build your library. Star up to 3 to pin them beside the presets.</p>
        ) : (
          <ul className="space-y-1">
            {savedDesigns.map((d) => (
              <li key={d.id} className="flex items-center gap-1.5 rounded-lg border border-edge px-2 py-1">
                <span className="h-4 w-4 flex-none rounded border border-black/15" style={{ background: `linear-gradient(150deg, ${d.design.bg1}, ${d.design.bg2})` }} />
                <button
                  type="button"
                  onClick={() => set({ coverStyle: "custom", coverDesign: { ...d.design } })}
                  className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold text-ink-2 hover:text-accent"
                >
                  {d.name}
                </button>
                <IconButton
                  label={d.favorite ? "Unstar (hide from the picker)" : "Star to show in the picker"}
                  name="star"
                  size={13}
                  className={cx("p-1", d.favorite ? "text-warn" : "text-faint hover:text-warn")}
                  iconClassName={d.favorite ? "fill-current" : undefined}
                  onClick={() => toggleFavoriteCoverDesign(d.id)}
                />
                <IconButton label={`Delete “${d.name}”`} name="trash" size={13} className="p-1 hover:text-danger" onClick={() => deleteCoverDesign(d.id)} />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

/** Interior colour palettes — the studio-wide PDF ink/accent/highlight
    scheme, as compact chips (mirroring the Cover design picker): three
    premium defaults, then the author's saved customs, then a Customise
    fold-out (per-colour pickers) and Save. Applying writes BrandConfig.colors,
    exactly like the manual pickers this replaces, so every PDF re-colours.
    Light/dark is handled by the global reading theme, not here. */
function InteriorPalettes() {
  const { brand } = useApp();
  const customPalettes = useCustomPalettes();
  const toast = useToast();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [savePrompt, setSavePrompt] = useState(false);
  const apply = (colors: PaletteColors) => saveBrand({ colors: { ...colors } });
  const paletteSwatch = (c: PaletteColors) => `linear-gradient(90deg, ${c.primary} 0 40%, ${c.accent} 40% 72%, ${c.gold} 72% 100%)`;

  return (
    <div className="space-y-2.5 border-t border-edge/70 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-faint">Interior colours — all documents</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DEFAULT_PALETTES.map((p) => (
          <SwatchChip key={p.id} active={samePalette(brand.colors, p)} swatch={paletteSwatch(p.colors)} label={p.name} onClick={() => apply(p.colors)} />
        ))}
      </div>
      {customPalettes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {customPalettes.map((p) => (
            <span key={p.id} className="group relative inline-flex">
              <SwatchChip active={samePalette(brand.colors, p)} swatch={paletteSwatch(p.colors)} label={p.name} onClick={() => apply(p.colors)} />
              <button
                type="button"
                onClick={() => deleteCustomPalette(p.id)}
                title={`Delete “${p.name}”`}
                aria-label={`Delete ${p.name}`}
                className="absolute -right-1 -top-1 hidden rounded-full bg-ink/75 p-0.5 text-bg group-hover:block"
              >
                <Icon name="x" size={9} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCustomizeOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-edge px-2 py-1 text-[11px] font-semibold text-ink-2 hover:border-faint"
        >
          <Icon name="sliders" size={12} />
          {customizeOpen ? "Hide colours" : "Customise"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!canSavePalette()) {
              toast(`Palette limit reached (${MAX_PALETTES}) — delete one first`, "info");
              return;
            }
            setSavePrompt(true);
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-edge px-2 py-1 text-[11px] font-semibold text-ink-2 hover:border-accent hover:text-accent"
        >
          <Icon name="star" size={12} />
          Save palette
        </button>
      </div>
      {customizeOpen && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-edge p-2">
          {(Object.keys(BRAND_COLOR_LABELS) as (keyof PaletteColors)[]).map((key) => (
            <label key={key} className="flex items-center gap-1.5" title={BRAND_COLOR_LABELS[key]}>
              <input
                type="color"
                aria-label={BRAND_COLOR_LABELS[key]}
                value={brand.colors[key]}
                onChange={(e) => saveBrand({ colors: { ...brand.colors, [key]: e.target.value } })}
                className="h-6 w-7 flex-none cursor-pointer rounded border border-edge bg-transparent p-0"
              />
              <span className="text-[10.5px] font-medium text-ink-2">{BRAND_COLOR_LABELS[key]}</span>
            </label>
          ))}
          <button
            type="button"
            onClick={() => {
              saveBrand({ colors: { ...DEFAULT_BRAND.colors } });
              toast("Interior colours reset to defaults", "ok");
            }}
            className="ml-auto rounded-md border border-edge px-2 py-1 text-[10.5px] font-semibold text-ink-2 hover:border-faint"
          >
            Reset
          </button>
        </div>
      )}
      <p className="text-[10.5px] leading-relaxed text-faint">
        Headings, accents and highlights in every PDF. Names, links and the watermark live in{" "}
        <a href="#/settings" className="underline decoration-dotted">Studio Settings</a>.
      </p>
      <NamePromptModal
        open={savePrompt}
        title="Name this palette"
        initial="My palette"
        onClose={() => setSavePrompt(false)}
        onSubmit={(name) => {
          saveCustomPalette(name, brand.colors);
          toast(`Saved palette “${name}”`, "ok");
        }}
      />
    </div>
  );
}

/** The settings form itself — shared verbatim by the mobile modal and the
    desktop pane so the two stay in lockstep with zero duplicated markup.

    Exactly three collapsible sections, in order:
      1. Publication — every cover-page text/metadata field in one place
         (name, subtitle, feature tags, exam, unit, session, edition,
         language, author);
      2. Cover — include/exclude, the compact cover-design picker (presets +
         favorited customs, auto-adapting to the global light/dark theme) and
         its colour/designer controls;
      3. Interior — text density, page size, TOC, watermark, answers, the
         interior colour palettes, layout presets and the filename pattern.

    Publication and Cover open by default; Interior folds away until needed.
    `onCoverEditing` fires true while focus is anywhere inside Publication or
    Cover (every field there appears on the cover) and false when it leaves —
    the host peeks the preview at the cover so the author sees the edit land. */
function DetailsFields({ doc, onChange, onCoverEditing, onLayoutEditing }: { doc: Doc; onChange: (patch: Partial<Doc>) => void; onCoverEditing?: (active: boolean) => void; onLayoutEditing?: (active: boolean) => void }) {
  const { brand, settings } = useApp();
  const template = TEMPLATE_META[doc.template];
  const layout = (patch: Partial<DocLayout>) => onChange({ layout: { ...doc.layout, ...patch } });
  const isDark = settings.docTheme === "dark";

  const mcqIssues = useMemo(() => {
    if (doc.template !== "questions") return [];
    return validateMcq(parseMcq(doc.body));
  }, [doc.template, doc.body]);

  return (
    <div className="space-y-4">
      {/* Focus anywhere in these two groups = the author is working on the
          cover; focusout to somewhere still inside keeps the peek alive. */}
      <div
        className="space-y-4"
        onFocusCapture={onCoverEditing ? () => onCoverEditing(true) : undefined}
        onBlurCapture={
          onCoverEditing
            ? (e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCoverEditing(false);
              }
            : undefined
        }
      >
      {/* 1 · Publication — all cover text & metadata, grouped and ordered. */}
      <CollapsibleGroup title="Publication" storageKey="ps2:details:publication" defaultOpen>
        <Field label="Publication name" hint="The booklet's title — also the large title on the cover. Shown in the editor header too.">
          <input className={inputClass} value={doc.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Untitled document" />
        </Field>
        <Field label="Subtitle / subheading">
          <input className={inputClass} value={doc.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} placeholder="Shown under the title on the cover" />
        </Field>
        <Field label="Unit / Institute" hint="Name shown in the cover lockup. Leave blank to use the studio-wide brand name.">
          <input className={inputClass} value={doc.institute ?? ""} onChange={(e) => onChange({ institute: e.target.value || undefined })} placeholder={brand.name} />
        </Field>
        <Field label="Feature tags" hint="One line per tag, e.g. “Premium Study Notes”, “Exam-Ready Coverage”, “TYK-Oriented”. Leave empty to use the template's defaults.">
          <textarea
            className={inputClass + " resize-none"}
            rows={2}
            value={(doc.coverLines ?? []).join("\n")}
            onChange={(e) => {
              const raw = e.target.value;
              onChange({ coverLines: raw.trim() === "" ? undefined : raw.split("\n") });
            }}
            placeholder={"Premium Study Notes\nExam-Ready Coverage"}
          />
        </Field>
        <Field label="Exam">
          <input className={inputClass} list="exam-options" value={doc.exam} onChange={(e) => onChange({ exam: e.target.value })} placeholder="e.g. UGC-NET Political Science" />
          <datalist id="exam-options">
            {brand.exams.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </Field>
        <Field label="Paper / Unit">
          <input className={inputClass} value={doc.paper} onChange={(e) => onChange({ paper: e.target.value })} placeholder="Paper 2 · Unit 1" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Session" hint="e.g. June 2026. Shown as a pill in the cover's top-right.">
            <input className={inputClass} value={doc.session} onChange={(e) => onChange({ session: e.target.value })} placeholder="June 2026" />
          </Field>
          <Field label="Edition" hint="Small badge in the cover's extreme top-right corner — e.g. 1e, 2e, 3e.">
            <input className={inputClass} value={doc.edition} onChange={(e) => onChange({ edition: e.target.value })} placeholder="1e" />
          </Field>
        </div>
        <Field label="Language badge" hint="Cover page only — controls which language badge appears on the cover. Your document content is never translated or changed.">
          <Segmented
            value={doc.lang}
            onChange={(lang) => onChange({ lang })}
            columns={2}
            options={[
              { value: "en", label: "English" },
              { value: "hi", label: "हिन्दी" },
              { value: "both", label: "Both" },
              { value: "none", label: "None" },
            ]}
          />
        </Field>
        <Field label="Author">
          <input className={inputClass} value={doc.author} onChange={(e) => onChange({ author: e.target.value })} />
        </Field>
      </CollapsibleGroup>

      {/* 2 · Cover — inclusion, the compact design picker and its controls. */}
      <CollapsibleGroup title="Cover" storageKey="ps2:details:cover" defaultOpen>
        <Toggle label="Include cover page" checked={doc.layout.cover} onChange={(v) => layout({ cover: v })} />
        {doc.layout.cover && (
          <>
            <CoverPicker doc={doc} onChange={onChange} isDark={isDark} />
            {doc.layout.coverStyle === "custom" ? (
              <CoverDesigner doc={doc} onChange={onChange} />
            ) : (
              <div>
                <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-wide text-faint">Cover colors (optional)</span>
                <CoverColorPicker doc={doc} onChange={onChange} />
              </div>
            )}
          </>
        )}
      </CollapsibleGroup>
      </div>

      {/* 3 · Interior — page structure, palettes and export layout. Focus
          anywhere here peeks the preview at the last-viewed inside page so a
          density/size/TOC/palette change is visible as it's made. */}
      <div
        onFocusCapture={onLayoutEditing ? () => onLayoutEditing(true) : undefined}
        onBlurCapture={
          onLayoutEditing
            ? (e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onLayoutEditing(false);
              }
            : undefined
        }
      >
      <CollapsibleGroup title="Interior" storageKey="ps2:details:interior" defaultOpen={false}>
        <Field label="Text density" hint="Spacing and rhythm for the whole document. Ultra packs the most onto each page — spacing, margins and layout tighten together, not just the font.">
          <Segmented
            value={doc.layout.density}
            onChange={(density) => layout({ density })}
            columns={2}
            options={[
              { value: "ultra", label: "Ultra" },
              { value: "compact", label: "Compact" },
              { value: "comfort", label: "Comfort" },
              { value: "relaxed", label: "Relaxed" },
            ]}
          />
        </Field>
        <Field label="Page size">
          <Segmented
            value={doc.layout.pageSize}
            onChange={(pageSize) => layout({ pageSize })}
            columns={3}
            options={[
              { value: "a4", label: "A4" },
              { value: "a5", label: "A5" },
              { value: "letter", label: "Letter" },
            ]}
          />
        </Field>
        {template.hasToc && <Toggle label="Table of contents" checked={doc.layout.toc} onChange={(v) => layout({ toc: v })} />}
        <Toggle label="Watermark on every page" checked={doc.layout.watermark} onChange={(v) => layout({ watermark: v })} />
        {template.hasAnswers && (
          <div className="space-y-4 border-t border-edge/70 pt-3">
            <span className="block text-[10.5px] font-bold uppercase tracking-wide text-faint">Question Bank</span>
            <Field
              label="Answers & solutions"
              hint="Inline highlights the correct option (✓) with the solution under each question — the study layout. At the end collects a key + explanations at the back for practice tests, with clickable Answer → and ↩ Question links both ways. Hidden prints a clean question paper."
            >
              <Segmented
                value={doc.layout.answers}
                onChange={(answers) => layout({ answers })}
                columns={3}
                options={[
                  { value: "inline", label: "Inline" },
                  { value: "end", label: "At the end" },
                  { value: "none", label: "Hidden" },
                ]}
              />
            </Field>
            <Field
              label="Question columns"
              hint="Two columns is the classic printed PYQ-book format — roughly twice the questions per page. Best on A4 with short-to-medium questions; long solutions still read fine as they flow down the column."
            >
              <Segmented
                value={String(doc.layout.qbColumns ?? 1)}
                onChange={(v) => layout({ qbColumns: v === "2" ? 2 : 1 })}
                columns={2}
                options={[
                  { value: "1", label: "Single" },
                  { value: "2", label: "Two columns" },
                ]}
              />
            </Field>
            <Toggle
              label="Each unit starts on a new page"
              checked={doc.layout.qbUnitBreaks !== false}
              onChange={(v) => layout({ qbUnitBreaks: v })}
            />
            <Toggle
              label="Show topic on every question"
              checked={doc.layout.qbTopics !== false}
              onChange={(v) => layout({ qbTopics: v })}
            />
          </div>
        )}
        <InteriorPalettes />
        <div className="border-t border-edge/70 pt-3">
          <LayoutPresets layout={doc.layout} onApply={(l) => onChange({ layout: l })} />
        </div>
        <Field label="PDF filename pattern" hint="Used for every export — {title}, {brand} and {date} are replaced automatically.">
          <input className={inputClass} value={settings.fileNamePattern} onChange={(e) => saveSettings({ fileNamePattern: e.target.value })} />
        </Field>
      </CollapsibleGroup>
      </div>

      {mcqIssues.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-edge bg-raised p-4">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-faint">Booklet check</h3>
          {mcqIssues.slice(0, 8).map((issue, i) => (
            <p key={i} className={cx("flex items-start gap-2 text-xs", issue.level === "error" ? "text-danger" : issue.level === "warning" ? "text-warn" : "text-faint")}>
              <Icon name={issue.level === "info" ? "callout" : "alert"} size={13} className="mt-0.5 flex-none" />
              {issue.message}
            </p>
          ))}
          {mcqIssues.length > 8 && <p className="text-xs text-faint">…and {mcqIssues.length - 8} more.</p>}
        </div>
      )}
    </div>
  );
}

/** Mobile / narrow-screen: a slide-over modal (hidden once the desktop
    pane below takes over at the `md` breakpoint). */
export function Details({
  open,
  onClose,
  doc,
  onChange,
  onUndo,
  canUndo,
}: {
  open: boolean;
  onClose: () => void;
  doc: Doc;
  onChange: (patch: Partial<Doc>) => void;
  onUndo?: () => void;
  canUndo?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef);

  // Focusing the panel must only happen when it *opens* — keying this off
  // `onClose` too (as a naive exhaustive-deps effect would) re-focuses the
  // panel div on every parent re-render, i.e. on every keystroke in any
  // field below, which yanks focus out of whatever input the author was
  // typing in and (on mobile) dismisses the on-screen keyboard.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Document details">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-xs flex-col border-r border-edge bg-surface shadow-2xl outline-none sm:max-w-sm"
      >
        <header className="flex items-center justify-between gap-3 border-b border-edge px-5 py-3.5">
          <h2 className="text-sm font-bold text-ink">Document details</h2>
          <div className="flex items-center gap-0.5">
            {onUndo && <IconButton label="Undo last settings change" name="undo" disabled={!canUndo} onClick={onUndo} />}
            <IconButton label="Close" name="x" onClick={onClose} />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <DetailsFields doc={doc} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}

/** Desktop / tablet (`md` and up): the settings pane docked to the left of
    the workspace, persistent and resizable like the editor and preview
    panes beside it. */
export function DetailsPane({
  doc,
  onChange,
  onCollapse,
  onResetLayout,
  onUndo,
  canUndo,
  onCoverEditing,
  onLayoutEditing,
}: {
  doc: Doc;
  onChange: (patch: Partial<Doc>) => void;
  onCollapse: () => void;
  onResetLayout?: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  /** Cover peek — see DetailsFields. Desktop pane only: the mobile modal
      covers the preview anyway, so peeking there would be invisible. */
  onCoverEditing?: (active: boolean) => void;
  /** Interior (layout) peek — see DetailsFields. Desktop pane only. */
  onLayoutEditing?: (active: boolean) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex h-10 flex-none items-center justify-between gap-2 border-b border-edge px-4">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-faint">Settings</h2>
        <div className="flex items-center gap-0.5">
          {onUndo && (
            <IconButton label="Undo last settings change" name="undo" size={14} disabled={!canUndo} onClick={onUndo} />
          )}
          {onResetLayout && (
            <IconButton label="Reset workspace to default layout" name="refresh" size={14} onClick={onResetLayout} />
          )}
          <IconButton label="Collapse settings panel" name="chevronLeft" size={14} onClick={onCollapse} />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <DetailsFields doc={doc} onChange={onChange} onCoverEditing={onCoverEditing} onLayoutEditing={onLayoutEditing} />
      </div>
    </div>
  );
}
