/**
 * Scripts inlined into preview/export documents. Neither script ships
 * in the app bundle — they run inside the sandboxed iframe.
 *
 * HARNESS_JS (paged documents) —
 *   1. tracks the current chapter/section to fill the running-header topic,
 *   2. stamps the vector watermark onto every content page,
 *   3. switches long MCQ option lists to a single column,
 *   4. zoom: fit-to-width or an explicit factor (host message "set-zoom"),
 *   5. page navigation + visible-page reporting for the host pager,
 *   6. cursor sync: scrolls to the page containing a source line,
 *   7. reports completion + page count to the host app.
 *
 * PREVIEW_JS (flow documents) —
 *   1. swaps #doc-root content in place (typing never reloads the iframe),
 *   2. follows the editor cursor via [data-line] markers.
 */
export const HARNESS_JS = String.raw`(function () {
  // Long MCQ options read better in one column — decide before layout.
  document.querySelectorAll(".q__options").forEach(function (ol) {
    var long = Array.prototype.some.call(ol.querySelectorAll(".q__opt-text"), function (el) {
      return (el.textContent || "").length > 55;
    });
    if (long) ol.classList.add("q__options--long");
  });

  var wantWatermark = document.body.getAttribute("data-watermark") === "1";
  var isPreview = document.body.getAttribute("data-purpose") === "preview";
  var wmTemplate = document.getElementById("watermark-template");

  function report(pages, error) {
    if (window.__PAGED_DONE__) return; // first result wins — never double-report
    window.__PAGED_PAGES__ = pages || 0;
    window.__PAGED_DONE__ = true;
    if (error) window.__PAGED_ERROR__ = String(error);
    try {
      parent.postMessage({ type: "paged-done", pages: pages || 0, error: error ? String(error) : null }, "*");
    } catch (e) { /* detached */ }
  }

  if (typeof window.Paged === "undefined" || !window.Paged.Handler) {
    report(0, "Paged.js failed to load");
    return;
  }

  /* ── Zoom (preview only) ─────────────────────────────────────────
     "fit-width" | "fit-page" | number. CSS zoom keeps real geometry so
     scrolling, page navigation and the export transcriber all stay
     accurate. Pinch and ctrl+wheel drive an explicit factor. */
  var zoomMode = "fit-width";
  var MIN_Z = 0.25, MAX_Z = 3;
  function fitFactors() {
    var page = document.querySelector(".pagedjs_page");
    if (!page) return { width: 1, page: 1 };
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    return {
      width: Math.max(MIN_Z, Math.min(MAX_Z, (vw - 24) / (page.offsetWidth + 8))),
      page: Math.max(MIN_Z, Math.min(MAX_Z, Math.min((vw - 24) / (page.offsetWidth + 8), (vh - 24) / (page.offsetHeight + 8)))),
    };
  }
  function currentFactor() {
    var f = fitFactors();
    if (zoomMode === "fit-width") return f.width;
    if (zoomMode === "fit-page") return f.page;
    return Math.max(MIN_Z, Math.min(MAX_Z, zoomMode));
  }
  function applyZoom() {
    if (!isPreview) return;
    var pages = document.querySelector(".pagedjs_pages");
    if (!pages) return;
    var z = currentFactor();
    pages.style.zoom = z;
    try {
      parent.postMessage({ type: "zoom", zoom: z, mode: typeof zoomMode === "number" ? "custom" : zoomMode }, "*");
    } catch (e) {}
  }
  function setZoom(mode) { zoomMode = mode; applyZoom(); }
  window.addEventListener("resize", function () {
    if (typeof zoomMode === "string") applyZoom();
  });

  // Pinch-to-zoom + ctrl/⌘+wheel — anchored so the focus point holds.
  function zoomAround(factor, clientX, clientY) {
    var prev = currentFactor();
    var next = Math.max(MIN_Z, Math.min(MAX_Z, factor));
    if (Math.abs(next - prev) < 0.001) return;
    var sx = window.scrollX, sy = window.scrollY;
    var docX = (sx + clientX) / prev, docY = (sy + clientY) / prev;
    zoomMode = next;
    applyZoom();
    window.scrollTo(docX * next - clientX, docY * next - clientY);
  }
  window.addEventListener("wheel", function (e) {
    if (!isPreview || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomAround(currentFactor() * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX, e.clientY);
  }, { passive: false });

  var pinchDist = 0, pinchZoom = 1, pinchCX = 0, pinchCY = 0;
  window.addEventListener("touchstart", function (e) {
    if (e.touches.length === 2) {
      var a = e.touches[0], b = e.touches[1];
      pinchDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchZoom = currentFactor();
      pinchCX = (a.clientX + b.clientX) / 2;
      pinchCY = (a.clientY + b.clientY) / 2;
    }
  }, { passive: true });
  window.addEventListener("touchmove", function (e) {
    if (e.touches.length === 2 && pinchDist > 0) {
      e.preventDefault();
      var a = e.touches[0], b = e.touches[1];
      var d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      zoomAround(pinchZoom * (d / pinchDist), pinchCX, pinchCY);
    }
  }, { passive: false });
  window.addEventListener("touchend", function (e) { if (e.touches.length < 2) pinchDist = 0; }, { passive: true });

  // Double-tap / double-click toggles fit-width ⇄ 100%.
  window.addEventListener("dblclick", function (e) {
    if (!isPreview) return;
    setZoom(typeof zoomMode === "number" ? "fit-width" : 1);
    e.preventDefault();
  });

  function pageEls() {
    return document.querySelectorAll(".pagedjs_page");
  }

  function goToPage(n) {
    var pages = pageEls();
    var el = pages[Math.max(0, Math.min(pages.length - 1, n - 1))];
    if (el) el.scrollIntoView({ block: "start", behavior: "auto" });
  }

  // Report which page is in view so the host pager stays honest.
  var visTimer = null;
  window.addEventListener("scroll", function () {
    if (visTimer) return;
    visTimer = setTimeout(function () {
      visTimer = null;
      var pages = pageEls();
      var mid = window.innerHeight / 2;
      for (var i = 0; i < pages.length; i++) {
        var r = pages[i].getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid) {
          try { parent.postMessage({ type: "page-visible", page: i + 1 }, "*"); } catch (e) {}
          return;
        }
      }
    }, 120);
  }, { passive: true });

  // Pick the element whose source line is closest below the cursor.
  // (A full scan, not DOM order: nested renders emit fragment-relative
  // line numbers that must lose to true document lines.)
  function scrollToLine(line) {
    var els = document.querySelectorAll(".pagedjs_page [data-line]");
    var best = null;
    var bestLine = -1;
    for (var i = 0; i < els.length; i++) {
      var ln = parseInt(els[i].getAttribute("data-line"), 10);
      if (ln <= line && ln > bestLine) { best = els[i]; bestLine = ln; }
    }
    if (!best) return;
    var page = best.closest(".pagedjs_page");
    if (page) page.scrollIntoView({ block: "start", behavior: "auto" });
  }

  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.type === "set-zoom") setZoom(d.zoom);
    else if (d.type === "zoom-by") zoomAround(currentFactor() * d.factor, document.documentElement.clientWidth / 2, document.documentElement.clientHeight / 2);
    else if (d.type === "go-to-page") goToPage(d.page);
    else if (d.type === "scroll-to-line") scrollToLine(d.line);
    else if (d.type === "print") {
      // Print at 1:1 — the preview zoom must not scale the paper.
      var pages = document.querySelector(".pagedjs_pages");
      var prev = pages ? pages.style.zoom : "";
      if (pages) pages.style.zoom = "1";
      window.focus();
      window.print();
      if (pages) pages.style.zoom = prev;
    }
  });

  // Table-of-contents navigation: a chapter click jumps straight to that
  // chapter's page inside this same preview — never a nested window or a
  // fragment reload. getElementById reaches the heading on whatever page
  // it landed on; we scroll that page to the top.
  document.addEventListener("click", function (e) {
    var link = e.target.closest && e.target.closest('a[href^="#"]');
    if (!link) return;
    var id = decodeURIComponent((link.getAttribute("href") || "").slice(1));
    var dest = id && document.getElementById(id);
    if (!dest) return;
    e.preventDefault();
    var page = dest.closest(".pagedjs_page");
    (page || dest).scrollIntoView({ block: "start", behavior: "smooth" });
  });

  // Preview → editor: clicking any sourced element reports its line so
  // the host can move the editor cursor there (read-only pages view —
  // no inline editing here, that's the flow preview's job).
  document.addEventListener("click", function (e) {
    if (!isPreview) return;
    if (e.target.closest && e.target.closest("a, input")) return;
    var target = e.target.closest && e.target.closest("[data-line]");
    if (!target) return;
    var line = parseInt(target.getAttribute("data-line"), 10);
    if (!line) return;
    try { parent.postMessage({ type: "preview-click", line: line, editable: false }, "*"); } catch (err) {}
  });

  // Running header topic — tracks the chapter (h1) / section (h2) in
  // effect as each page opens. "Plato: The Philosopher" → "Plato".
  var curChap = "";
  var curSect = "";
  function shortTopic(s) {
    return (s || "").split(/\s*[:—–]\s+|\s+[-]\s+/)[0].trim();
  }

  class StudioHandler extends window.Paged.Handler {
    afterPageLayout(pageElement) {
      var topicBox = pageElement.querySelector(".pagedjs_margin-top-center .run-head-topic");
      if (topicBox) topicBox.textContent = shortTopic(curChap || curSect);
      var heads = pageElement.querySelectorAll(".doc h1, .doc h2, .mcq h1, .mcq h2, .deck h1, .deck h2");
      for (var i = 0; i < heads.length; i++) {
        var t = (heads[i].textContent || "").trim();
        if (!t) continue;
        if (heads[i].tagName === "H1") { curChap = t; curSect = ""; }
        else { curSect = t; }
      }

      if (!wantWatermark || !wmTemplate) return;
      if (pageElement.querySelector(".cover")) return;
      var box = pageElement.querySelector(".pagedjs_pagebox");
      if (box) box.appendChild(wmTemplate.content.cloneNode(true));
    }

    afterRendered(pages) {
      applyZoom();
      report(pages.length, null);
    }
  }

  window.Paged.registerHandlers(StudioHandler);

  // Never hang the host on a rendering hiccup — but a stray error or
  // rejection during layout must NOT abort a render that is still
  // progressing. Paged.js emits recoverable errors while paginating, so a
  // fixed short timeout raced the layout: short documents finished inside
  // the window and exported fine, but anything past ~10 pages was still
  // laying out when the timer fired and got wrongly declared failed —
  // which forced the whole export onto the print fallback. Instead of
  // failing on a timer, watch the page count and only give up once
  // pagination has genuinely stalled, reporting whatever pages exist.
  var watching = false;
  function unblock(ev) {
    if (watching || window.__PAGED_DONE__) return;
    watching = true;
    var reason = (ev && (ev.message || ev.reason)) || "render error";
    var lastCount = -1;
    var stalls = 0;
    (function check() {
      if (window.__PAGED_DONE__) return; // afterRendered already reported success
      var count = document.querySelectorAll(".pagedjs_page").length;
      if (count !== lastCount) { lastCount = count; stalls = 0; } // still making progress
      else stalls += 1;
      // ~3s with no new page = genuinely stuck. Pages already laid out are
      // a real (if partial) render, so keep them rather than discard the
      // whole export; only a zero-page render is a true failure.
      if (stalls >= 12) {
        report(count, count ? null : reason);
        return;
      }
      setTimeout(check, 250);
    })();
  }
  window.addEventListener("error", unblock);
  window.addEventListener("unhandledrejection", unblock);
})();`;

