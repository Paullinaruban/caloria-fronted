/* Caloria Club — analytics (GA4 + Meta Pixel + TikTok Pixel).
   ─────────────────────────────────────────────────────────────
   PASTE YOUR IDS BELOW — that's the only edit needed. While all three are
   empty this file does nothing at all (no external requests, no cookies).

   Events sent once IDs are set:
     page_view               — automatic on every page load
     referral_visit          — visitor arrived through a member's invite link
     waitlist_signup         — new Founding Member joined ("Lead" on Meta/TikTok;
                               includes referred: yes/no for referral conversions)
     questionnaire_complete  — all three founding questions answered
*/
(function () {
  "use strict";

  var IDS = {
    ga4: "",        // e.g. "G-XXXXXXXXXX"
    metaPixel: "",  // e.g. "1234567890123456"
    tiktokPixel: "" // e.g. "ABCDEFGHIJKLMNOPQRSTUVWX"
  };

  var enabled = !!(IDS.ga4 || IDS.metaPixel || IDS.tiktokPixel);

  function loadScript(src) {
    var s = document.createElement("script");
    s.async = true; s.src = src;
    document.head.appendChild(s);
  }

  if (IDS.ga4) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", IDS.ga4);
    loadScript("https://www.googletagmanager.com/gtag/js?id=" + IDS.ga4);
  }

  if (IDS.metaPixel) {
    /* Meta Pixel bootstrap (official snippet, minified) */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,"script","https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", IDS.metaPixel);
    window.fbq("track", "PageView");
  }

  if (IDS.tiktokPixel) {
    /* TikTok Pixel bootstrap (official snippet, condensed) */
    !function (w, d, t) {
      w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || [];
      ttq.methods = ["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
      ttq.setAndDefer = function (o, m) { o[m] = function () { o.push([m].concat(Array.prototype.slice.call(arguments, 0))); }; };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.load = function (e) { ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._t = ttq._t || {}; ttq._t[e] = +new Date(); ttq._o = ttq._o || {};
        loadScript("https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=" + e + "&lib=" + t); };
      ttq.load(IDS.tiktokPixel);
      ttq.page();
    }(window, document, "ttq");
  }

  /* One tracking call, fanned out to whichever pixels are configured. */
  window.caloriaTrack = function (event, params) {
    if (!enabled) return;
    params = params || {};
    try {
      if (IDS.ga4 && window.gtag) window.gtag("event", event, params);
      if (IDS.metaPixel && window.fbq) {
        if (event === "waitlist_signup") window.fbq("track", "Lead", params);
        else window.fbq("trackCustom", event, params);
      }
      if (IDS.tiktokPixel && window.ttq) {
        if (event === "waitlist_signup") window.ttq.track("SubmitForm", params);
        else window.ttq.track(event, params);
      }
    } catch (_) { /* analytics must never break the experience */ }
  };

  // Referral visit — the invite link carries ?ref=CODE.
  if (enabled && new URLSearchParams(location.search).get("ref")) {
    window.caloriaTrack("referral_visit", {});
  }
})();
