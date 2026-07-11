/**
 * Image insertion for the Markdown editor. Images are stored inline as
 * self-contained data URIs so a document stays a single portable string —
 * no asset folder, no broken links, and they render identically in the
 * live preview and the exported PDF (the vector engine embeds data-URI
 * <img> directly, transcribe.ts § drawImage).
 *
 * The one cost of inlining is size, so every image is downscaled to a
 * sensible print resolution before encoding. Photos become JPEG; anything
 * that may carry transparency (PNG/SVG/GIF/WebP) stays PNG.
 */

/** Longest edge an inserted image is scaled down to — comfortably sharp at
    A4 print width while keeping the data URI (and IndexedDB) reasonable. */
const MAX_DIM = 1600;

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/** A caption/alt from a file name: "power-separation.png" → "power separation". */
function altFromName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
}

async function toDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error("not an image"));
      img.src = url;
    });
    if (!img.naturalWidth) throw new Error("image has no size");
    const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    // No downscale needed and already a compact format: keep the original
    // bytes untouched (avoids a needless re-encode and quality loss).
    if (scale === 1 && (file.type === "image/jpeg" || file.type === "image/png")) {
      return await blobToDataUrl(file);
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const keepAlpha = /png|svg|gif|webp/.test(file.type);
    return canvas.toDataURL(keepAlpha ? "image/png" : "image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result as string);
    reader.onerror = () => rej(new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

/** Convert an image file to a block-level Markdown image, padded with blank
    lines so it always renders as its own figure. */
export async function imageFileToMarkdown(file: File): Promise<string> {
  const dataUrl = await toDataUrl(file);
  return `\n\n![${altFromName(file.name)}](${dataUrl})\n\n`;
}
