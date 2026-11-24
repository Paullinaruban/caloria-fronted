/* ===================== Meta Pixel — Caloria Club =====================
 * Pixel / Dataset ID: 1089413896799147
 *
 * Kept in this SEPARATE self-hosted file (loaded via <script src>) on purpose:
 * the site's Content-Security-Policy has `script-src 'self'` (no 'unsafe-inline'),
 * so Meta's snippet cannot live inline in index.html. The remote loader
 * (connect.facebook.net) and the event beacons (www.facebook.com) are allowed in
 * the CSP — see netlify.toml.
 *
 * Fires PageView here. Funnel + conversion events are triggered by app.js through
 * window.CaloriaPixel so they happen at the RIGHT moment (e.g. Purchase only after
 * a confirmed, paid subscription — never on a checkout click).
 * ==================================================================== */
(function () {
  "use strict";
  var PIXEL_ID = "1089413896799147";

  // Standard Meta Pixel base loader (verbatim from Events Manager; ID injected above).
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0";
    n.queue = []; t = b.createElement(e); t.async = !0;
    t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  try {
    fbq("init", PIXEL_ID);
    fbq("track", "PageView");
  } catch (e) { /* pixel blocked (ad-blocker) — the app keeps working */ }

  // ---- helpers ----------------------------------------------------------
  function ready() { return typeof window.fbq === "function"; }
  function safe(fn) { try { if (ready()) fn(); } catch (e) {} }
  function num(v) { v = parseFloat(v); return (isFinite(v) && v > 0) ? Math.round(v * 100) / 100 : undefined; }

  // Dedup a Purchase across the post-Stripe redirect/reload and any re-polling,
  // so a refresh of the ?checkout=success URL can never double-count a sale.
  function firstTime(key) {
    try {
      if (localStorage.getItem(key)) return false;
      localStorage.setItem(key, String(Date.now()));
    } catch (e) { /* private mode — fall through and allow the event */ }
    return true;
  }

  function planParams(interval, value, currency) {
    var p = {
      content_type: "product",
      content_category: "subscription",
      content_name: interval === "yearly" ? "Caloria Premium — Yearly" : "Caloria Premium — Monthly",
      contents: [{ id: "caloria_premium_" + (interval || "monthly"), quantity: 1 }]
    };
    var v = num(value);
    if (v !== undefined) { p.value = v; p.currency = (currency || "USD").toUpperCase(); }
    return p;
  }

  window.CaloriaPixel = {
    // Viewing the pricing / subscription offer.
    viewContent: function (interval, value, currency) {
      safe(function () { fbq("track", "ViewContent", planParams(interval, value, currency)); });
    },
    // User began checkout (clicked "Continue to secure checkout"). NOT a conversion.
    initiateCheckout: function (interval, value, currency) {
      safe(function () {
        var p = planParams(interval, value, currency);
        p.num_items = 1;
        fbq("track", "InitiateCheckout", p);
      });
    },
    // Fired ONLY after a confirmed, paid subscription (see confirmSubscription in
    // app.js). `dedupeKey` is the Stripe session id so it fires at most once/sale.
    purchase: function (dedupeKey, interval, value, currency) {
      if (dedupeKey && !firstTime("caloria.fbq.purchase." + dedupeKey)) return;
      safe(function () {
        var opts = dedupeKey ? { eventID: "sub_" + dedupeKey } : undefined; // ready for CAPI dedup later
        fbq("track", "Purchase", planParams(interval, value, currency), opts);
      });
    }
  };
})();
