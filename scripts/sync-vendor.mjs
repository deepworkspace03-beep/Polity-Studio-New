/**
 * Post-install asset preparation (nothing here is committed):
 *
 * 1. Copies the Paged.js browser build from node_modules into
 *    public/vendor so the preview iframe can load it as a plain script.
 * 2. Decompresses every bundled woff2 font into public/fonts/ttf/ —
 *    the PDF engine embeds raw TTF programs (fontkit's TTF subsetter
 *    is unreliable on WOFF2-reconstructed glyph data). The TTFs are
 *    fetched only when a PDF is exported.
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* 1 ── Paged.js */
const pagedSrc = join(root, "node_modules/pagedjs/dist/paged.polyfill.min.js");
const pagedDest = join(root, "public/vendor/paged.polyfill.min.js");
if (existsSync(pagedSrc)) {
  mkdirSync(dirname(pagedDest), { recursive: true });
  copyFileSync(pagedSrc, pagedDest);
  console.log("[sync-vendor] public/vendor/paged.polyfill.min.js updated");
} else {
  console.warn("[sync-vendor] pagedjs dist not found — run npm install first");
}

/* 2 ── TTF derivations for the PDF engine */
const fontsDir = join(root, "public/fonts");
const ttfDir = join(fontsDir, "ttf");
mkdirSync(ttfDir, { recursive: true });
const { decompress } = await import("wawoff2");
let made = 0;
for (const file of readdirSync(fontsDir)) {
  if (!file.endsWith(".woff2")) continue;
  const dest = join(ttfDir, basename(file, ".woff2") + ".ttf");
  const src = join(fontsDir, file);
  if (existsSync(dest) && statSync(dest).mtimeMs >= statSync(src).mtimeMs) continue;
  writeFileSync(dest, await decompress(readFileSync(src)));
  made++;
}
console.log(`[sync-vendor] public/fonts/ttf — ${made} TTF file(s) regenerated`);
