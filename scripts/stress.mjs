/* Stress / benchmark harness — drives the real production build in
   headless Chromium. Injects synthetic Notes and Question Bank documents
   straight into IndexedDB, opens Pages mode and measures pagination
   (wall time, live paged-progress events, main-thread responsiveness via
   rAF gaps, DOM nodes, settled pages, JS heap), then runs Publish →
   Download PDF and records export time, byte size and success.

   Usage (see docs/performance.md for the current reference numbers):

     npm run build
     npm run preview -- --port 4173 --host 127.0.0.1 &
     npm i --no-save playwright-core        # deliberately not a dependency
     node scripts/stress.mjs                # writes results.json + pdfs/

   Env: BASE_URL (default http://127.0.0.1:4173) · ONLY=id,id to filter
   scenarios · SKIP_EXPORT=1 · OUT=file.json · PAGINATION_TIMEOUT ms ·
   CPU_THROTTLE=4 to approximate tablet-class hardware. Run scenarios
   sequentially on a quiet machine — parallel runs skew the timings. */
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4173";
const OUT = process.env.OUT || "results.json";
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const SKIP_EXPORT = process.env.SKIP_EXPORT === "1";
const PAGINATION_TIMEOUT = Number(process.env.PAGINATION_TIMEOUT || 600000);

/* ── generators ── */
function notesBody(targetPages) {
  const words = targetPages * 196;
  const para = () =>
    "The constitutional framework distributes sovereign power between the Union and the States through a carefully calibrated scheme of legislative, executive and financial relations that has evolved through judicial interpretation and political practice over seven decades.".split(" ");
  let out = [];
  let w = 0;
  let ch = 0;
  while (w < words) {
    ch++;
    out.push(`# Chapter ${ch} — Constitutional Themes ${ch}`);
    for (let s = 1; s <= 6 && w < words; s++) {
      out.push(`\n## ${ch}.${s} Federal Structure and Governance`);
      for (let p = 0; p < 3 && w < words; p++) {
        const t = para();
        out.push("\n" + t.join(" "));
        w += t.length;
      }
      out.push(`\n- Key doctrine ${s}: basic structure limits amendment power\n- Article ${300 + s}: property rights transition\n- Landmark case ${s}: Kesavananda Bharati (1973)`);
      w += 30;
      if (s === 3) {
        out.push(`\n:::note Examiner's angle\nQuestions repeatedly test the interplay of Articles 245–254 — study the doctrine of pith and substance with recent examples.\n:::`);
        w += 28;
      }
    }
  }
  return out.join("\n");
}

function qbBody(count, { longSolutions = false } = {}) {
  const out = ["Attempt all questions. Answers follow each question.\n"];
  const topics = ["Indian Polity", "Greek Political Thought", "Public Administration", "International Relations", "Political Theory"];
  for (let i = 1; i <= count; i++) {
    if (i % 50 === 1) out.push(`\n## Section ${Math.ceil(i / 50)} — Practice Set ${Math.ceil(i / 50)}\n`);
    out.push(`Q. Which of the following statements about constitutional amendment procedure ${i} correctly describes the special majority requirement under Article 368 as interpreted by the Supreme Court?`);
    out.push(`A) A simple majority of members present and voting`);
    out.push(`B) A majority of the total membership and two-thirds of members present and voting *`);
    out.push(`C) Ratification by all state legislatures without exception`);
    out.push(`D) A referendum followed by presidential assent`);
    out.push(`Topic: ${topics[i % topics.length]}`);
    out.push(`Source: UPSC CSE ${2015 + (i % 10)}`);
    const long = longSolutions && i % 3 === 0;
    out.push(
      `Solution: Article 368 requires a majority of the total membership of each House and a two-thirds majority of members present and voting.${
        long
          ? " Federal provisions additionally need ratification by half the states. The Supreme Court in Kesavananda Bharati (1973) held that the amending power cannot destroy the basic structure of the Constitution — a doctrine reaffirmed in Minerva Mills (1980) and applied to judicial review, federalism and secularism. In practice this means Parliament's constituent power is wide but not unlimited: an amendment touching the essential features must survive basic-structure scrutiny. Candidates should distinguish the three amendment tracks — simple majority (outside Article 368), special majority, and special majority plus state ratification — and remember that the special majority is counted on total membership, not on members present alone. The doctrine has since been applied in I.R. Coelho (2007) to Ninth Schedule laws, extending judicial review to post-1973 insertions."
          : ""
      }`,
    );
    out.push("");
  }
  return out.join("\n");
}

