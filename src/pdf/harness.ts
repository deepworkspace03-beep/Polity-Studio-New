/**
 * Print harness — inlined into every paged document (preview + export).
 * Runs inside the iframe alongside Paged.js and:
 *   1. tracks the current chapter/section to fill the running-header topic,
 *   2. stamps the vector watermark onto every content page,
 *   3. switches long MCQ option lists to a single column,
 *   4. scales pages to fit the preview pane (preview only),
 *   5. reports completion + page count to the host app.
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

  // Fit pages to the pane width in preview mode.
  function fitPreview() {
    if (!isPreview) return;
    var page = document.querySelector(".pagedjs_page");
    var pages = document.querySelector(".pagedjs_pages");
    if (!page || !pages) return;
    var scale = Math.min(1, (document.documentElement.clientWidth - 24) / (page.offsetWidth + 24));
    pages.style.transform = scale < 1 ? "scale(" + scale + ")" : "";
    if (scale < 1) {
      pages.style.height = pages.offsetHeight * scale + "px";
    } else {
      pages.style.height = "";
    }
  }
  window.addEventListener("resize", fitPreview);

  // Running header topic — tracks the chapter (h1) / section (h2) in
  // effect as each page opens. "Plato: The Philosopher" → "Plato".
  var curChap = "";
  var curSect = "";
  function shortTopic(s) {
    return (s || "").split(/\s*[:—–]\s+|\s+[-]\s+/)[0].trim();
  }

  class StudioHandler extends window.Paged.Handler {
    afterPageLayout(pageElement) {
      var topicBox = pageElement.querySelector(".pagedjs_margin-top-right .run-head-topic");
      if (topicBox) topicBox.textContent = shortTopic(curChap || curSect);
      var heads = pageElement.querySelectorAll(".doc h1, .doc h2, .mcq h1, .mcq h2, .deck h1, .deck h2");
      for (var i = 0; i < heads.length; i++) {
        var t = (heads[i].textContent || "").trim();
        if (!t) continue;
        if (heads[i].tagName === "H1") { curChap = t; curSect = ""; }
        else { curSect = t; }
      }

      if (!wantWatermark || !wmTemplate) return;
      if (pageElement.querySelector(".cover") || pageElement.querySelector(".closing")) return;
      var box = pageElement.querySelector(".pagedjs_pagebox");
      if (box) box.appendChild(wmTemplate.content.cloneNode(true));
    }

    afterRendered(pages) {
      fitPreview();
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
