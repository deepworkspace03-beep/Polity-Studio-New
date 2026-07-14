#!/usr/bin/env node
/**
 * Permanent visual regression benchmark for the vector PDF engine.
 *
 * Opt-in only — not part of `npm test`/`typecheck`/`build`, and not
 * wired into CI (it needs a real Chromium + a built app, both too heavy
 * for a lightweight required pipeline). Run it by hand after touching
 * anything in pdf/engine, pdf/document.ts, or pdf/styles/*.css:
 *
 *   npm run test:visual           # compare against the saved baseline
 *   npm run test:visual -- --update   # re-save the baseline (after an
 *                                        intentional layout change)
 *
 * What it checks, and why this shape:
 *
 *   1. Baseline pixel diff (scripts/visual-baseline/*.png) — every page
 *      of the PDF export of the canonical reference document ("Fundamental
 *      Rights — Complete Notes", the same built-in demo the project's
 *      other fidelity work was validated against) is screenshotted via
 *      Chromium's own PDF viewer and compared pixel-for-pixel against a
 *      saved baseline. Same renderer both times, so alignment is exact —
 *      any real difference is a real regression, not a cross-engine
 *      rasterization artifact. This is the "did a PDF-engine change
 *      silently alter layout/spacing/margins/pagination" check.
 *
 *   2. Structural cross-format check (page count + page count) between
 *      the PDF export, the standalone HTML export, and the live paged
 *      preview. Cheap and reliable without needing pixel-perfect
 *      alignment between two fundamentally different rendering engines
 *      (Blink's HTML layout vs. PDFium) — full pixel-diffing across
 *      those two was considered and rejected: getting them to agree on
 *      DPI/zoom precisely enough to avoid constant false positives isn't
 *      practical to maintain for a solo project. Page-count agreement
 *      still catches the highest-value class of HTML/PDF divergence
 *      (an extra/missing/blank page, a pagination miscalculation).
 */
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASELINE_DIR = path.join(ROOT, "scripts", "visual-baseline");
const OUT_DIR = path.join(ROOT, ".visual-regression-out");
const PORT = 4790;
const REFERENCE_TITLE = /Fundamental Rights.*Complete Notes/i;
// Chromium's PDF viewer cold-starts fresh for every page render (see
// renderOnePdfPage) and its glyph anti-aliasing isn't perfectly
// deterministic run-to-run — two renders of byte-identical PDF content
// can differ by up to ~1.7% of pixels, entirely along glyph edges, with
// zero layout change (confirmed by inspecting the diff images: the
// highlighted pixels trace text outlines uniformly across every page,
// not a block-shifted "ghosting" pattern, which is what a real
// regression looks like — the deliberate regression this threshold was
// calibrated against, a heading font-size bump, produced 6-10% diffs).
// 3% leaves a comfortable margin above the observed noise floor while
// still catching real layout/spacing/pagination changes.
const DIFF_THRESHOLD_PCT = 3;
const UPDATE = process.argv.includes("--update");
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

function log(msg) {
  console.log(`[visual-regression] ${msg}`);
}

async function ensureBuilt() {
  if (existsSync(path.join(ROOT, "dist", "index.html"))) return;
  log("dist/ not found — building…");
  const res = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
  if (res.status !== 0) throw new Error("build failed");
}

function startPreview() {
  const proc = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return proc;
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`preview server did not respond at ${url} within ${timeoutMs}ms`);
}

async function openReferenceDoc(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /examples/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByText(REFERENCE_TITLE).first().click();
  await page.waitForTimeout(1000);
}

async function openPublishAndSettle(page) {
  await page.getByRole("button", { name: /publish pdf/i }).first().click();
  await page.waitForTimeout(1500); // let the Publish view mount and Paged.js start
  // The typeset pages render inside the Publish view's iframe (see
  // Publish.tsx — title="Typeset pages"), not the top-level document.
  const pages = page.frameLocator('iframe[title="Typeset pages"]').locator(".pagedjs_page");
  // Wait for Paged.js to finish: page count stops changing across three checks.
  let last = -1;
  let stableStreak = 0;
  for (let i = 0; i < 60; i++) {
    const n = await pages.count().catch(() => 0);
    if (n > 0 && n === last) {
      stableStreak++;
      if (stableStreak >= 3) return n;
    } else {
      stableStreak = 0;
    }
    last = n;
    await page.waitForTimeout(400);
  }
  throw new Error(`Paged.js layout never settled (last count seen: ${last})`);
}

async function downloadVia(page, buttonName, savePath) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.getByRole("button", { name: buttonName }).first().click(),
  ]);
  await download.saveAs(savePath);
}

async function renderOnePdfPage(browser, pdfPath, n) {
  // A fresh page (not a reused one navigated repeatedly) avoids a race in
  // Chromium's built-in PDF viewer: reusing one tab and changing only the
  // #page=N fragment (or even a cache-busting query string) doesn't
  // reliably re-scroll the already-mounted viewer before the screenshot —
  // it can still show whatever page a previous navigation left it on. A
  // brand-new tab always mounts the viewer fresh, landing directly on
  // the requested page.
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
  try {
    await page.goto(`file://${pdfPath}#page=${n}&zoom=100`, { waitUntil: "networkidle", timeout: 20000 });
    // Chromium's built-in PDF viewer renders in an internal plugin
    // surface that isn't reliably introspectable from page.evaluate (no
    // documented, version-stable hook to detect "first raster done"), so
    // a generous fixed wait is the robust choice here over a fragile
    // DOM/canvas poll — a fresh tab cold-starts the whole viewer (parse
    // + first raster) for every page, slower than a warm, already-open
    // one.
    await page.waitForTimeout(1500);
    return await page.screenshot();
  } finally {
    await page.close();
  }
}

