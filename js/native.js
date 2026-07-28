/* ============================================================================
 * Caloria — Capacitor native bridge
 * ----------------------------------------------------------------------------
 * Loaded on native (iOS/Android) AND web. On web it is an inert no-op, so the
 * existing site behaves EXACTLY as before. On native it:
 *   1. Points the app at the production backend (the web build uses same-origin
 *      + Netlify _redirects; the native app has no same origin, so it needs the
 *      absolute API URL).
 *   2. Configures the status bar to match the light-pink theme.
 *   3. Hides the splash screen once the app has booted.
 *   4. Keeps inputs visible when the keyboard opens.
 *   5. Handles deep links (custom scheme + universal links).
 *   6. Registers for push notifications.
 *   7. Opens Stripe Checkout in the system browser (App Store / Play compliant)
 *      and refreshes subscription state when the user returns.
 *
 * IMPORTANT: this file loads BEFORE js/app.js so that window.CALORIA_API is set
 * before app.js reads it.
 * ==========================================================================*/
(function () {
  "use strict";

  var Cap = window.Capacitor;
  var isNative = !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform());

  /* --- Production backend URL (same host the web build proxies /api/* to) --- */
  var PROD_API = "https://caloria-api.onrender.com";

  // On native, force the absolute API base unless one was already provided.
  if (isNative && !window.CALORIA_API) {
    window.CALORIA_API = PROD_API;
  }

  // Public surface used by app.js (guarded so web stays untouched).
  window.CaloriaNative = {
    isNative: isNative,
    platform: isNative ? Cap.getPlatform() : "web",
    /**
     * Open an external URL. On native this uses the in-app system browser
     * (SFSafariViewController / Chrome Custom Tab). On web it falls back to a
     * normal navigation so behaviour is identical to today.
     * @param {string} url
     * @param {{checkout?: boolean}} [opts]
     */
    openExternal: function (url, opts) {
      opts = opts || {};
      var Browser = isNative && Cap.Plugins && Cap.Plugins.Browser;
      if (!Browser) { window.location.href = url; return; }
      if (opts.checkout) pendingCheckoutReturn = true;
      Browser.open({ url: url, presentationStyle: "fullscreen" });
    }
  };

  if (!isNative) return; // ---- web ends here; everything below is native-only ----

  var P = Cap.Plugins || {};
  var pendingCheckoutReturn = false;

  // Tag <html> so CSS can target native (safe areas, keyboard, etc.).
  var root = document.documentElement;
  root.classList.add("native", "platform-" + Cap.getPlatform());

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else { fn(); }
  }

  /* ---------------------------------------------------------------- status bar */
  function initStatusBar() {
    var SB = P.StatusBar;
    if (!SB) return;
    try {
      // Light background => dark content. On the plugin, Style.Light = dark text.
      SB.setStyle({ style: "LIGHT" });
      if (Cap.getPlatform() === "android") {
        SB.setBackgroundColor({ color: "#ffeaf3" });
        SB.setOverlaysWebView({ overlay: false });
      }
    } catch (e) { /* non-fatal */ }
  }

  /* -------------------------------------------------------------- splash screen */
  function hideSplash() {
    var SS = P.SplashScreen;
    if (!SS) return;
    try { SS.hide({ fadeOutDuration: 250 }); } catch (e) {}
  }

  /* -------------------------------------------------------------- keyboard */
  function initKeyboard() {
    var KB = P.Keyboard;
    if (!KB || !KB.addListener) return;
    try {
      KB.addListener("keyboardWillShow", function (info) {
        var h = (info && info.keyboardHeight) || 0;
        root.style.setProperty("--kb-height", h + "px");
        root.classList.add("kb-open");
        // Make sure the focused field is scrolled into view above the keyboard.
        var el = document.activeElement;
        if (el && el.scrollIntoView) {
          setTimeout(function () {
            try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
          }, 50);
        }
      });
      KB.addListener("keyboardWillHide", function () {
        root.style.setProperty("--kb-height", "0px");
        root.classList.remove("kb-open");
      });
    } catch (e) {}
  }

  /* -------------------------------------------------------------- deep links */
  // Routes both custom-scheme links (caloriaclub://path?query) and universal
  // links (https://caloriaclub.com/path?query) into the SPA. app.js reads the
  // URL on boot, so we normalise to a same-origin path and reload the shell.
  function initDeepLinks() {
    var App = P.App;
    if (!App || !App.addListener) return;
    App.addListener("appUrlOpen", function (data) {
      var raw = data && data.url;
      if (!raw) return;
      try {
        var path = "/", search = "";
        var m = raw.match(/^caloriaclub:\/\/([^?]*)(\?.*)?$/i); // custom scheme
        if (m) {
          path = "/" + (m[1] || "");
          search = m[2] || "";
        } else {
          var u = new URL(raw); // universal link
          path = u.pathname || "/";
          search = u.search || "";
        }
        var target = path + search;
        // If we're already on this route, just re-run boot; else navigate.
        if (location.pathname + location.search !== target) {
          location.href = target;
        } else {
          location.reload();
        }
      } catch (e) { /* ignore malformed links */ }
    });
  }

  /* -------------------------------------------------------------- push */
  function initPush() {
    var PN = P.PushNotifications;
    if (!PN || !PN.addListener) return;
    try {
      PN.addListener("registration", function (t) {
        var token = t && t.token;
        if (!token) return;
        // Expose for anything that wants it; try to register with the backend if
        // it supports it (endpoint is optional — a 404 is silently ignored so the
        // backend can stay unchanged until you add push server-side).
        window.CaloriaNative.pushToken = token;
        window.dispatchEvent(new CustomEvent("caloria:push-token", { detail: token }));
        try {
          var authToken = localStorage.getItem("caloria.token");
          if (authToken) {
            fetch((window.CALORIA_API || "") + "/api/push/register", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + authToken
              },
              body: JSON.stringify({ token: token, platform: Cap.getPlatform() })
            }).catch(function () {});
          }
        } catch (e) {}
      });
      PN.addListener("registrationError", function (err) {
        console.warn("[caloria] push registration error", err);
      });
      PN.addListener("pushNotificationActionPerformed", function (action) {
        // Deep-link on tap if the payload carries a route.
        var data = action && action.notification && action.notification.data;
        if (data && data.route) {
          try { location.href = data.route; } catch (e) {}
        }
      });

      // Ask permission, then register. We DON'T auto-prompt on first launch to
      // avoid an ugly cold permission dialog — call CaloriaNative.enablePush()
      // from a "Turn on notifications" button for best App Store UX. We still
      // register if permission was already granted previously.
      PN.checkPermissions().then(function (res) {
        if (res && res.receive === "granted") PN.register();
      }).catch(function () {});

      window.CaloriaNative.enablePush = function () {
        return PN.requestPermissions().then(function (res) {
          if (res && res.receive === "granted") { PN.register(); return true; }
          return false;
        });
      };
    } catch (e) {}
  }

  /* -------------------------------------------------------------- app lifecycle */
  // When the user returns from the external Stripe checkout, reload the shell so
  // boot() re-reads /api/me and the (now active) subscription unlocks the app.
  function initLifecycle() {
    var App = P.App, Browser = P.Browser;
    function onReturn() {
      if (!pendingCheckoutReturn) return;
      pendingCheckoutReturn = false;
      try { Browser && Browser.close(); } catch (e) {}
      // Small delay lets the Stripe webhook mark the account active server-side.
      setTimeout(function () { location.reload(); }, 400);
    }
    if (Browser && Browser.addListener) {
      Browser.addListener("browserFinished", onReturn);
    }
    if (App && App.addListener) {
      App.addListener("appStateChange", function (state) {
        if (state && state.isActive) onReturn();
      });
      // Android hardware back: exit the app only from the top of the SPA.
      App.addListener("backButton", function (info) {
        if (info && info.canGoBack) { window.history.back(); }
        else { App.exitApp(); }
      });
    }
  }

  /* -------------------------------------------------------------- boot */
  initStatusBar();
  initKeyboard();
  initDeepLinks();
  initPush();
  initLifecycle();

  ready(function () {
    // Give the web app a beat to render the first screen, then drop the splash.
    setTimeout(hideSplash, 200);
  });
  // Safety net: never leave the splash up forever.
  setTimeout(hideSplash, 3000);
})();
