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

  /* ── Zoom (preview only) ── zoom keeps layout math simple compared
     to transform: scaled pages keep real geometry for scrolling. */
  var zoomMode = "fit";
  function applyZoom() {
    if (!isPreview) return;
    var pages = document.querySelector(".pagedjs_pages");
    var page = document.querySelector(".pagedjs_page");
    if (!pages || !page) return;
    var z = zoomMode === "fit"
      ? Math.min(1.35, (document.documentElement.clientWidth - 28) / (page.offsetWidth + 26))
      : zoomMode;
    pages.style.zoom = z;
    try { parent.postMessage({ type: "zoom", zoom: z, fit: zoomMode === "fit" }, "*"); } catch (e) {}
  }
  window.addEventListener("resize", function () {
    if (zoomMode === "fit") applyZoom();
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
    if (d.type === "set-zoom") { zoomMode = d.zoom; applyZoom(); }
    else if (d.type === "go-to-page") goToPage(d.page);
    else if (d.type === "scroll-to-line") scrollToLine(d.line);
    else if (d.type === "print") { window.focus(); window.print(); }
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

  // Never hang the host on a rendering hiccup.
  function unblock(ev) {
    setTimeout(function () {
      if (!window.__PAGED_DONE__) report(0, (ev && (ev.message || ev.reason)) || "render error");
    }, 800);
  }
  window.addEventListener("error", unblock);
  window.addEventListener("unhandledrejection", unblock);
})();`;

export const PREVIEW_JS = String.raw`(function () {
  var root = document.getElementById("doc-root");
  var flashTimer = null;

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

  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.type === "update" && typeof d.html === "string") {
      root.innerHTML = d.html;
    } else if (d.type === "scroll-to-line" && typeof d.line === "number") {
      scrollToLine(d.line);
    }
  });

  try { parent.postMessage({ type: "preview-ready" }, "*"); } catch (e) { /* detached */ }
})();`;
