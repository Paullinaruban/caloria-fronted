/* ============================================================================
 * Caloria — RevenueCat In-App Purchase bridge (window.CaloriaIAP)
 * ----------------------------------------------------------------------------
 * NATIVE ONLY. On the website this file is completely inert — `isEnabled` stays
 * false, so app.js keeps using Stripe exactly as it does today.
 *
 * On the iOS app (and, later, Android) it drives Apple In-App Purchase through
 * the RevenueCat Capacitor plugin. The RevenueCat user id is set to the Caloria
 * `user.id`, so a purchase attaches to the SAME account — no duplicate accounts.
 *
 * This talks to the native plugin via the Capacitor bridge
 * (`Capacitor.Plugins.<name>`) because the site is not bundled. The plugin comes
 * from `@revenuecat/purchases-capacitor` (installed via npm). If a future plugin
 * version registers under a different bridge name, add it to PLUGIN_NAMES below.
 * ==========================================================================*/
(function () {
  "use strict";

  var Cap = window.Capacitor;
  var isNative = !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform());
  var platform = isNative ? Cap.getPlatform() : "web";

  // Possible bridge names across plugin versions (most→least likely).
  var PLUGIN_NAMES = ["Purchases", "PurchasesPlugin", "CapacitorPurchases", "RevenueCat"];

  function resolvePlugin() {
    if (!isNative || !Cap.Plugins) return null;
    for (var i = 0; i < PLUGIN_NAMES.length; i++) {
      if (Cap.Plugins[PLUGIN_NAMES[i]]) return Cap.Plugins[PLUGIN_NAMES[i]];
    }
    return null;
  }

  var Purchases = resolvePlugin();

  var state = {
    configured: false,
    entitlement: "premium",
    apiKey: "",
    userId: null,
  };

  function log() {
    try { console.log.apply(console, ["[caloria][iap]"].concat([].slice.call(arguments))); } catch (e) {}
  }

  // Pick the public SDK key for THIS platform from the /api/config payload.
  function keyForPlatform(cfg) {
    if (!cfg) return "";
    if (platform === "ios") return cfg.revenuecat_apple_key || "";
    if (platform === "android") return cfg.revenuecat_google_key || "";
    return "";
  }

  var CaloriaIAP = {
    // True only when we're native, the plugin is present, and a key is configured.
    get isEnabled() {
      return !!(isNative && Purchases && state.configured);
    },
    platform: platform,

    /**
     * Configure the RevenueCat SDK. Pass the object returned by GET /api/config.
     * Safe to call more than once; only the first configure() hits the SDK.
     */
    configure: async function (cfg) {
      if (!isNative || !Purchases) return false;
      var key = keyForPlatform(cfg);
      if (!key) { log("no RevenueCat key for", platform, "— IAP stays disabled"); return false; }
      if (state.configured) return true;
      state.apiKey = key;
      state.entitlement = (cfg && cfg.revenuecat_entitlement) || "premium";
      try {
        await Purchases.configure({ apiKey: key });
        state.configured = true;
        log("configured for", platform);
        return true;
      } catch (e) {
        log("configure failed", e);
        return false;
      }
    },

    /** Tie the RevenueCat customer to the Caloria account (user.id as a string). */
    identify: async function (userId) {
      if (!this.isEnabled || userId == null) return;
      var id = String(userId);
      if (state.userId === id) return;
      try { await Purchases.logIn({ appUserID: id }); state.userId = id; log("identified", id); }
      catch (e) { log("logIn failed", e); }
    },

    /** Clear the RevenueCat identity on logout (returns to an anonymous id). */
    logout: async function () {
      if (!this.isEnabled) return;
      state.userId = null;
      try { await Purchases.logOut(); } catch (e) { /* already anonymous — fine */ }
    },

    /**
     * Buy the subscription for the given interval ('monthly' | 'yearly').
     * Returns true if the purchase completed and the entitlement is now active.
     * Throws with a user-friendly message on real failures (not on user-cancel).
     */
    purchase: async function (interval) {
      if (!this.isEnabled) throw new Error("In-app purchases aren't available.");
      var pkg = await pickPackage(interval);
      if (!pkg) throw new Error("This subscription isn't available yet. Please try again later.");
      try {
        var res = await Purchases.purchasePackage({ aPackage: pkg });
        return hasEntitlement(res && res.customerInfo);
      } catch (e) {
        if (isUserCancelled(e)) return false;  // silent — user backed out
        log("purchase failed", e);
        throw new Error(friendlyError(e));
      }
    },

    /** Apple-required "Restore Purchases". Returns true if premium was restored. */
    restore: async function () {
      if (!this.isEnabled) return false;
      try {
        var res = await Purchases.restorePurchases();
        return hasEntitlement(res && res.customerInfo);
      } catch (e) { log("restore failed", e); return false; }
    },

    /** Current entitlement state straight from the SDK cache. */
    isActive: async function () {
      if (!this.isEnabled) return false;
      try { var res = await Purchases.getCustomerInfo(); return hasEntitlement(res && res.customerInfo); }
      catch (e) { return false; }
    },
  };

  /* ---------------------------- helpers ---------------------------- */
  function hasEntitlement(customerInfo) {
    try {
      var active = customerInfo && customerInfo.entitlements && customerInfo.entitlements.active;
      return !!(active && active[state.entitlement]);
    } catch (e) { return false; }
  }

  // Choose the monthly/annual package from the current offering.
  async function pickPackage(interval) {
    var offerings = await Purchases.getOfferings();
    var current = offerings && offerings.current;
    if (!current || !current.availablePackages || !current.availablePackages.length) return null;
    var pkgs = current.availablePackages;
    var wantAnnual = /year|annual/i.test(interval || "");
    // Match by RevenueCat package type first, then by identifier as a fallback.
    var byType = pkgs.filter(function (p) {
      var t = (p.packageType || "").toUpperCase();
      return wantAnnual ? t === "ANNUAL" : t === "MONTHLY";
    });
    if (byType.length) return byType[0];
    var byId = pkgs.filter(function (p) {
      return wantAnnual ? /year|annual/i.test(p.identifier || "") : /month/i.test(p.identifier || "");
    });
    if (byId.length) return byId[0];
    return pkgs[0]; // last resort: the first available package
  }

  function isUserCancelled(e) {
    if (!e) return false;
    if (e.code === "1" || e.code === 1) return true;                 // RC PURCHASE_CANCELLED
    return /cancel/i.test(e.message || "") || e.userCancelled === true;
  }

  function friendlyError(e) {
    var m = (e && e.message) || "";
    if (/network/i.test(m)) return "Network problem — check your connection and try again.";
    if (/already/i.test(m)) return "You already own this subscription. Try “Restore Purchases”.";
    return "The purchase couldn't be completed. Please try again.";
  }

  window.CaloriaIAP = CaloriaIAP;
})();
