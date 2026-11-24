/* ===========================================================================
 * Caloria Lucky Wheel — new-visitor promotional popup.
 * Loads after config.js (window.CALORIA_API) and app.js (window.caloriaStartJoin).
 *
 * The BACKEND decides the prize (secure, weighted) and persists the redemption;
 * this module only animates the wheel to that prize, shows the winning screen, and
 * hands off into the EXISTING onboarding → registration → checkout flow via
 * window.caloriaStartJoin(). No prices, prizes, or odds are decided on the client.
 * ===========================================================================*/
(function () {
  "use strict";

  var API = window.CALORIA_API || ("http://" + (location.hostname || "localhost") + ":8787");
  var TOKEN_KEY   = "caloria.token";           // app.js login token (shared)
  var STORE       = "caloria.wheel.v1";        // the won offer (read by app.js)
  var SESSION_KEY = "caloria.wheel.session";   // stable wheel session (no reroll)
  var DISMISS     = "caloria.wheel.dismissed"; // sessionStorage, this tab/session

  var SHOWN = false, SPINNING = false;

  function $(id) { return document.getElementById(id); }

  function api(path, body) {
    return fetch(API + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ("Error " + r.status)); e.status = r.status; e.data = j; throw e; }
        return j;
      });
    });
  }

  function getSession() { try { return localStorage.getItem(SESSION_KEY) || null; } catch (_) { return null; } }
  function setSession(s) { try { if (s) localStorage.setItem(SESSION_KEY, s); } catch (_) {} }
  function hasWon() { try { return !!localStorage.getItem(STORE); } catch (_) { return false; } }

  function eligible() {
    // New, logged-out visitor only; never interrupt onboarding / login / checkout.
    try { if (localStorage.getItem(TOKEN_KEY)) return false; } catch (_) {}
    if (window.CaloriaNative && window.CaloriaNative.isNative) return false;
    try { if (sessionStorage.getItem(DISMISS)) return false; } catch (_) {}
    if (hasWon()) return false;                       // already holds an offer
    var app = $("app");
    if (app && !app.classList.contains("hidden")) return false;  // mid-flow
    return true;
  }

  function logEvent(ev, extra) {
    try {
      var body = { event: ev, wheel_session: getSession() };
      if (extra) { for (var k in extra) { body[k] = extra[k]; } }
      api("/api/wheel/event", body).catch(function () {});
    } catch (_) {}
  }

  /* ---- wheel geometry (SVG, 3 sectors) ---- */
  var COLORS = ["#ff8fbd", "#ffd4e6", "#ff6fa8"];   // powder-pink palette
  var SHORT  = { yearly: "YEARLY −60%", quarterly: "3-MONTH −50%", monthly: "$12 1ST MONTH" };
  var ORDER  = [];

  function polar(cx, cy, r, deg) { var a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function sectorPath(cx, cy, r, start, end) {
    var p1 = polar(cx, cy, r, start), p2 = polar(cx, cy, r, end);
    var large = (end - start) > 180 ? 1 : 0;
    return "M" + cx + " " + cy + " L" + p1[0].toFixed(2) + " " + p1[1].toFixed(2) +
           " A" + r + " " + r + " 0 " + large + " 1 " + p2[0].toFixed(2) + " " + p2[1].toFixed(2) + " Z";
  }
  function svgEl(name) { return document.createElementNS("http://www.w3.org/2000/svg", name); }

  function buildWheel(prizes) {
    var svg = $("lwWheel"); if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var n = prizes.length, seg = 360 / n, cx = 100, cy = 100, r = 97;
    for (var i = 0; i < n; i++) {
      var start = i * seg, end = (i + 1) * seg, mid = start + seg / 2, key = prizes[i].prize;
      var path = svgEl("path");
      path.setAttribute("d", sectorPath(cx, cy, r, start, end));
      path.setAttribute("fill", COLORS[i % COLORS.length]);
      path.setAttribute("stroke", "#ffffff"); path.setAttribute("stroke-width", "2");
      svg.appendChild(path);
      var lp = polar(cx, cy, r * 0.60, mid);
      var t = svgEl("text");
      t.setAttribute("x", lp[0].toFixed(1)); t.setAttribute("y", lp[1].toFixed(1));
      t.setAttribute("text-anchor", "middle"); t.setAttribute("dominant-baseline", "middle");
      t.setAttribute("transform", "rotate(" + mid.toFixed(1) + " " + lp[0].toFixed(1) + " " + lp[1].toFixed(1) + ")");
      t.setAttribute("fill", "#7a2348"); t.setAttribute("font-size", "9.5"); t.setAttribute("font-weight", "800");
      t.textContent = SHORT[key] || key;
      svg.appendChild(t);
    }
    // hub
    var hub = svgEl("circle");
    hub.setAttribute("cx", cx); hub.setAttribute("cy", cy); hub.setAttribute("r", "14");
    hub.setAttribute("fill", "#fff"); hub.setAttribute("stroke", "#ff6fa8"); hub.setAttribute("stroke-width", "3");
    svg.appendChild(hub);
  }

  function animateTo(prize) {
    return new Promise(function (resolve) {
      var svg = $("lwWheel");
      var idx = ORDER.indexOf(prize); if (idx < 0) idx = 0;
      var n = ORDER.length || 3, seg = 360 / n, center = idx * seg + seg / 2;
      // Bring the won segment's center under the top pointer, after several turns.
      var finalDeg = 360 * 6 + (360 - center);
      if (!svg) { resolve(); return; }
      svg.style.transition = "transform 4.2s cubic-bezier(.17,.72,.18,1)";
      // force reflow so the transition always runs
      void svg.getBoundingClientRect();
      svg.style.transform = "rotate(" + finalDeg + "deg)";
      setTimeout(resolve, 4350);
    });
  }

  /* ---- spin → win ---- */
  function spin() {
    if (SPINNING) return;
    SPINNING = true;
    logEvent("spin_initiated");
    var btn = $("lwSpin");
    if (btn) { btn.disabled = true; btn.textContent = "Spinning…"; }
    api("/api/wheel/spin", { wheel_session: getSession() }).then(function (offer) {
      setSession(offer.wheel_session);
      return animateTo(offer.prize).then(function () { showResult(offer); });
    }).catch(function () {
      SPINNING = false;
      if (btn) { btn.disabled = false; btn.textContent = "SPIN THE WHEEL"; }
    });
  }

  var OFFER_LABEL = {
    yearly: "for your first year",
    quarterly: "for your first 3 months",
    monthly: "for your first month",
  };

  function resultHTML(offer) {
    // Headings are fixed promo copy per spec; prices come from the backend offer
    // (single source of truth), so nothing is hardcoded that could drift.
    var heads = {
      yearly:    { h: "OMG! YOU WON! 🎀", sub: "60% OFF YOUR YEARLY MEMBERSHIP",
                   was: offer.regular_price + "/year", now: "ONLY " + offer.promo_price + "/YEAR" },
      quarterly: { h: "YOU WON 50% OFF! 🎀", sub: "YOUR 3-MONTH CALORIA MEMBERSHIP",
                   was: offer.regular_price, now: "ONLY " + offer.promo_price + " / 3 MONTHS" },
      monthly:   { h: "A LITTLE GIFT FOR YOU! 🎀", sub: "YOUR FIRST MONTH OF CALORIA CLUB",
                   was: offer.regular_price, now: "ONLY " + offer.promo_price + " FOR YOUR FIRST MONTH" },
    };
    var v = heads[offer.prize] || heads.monthly;
    return '' +
      '<span class="pill pill-aqua lw-win-pill">YOU WON 🎀</span>' +
      '<h3 class="lw-win-h">' + v.h + '</h3>' +
      '<p class="lw-win-sub">' + v.sub + '</p>' +
      '<div class="lw-win-price"><s>' + v.was + '</s><span class="lw-win-now">' + v.now + '</span></div>' +
      '<p class="lw-win-terms">' + offer.renewal_terms + '</p>' +
      '<button class="btn btn-glow btn-block btn-lg" type="button" id="lwJoin">JOIN CALORIA CLUB</button>' +
      '<p class="ec-pop-fine">New customers only. Offer valid 24 hours.</p>';
  }

  function showResult(offer) {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        redemption_id: offer.redemption_id, prize: offer.prize, interval: offer.interval,
        promo_price: offer.promo_price, regular_price: offer.regular_price,
        renewal_terms: offer.renewal_terms, offer_label: OFFER_LABEL[offer.prize] || "",
      }));
    } catch (_) {}
    logEvent("winning_shown", { prize: offer.prize, redemption_id: offer.redemption_id });
    var intro = $("lwIntro"); if (intro) intro.classList.add("hidden");
    var res = $("lwResult");
    if (res) {
      res.innerHTML = resultHTML(offer);
      res.classList.remove("hidden");
      var join = $("lwJoin");
      if (join) join.addEventListener("click", function () {
        logEvent("join_clicked", { prize: offer.prize, redemption_id: offer.redemption_id });
        hide();
        if (typeof window.caloriaStartJoin === "function") { window.caloriaStartJoin(); return; }
        var b = document.querySelector('[data-auth="signup"]'); if (b) b.click();   // fallback
      });
    }
  }

  /* ---- show / hide ---- */
  function show() {
    if (SHOWN) return;
    var p = $("lwPop");
    if (!p || !eligible()) return;
    SHOWN = true;
    p.classList.remove("hidden");
    logEvent("popup_shown");
  }
  function hide() { var p = $("lwPop"); if (p) p.classList.add("hidden"); }
  function dismiss() {
    hide();
    try { sessionStorage.setItem(DISMISS, "1"); } catch (_) {}
    SPINNING = false;
  }

  function boot() {
    api("/api/config").then(function (c) {
      var w = c && c.wheel;
      if (!w || !w.enabled || !w.prizes || !w.prizes.length) return;   // wheel off → never shows
      ORDER = w.prizes.map(function (p) { return p.prize; });
      buildWheel(w.prizes);
      var odds = $("lwOdds");
      if (odds) {
        odds.textContent = "Every spin wins 🎀  " +
          w.prizes.map(function (p) { return p.odds_pct + "% " + p.prize; }).join("  ·  ");
      }
      var closeBtn = $("lwClose"); if (closeBtn) closeBtn.addEventListener("click", dismiss);
      var ov = $("lwPop"); if (ov) ov.addEventListener("click", function (e) { if (e.target === ov) dismiss(); });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { var p = $("lwPop"); if (p && !p.classList.contains("hidden")) dismiss(); }
      });
      var spinBtn = $("lwSpin"); if (spinBtn) spinBtn.addEventListener("click", spin);
      setTimeout(show, 5000);   // exactly ~5 seconds after landing
    }).catch(function () {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
