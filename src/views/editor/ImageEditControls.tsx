import { useRef, useState } from "react";
import type { ImageLineInfo } from "./imageLine";
import { IconButton, Segmented, inputClass, useToast } from "../../components/ui";

const WIDTH_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "35%", label: "S", hint: "Small — 35% width" },
  { value: "65%", label: "M", hint: "Medium — 65% width" },
  { value: "", label: "L", hint: "Large — full width" },
];

/** The resize/align/caption/replace/remove control row shared by the
    editor's docked image bar (ImageTools) and the Preview pane's floating
    one — one place to fix, and both always rewrite the same Markdown
    attribute syntax the renderer/PDF engine already understand. */
export function ImageEditControls({
  info,
  onWidth,
  onAlign,
  onCaption,
  onReplace,
  onRemove,
}: {
  info: ImageLineInfo;
  onWidth: (width: string) => void;
  onAlign: (align: "left" | "center" | "right") => void;
  onCaption: (caption: string) => void;
  onReplace: (file: File) => Promise<void>;
  onRemove: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState(info.title);
  const width = WIDTH_OPTIONS.some((o) => o.value === info.width) ? info.width : "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Image</span>
      <Segmented size="sm" value={width} onChange={onWidth} options={WIDTH_OPTIONS} />
      <Segmented
        size="sm"
        value={info.align}
        onChange={onAlign}
        options={[
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
          { value: "right", label: "Right" },
        ]}
      />
      <input
        className={inputClass + " h-8 w-32 py-1 text-xs"}
        placeholder="Caption…"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => {
          if (caption !== info.title) onCaption(caption);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <span className="mx-0.5 h-4 w-px bg-edge" />
      <IconButton label="Replace image" name="upload" size={14} onClick={() => fileRef.current?.click()} />
      <IconButton label="Remove image" name="trash" size={14} onClick={onRemove} />
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
