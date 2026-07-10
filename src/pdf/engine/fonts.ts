import type { PDFDocument, PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/**
 * Font resolution for the PDF engine.
 *
 * Mirrors public/fonts/fonts.css: the same woff2 subsets the preview
 * renders with are fetched (warm from the browser cache), parsed with
 * fontkit for exact metrics, and embedded into the PDF subset to the
 * glyphs actually used. Faces are matched per character with the same
 * family → unicode-range → weight/style rules the browser applies, so
 * the PDF uses exactly the fonts the preview showed.
 */

type Range = [number, number];

const LATIN: Range[] = [
  [0x0000, 0x00ff], [0x0131, 0x0131], [0x0152, 0x0153], [0x02bb, 0x02bc], [0x02c6, 0x02c6],
  [0x02da, 0x02da], [0x02dc, 0x02dc], [0x0304, 0x0304], [0x0308, 0x0308], [0x0329, 0x0329],
  [0x2000, 0x206f], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x2191, 0x2191], [0x2193, 0x2193],
  [0x2212, 0x2212], [0x2215, 0x2215], [0xfeff, 0xfeff], [0xfffd, 0xfffd],
];
const LATIN_EXT: Range[] = [
  [0x0100, 0x02ba], [0x02bd, 0x02c5], [0x02c7, 0x02cc], [0x02ce, 0x02d7], [0x02dd, 0x02ff],
  [0x0304, 0x0304], [0x0308, 0x0308], [0x0329, 0x0329], [0x1d00, 0x1dbf], [0x1e00, 0x1e9f],
  [0x1ef2, 0x1eff], [0x2020, 0x2020], [0x20a0, 0x20ab], [0x20ad, 0x20c0], [0x2113, 0x2113],
  [0x2c60, 0x2c7f], [0xa720, 0xa7ff],
];
const DEVANAGARI: Range[] = [
  [0x0900, 0x097f], [0x1cd0, 0x1cf9], [0x200c, 0x200d], [0x20a8, 0x20a8], [0x20b9, 0x20b9],
  [0x20f0, 0x20f0], [0x25cc, 0x25cc], [0xa830, 0xa839], [0xa8e0, 0xa8ff], [0x11b00, 0x11b09],
];

interface FaceDef {
  family: string;
  weight: number;
  italic: boolean;
  ranges: Range[];
  url: string;
}

function slices(family: string, file: string, weights: number[], italics: number[] = []): FaceDef[] {
  const out: FaceDef[] = [];
  for (const w of weights) {
    for (const [ranges, slice] of [[LATIN, "latin"], [LATIN_EXT, "latin-ext"]] as const) {
      out.push({ family, weight: w, italic: false, ranges, url: `/fonts/ttf/${file}-${w}-${slice}.ttf` });
    }
  }
  for (const w of italics) {
    for (const [ranges, slice] of [[LATIN, "latin"], [LATIN_EXT, "latin-ext"]] as const) {
      out.push({ family, weight: w, italic: true, ranges, url: `/fonts/ttf/${file}-${w}i-${slice}.ttf` });
    }
  }
  return out;
}

const FACES: FaceDef[] = [
  ...slices("manrope", "Manrope", [400, 500, 600, 700, 800]),
  ...slices("literata", "Literata", [400, 600, 700], [400, 600]),
  ...slices("jetbrains mono", "JetBrainsMono", [400, 600]),
  ...[400, 600, 700].map((w) => ({
    family: "noto sans devanagari", weight: w, italic: false, ranges: DEVANAGARI,
    url: `/fonts/ttf/NotoSansDevanagari-${w}-devanagari.ttf`,
  })),
  ...[400, 700].map((w) => ({
    family: "noto serif devanagari", weight: w, italic: false, ranges: DEVANAGARI,
    url: `/fonts/ttf/NotoSerifDevanagari-${w}-devanagari.ttf`,
  })),
];

/** Generic CSS families mapped onto bundled ones (fallback tails like
    "Georgia, serif" in font stacks). */
