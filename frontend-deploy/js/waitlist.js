/* Caloria Club — waitlist homepage helpers (Frontend A).
   Lives in a file (not inline) because the production CSP is script-src 'self'. */
(function () {
  "use strict";

  // Smooth-scroll CTAs (this page doesn't load the product app.js).
  document.querySelectorAll("[data-scroll]").forEach(function (b) {
    b.addEventListener("click", function () {
      var el = document.getElementById(b.dataset.scroll);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // Mirror the live member count into the hero proof line.
  var API = window.CALORIA_API || "http://" + (location.hostname || "localhost") + ":8787";
  fetch(API + "/api/club/stats").then(function (r) { return r.json(); }).then(function (s) {
    if (s.total >= 10) {
      document.getElementById("wlHeroProof").textContent =
        s.total.toLocaleString() + " women are already inside. Founding memberships are limited.";
    }
  }).catch(function () { /* proof line keeps its default copy */ });
})();