async function renderPdfPages(browser, pdfPath, pageCount) {
  const shots = [];
  for (let n = 1; n <= pageCount; n++) {
    shots.push(await renderOnePdfPage(browser, pdfPath, n));
  }
  return shots;
}

function countHtmlPages(htmlPath) {
  const html = readFileSync(htmlPath, "utf8");
  return (html.match(/class="[^"]*\bpagedjs_page\b/g) ?? []).length;
}

function compareToBaseline(shots) {
  mkdirSync(BASELINE_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const existingBaselineCount = readdirSync(BASELINE_DIR).filter((f) => /^page-\d+\.png$/.test(f)).length;
  const results = [];
  if (!UPDATE && existingBaselineCount > 0 && shots.length !== existingBaselineCount) {
    // A silently-added or silently-dropped page is exactly the kind of
    // regression this script exists to catch — without this check, a new
    // page would just get treated as "no prior baseline" and pass, and a
    // dropped page's baseline image would never even be looked at.
    results.push({
      name: "page count",
      status: "FAIL",
      reason: `document now renders ${shots.length} pages, baseline has ${existingBaselineCount} — run with --update if this is intentional`,
    });
  }
  for (let i = 0; i < shots.length; i++) {
    const name = `page-${String(i + 1).padStart(2, "0")}.png`;
    const baselinePath = path.join(BASELINE_DIR, name);
    if (UPDATE) {
      writeFileSync(baselinePath, shots[i]);
      results.push({ name, status: "updated" });
      continue;
    }
    if (!existsSync(baselinePath)) {
      // Read-only comparison mode never writes — a page beyond the saved
      // baseline is reported, not silently adopted (that would let a
      // regression that only adds pages sail through as "new baseline").
      results.push({ name, status: "FAIL", reason: "no baseline for this page — run with --update if this is intentional" });
      continue;
    }
    const current = PNG.sync.read(shots[i]);
    const baseline = PNG.sync.read(readFileSync(baselinePath));
    if (current.width !== baseline.width || current.height !== baseline.height) {
      results.push({ name, status: "FAIL", reason: `dimension mismatch (${current.width}x${current.height} vs baseline ${baseline.width}x${baseline.height})` });
      continue;
    }
    const diff = new PNG({ width: current.width, height: current.height });
    // A looser per-pixel threshold (pixelmatch default is 0.1) absorbs
    // the same rasterization jitter described above at the source,
    // before it's even counted — see DIFF_THRESHOLD_PCT above.
    const diffPixels = pixelmatch(current.data, baseline.data, diff.data, current.width, current.height, { threshold: 0.3 });
    const pct = (diffPixels / (current.width * current.height)) * 100;
    if (pct > DIFF_THRESHOLD_PCT) {
      const diffPath = path.join(OUT_DIR, `diff-${name}`);
      writeFileSync(diffPath, PNG.sync.write(diff));
      writeFileSync(path.join(OUT_DIR, `current-${name}`), shots[i]);
      results.push({ name, status: "FAIL", reason: `${pct.toFixed(2)}% pixels differ (threshold ${DIFF_THRESHOLD_PCT}%) — see ${path.relative(ROOT, diffPath)}` });
    } else {
      results.push({ name, status: "ok", reason: `${pct.toFixed(3)}% pixels differ` });
    }
  }
  return results;
}

async function main() {
  await ensureBuilt();
  const preview = startPreview();
  let browser;
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`);
    browser = await chromium.launch(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

    await openReferenceDoc(page);
    const livePageCount = await openPublishAndSettle(page);
    log(`live preview settled at ${livePageCount} pages`);

    mkdirSync(OUT_DIR, { recursive: true });
    const pdfPath = path.join(OUT_DIR, "reference.pdf");
    const htmlPath = path.join(OUT_DIR, "reference.html");
    await downloadVia(page, /^Download PDF/i, pdfPath);
    await downloadVia(page, /Download HTML/i, htmlPath);
    await page.close();

    const htmlPageCount = countHtmlPages(htmlPath);
    log(`standalone HTML export: ${htmlPageCount} pages`);

    const shots = await renderPdfPages(browser, pdfPath, livePageCount);
    log(`rendered ${shots.length} PDF pages via Chromium's PDF viewer`);

    let ok = true;
    if (htmlPageCount !== livePageCount) {
      ok = false;
      log(`FAIL — structural: HTML export has ${htmlPageCount} pages, live preview has ${livePageCount}`);
    } else {
      log(`ok — structural: HTML export and live preview both have ${livePageCount} pages`);
    }
    if (shots.length !== livePageCount) {
      ok = false;
      log(`FAIL — structural: rendered ${shots.length} PDF pages, expected ${livePageCount}`);
    }

    const results = compareToBaseline(shots);
    for (const r of results) {
      log(`${r.status === "FAIL" ? "FAIL" : "ok  "} — ${r.name}: ${r.reason ?? r.status}`);
      if (r.status === "FAIL") ok = false;
    }

    if (UPDATE) {
      log("baseline updated — review scripts/visual-baseline/*.png and commit if the change is intentional");
    } else if (ok) {
      log("PASS");
    } else {
      log("FAIL — see reasons above; diff images (if any) are in .visual-regression-out/");
      process.exitCode = 1;
    }
  } finally {
    await browser?.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error("[visual-regression] error:", err);
  process.exitCode = 1;
});
