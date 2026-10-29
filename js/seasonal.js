/* Caloria Club — seasonal bootstrap for PUBLIC (logged-out) pages.
   Two targeted jobs only, no redesign:
     1) swap every existing mascot <img> to the Christmas mascot asset
        (originals kept on disk AND remembered in data-orig-src, so it's fully
        reversible — flip CALORIA_WINTER=false and refresh to restore);
     2) start the same subtle snowfall used elsewhere.
   Runs on the landing page before login, the header, club & waitlist pages.
   Honors prefers-reduced-motion and a global kill switch. */
(function () {
  "use strict";
  var WINTER_SRC = "/assets/mascot-winter.png?v=4";   // genuine transparent-alpha cutout
  // Images that ARE the mascot (by filename or class). Founder photos etc. excluded.
  var MASCOT_RE = /(hero-mascot-cut|logo-mascot|mascot-sm|mascot-winter)/i;
  var MASCOT_CLASS = /(brand-logo|brand-mascot|hero-mascot|wl-mascot|sub-gate-logo)/i;

  function enabled() { return window.CALORIA_WINTER !== false; }
  function reduced() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return false; }
  }

  function swapMascots() {
    if (!enabled()) return;
    var imgs = document.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.dataset.winter) continue;
      var src = img.getAttribute("src") || "";
      var cls = img.className || "";
      if (src.indexOf("mascot-winter") !== -1) { img.dataset.winter = "1"; continue; }
      if (MASCOT_RE.test(src) || MASCOT_CLASS.test(cls) || /mascot/i.test(img.getAttribute("alt") || "")) {
        img.dataset.origSrc = src;
        img.dataset.winter = "1";
        img.src = WINTER_SRC;
        img.classList.add("is-winter-mascot");
      }
    }
  }

  function startSnow() {
    if (!enabled() || reduced() || !window.CaloriaSnow) return;
    if (!document.getElementById("snowRoot")) {
      var d = document.createElement("div");
      d.id = "snowRoot"; d.setAttribute("aria-hidden", "true");
      document.body.appendChild(d);
    }
    try { window.CaloriaSnow.start({ density: 0.00007 }); } catch (e) {}
  }

  function go() { swapMascots(); startSnow(); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();

  // Exposed so the app can re-run the swap after it reveals late-rendered mascots
  // (e.g. the in-app header shown post-login).
  window.CaloriaSeasonal = { refresh: go, swapMascots: swapMascots };
})();