/**
 * VIEWER_JS — the tiny reader script embedded in standalone HTML
 * exports. The pages are already laid out (the export snapshots the
 * paginated DOM), so all this does is zoom (fit-width by default,
 * ctrl/⌘+wheel, pinch, double-click) and a floating page indicator.
 * ~2 KB instead of shipping the 500 KB Paged.js runtime.
 */
export const VIEWER_JS = String.raw`(function () {
  var root = document.querySelector(".pagedjs_pages");
  var pages = document.querySelectorAll(".pagedjs_page");
  if (!root || !pages.length) return;
  var MIN = 0.25, MAX = 3, mode = "fit-width";

  function fit() {
    var p = pages[0];
    return Math.max(MIN, Math.min(MAX, (document.documentElement.clientWidth - 24) / (p.offsetWidth + 8)));
  }
  function factor() { return mode === "fit-width" ? fit() : Math.max(MIN, Math.min(MAX, mode)); }
  function apply() { root.style.zoom = factor(); }

  function zoomAround(next, cx, cy) {
    var prev = factor();
    next = Math.max(MIN, Math.min(MAX, next));
    if (Math.abs(next - prev) < 0.001) return;
    var sx = window.scrollX, sy = window.scrollY;
    mode = next;
    apply();
    window.scrollTo(((sx + cx) / prev) * next - cx, ((sy + cy) / prev) * next - cy);
  }
  window.addEventListener("resize", function () { if (mode === "fit-width") apply(); });
  window.addEventListener("wheel", function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomAround(factor() * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX, e.clientY);
  }, { passive: false });
  window.addEventListener("dblclick", function () { mode = typeof mode === "number" ? "fit-width" : 1; apply(); });

  var pd = 0, pz = 1, px = 0, py = 0;
  window.addEventListener("touchstart", function (e) {
    if (e.touches.length === 2) {
      var a = e.touches[0], b = e.touches[1];
      pd = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pz = factor(); px = (a.clientX + b.clientX) / 2; py = (a.clientY + b.clientY) / 2;
    }
  }, { passive: true });
  window.addEventListener("touchmove", function (e) {
    if (e.touches.length === 2 && pd > 0) {
      e.preventDefault();
      var a = e.touches[0], b = e.touches[1];
      zoomAround(pz * (Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pd), px, py);
    }
  }, { passive: false });
  window.addEventListener("touchend", function (e) { if (e.touches.length < 2) pd = 0; }, { passive: true });

  // Floating page indicator + zoom controls.
  var bar = document.createElement("div");
  bar.setAttribute("style", "position:fixed;bottom:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:2px;background:rgba(17,21,28,0.92);color:#dfe6ef;border:1px solid rgba(255,255,255,0.14);border-radius:999px;padding:4px 6px;font:600 12px/1 system-ui,sans-serif;z-index:9;user-select:none;");
  function btn(txt, title, fn) {
    var b = document.createElement("button");
    b.textContent = txt; b.title = title;
    b.setAttribute("style", "all:unset;cursor:pointer;padding:4px 8px;border-radius:999px;");
    b.addEventListener("click", fn);
    return b;
  }
  var label = document.createElement("span");
  label.setAttribute("style", "padding:0 8px;font-variant-numeric:tabular-nums;");
  function setLabel(n) { label.textContent = n + " / " + pages.length; }
  setLabel(1);
  bar.appendChild(btn("−", "Zoom out", function () { zoomAround(factor() * 0.9, innerWidth / 2, innerHeight / 2); }));
  bar.appendChild(btn("+", "Zoom in", function () { zoomAround(factor() * 1.1, innerWidth / 2, innerHeight / 2); }));
  bar.appendChild(btn("⤢", "Fit width", function () { mode = "fit-width"; apply(); }));
  bar.appendChild(label);
  document.body.appendChild(bar);

  var t = null;
  window.addEventListener("scroll", function () {
    if (t) return;
    t = setTimeout(function () {
      t = null;
      var mid = window.innerHeight / 2;
      for (var i = 0; i < pages.length; i++) {
        var r = pages[i].getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid) { setLabel(i + 1); return; }
      }
    }, 120);
  }, { passive: true });

  apply();
})();`;

