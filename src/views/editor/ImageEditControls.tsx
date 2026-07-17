import { useRef, useState } from "react";
import type { ImageLineInfo, ImageLinePatch } from "./imageLine";
import type { FigureAlign, FigureGap } from "../../markdown/figure";
import { IconButton, Segmented, inputClass, useToast } from "../../components/ui";
import { cx } from "../../lib/utils";

const WIDTH_PRESETS: { value: string; label: string; hint: string }[] = [
  { value: "18%", label: "XS", hint: "Tiny — 18% width, author-portrait size" },
  { value: "35%", label: "S", hint: "Small — 35% width" },
  { value: "65%", label: "M", hint: "Medium — 65% width" },
  { value: "", label: "L", hint: "Large — natural width" },
];

const LAYOUT_OPTIONS: { value: FigureAlign; label: string; hint: string }[] = [
  { value: "left", label: "Left", hint: "Left wrap — text flows to the right, book-style" },
  { value: "center", label: "Center", hint: "Centered block" },
  { value: "right", label: "Right", hint: "Right wrap — text flows to the left, book-style" },
  { value: "full", label: "Full", hint: "Full column width" },
];

const GAP_OPTIONS: { value: FigureGap; label: string; hint: string }[] = [
  { value: "sm", label: "S", hint: "Tight spacing" },
  { value: "md", label: "M", hint: "Normal spacing" },
  { value: "lg", label: "L", hint: "Roomy spacing" },
];

/** A small on/off pill for the border/rounded/shadow style flags. */
function StyleChip({ active, label, hint, onClick }: { active: boolean; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={hint}
      onClick={onClick}
      className={cx(
        "rounded-lg border px-2 py-1 text-xs font-medium transition-colors",
        active ? "border-accent bg-accent/15 text-accent" : "border-edge text-ink-2 hover:bg-raised",
      )}
    >
      {label}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</span>
      {children}
    </div>
  );
}

/** The layout/style/caption/replace/remove control set shared by the
    editor's docked image bar (ImageTools) and the Preview pane's floating
    one — one place to fix, and both always rewrite the same Markdown
    attribute syntax the renderer/PDF engine already understand
    (markdown/figure.ts). */
export function ImageEditControls({
  info,
  onPatch,
  onReplace,
  onRemove,
}: {
  info: ImageLineInfo;
  onPatch: (patch: ImageLinePatch, opts?: { focus?: boolean }) => void;
  onReplace: (file: File) => Promise<void>;
  onRemove: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState(info.title);
  const gap: FigureGap = info.gap || "md";
  const isFull = info.align === "full";
  const isWrap = info.align === "left" || info.align === "right";
  // Wrapped images are capped at 60% of the column (print CSS) so they can
  // never swallow the text beside them; block images may go full width.
  const sliderMax = isWrap ? 60 : 100;
  const widthPct = /^(\d+)%$/.exec(info.width)?.[1];
  const sliderValue = widthPct
    ? Math.min(sliderMax, Math.max(1, Number(widthPct)))
    : isWrap
      ? 42
      : 100;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Group label="Layout">
        <Segmented size="sm" value={info.align} onChange={(align) => onPatch({ align })} options={LAYOUT_OPTIONS} />
      </Group>

      {!isFull && (
        <Group label="Size">
          {WIDTH_PRESETS.map((o) => (
            <StyleChip
              key={o.label}
              active={info.width === o.value}
              label={o.label}
              hint={o.hint}
              onClick={() => onPatch({ width: o.value })}
            />
          ))}
          <input
            type="range"
            min={1}
            max={sliderMax}
            step={1}
            value={sliderValue}
            aria-label="Image width (% of the text column)"
            title="Drag for any width, 1–100%"
            // focus:false — patching live while dragging must not move
            // focus to the editor, which would end the drag mid-gesture.
            onChange={(e) => onPatch({ width: `${e.target.value}%` }, { focus: false })}
            className="w-24 accent-accent"
          />
          <span className="w-9 text-right text-[11px] font-semibold tabular-nums text-ink-2">
            {widthPct ? `${widthPct}%` : info.width || "Auto"}
          </span>
        </Group>
      )}

      <Group label="Space">
        <Segmented
          size="sm"
          value={gap}
          onChange={(g) => onPatch({ gap: g === "md" ? "" : g })}
          options={GAP_OPTIONS}
        />
      </Group>

      <Group label="Style">
        <StyleChip active={info.border} label="Border" hint="Toggle a thin border" onClick={() => onPatch({ border: !info.border })} />
        <StyleChip active={info.round} label="Round" hint="Toggle rounded corners" onClick={() => onPatch({ round: !info.round })} />
        <StyleChip active={info.shadow} label="Shadow" hint="Toggle a light shadow (preview/HTML only)" onClick={() => onPatch({ shadow: !info.shadow })} />
      </Group>

      <input
        className={inputClass + " h-8 w-32 py-1 text-xs"}
        placeholder="Caption…"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => {
          if (caption !== info.title) onPatch({ title: caption });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />

      <div className="flex items-center gap-0.5">
        <IconButton label="Replace image" name="upload" size={14} onClick={() => fileRef.current?.click()} />
        <IconButton label="Remove image" name="trash" size={14} onClick={onRemove} />
      </div>
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
            await onReplace(file);
          } catch {
            toast("Couldn't read that image — try a PNG, JPEG or SVG", "error");
          }
        }}
      />
    </div>
  );
}