const GENERIC: Record<string, string> = {
  serif: "literata", georgia: "literata",
  "sans-serif": "manrope", "system-ui": "manrope", "ui-sans-serif": "manrope",
  monospace: "jetbrains mono", consolas: "jetbrains mono", "ui-monospace": "jetbrains mono",
};

const inRanges = (cp: number, ranges: Range[]) => ranges.some(([a, b]) => cp >= a && cp <= b);

/** CSS font-weight matching (desktop browser behaviour, simplified for
    discrete weight sets): ≤500 prefers descending then ascending. */
function pickWeight(candidates: FaceDef[], want: number): FaceDef {
  const sorted = [...candidates].sort((a, b) => a.weight - b.weight);
  const exact = sorted.find((f) => f.weight === want);
  if (exact) return exact;
  const below = sorted.filter((f) => f.weight < want).pop();
  const above = sorted.find((f) => f.weight > want);
  if (want <= 500) return below ?? above!;
  return above ?? below!;
}

export interface LoadedFace {
  def: FaceDef;
  /** hhea metrics as em fractions — Chrome's inline-box metrics. */
  ascent: number;
  descent: number;
  /** Underline geometry as em fractions (position is negative below baseline). */
  underlinePosition: number;
  underlineThickness: number;
  hasGlyph(cp: number): boolean;
  pdfFont: PDFFont;
}

export class FontResolver {
  private loaded = new Map<string, Promise<LoadedFace | null>>();
  private warned = new Set<string>();
  constructor(private pdf: PDFDocument, private baseUrl: string) {
    this.pdf.registerFontkit(fontkit);
  }

  private load(def: FaceDef): Promise<LoadedFace | null> {
    let p = this.loaded.get(def.url);
    if (!p) {
      p = (async () => {
        try {
          const res = await fetch(this.baseUrl + def.url);
          if (!res.ok) throw new Error(`${res.status}`);
          const bytes = await res.arrayBuffer();
          const fk = fontkit.create(new Uint8Array(bytes) as never) as unknown as {
            unitsPerEm: number; hhea: { ascent: number; descent: number };
            underlinePosition: number; underlineThickness: number;
            characterSet: number[];
          };
          const chars = new Set(fk.characterSet);
          const pdfFont = await this.pdf.embedFont(bytes, { subset: true });
          const upm = fk.unitsPerEm;
          return {
            def,
            ascent: fk.hhea.ascent / upm,
            descent: -fk.hhea.descent / upm,
            underlinePosition: (fk.underlinePosition || -0.1 * upm) / upm,
            underlineThickness: (fk.underlineThickness || 0.07 * upm) / upm,
            hasGlyph: (cp: number) => chars.has(cp),
            pdfFont,
          };
        } catch (err) {
          if (!this.warned.has(def.url)) {
            this.warned.add(def.url);
            console.warn(`[pdf] font unavailable: ${def.url}`, err);
          }
          return null;
        }
      })();
      this.loaded.set(def.url, p);
    }
    return p;
  }

  /**
   * Resolves the face for one character the way the browser does:
   * walk the family stack; within a family only faces whose
   * unicode-range covers the character participate; nearest
   * weight/style wins. Returns null when nothing covers it.
   */
  async resolve(stack: string[], weight: number, italic: boolean, cp: number): Promise<LoadedFace | null> {
    for (const raw of stack) {
      const name = raw.trim().replace(/^["']|["']$/g, "").toLowerCase();
      const family = FACES.some((f) => f.family === name) ? name : GENERIC[name];
      if (!family) continue;
      const covering = FACES.filter((f) => f.family === family && inRanges(cp, f.ranges));
      if (covering.length === 0) continue;
      const styled = covering.filter((f) => f.italic === italic);
      const pool = styled.length ? styled : covering;
      const chosen = pickWeight(pool, weight);
      const face = await this.load(chosen);
      if (face && face.hasGlyph(cp)) return face;
      // Slice covers the range but misses the glyph — try remaining families.
    }
    return null;
  }
}