export const PREVIEW_JS = String.raw`(function () {
  var root = document.getElementById("doc-root");
  var flashTimer = null;
  var editing = false;

  // Closest source line at or above the cursor (full scan — nested
  // renders emit fragment-relative numbers that must not win).
  function scrollToLine(line) {
    var els = root.querySelectorAll("[data-line]");
    var best = null;
    var bestLine = -1;
    for (var i = 0; i < els.length; i++) {
      var ln = parseInt(els[i].getAttribute("data-line"), 10);
      if (ln <= line && ln > bestLine) { best = els[i]; bestLine = ln; }
    }
    if (!best) return;
    var r = best.getBoundingClientRect();
    var vh = window.innerHeight;
    // Only move when the target is outside the comfortable middle band,
    // so small cursor movements don't fight the reader's own scrolling.
    if (r.top < vh * 0.12 || r.bottom > vh * 0.85) {
      window.scrollTo({ top: window.scrollY + r.top - vh * 0.3, behavior: "smooth" });
    }
    document.querySelectorAll(".preview-here").forEach(function (el) { el.classList.remove("preview-here"); });
    if (flashTimer) clearTimeout(flashTimer);
    best.classList.add("preview-here");
    flashTimer = setTimeout(function () { best.classList.remove("preview-here"); }, 1700);
  }

  /* ── Inline editing ──────────────────────────────────────────────
     Editable elements carry data-edit ("title" | "subtitle" | a field
     name) or data-edit-line (a heading source line). Focus pauses host
     content swaps; commit posts the new text back for the host to write
     into the doc / markdown. Plain text only — no rich paste. */
  function editableEls() {
    return root.querySelectorAll("[data-edit], [data-edit-line]");
  }
  function commit(el) {
    var text = (el.textContent || "").replace(/\s+/g, " ").trim();
    var msg = { type: "inline-edit", text: text };
    if (el.hasAttribute("data-edit-line")) msg.line = parseInt(el.getAttribute("data-edit-line"), 10);
    else msg.field = el.getAttribute("data-edit");
    try { parent.postMessage(msg, "*"); } catch (e) {}
  }
  function wireEditables() {
    editableEls().forEach(function (el) {
      if (el.__wired) return;
      el.__wired = true;
      el.setAttribute("contenteditable", "plaintext-only");
      el.setAttribute("spellcheck", "false");
      el.classList.add("inline-editable");
      el.addEventListener("focus", function () { editing = true; try { parent.postMessage({ type: "edit-focus" }, "*"); } catch (e) {} });
      el.addEventListener("blur", function () { editing = false; commit(el); try { parent.postMessage({ type: "edit-blur" }, "*"); } catch (e) {} });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); el.blur(); }
        else if (e.key === "Escape") { e.preventDefault(); el.blur(); }
      });
      el.addEventListener("paste", function (e) {
        e.preventDefault();
        var t = (e.clipboardData || window.clipboardData).getData("text/plain").replace(/[\r\n]+/g, " ");
        document.execCommand("insertText", false, t);
      });
    });
  }

  // Preview → editor: click anywhere sourced (paragraph, list item,
  // table cell, callout…) reports its line. Elements that are also
  // inline-editable (title/subtitle/headings) mark themselves so the
  // host syncs the editor cursor without stealing DOM focus from the
  // contenteditable the click just entered.
  root.addEventListener("click", function (e) {
    // TOC chapter click → scroll to that heading in this same preview.
    var link = e.target.closest('a[href^="#"]');
    if (link) {
      var id = decodeURIComponent((link.getAttribute("href") || "").slice(1));
      var dest = id && document.getElementById(id);
      if (dest) { e.preventDefault(); dest.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
    }
    if (e.target.closest("a, input")) return;
    var target = e.target.closest("[data-line]");
    if (!target) return;
    var line = parseInt(target.getAttribute("data-line"), 10);
    if (!line) return;
    var editable = !!e.target.closest("[data-edit], [data-edit-line]");
    try { parent.postMessage({ type: "preview-click", line: line, editable: editable }, "*"); } catch (err) {}
  });

  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.type === "update" && typeof d.html === "string") {
      if (editing) return; // never clobber an element being edited
      root.innerHTML = d.html;
      wireEditables();
    } else if (d.type === "scroll-to-line" && typeof d.line === "number") {
      if (!editing) scrollToLine(d.line);
    }
  });

  // Report scroll progress so the host can show an estimated page /
  // percentage readout for the continuous flow view (throttled to a frame).
  var scrollTick = false;
  function reportScroll() {
    scrollTick = false;
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    var pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    try { parent.postMessage({ type: "flow-scroll", pct: pct }, "*"); } catch (e) {}
  }
  window.addEventListener("scroll", function () {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(reportScroll);
  }, { passive: true });

  wireEditables();
  try { parent.postMessage({ type: "preview-ready" }, "*"); } catch (e) { /* detached */ }
  reportScroll();
})();`;