/* ── scenario table ── */
const SCENARIOS = [
  { id: "notes-100", template: "notes", title: "Notes 100p", body: notesBody(100) },
  { id: "notes-250", template: "notes", title: "Notes 250p", body: notesBody(250) },
  { id: "notes-500", template: "notes", title: "Notes 500p", body: notesBody(500) },
  { id: "notes-1000", template: "notes", title: "Notes 1000p", body: notesBody(1000) },
  { id: "qb-1500", template: "questions", title: "QB 1500q", body: qbBody(1500) },
  { id: "qb-long-300", template: "questions", title: "QB 300q long sols", body: qbBody(300, { longSolutions: true }) },
];

function makeDoc(s) {
  const now = Date.now();
  return {
    id: `stress-${s.id}`,
    title: s.title,
    subtitle: "Stress-test document",
    template: s.template,
    body: s.body,
    exam: "UPSC CSE",
    paper: "GS-II",
    session: "2026",
    edition: "1e",
    author: "Stress Harness",
    lang: "en",
    layout: {
      cover: true,
      coverStyle: "regal",
      toc: s.template === "notes",
      watermark: true,
      pageSize: "a4",
      density: "compact",
      answers: "inline",
    },
    createdAt: now,
    updatedAt: now,
  };
}

/* ── driver ── */
async function run() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const results = [];
  for (const s of SCENARIOS) {
    if (ONLY && !ONLY.includes(s.id)) continue;
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    // CPU_THROTTLE=4 approximates tablet-class hardware (Android Chrome).
    if (process.env.CPU_THROTTLE) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.CPU_THROTTLE) });
    }
    page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message.slice(0, 120)}`));

    const r = { id: s.id, bodyChars: s.body.length };
    try {
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      // Inject the document straight into IndexedDB, then reload.
      await page.evaluate(async (doc) => {
        await new Promise((resolve, reject) => {
          const req = indexedDB.open("polity-studio", 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "id" });
            if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
          };
          req.onsuccess = () => {
            const tx = req.result.transaction("docs", "readwrite");
            tx.objectStore("docs").put(doc);
            tx.oncomplete = () => { req.result.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        });
      }, makeDoc(s));

      // Instrument the parent window: message log + rAF-gap monitor.
      await page.addInitScript(() => {
        window.__msgs = [];
        window.addEventListener("message", (e) => {
          const d = e.data || {};
          if (d.type === "paged-done" || d.type === "paged-progress") {
            window.__msgs.push({ type: d.type, pages: d.pages, t: performance.now() });
          }
        });
        window.__gaps = { max: 0, count: 0 };
        let last = performance.now();
        const tick = () => {
          const now = performance.now();
          const gap = now - last;
          if (gap > window.__gaps.max) window.__gaps.max = gap;
          if (gap > 250) window.__gaps.count++;
          last = now;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      await page.goto(`${BASE}/#/edit/stress-${s.id}`, { waitUntil: "domcontentloaded" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".cm-content", { timeout: 30000 });
      // Let the flow preview settle, then reset monitors and go to Pages.
      await page.waitForTimeout(2500);
      await page.evaluate(() => { window.__msgs = []; window.__gaps = { max: 0, count: 0 }; });

      const t0 = Date.now();
      await page.getByRole("radio", { name: "Pages" }).or(page.getByText("Pages", { exact: true })).first().click();
      await page.waitForFunction(() => window.__msgs.some((m) => m.type === "paged-done"), null, {
        timeout: PAGINATION_TIMEOUT, polling: 500,
      });
      r.paginateMs = Date.now() - t0;
      const msgs = await page.evaluate(() => window.__msgs);
      const done = msgs.find((m) => m.type === "paged-done");
      r.pages = done.pages;
      r.progressEvents = msgs.filter((m) => m.type === "paged-progress").length;
      r.gaps = await page.evaluate(() => window.__gaps);

      // Iframe DOM stats.
      const frame = page.frames().find((f) => f !== page.mainFrame() && f.url() !== "about:blank");
      if (frame) {
        r.domNodes = await frame.evaluate(() => document.getElementsByTagName("*").length);
        r.settledPages = await frame.evaluate(() => document.querySelectorAll(".pagedjs_page.p-settled").length);
        // Correctness probes: blank pages (a page whose content area has no
        // text and no figure — layout waste or a break bug) and average
        // content-area fill (bottom of last child vs area height) on the
        // body pages, the "how much trailing whitespace" measure.
        r.blankPages = await frame.evaluate(() =>
          [...document.querySelectorAll(".pagedjs_page")].filter((p) => {
            if (p.querySelector(".cover")) return false;
            const area = p.querySelector(".pagedjs_page_content");
            return !!area && !(area.textContent || "").trim() && !area.querySelector("img, svg");
          }).length,
        );
        r.avgFillPct = await frame.evaluate(() => {
          const pages = [...document.querySelectorAll(".pagedjs_page")].filter(
            (p) => !p.querySelector(".cover, .toc") && (p.querySelector(".pagedjs_page_content")?.textContent || "").trim(),
          );
          if (pages.length < 2) return null;
          let sum = 0;
          let n = 0;
          // Skip the final page — it is legitimately part-filled.
          for (const p of pages.slice(0, -1)) {
            const area = p.querySelector(".pagedjs_page_content > div") || p.querySelector(".pagedjs_page_content");
            const ar = area.getBoundingClientRect();
            let bottom = ar.top;
            for (const el of area.querySelectorAll(":scope > *, :scope > * > *")) {
              const r2 = el.getBoundingClientRect();
              if (r2.bottom > bottom) bottom = r2.bottom;
            }
            if (ar.height > 0) {
              sum += Math.min(1, (bottom - ar.top) / ar.height);
              n++;
            }
          }
          return n ? Math.round((sum / n) * 100) : null;
        });
      }
      const perf = await cdp.send("Performance.getMetrics");
      const metric = (n) => perf.metrics.find((m) => m.name === n)?.value;
      r.jsHeapMB = Math.round((metric("JSHeapUsedSize") || 0) / 1048576);
      r.layoutCount = metric("LayoutCount");

      // Scroll responsiveness probe: jump to the middle of the paged view.
      await page.evaluate(() => { window.__gaps = { max: 0, count: 0 }; });
      if (frame) {
        await frame.evaluate(() => {
          const se = document.scrollingElement || document.documentElement;
          se.scrollTop = se.scrollHeight / 2;
        });
        await page.waitForTimeout(1200);
        r.scrollGapMax = (await page.evaluate(() => window.__gaps)).max;
      }

      if (!SKIP_EXPORT) {
        // Publish → wait for layout → Download PDF.
        await page.evaluate(() => { window.__msgs = []; });
        const tPub = Date.now();
        await page.getByRole("button", { name: /Publish PDF|Publish/ }).first().click();
        await page.waitForFunction(() => window.__msgs.some((m) => m.type === "paged-done"), null, {
          timeout: PAGINATION_TIMEOUT, polling: 500,
        });
        r.publishLayoutMs = Date.now() - tPub;
        const tExp = Date.now();
        const dlBtn = page.getByRole("button", { name: "Download PDF", exact: true });
        await dlBtn.waitFor({ state: "visible", timeout: 30000 });
        const dl = page.waitForEvent("download", { timeout: PAGINATION_TIMEOUT });
        await dlBtn.click();
        const download = await dl;
        const path = `pdfs/${s.id}.pdf`;
        fs.mkdirSync("pdfs", { recursive: true });
        await download.saveAs(path);
        r.exportMs = Date.now() - tExp;
        r.pdfKB = Math.round(fs.statSync(path).size / 1024);
        r.exportOk = true;
      }
    } catch (err) {
      r.error = String(err).slice(0, 300);
      console.log(`  FAILED: ${r.error}`);
    }
    console.log(JSON.stringify(r));
    results.push(r);
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
}

run().catch((e) => { console.error(e); process.exit(1); });
