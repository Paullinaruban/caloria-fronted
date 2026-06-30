/* ===================== Caloria — premium platform app ===================== */
(function () {
  "use strict";

  const API = window.CALORIA_API || `http://${location.hostname || "localhost"}:8787`;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const TOKEN_KEY = "caloria.token";

  let token = localStorage.getItem(TOKEN_KEY) || null;
  let user = null;
  let cfg = { price_monthly: "$19.99", price_yearly: "$99", stripe_configured: false, images_enabled: false, trial_days: 0 };
  let billingInterval = "monthly";

  /* ---------- api ---------- */
  async function api(path, { method = "GET", body, auth = true } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(API + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error(data.error || `Error ${res.status}`);
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ===================== boot ===================== */
  async function boot() {
    try {
      try { cfg = await api("/api/config", { auth: false }); } catch (_) {}
      applyPricing();
      loadSocialProof();
      if (token) {
        try {
          user = (await api("/api/me")).user;
        } catch (_) {
          // bad/expired token (e.g. server reset) — drop it and show the landing
          token = null; user = null; localStorage.removeItem(TOKEN_KEY);
        }
      }
      route();
      updateVerifyBanner();
      await handleAuthLinks();
    } catch (err) {
      console.error("Caloria boot failed:", err);
      revealLanding();
    }
    ensureVisible();
  }

  // Safety nets — the app must never render a blank page.
  function revealLanding() {
    $("#app").classList.add("hidden");
    $("#site").classList.remove("hidden");
  }
  function ensureVisible() {
    const appShown = !$("#app").classList.contains("hidden");
    const siteShown = !$("#site").classList.contains("hidden");
    const hasActiveView = !!document.querySelector(".view.active");
    // If the app shell is up but no view is active, or nothing is showing at
    // all, fall back to a safe state rather than a white screen.
    if (siteShown) return;
    if (!appShown) return revealLanding();
    if (!hasActiveView) showView(user && user.targets ? "dashboard" : user ? "onboard" : "dashboard");
  }
  window.addEventListener("error", function (e) {
    console.error("Caloria runtime error:", e.message);
    ensureVisible();
  });

  function route() {
    if (user) {
      $("#site").classList.add("hidden");
      $("#app").classList.remove("hidden");
      $("#planChip").textContent = user.plan === "premium" ? "Premium ✨" : "Free";
      $("#planChip").classList.toggle("premium", user.plan === "premium");
      if (!user.targets) { obReset(); showView("onboard"); }
      else { showView("dashboard"); loadDashboard(); }
    } else {
      $("#app").classList.add("hidden");
      $("#site").classList.remove("hidden");
    }
  }

  function showView(name) {
    $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === name));
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (name === "dashboard") loadDashboard();
    if (name === "journey") loadJourney();
    if (name === "account") renderAccount();
    if (name === "workout") { refreshWorkoutGate(); loadWorkout(); }
    if (name === "coach") openCoach();
    if (name === "club") loadClub();
    if (name !== "scan") stopCamera();
  }

  /* ===================== landing ===================== */
  $$("[data-scroll]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.scroll;
    if (id === "top") return window.scrollTo({ top: 0, behavior: "smooth" });
    const el = $("#" + id); if (el) el.scrollIntoView({ behavior: "smooth" });
  }));

  function applyPricing() {
    $("#priceAmt") && ($("#priceAmt").textContent = billingInterval === "monthly" ? cfg.price_monthly : cfg.price_yearly);
    $("#pricePer") && ($("#pricePer").textContent = billingInterval === "monthly" ? "/month" : "/year");
    $("#priceNote") && ($("#priceNote").textContent = billingInterval === "monthly" ? "Billed monthly · cancel anytime" : "Billed yearly · best value");
    $("#upMonthly") && ($("#upMonthly").textContent = cfg.price_monthly);
    $("#upYearly") && ($("#upYearly").textContent = cfg.price_yearly);
    $("#pwMonthly") && ($("#pwMonthly").textContent = cfg.price_monthly);
    $("#pwYearly") && ($("#pwYearly").textContent = cfg.price_yearly);
    const trial = cfg.trial_days > 0 ? `${cfg.trial_days}-day free trial` : "";
    const trialCta = "Join The Club";
    $("#paywallTrial") && ($("#paywallTrial").textContent = trial || "Premium");
    $("#paywallTrial") && $("#paywallTrial").classList.toggle("hidden", !trial);
    $("#paywallCheckout") && ($("#paywallCheckout").textContent = trialCta);
    $("#paywallNote") && ($("#paywallNote").textContent = trial ? "Cancel anytime before the trial ends — no charge." : "Cancel anytime.");
    $("#ubTitle") && ($("#ubTitle").textContent = "Join the Supermodel Wellness Club");
    $("#checkoutBtn") && ($("#checkoutBtn").textContent = trialCta);
  }

  // billing toggles (landing + account)
  $$(".bill-toggle").forEach((tg) => {
    tg.querySelectorAll(".bt-opt").forEach((opt) =>
      opt.addEventListener("click", () => {
        tg.querySelectorAll(".bt-opt").forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
        billingInterval = opt.dataset.interval;
        applyPricing();
      })
    );
  });

  /* ===================== auth modal ===================== */
  let authMode = "signup";
  const modal = $("#authModal");

  function openAuth(mode) {
    authMode = mode;
    $("#authTitle").textContent = mode === "signup" ? "Join The Club" : "Welcome back, Supermodel";
    $("#authSub").textContent = mode === "signup" ? "Join a community of women building their dream body." : "Log back into the Supermodel Wellness Club.";
    $("#authSubmit").textContent = mode === "signup" ? "Create account" : "Log in";
    $("#nameField").classList.toggle("hidden", mode !== "signup");
    $("#authConsent").classList.toggle("hidden", mode !== "signup");
    $("#authSwitchText").textContent = mode === "signup" ? "Already have an account?" : "New to Caloria?";
    $("#authSwitch").textContent = mode === "signup" ? "Log in" : "Sign up";
    $("#authForgotWrap").classList.toggle("hidden", mode !== "login");
    $("#authError").classList.add("hidden");
    modal.classList.add("show");
    renderCaptcha();
    setTimeout(() => $("#authEmail").focus(), 50);
  }

  /* ---------- Cloudflare Turnstile (env-gated) ---------- */
  let captchaToken = "", captchaWidgetId = null, turnstileLoading = false;
  function turnstileReady() { return !!(cfg && cfg.turnstile_site_key); }
  function loadTurnstile() {
    if (!turnstileReady() || window.turnstile || turnstileLoading) return;
    turnstileLoading = true;
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__cfReady";
    s.async = true; s.defer = true;
    window.__cfReady = () => renderCaptcha();
    document.head.appendChild(s);
  }
  function renderCaptcha() {
    if (!turnstileReady()) return;
    const el = $("#authCaptcha");
    if (!window.turnstile) { loadTurnstile(); return; }
    if (captchaWidgetId !== null) { try { window.turnstile.reset(captchaWidgetId); } catch (_) {} captchaToken = ""; return; }
    captchaWidgetId = window.turnstile.render(el, {
      sitekey: cfg.turnstile_site_key,
      callback: (t) => { captchaToken = t; },
      "error-callback": () => { captchaToken = ""; },
      "expired-callback": () => { captchaToken = ""; },
    });
  }
  function closeAuth() { modal.classList.remove("show"); }

  $$("[data-auth]").forEach((b) => b.addEventListener("click", () => openAuth(b.dataset.auth)));
  $("#authClose").addEventListener("click", closeAuth);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeAuth(); });
  $("#authSwitch").addEventListener("click", () => openAuth(authMode === "signup" ? "login" : "signup"));

  /* ---------- email verification banner ---------- */
  function updateVerifyBanner() {
    const b = $("#verifyBanner");
    if (b) b.classList.toggle("hidden", !(user && user.needs_verification));
  }

  /* ---------- email verification: 6-digit code ---------- */
  const verifyModal = $("#verifyModal");
  let verifyEmailAddr = "";
  function openVerify(email) {
    verifyEmailAddr = email || (user && user.email) || "";
    $("#verifyEmail").textContent = verifyEmailAddr;
    $("#verifyError").classList.add("hidden");
    $("#verifyResendMsg").textContent = "";
    $("#verifyCodeInput").value = "";
    verifyModal.classList.add("show");
    setTimeout(() => $("#verifyCodeInput").focus(), 60);
  }
  const closeVerify = () => verifyModal.classList.remove("show");
  $("#verifyClose").addEventListener("click", closeVerify);
  verifyModal.addEventListener("click", (e) => { if (e.target === verifyModal) closeVerify(); });
  $("#verifyEnterCode").addEventListener("click", () => openVerify(user && user.email));
  $("#verifyCodeInput").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6); });
  $("#verifyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = $("#verifyCodeInput").value.trim();
    const err = $("#verifyError"); err.classList.add("hidden");
    if (code.length !== 6) { err.textContent = "Enter the 6-digit code from your email."; err.classList.remove("hidden"); return; }
    $("#verifySubmit").disabled = true;
    try {
      await api("/api/auth/verify-code", { method: "POST", body: { email: verifyEmailAddr, code }, auth: false });
      try { if (token) user = (await api("/api/me")).user; } catch (_) {}
      closeVerify(); updateVerifyBanner();
      toast("Email verified — welcome to the Club 💗");
      route();
    } catch (ex) { err.textContent = ex.message || "That code is incorrect or has expired."; err.classList.remove("hidden"); }
    finally { $("#verifySubmit").disabled = false; }
  });
  $("#verifyResendBtn").addEventListener("click", async () => {
    const btn = $("#verifyResendBtn"); btn.disabled = true;
    try {
      await api("/api/auth/resend", { method: "POST", body: { email: verifyEmailAddr }, auth: !!token });
      $("#verifyResendMsg").textContent = "New code sent 💌";
    } catch (_) { $("#verifyResendMsg").textContent = "Try again shortly."; }
    setTimeout(() => { btn.disabled = false; $("#verifyResendMsg").textContent = ""; }, 8000);
  });

  /* ---------- forgot / reset password ---------- */
  $("#authForgot").addEventListener("click", async () => {
    const email = $("#authEmail").value.trim();
    if (!email) { $("#authError").textContent = "Enter your email above first."; $("#authError").classList.remove("hidden"); return; }
    try { await api("/api/auth/forgot", { method: "POST", body: { email }, auth: false }); } catch (_) {}
    closeAuth();
    toast("If that email has an account, a reset link is on its way 💌");
  });

  const resetModal = $("#resetModal");
  let resetToken = null;
  function openReset(tok) { resetToken = tok; $("#resetError").classList.add("hidden"); resetModal.classList.add("show"); }
  $("#resetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = $("#resetPassword").value;
    const err = $("#resetError"); err.classList.add("hidden");
    try {
      await api("/api/auth/reset", { method: "POST", body: { token: resetToken, password: pw }, auth: false });
      resetModal.classList.remove("show");
      toast("Password updated — please log in 💗");
      openAuth("login");
    } catch (ex) { err.textContent = ex.message; err.classList.remove("hidden"); }
  });

  /* ---------- handle password-reset links on load (verification uses codes) ---------- */
  async function handleAuthLinks() {
    const p = new URLSearchParams(location.search);
    const rt = p.get("reset");
    if (rt) { openReset(rt); history.replaceState({}, "", location.pathname); }
  }

  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#authEmail").value.trim();
    const password = $("#authPassword").value;
    const name = $("#authName").value.trim();
    const errEl = $("#authError");
    errEl.classList.add("hidden");
    $("#authSubmit").disabled = true;
    try {
      const path = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const body = authMode === "signup" ? { email, password, name } : { email, password };
      if (turnstileReady()) body.captcha_token = captchaToken;
      const res = await api(path, { method: "POST", body, auth: false });
      token = res.token; localStorage.setItem(TOKEN_KEY, token);
      user = res.user;
      closeAuth();
      route();
      updateVerifyBanner();
      if (user.needs_verification) {
        // New (or unverified) account → prompt for the 6-digit code right away.
        openVerify(user.email);
        // Don't show a fake "we emailed you" success if the email never went out.
        if (res.verification_email_sent === false) {
          toast("⚠️ We couldn't send your verification email right now. Tap “Resend”, or contact support.");
        }
      } else {
        toast(authMode === "signup" ? "Welcome to Caloria 💗" : "Welcome back 💗");
      }
    } catch (err) {
      errEl.textContent = err.message; errEl.classList.remove("hidden");
    } finally {
      $("#authSubmit").disabled = false;
    }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch (_) {}
    token = null; user = null; localStorage.removeItem(TOKEN_KEY);
    route();
  });

  /* ===================== onboarding wizard (premium, multi-step) ===================== */
  const NOW_YEAR = new Date().getFullYear();
  const OB_STEPS = [
    { key: "age_confirmed", type: "confirm", title: "Before we begin", sub: "Caloria is for ages 16 and over.",
      checkLabel: "I confirm that I am at least 16 years old." },
    { key: "height", type: "number", title: "How tall are you?", sub: "We calibrate every plan to your body.", unit: "cm", min: 120, max: 210, def: 166 },
    { key: "weight", type: "number", title: "What's your current weight?", sub: "Used to set your calorie & macro targets.", unit: "kg", min: 35, max: 160, def: 60 },
    { key: "birth_year", type: "number", title: "What's your year of birth?", sub: "We use this to calculate your age.", unit: "", min: NOW_YEAR - 90, max: NOW_YEAR - 16, def: NOW_YEAR - 22 },
    { key: "goal", type: "single", title: "What's your main goal?", options: [
      { v: "fat_loss", label: "Fat loss", emoji: "🔥", sub: "Lean & defined" },
      { v: "fat_loss", label: "Model body", emoji: "👠", sub: "Supermodel-lean" },
      { v: "muscle_gain", label: "Muscle toning", emoji: "💪", sub: "Sculpt & shape" },
      { v: "fat_loss", label: "Lean physique", emoji: "✨", sub: "Low body fat" },
      { v: "maintenance", label: "Maintenance", emoji: "⚖️", sub: "Stay & glow" },
    ] },
    { key: "physique", type: "single", title: "Your dream physique", sub: "The aesthetic we'll build toward.", options: [
      { v: "Supermodel Lean", label: "Supermodel Lean", emoji: "👠" },
      { v: "Maintain and glow", label: "Maintain and glow", emoji: "💎" },
      { v: "Toned & Feminine", label: "Toned & Feminine", emoji: "🌸" },
      { v: "Athletic Glow-Up", label: "Athletic Glow-Up", emoji: "⚡" },
    ] },
    { key: "activity", type: "single", title: "How active are you?", options: [
      { v: "sedentary", label: "Rarely active", emoji: "🛋️" },
      { v: "light", label: "Lightly active", emoji: "🚶‍♀️" },
      { v: "moderate", label: "Moderately active", emoji: "🏃‍♀️" },
      { v: "active", label: "Very active", emoji: "🔥" },
      { v: "athlete", label: "Athlete", emoji: "🏅" },
    ] },
    { key: "experience", type: "single", title: "Your training experience", options: [
      { v: "beginner", label: "Beginner", emoji: "🌱" },
      { v: "intermediate", label: "Intermediate", emoji: "💪" },
      { v: "advanced", label: "Advanced", emoji: "🏆" },
    ] },
    { key: "struggle", type: "single", title: "Your biggest struggle?", sub: "We'll coach you through it.", options: [
      { v: "consistency", label: "Consistency", emoji: "📆" },
      { v: "overeating", label: "Overeating", emoji: "🍽️" },
      { v: "motivation", label: "Motivation", emoji: "✨" },
      { v: "cravings", label: "Cravings", emoji: "🍫" },
      { v: "time", label: "Time management", emoji: "⏳" },
    ] },
    { key: "diet_pref", type: "single", title: "Dietary preference", options: [
      { v: "none", label: "No preference", emoji: "🍽️" },
      { v: "vegetarian", label: "Vegetarian", emoji: "🥗" },
      { v: "vegan", label: "Vegan", emoji: "🌿" },
      { v: "pescatarian", label: "Pescatarian", emoji: "🐟" },
      { v: "high_protein", label: "High-protein", emoji: "🥩" },
    ] },
    { key: "allergies", type: "multi", title: "Any food allergies?", sub: "We'll keep these out of your meals.", options: [
      { v: "dairy", label: "Dairy" }, { v: "gluten", label: "Gluten" }, { v: "nuts", label: "Nuts" },
      { v: "egg", label: "Eggs" }, { v: "soy", label: "Soy" }, { v: "fish", label: "Fish" },
      { v: "shellfish", label: "Shellfish" }, { v: "__none", label: "None 🙂" },
    ] },
    { key: "confidence", type: "single", title: "How confident do you feel right now?", options: [
      { v: "low", label: "Just starting", emoji: "🌱" },
      { v: "building", label: "Building it", emoji: "📈" },
      { v: "confident", label: "Confident", emoji: "👑" },
    ] },
    { key: "lifestyle", type: "single", title: "Which best describes your lifestyle?", options: [
      { v: "busy", label: "Busy professional", emoji: "💼" },
      { v: "student", label: "Student", emoji: "🎓" },
      { v: "parent", label: "Parent", emoji: "👶" },
      { v: "flexible", label: "Flexible schedule", emoji: "🌤️" },
    ] },
    { key: "__preview", type: "preview", title: "Your plan is ready ✨" },
    { key: "__paywall", type: "paywall", title: "Unlock your transformation" },
  ];
  const OB_PREVIEW = OB_STEPS.length - 2;
  let obIndex = 0, obAns = {}, obSubmitted = false;

  function obReset() { obIndex = 0; obAns = {}; obSubmitted = false; obRender(); }

  function obRender() {
    const s = OB_STEPS[obIndex];
    $("#obStepBadge").textContent = `Step ${obIndex + 1} of ${OB_STEPS.length}`;
    $("#obBar").style.width = ((obIndex + 1) / OB_STEPS.length * 100) + "%";
    $("#obBack").style.visibility = obIndex === 0 ? "hidden" : "visible";
    const next = $("#obNext");
    next.textContent = s.type === "paywall" ? "Enter Caloria 💗" : s.type === "preview" ? "Continue" : "Continue";
    next.disabled = false;
    const host = $("#obStep");

    if (s.type === "confirm") {
      const checked = obAns[s.key] === true;
      host.innerHTML = `<h3 class="ob-title">${s.title}</h3>${s.sub ? `<p class="ob-sub">${s.sub}</p>` : ""}
        <label class="ob-confirm"><input type="checkbox" id="obConfirm" ${checked ? "checked" : ""}/><span>${s.checkLabel}</span></label>
        <p class="ob-validation hidden" id="obValidation">Please confirm to continue.</p>`;
      $("#obConfirm").addEventListener("change", (e) => {
        obAns[s.key] = e.target.checked;
        if (e.target.checked) { obAns.age_confirmed_at = new Date().toISOString(); $("#obValidation").classList.add("hidden"); }
        updateObNextState();
      });
      updateObNextState();
    } else if (s.type === "number") {
      host.innerHTML = `<h3 class="ob-title">${s.title}</h3>${s.sub ? `<p class="ob-sub">${s.sub}</p>` : ""}
        <div class="ob-number"><input id="obInput" type="number" min="${s.min}" max="${s.max}" value="${obAns[s.key] != null ? obAns[s.key] : s.def}"/><span>${s.unit}</span></div>`;
    } else if (s.type === "single" || s.type === "multi") {
      const sel = obAns[s.key];
      host.innerHTML = `<h3 class="ob-title">${s.title}</h3>${s.sub ? `<p class="ob-sub">${s.sub}</p>` : ""}
        <div class="ob-options">` + s.options.map((o, i) => {
          const active = s.type === "multi" ? (Array.isArray(sel) && sel.includes(o.v)) : (sel === o.v && obAns[s.key + "_i"] === i);
          return `<button class="ob-opt${active ? " sel" : ""}" data-i="${i}"><b>${o.emoji ? o.emoji + " " : ""}${o.label}</b>${o.sub ? `<small>${o.sub}</small>` : ""}</button>`;
        }).join("") + `</div>`;
      $$("#obStep .ob-opt").forEach((b) => b.addEventListener("click", () => obPick(s, +b.dataset.i)));
    } else if (s.type === "preview") {
      const t = (user && user.targets) || {};
      host.innerHTML = `<h3 class="ob-title">${s.title}</h3>
        <p class="ob-sub">Built for your ${esc(obAns.physique || "goal")} goal — here are your daily targets.</p>
        <div class="ob-preview">
          <div class="obp-cal"><b>${t.calories || "—"}</b><span>kcal / day</span></div>
          <div class="obp-macros">
            <div><b>${t.protein || "—"}g</b><span>Protein</span></div>
            <div><b>${t.carbs || "—"}g</b><span>Carbs</span></div>
            <div><b>${t.fat || "—"}g</b><span>Fat</span></div>
          </div>
        </div>
        <p class="ob-sub">Plus a personalized training plan, AI coaching and meal plans — all tuned to you.</p>`;
    } else if (s.type === "paywall") {
      host.innerHTML = `<h3 class="ob-title">${s.title}</h3>
        <p class="ob-sub">Subscribe to unlock everything built for you — ${cfg.price_monthly}/month or ${cfg.price_yearly}/year.</p>
        <ul class="paywall-feats">
          <li>✓ Personalized workout plans &amp; AI coaching</li>
          <li>✓ Database-driven meal plans for your goal</li>
          <li>✓ Photo calorie scanning &amp; progress tracking</li>
        </ul>
        <button class="btn btn-glow btn-block btn-lg" id="obTrial">Unlock my plan</button>`;
      const tb = $("#obTrial"); if (tb) tb.addEventListener("click", () => openPaywall("Subscribe to unlock your plan."));
    }
  }

  function updateObNextState() {
    const s = OB_STEPS[obIndex], next = $("#obNext");
    next.disabled = !!(s && s.type === "confirm" && obAns[s.key] !== true);
  }

  function obPick(step, i) {
    const o = step.options[i];
    if (step.type === "multi") {
      let arr = Array.isArray(obAns[step.key]) ? obAns[step.key].slice() : [];
      if (o.v === "__none") { arr = []; }
      else { arr = arr.includes(o.v) ? arr.filter((x) => x !== o.v) : arr.concat(o.v); }
      obAns[step.key] = arr;
    } else {
      obAns[step.key] = o.v; obAns[step.key + "_i"] = i; obAns[step.key + "_label"] = o.label;
    }
    obRender();
  }

  async function obSubmitProfile() {
    const profile = {
      gender: "female",
      height: obAns.height != null ? obAns.height : 166,
      weight: obAns.weight != null ? obAns.weight : 60,
      birth_year: obAns.birth_year != null ? obAns.birth_year : NOW_YEAR - 22,
      age_confirmed: obAns.age_confirmed === true,
      age_confirmed_at: obAns.age_confirmed_at || null,
      activity: obAns.activity || "light",
      goal: obAns.goal || "fat_loss",
      physique: obAns.physique || null,
      level: obAns.experience || "beginner",
      struggle: obAns.struggle || null,
      diet_pref: obAns.diet_pref || "none",
      allergies: Array.isArray(obAns.allergies) ? obAns.allergies : [],
      confidence: obAns.confidence || null,
      lifestyle: obAns.lifestyle || null,
    };
    user = (await api("/api/onboarding", { method: "POST", body: { profile } })).user;
    obSubmitted = true;
  }

  $("#obBack").addEventListener("click", () => { if (obIndex > 0) { obIndex--; obRender(); } });
  $("#obNext").addEventListener("click", async () => {
    const s = OB_STEPS[obIndex];
    if (s.type === "confirm" && obAns[s.key] !== true) {
      const v = $("#obValidation"); if (v) v.classList.remove("hidden");
      return;  // mandatory 16+ gate — cannot continue unconfirmed
    }
    if (s.type === "number") {
      const v = +$("#obInput").value;
      obAns[s.key] = Math.max(s.min, Math.min(s.max, v || s.def));
    }
    if (s.type === "paywall") { toast("Welcome to the Supermodel Wellness Club 👑"); showView("dashboard"); return; }   // finish
    // submit right before showing the preview so targets are real
    if (obIndex === OB_PREVIEW - 1 && !obSubmitted) {
      const btn = $("#obNext"); btn.disabled = true; btn.textContent = "Building your plan…";
      try { await obSubmitProfile(); } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = "Continue"; return; }
      btn.disabled = false;
    }
    if (obIndex < OB_STEPS.length - 1) { obIndex++; obRender(); }
  });
  obReset();

  /* ===================== app nav ===================== */
  $$("[data-view]").forEach((el) => el.addEventListener("click", (e) => {
    if (el.tagName === "SECTION") return;
    showView(el.dataset.view);
  }));

  /* ===================== dashboard ===================== */
  function isToday(iso) {
    if (!iso) return true;
    const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
    return d.toDateString() === new Date().toDateString();
  }

  async function loadDashboard() {
    if (!user) return;
    loadRitual();
    loadNotifications();
    $("#dashGreeting").textContent = `Welcome back, ${user.name || "there"} 💗`;
    $("#dashDate").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const t = user.targets || { calories: 2000, protein: 120, carbs: 200, fat: 60 };

    let meals = [];
    try { meals = (await api("/api/meals")).meals || []; } catch (_) {}
    const today = meals.filter((m) => isToday(m.created_at));

    let cal = 0, p = 0, c = 0, f = 0;
    today.forEach((m) => { cal += m.calories || 0; p += m.protein || 0; c += m.carbs || 0; f += m.fats || 0; });

    const left = Math.max(0, Math.round(t.calories - cal));
    const pct = Math.min(100, Math.round((cal / t.calories) * 100));
    $("#calRing").style.setProperty("--p", pct + "%");
    $("#dashCalLeft").textContent = left;
    $("#dashEaten").textContent = Math.round(cal);
    $("#dashTarget").textContent = t.calories;
    setBar("#barP", "#valP", p, t.protein);
    setBar("#barC", "#valC", c, t.carbs);
    setBar("#barF", "#valF", f, t.fat);

    // Daily motivation + dynamic progress banner (local, no API).
    renderMotivation({
      streak: computeStreak(meals),
      daysThisWeek: daysLoggedThisWeek(meals),
      mealsToday: today.length,
      proteinPct: t.protein ? Math.round((p / t.protein) * 100) : 0,
      calPct: pct,
    });

    renderWall(today);
    $("#dashUpgrade").classList.toggle("hidden", user.plan === "premium");
  }
  function setBar(bar, val, eaten, target) {
    $(bar).style.width = Math.min(100, (eaten / target) * 100) + "%";
    $(val).textContent = `${Math.round(eaten)}/${target}g`;
  }

  /* ===================== Journey hub (motivation · progress · retention) ===================== */
  let journeyLoaded = false;
  const levelClass = (lvl) => "lvl-" + String(lvl || "").toLowerCase();
  async function loadJourney() {
    let j;
    try { j = await api("/api/journey"); }
    catch (err) { if (err.status === 401) { token = null; user = null; localStorage.removeItem(TOKEN_KEY); return route(); } return; }

    $("#jrDaily").textContent = j.daily_message;
    $("#jrIdentity").textContent = j.identity_line || "";
    $("#jrFuture").textContent = j.future_you;

    // patterns (only show when we have enough signal)
    const pats = j.patterns || [];
    $("#jrPatternsCard").classList.toggle("hidden", pats.length === 0);
    $("#jrPatterns").innerHTML = pats.map((p) => `<li>${esc(p)}</li>`).join("");
    // glow-up insights
    $("#jrGlowInsights").innerHTML = (j.glow_up_insights || []).map((g) => `<li>${esc(g)}</li>`).join("");

    // glow score — aspirational empty state when there's no data yet
    const noData = (j.totals && j.totals.meals_logged === 0);
    $("#jrGlow").textContent = noData ? "—" : j.glow_score;
    $("#jrGlowBar").style.width = (noData ? 0 : j.glow_score) + "%";
    const d = j.glow_dimensions;
    $("#jrDims").innerHTML = noData
      ? `<div class="jr-glow-empty">Log your first meal and your Glow Score comes alive — Skin, Energy, Bloating &amp; Recovery support, all personalized to you. ✨</div>`
      : [
        ["Skin Support", d.skin_support], ["Energy Support", d.energy_support],
        ["Bloating Risk", d.bloating_risk], ["Recovery Support", d.recovery_support],
      ].map(([k, v]) => `<div class="jr-dim"><span>${k}</span><b class="${levelClass(v)}">${esc(v)}</b></div>`).join("");

    // transformation journey
    $("#jrStageName").textContent = `Stage ${j.stage.number}: ${j.stage.name}`;
    $("#jrStageBlurb").textContent = j.stage.blurb;
    $("#jrStages").innerHTML = j.stages.map((s) =>
      `<div class="jr-stage ${s.reached ? "done" : ""}"><i>${s.number}</i><span>${esc(s.name)}</span></div>`).join("");
    $("#jrNextStage").textContent = j.next_stage
      ? `${j.next_stage.days_to_go} more day${j.next_stage.days_to_go !== 1 ? "s" : ""} of showing up to reach ${j.next_stage.name}.`
      : "You've reached the final stage. This is who you are now. 👑";

    // streak
    $("#jrStreak").textContent = j.streak.current;
    $("#jrStreakTier").textContent = j.streak.tier || (j.streak.current ? "Keep it alive" : "Start your streak today");
    $("#jrLongest").textContent = j.streak.longest ? `Longest: ${j.streak.longest} days` : "";

    // weekly review
    $("#jrWins").innerHTML = j.weekly_review.wins.map((w) => `<li>✔ ${esc(w)}</li>`).join("");
    $("#jrFocus").innerHTML = j.weekly_review.next_week_focus.map((f) => `<li>→ ${esc(f)}</li>`).join("");

    // milestones
    $("#jrMiles").innerHTML = j.milestones.map((m) => `<li>${esc(m)}</li>`).join("");

    // achievements
    $("#jrBadges").innerHTML = j.achievements.map((a) =>
      `<div class="jr-badge ${a.unlocked ? "unlocked" : "locked"}" title="${esc(a.desc)}">
        <span class="jr-badge-emoji">${a.unlocked ? a.emoji : "🔒"}</span>
        <b>${esc(a.title)}</b><small>${esc(a.desc)}</small></div>`).join("");

    // celebrate newly-unlocked badges (in-app notification)
    if (j.new_achievements && j.new_achievements.length && journeyLoaded === false) {
      j.new_achievements.forEach((a, i) => setTimeout(() => toast(`${a.emoji} Achievement unlocked: ${a.title}`), 600 + i * 1400));
    }
    journeyLoaded = true;
  }

  /* ===================== Daily Ritual system ===================== */
  let ritualState = null, checkinSel = {}, checkinShownFor = null;
  function ritualGreeting() { const h = new Date().getHours(); return h < 12 ? "Good morning ☀️" : h < 17 ? "Good afternoon 🌤️" : "Good evening 🌙"; }
  const cap = (f) => f[0].toUpperCase() + f.slice(1);

  async function loadRitual() {
    let r; try { r = await api("/api/ritual"); } catch (_) { return; }
    ritualState = r;
    const rc = $("#ritualCard");
    if (r.morning_done) {
      rc.classList.remove("rc-cta"); rc.onclick = null;
      rc.innerHTML = `<div class="rc-coach"><span class="rc-coach-label">Today's coach message</span><p>${esc(r.coach_message)}</p></div>`;
    } else {
      rc.classList.add("rc-cta"); rc.onclick = openCheckin;
      rc.innerHTML = `<div class="rc-cta-in"><div><b>${ritualGreeting()}</b><small>How are you feeling today? · 10-second daily ritual</small></div><span class="rc-go">Check in →</span></div>`;
    }
    $("#bvScore").textContent = r.best_version.score + "%";
    $("#bvBar").style.width = r.best_version.score + "%";
    $("#bvMsg").textContent = r.best_version.message;
    $("#srStreak").textContent = r.streak.current;
    const fb = $("#freezeBtn");
    fb.disabled = !r.freeze.available;
    fb.textContent = r.freeze.available ? "❄️ Protect streak" : "❄️ Protected this week";
    const q = r.quest;
    $("#questCard").classList.toggle("hidden", !q.active);
    $("#questProgress").textContent = `${q.completed}/${q.total} complete`;
    $("#questSteps").innerHTML = q.steps.map((s) => `<div class="quest-step${s.done ? " done" : ""}"><i>${s.done ? "✓" : s.day}</i><span>${esc(s.title)}</span></div>`).join("");
    $("#sundayResetBtn").classList.toggle("hidden", !r.sunday_reset.is_sunday);
    $("#reflectOpts").innerHTML = r.options.reflection.map((v) => `<button class="reflect-opt" data-val="${esc(v)}">${esc(v)}</button>`).join("");
    // auto-prompt the morning check-in once per day
    if (r.show_morning && checkinShownFor !== r.date && localStorage.getItem("caloria.ci." + r.date) !== "1") {
      checkinShownFor = r.date; setTimeout(openCheckin, 500);
    }
    // gentle evening reflection prompt (once per day)
    if (r.show_evening && localStorage.getItem("caloria.re." + r.date) !== "1") {
      localStorage.setItem("caloria.re." + r.date, "1");
      setTimeout(() => $("#reflectModal").classList.add("show"), 800);
    }
  }

  function openCheckin() {
    checkinSel = {};
    $("#checkinGreeting").textContent = ritualGreeting();
    ["energy", "mood", "sleep", "hydration"].forEach((f) => {
      $("#ci" + cap(f)).innerHTML = ritualState.options[f].map((v) => `<button class="ci-chip" data-field="${f}" data-val="${esc(v)}">${esc(v)}</button>`).join("");
    });
    $("#checkinError").classList.add("hidden");
    $("#checkinModal").classList.add("show");
  }
  $("#checkinModal").addEventListener("click", (e) => {
    if (e.target.classList.contains("ci-chip")) {
      const f = e.target.dataset.field; checkinSel[f] = e.target.dataset.val;
      e.target.parentElement.querySelectorAll(".ci-chip").forEach((b) => b.classList.toggle("sel", b === e.target));
    }
    if (e.target === $("#checkinModal")) $("#checkinModal").classList.remove("show");
  });
  $("#checkinClose").addEventListener("click", () => { $("#checkinModal").classList.remove("show"); if (ritualState) localStorage.setItem("caloria.ci." + ritualState.date, "1"); });
  $("#checkinSubmit").addEventListener("click", async () => {
    const need = ["energy", "mood", "sleep", "hydration"].filter((f) => !checkinSel[f]);
    if (need.length) { $("#checkinError").textContent = "Tap one option for each — it only takes a moment 💗"; $("#checkinError").classList.remove("hidden"); return; }
    $("#checkinSubmit").disabled = true;
    try {
      ritualState = await api("/api/ritual/checkin", { method: "POST", body: checkinSel });
      $("#checkinModal").classList.remove("show");
      localStorage.setItem("caloria.ci." + ritualState.date, "1");
      loadRitual();
      toast("Check-in complete 💗");
      if (ritualState.coach_message) setTimeout(() => toast(ritualState.coach_message), 1100);
    } catch (e) { $("#checkinError").textContent = e.message; $("#checkinError").classList.remove("hidden"); }
    finally { $("#checkinSubmit").disabled = false; }
  });

  $("#reflectModal").addEventListener("click", async (e) => {
    if (e.target.classList.contains("reflect-opt")) {
      try { ritualState = await api("/api/ritual/reflect", { method: "POST", body: { reflection: e.target.dataset.val } });
        $("#reflectModal").classList.remove("show"); toast("Reflection saved 🌙 Rest well — tomorrow's another chance."); } catch (_) {}
    }
    if (e.target === $("#reflectModal")) $("#reflectModal").classList.remove("show");
  });
  $("#reflectClose").addEventListener("click", () => $("#reflectModal").classList.remove("show"));

  $("#freezeBtn").addEventListener("click", async () => {
    try { ritualState = await api("/api/ritual/freeze", { method: "POST", body: {} }); loadRitual(); toast("❄️ Streak protected — your momentum is safe."); }
    catch (e) { toast(e.message || "Couldn't protect your streak right now."); }
  });

  $("#sundayResetBtn").addEventListener("click", () => {
    const s = ritualState.sunday_reset;
    $("#sundayStats").innerHTML = [["Days active", s.consistency.days_this_week], ["Workouts", s.workouts_this_week], ["Streak", s.streak.current + " 🔥"], ["Glow", s.glow_score]]
      .map(([k, v]) => `<div class="ss-stat"><b>${v}</b><span>${k}</span></div>`).join("");
    $("#sundayWins").innerHTML = s.wins.map((w) => `<li>✔ ${esc(w)}</li>`).join("");
    $("#sundayImprove").textContent = s.biggest_improvement;
    $("#sundayFocus").innerHTML = s.next_week_focus.map((f) => `<li>→ ${esc(f)}</li>`).join("");
    $("#sundayTrends").innerHTML = [["Mood", s.mood_trend], ["Energy", s.energy_trend], ["Check-ins", s.checkins_this_week + " this week"]]
      .map(([k, v]) => `<div class="sunday-trend"><span>${k}</span><b>${esc(String(v))}</b></div>`).join("");
    $("#sundayCraving").textContent = s.craving_insight;
    $("#sundayFutureYou").textContent = s.future_you_reflection;
    $("#sundayModal").classList.add("show");
  });
  $("#sundayClose").addEventListener("click", () => $("#sundayModal").classList.remove("show"));
  $("#sundayDone").addEventListener("click", () => $("#sundayModal").classList.remove("show"));

  // shareable milestone cards
  function openShare(headline, sub) {
    $("#shareHeadline").textContent = headline;
    $("#shareSub").textContent = sub || "Building my best version";
    $("#shareModal").classList.add("show");
  }
  $("#shareClose").addEventListener("click", () => $("#shareModal").classList.remove("show"));
  $("#shareModal").addEventListener("click", (e) => { if (e.target === $("#shareModal")) $("#shareModal").classList.remove("show"); });
  // tap the streak to share it
  document.addEventListener("click", (e) => {
    const f = e.target.closest(".sr-flame");
    if (f && ritualState && ritualState.streak.current > 0) openShare(`✨ ${ritualState.streak.current} Day Streak`, "Showing up for my best version");
  });

  /* ===================== in-app notifications (personalized) ===================== */
  let notifItems = [], notifHasNew = false;
  async function loadNotifications() {
    try { const r = await api("/api/notifications"); notifItems = r.notifications || []; notifHasNew = !!r.has_new; }
    catch (_) { return; }
    $("#notifDot").classList.toggle("hidden", !notifHasNew);  // badge only for genuinely new items
    renderNotifList();
  }
  function renderNotifList() {
    const list = $("#notifList");
    if (!notifItems.length) {
      list.innerHTML = `<div class="notif-empty">You're all caught up ✨</div>`;
      return;
    }
    list.innerHTML = notifItems.map((n, i) => `
      <button class="notif-item tone-${esc(n.tone || "info")}" data-i="${i}">
        <span class="notif-icon">${n.icon || "✨"}</span>
        <span class="notif-text"><b>${esc(n.title)}</b><small>${esc(n.body)}</small></span>
      </button>`).join("");
    $$("#notifList .notif-item").forEach((b) => b.addEventListener("click", () => {
      const n = notifItems[+b.dataset.i];
      closeNotif();
      if (n.action === "checkin") { if (typeof openCheckin === "function" && ritualState) openCheckin(); else showView("dashboard"); }
      else if (n.action === "freeze") { showView("dashboard"); const fb = $("#freezeBtn"); if (fb && !fb.disabled) fb.click(); }
      else showView("dashboard");
    }));
  }
  function openNotif() {
    $("#notifOverlay").classList.add("show");
    renderNotifList();
    // mark the shown notifications seen → clears the dot + starts their cooldown
    const keys = notifItems.map((n) => n._key).filter(Boolean);
    if (keys.length) api("/api/notifications/seen", { method: "POST", body: { keys } }).catch(() => {});
    notifHasNew = false; $("#notifDot").classList.add("hidden");
  }
  function closeNotif() { $("#notifOverlay").classList.remove("show"); }
  $("#notifBell").addEventListener("click", openNotif);
  $("#notifClose").addEventListener("click", closeNotif);
  $("#notifOverlay").addEventListener("click", (e) => { if (e.target === $("#notifOverlay")) closeNotif(); });

  /* ===================== daily motivation (local, no API) ===================== */
  // 94 unique, supportive messages across: Confidence · Consistency · Healthy
  // Habits · Fitness · Self Discipline · Self Love · Progress Tracking · Mindset.
  // No medical claims, no weight-loss promises.
  const MOTIVATION_QUOTES = [
    // Confidence Boost
    "You are capable of more than you realize.",
    "Confidence is built one small win at a time.",
    "You don't have to feel ready to begin.",
    "The way you speak to yourself matters — be kind.",
    "You are allowed to take up space and feel strong.",
    "Your worth isn't measured by a number.",
    "Stand tall — you've earned your place here.",
    "Every time you show up, your confidence grows.",
    "You are becoming the person you're meant to be.",
    "Believe in the effort you're putting in.",
    "Strong is a feeling, and it's already inside you.",
    "You are stronger than the excuse trying to stop you.",
    // Consistency
    "Consistency beats motivation.",
    "Small actions repeated daily create massive results.",
    "Show up, even on the days you don't feel like it.",
    "Progress lives in the boring, repeated days.",
    "You don't need to be perfect. You just need to keep going.",
    "One good day is a choice. Many good days are a habit.",
    "Discipline is choosing what you want most over what you want now.",
    "The streak you keep today builds the life you want tomorrow.",
    "Done consistently beats done perfectly.",
    "Keep stacking small wins — they add up.",
    "Showing up is the whole secret.",
    "Today's effort is tomorrow's momentum.",
    // Healthy Habits
    "Healthy isn't a destination, it's a daily practice.",
    "Build habits you can keep for life, not just this week.",
    "Nourish your body — it's the only home you'll ever have.",
    "A balanced plate is a form of self-respect.",
    "Hydrate, move, rest, repeat.",
    "Choose foods that make you feel energized, not restricted.",
    "Good habits are the foundation of a good life.",
    "Make the healthy choice the easy choice.",
    "Your habits today are shaping your future self.",
    "Eat to fuel your goals, not to punish your body.",
    "Rest is part of the work, too.",
    "Small healthy swaps add up to big change.",
    // Fitness Motivation
    "Your body can do amazing things — give it the chance.",
    "Movement is a celebration of what your body can do.",
    "Train because you love your body, not because you hate it.",
    "Every workout is a deposit in your future self.",
    "You won't always be motivated — that's why we build discipline.",
    "Sweat now, shine later.",
    "The hardest step is the one out the door.",
    "Strong days start with showing up.",
    "Progress, not perfection, in every rep.",
    "Your only competition is who you were yesterday.",
    "Move your body in a way that feels good today.",
    "Energy creates energy — start and the rest follows.",
    // Self Discipline
    "Discipline is self-care in disguise.",
    "Motivation gets you started, discipline keeps you going.",
    "Do it tired. Do it busy. Do it anyway.",
    "Future you is built by present-you's choices.",
    "Willpower is a muscle — it grows when you use it.",
    "Choose the habit, even when the mood disagrees.",
    "Discipline today, freedom tomorrow.",
    "The promises you keep to yourself matter most.",
    "Stay committed to your decisions, flexible in your approach.",
    "Small disciplines repeated build unstoppable momentum.",
    // Self Love
    "Be patient with yourself — you're doing your best.",
    "You deserve the same kindness you give others.",
    "Progress doesn't require self-criticism.",
    "Talk to yourself like someone you love.",
    "Your body is worthy of care at every stage.",
    "Rest without guilt — you've earned it.",
    "You are more than a goal weight or a number.",
    "Celebrate how far you've come.",
    "Self-love is choosing your wellbeing, again and again.",
    "You're allowed to be proud of small steps.",
    "Grace over guilt, always.",
    "Treat your body as a partner, not a project.",
    // Progress Tracking
    "What gets tracked gets improved.",
    "Every entry is proof you showed up.",
    "Look how far you've come, not how far you have to go.",
    "Progress is rarely loud — keep noticing the small wins.",
    "Your data tells a story of effort. Be proud of it.",
    "Tracking turns intention into action.",
    "Awareness is the first step to change.",
    "Each logged day is a brick in your foundation.",
    "Measure progress in habits, not just numbers.",
    "Consistency in tracking builds consistency in life.",
    // Mindset
    "Your future self will thank you for today's choices.",
    "Mindset is the muscle that moves everything else.",
    "Setbacks are setups for comebacks.",
    "You can restart your day at any moment.",
    "Focus on the next right choice, not the whole journey.",
    "Done is better than perfect.",
    "You're one decision away from a better day.",
    "Growth happens just outside your comfort zone.",
    "Trust the process you're building.",
    "Comparison steals joy — run your own race.",
    "A missed day is data, not failure.",
    "How you respond matters more than what happened.",
    "Think progress, not perfection.",
    "Your effort compounds, even when you can't see it yet.",
  ];
  // Local day number — changes once per day, so the quote rotates automatically.
  function localDayNumber() {
    return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  }
  function dailyQuote() { return MOTIVATION_QUOTES[localDayNumber() % MOTIVATION_QUOTES.length]; }

  function loggedDaySet(meals) {
    const s = new Set();
    (meals || []).forEach((m) => { const d = new Date(m.created_at); if (!isNaN(d)) s.add(d.toDateString()); });
    return s;
  }
  function computeStreak(meals) {
    const set = loggedDaySet(meals);
    let streak = 0; const d = new Date();
    if (!set.has(d.toDateString())) d.setDate(d.getDate() - 1);  // today not done yet ≠ broken streak
    while (set.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
    return streak;
  }
  function daysLoggedThisWeek(meals) {
    const set = loggedDaySet(meals); let n = 0; const d = new Date();
    for (let i = 0; i < 7; i++) { if (set.has(d.toDateString())) n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  // Contextual progress/achievement message — never medical, never a weight promise.
  function progressMessage(s) {
    if (s.streak >= 30) return { label: "Achievement", icon: "🏆", msg: "One month of consistency completed. Incredible." };
    if (s.streak >= 14) return { label: "Achievement", icon: "🔥", msg: "Two weeks strong — you're building habits that last." };
    if (s.streak >= 7)  return { label: "Achievement", icon: "🔥", msg: "One week of consistency completed. Keep the streak alive." };
    if (s.streak >= 5)  return { label: "Streak", icon: "🔥", msg: `${s.streak}-day streak unlocked. You're showing up for yourself.` };
    if (s.streak >= 3)  return { label: "Streak", icon: "🔥", msg: `${s.streak}-day streak unlocked.` };
    if (s.proteinPct >= 100) return { label: "Goal hit", icon: "💪", msg: "Protein goal achieved today. Great fuel for your body." };
    if (s.streak === 2) return { label: "Progress", icon: "✨", msg: "Two days in a row — momentum is building." };
    if (s.mealsToday >= 1) return { label: "Progress", icon: "🌱", msg: "You logged today. Every healthy choice compounds over time." };
    if (s.daysThisWeek >= 1) return { label: "Welcome back", icon: "💗", msg: "Showing up is the habit. Let's log today." };
    return null;
  }
  function renderMotivation(s) {
    const banner = $("#motivationBanner"); if (!banner) return;
    const ctx = progressMessage(s);
    $("#mbIcon").textContent = ctx ? ctx.icon : "✨";
    $("#mbLabel").textContent = ctx ? ctx.label : "Daily motivation";
    $("#mbMsg").textContent = ctx ? ctx.msg : dailyQuote();
    banner.classList.remove("hidden");
  }

  function renderWall(meals) {
    const list = $("#wallList"), empty = $("#wallEmpty");
    list.innerHTML = "";
    empty.classList.toggle("hidden", meals.length !== 0);
    meals.forEach((m) => {
      const el = document.createElement("div");
      el.className = "meal-item";
      el.innerHTML = `
        <div class="meal-thumb">${m.image ? `<img src="${m.image}" alt=""/>` : "🍽️"}</div>
        <div class="meal-info">
          <h4>${esc(m.name || "Meal")}</h4>
          <div class="meal-macros">P ${r1(m.protein)}g · C ${r1(m.carbs)}g · F ${r1(m.fats)}g${m.fiber != null ? ` · Fb ${r1(m.fiber)}g` : ""}</div>
        </div>
        <div class="meal-cal">${Math.round(m.calories || 0)}<small style="font-size:11px;color:var(--ink-soft)"> kcal</small></div>
        <button class="meal-del" data-del="${m.id}" aria-label="Remove">×</button>`;
      list.appendChild(el);
    });
    $$("[data-del]", list).forEach((b) => b.addEventListener("click", async () => {
      try { await api(`/api/meals?id=${b.dataset.del}`, { method: "DELETE" }); loadDashboard(); toast("Meal removed"); } catch (_) {}
    }));
  }

  /* ===================== camera + scan ===================== */
  // Native mobile behavior: "Take Photo" uses a capture input (opens the device
  // camera directly); "Choose from Gallery" uses a plain file input (opens Photos).
  // No getUserMedia — that needs HTTPS and broke on http/LAN ("Camera unavailable").
  const cameraInput = $("#cameraInput"), galleryInput = $("#galleryInput"), canvas = $("#captureCanvas");
  let currentResult = null;

  function stopCamera() { /* no live stream anymore — kept so showView() can call it safely */ }

  function downscale(source, w0, h0) {
    // Cap the longest edge — smaller upload + fewer vision tiles (cost) and faster on mobile.
    const maxEdge = 768, scale = Math.min(1, maxEdge / Math.max(w0, h0));
    const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(source, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.8);
  }
  function handlePickedFile(file) {
    if (!file) return;
    const img = new Image(), reader = new FileReader();
    reader.onload = () => { img.onload = () => analyze(downscale(img, img.width, img.height)); img.src = reader.result; };
    reader.readAsDataURL(file);
  }
  cameraInput.addEventListener("change", (e) => { handlePickedFile(e.target.files && e.target.files[0]); e.target.value = ""; });
  galleryInput.addEventListener("change", (e) => { handlePickedFile(e.target.files && e.target.files[0]); e.target.value = ""; });

  const sCapture = $("#scanCapture"), sLoading = $("#scanLoading"), sResult = $("#scanResult"), sError = $("#scanError");
  function scanStage(which) {
    sCapture.classList.toggle("hidden", which !== "capture");
    sLoading.classList.toggle("hidden", which !== "loading");
    sResult.classList.toggle("hidden", which !== "result");
    sError.classList.toggle("hidden", which !== "error");
  }
  const loadingMsgs = ["Sending your plate to the AI…", "Detecting ingredients…", "Estimating portions…", "Looking up USDA nutrition…", "Adding up your macros…"];

  async function analyze(dataUrl) {
    scanStage("loading");
    $("#analyzePreview").src = dataUrl;
    let i = 0; const lt = $("#loadingText"); lt.textContent = loadingMsgs[0];
    const cyc = setInterval(() => { i = (i + 1) % loadingMsgs.length; lt.textContent = loadingMsgs[i]; }, 1100);
    try {
      const data = await api("/api/analyze", { method: "POST", body: { image: dataUrl } });
      clearInterval(cyc);
      if (typeof data.scans_used === "number" && user) user.scans_used = data.scans_used;
      if (!data.ingredients || !data.ingredients.length) return scanError("No food detected. Try a clearer, well-lit photo.");
      renderResult(data, dataUrl);
    } catch (err) {
      clearInterval(cyc);
      if (err.status === 402) return scanError(err.message, true);
      if (err.status === 403 && err.data && err.data.needs_verification) { updateVerifyBanner(); return scanError(err.message); }
      if (err.status === 401) { token = null; user = null; localStorage.removeItem(TOKEN_KEY); return route(); }
      scanError(err.message || `Couldn't reach the AI backend at ${API}.`);
    }
  }
  function scanError(msg, upgrade) {
    $("#errorText").textContent = msg;
    $("#errorTitle").textContent = upgrade ? "Subscription required" : "Couldn't analyse that";
    $("#errorUpgradeBtn").classList.toggle("hidden", !upgrade);
    scanStage("error");
  }
  $("#errorRetryBtn").addEventListener("click", () => scanStage("capture"));
  $("#errorUpgradeBtn").addEventListener("click", () => openPaywall("Subscribe to unlock AI food scanning."));

  function renderResult(data, dataUrl) {
    currentResult = {
      meal_name: data.meal_name, image: dataUrl, confidence: data.confidence, low_confidence: data.low_confidence,
      ingredients: data.ingredients.map((ing) => {
        const g = ing.grams || 1;
        return {
          name: ing.name, grams: ing.grams, ai_grams: ing.ai_grams, matched: ing.matched, source: ing.source,
          rCal: ing.calories / g, rPro: ing.protein / g, rCarb: ing.carbs / g, rFat: ing.fat / g,
          rFib: ing.fiber / g, rSug: (ing.sugar || 0) / g, rSod: (ing.sodium || 0) / g,
        };
      }),
    };
    $("#resultImage").src = dataUrl;
    $("#resultName").value = data.meal_name;
    const pct = Math.round(data.confidence * 100), badge = $("#confBadge");
    badge.textContent = `${pct}% confident`;
    badge.className = "conf-badge " + (data.confidence >= 0.75 ? "high" : data.confidence >= 0.5 ? "med" : "low");
    $("#lowConfNote").classList.toggle("hidden", !data.low_confidence);
    const warn = $("#warnNote");
    if (data.warning) { warn.textContent = "⚠️ " + data.warning; warn.classList.remove("hidden"); } else warn.classList.add("hidden");

    renderQuality(data.quality);
    renderCraving(data.meal_name);

    const list = $("#ingredientList"); list.innerHTML = "";
    currentResult.ingredients.forEach((ing, idx) => {
      const row = document.createElement("div");
      row.className = "ingredient-row" + (ing.matched ? "" : " unmatched");
      row.innerHTML = `
        <div class="ing-main"><div class="ing-name">${esc(ing.name)}</div>
          <div class="ing-sub">${ing.matched ? esc(ing.source || "matched") : "⚠ no database match"}</div></div>
        <div class="ing-grams"><input type="number" min="0" step="5" value="${Math.round(ing.grams)}" data-idx="${idx}"/><span>g</span></div>
        <div class="ing-cal"><b data-cal="${idx}">${Math.round(ing.grams * ing.rCal)}</b><small>kcal</small></div>`;
      list.appendChild(row);
    });
    $$('#ingredientList input[data-idx]').forEach((inp) => inp.addEventListener("input", onGrams));
    recalc();
    scanStage("result");
  }
  function starString(stars) {
    const s = Math.max(0, Math.min(5, +stars || 0));
    const full = Math.floor(s), half = s - full >= 0.5;
    return "★".repeat(full) + (half ? "⯪" : "") + "☆".repeat(5 - full - (half ? 1 : 0));
  }
  function fillList(ulSel, wrapSel, items) {
    const wrap = $(wrapSel), ul = $(ulSel);
    if (!Array.isArray(items) || !items.length) { wrap.classList.add("hidden"); ul.innerHTML = ""; return; }
    ul.innerHTML = items.map((t) => `<li>${esc(t)}</li>`).join("");
    wrap.classList.remove("hidden");
  }
  async function renderCraving(mealName) {
    const card = $("#cravingCard");
    card.classList.add("hidden");
    if (!mealName) return;
    let c;
    try { c = await api("/api/craving?food=" + encodeURIComponent(mealName)); } catch (_) { return; }
    if (!c || !c.is_craving) return;
    $("#cravingReasons").innerHTML = (c.reasons || []).map((r) => `<li>${esc(r)}</li>`).join("");
    $("#cravingInstead").textContent = c.swap.instead;
    $("#cravingTry").textContent = c.swap.try;
    card.classList.remove("hidden");
  }
  function renderQuality(q) {
    const card = $("#qualityCard");
    if (!q || typeof q.score !== "number") { card.classList.add("hidden"); return; }
    $("#qScore").textContent = q.score.toFixed(1);
    const starsEl = $("#qStars");
    starsEl.textContent = starString(q.stars);
    starsEl.title = `${q.stars}/5`;
    card.dataset.tier = q.score >= 8 ? "high" : q.score >= 5.5 ? "mid" : "low";
    fillList("#qBenefits", "#qBenefitsWrap", q.benefits);
    fillList("#qImprove", "#qImproveWrap", q.improvements);
    fillList("#qRecs", "#qRecsWrap", q.recommendations);
    card.classList.remove("hidden");
  }
  function onGrams(e) {
    const idx = +e.target.dataset.idx, grams = Math.max(0, +e.target.value || 0);
    currentResult.ingredients[idx].grams = grams;
    $(`#ingredientList b[data-cal="${idx}"]`).textContent = Math.round(grams * currentResult.ingredients[idx].rCal);
    recalc();
  }
  function recalc() {
    let cal = 0, p = 0, c = 0, f = 0, fb = 0, sg = 0, sd = 0;
    currentResult.ingredients.forEach((i) => {
      cal += i.grams * i.rCal; p += i.grams * i.rPro; c += i.grams * i.rCarb; f += i.grams * i.rFat;
      fb += i.grams * i.rFib; sg += i.grams * i.rSug; sd += i.grams * i.rSod;
    });
    $("#resCalories").textContent = Math.round(cal);
    $("#sumP").textContent = r1(p); $("#sumC").textContent = r1(c); $("#sumF").textContent = r1(f);
    $("#sumFb").textContent = r1(fb); $("#sumSg").textContent = r1(sg); $("#sumSd").textContent = Math.round(sd);
    currentResult._totals = { calories: Math.round(cal), protein: r1(p), carbs: r1(c), fats: r1(f), fiber: r1(fb), sugar: r1(sg), sodium: Math.round(sd) };
  }
  $("#rescanBtn").addEventListener("click", () => scanStage("capture"));

  $("#addToWallBtn").addEventListener("click", async () => {
    if (!currentResult) return;
    const t = currentResult._totals;
    const meal = { name: $("#resultName").value.trim() || currentResult.meal_name, image: currentResult.image, ...t };
    try { await api("/api/meals", { method: "POST", body: { meal } }); } catch (_) {}
    const corrections = currentResult.ingredients
      .filter((i) => Math.round(i.grams) !== Math.round(i.ai_grams) && i.ai_grams > 0)
      .map((i) => ({ name: i.name, predicted_grams: i.ai_grams, corrected_grams: i.grams }));
    if (corrections.length) { api("/api/correct", { method: "POST", body: { corrections } }).catch(() => {}); }
    toast(corrections.length ? `Saved 💗 — learned from ${corrections.length} correction(s)` : "Saved to your day 💗");
    currentResult = null; scanStage("capture"); showView("dashboard");
  });

  /* ===================== meal plan ===================== */
  let activeModes = [];
  $$("#dietModes .mode-chip").forEach((chip) => chip.addEventListener("click", () => {
    if (user.plan !== "premium") { return openPaywall("Diet modes are a Premium feature."); }
    chip.classList.toggle("active");
    activeModes = $$("#dietModes .mode-chip.active").map((c) => c.dataset.mode);
  }));

  function refreshPlanGate() {
    const locked = user && user.plan !== "premium";
    $("#planPremiumNote").classList.toggle("hidden", !locked);
    $$("#dietModes .mode-chip").forEach((c) => c.classList.toggle("locked", locked));
  }

  $("#genPlanBtn").addEventListener("click", async () => {
    $("#planLoading").classList.remove("hidden");
    $("#planMeals").innerHTML = ""; $("#planTargets").classList.add("hidden"); $("#shoppingList").classList.add("hidden");
    try {
      const plan = await api("/api/mealplan", { method: "POST", body: { modes: activeModes } });
      renderPlan(plan);
    } catch (err) {
      if (err.data && err.data.needs_onboarding) { showView("onboard"); return; }
      toast(err.message);
    } finally { $("#planLoading").classList.add("hidden"); }
  });

  function renderPlan(plan) {
    const t = plan.targets;
    const pt = $("#planTargets");
    pt.innerHTML = `
      <div><b>${t.calories}</b><span>kcal</span></div>
      <div><b>${t.protein}g</b><span>Protein</span></div>
      <div><b>${t.carbs}g</b><span>Carbs</span></div>
      <div><b>${t.fat}g</b><span>Fat</span></div>`;
    pt.classList.remove("hidden");

    const wrap = $("#planMeals"); wrap.innerHTML = "";
    plan.meals.forEach((m, idx) => wrap.appendChild(mealCard(m, idx, plan.images_enabled)));

    const sl = $("#shoppingList");
    if (plan.shopping_list && plan.shopping_list.length) {
      sl.innerHTML = `<h3>🛒 Shopping list</h3><ul>${plan.shopping_list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
      sl.classList.remove("hidden");
    } else sl.classList.add("hidden");
  }

  function mealCard(m, idx, imagesEnabled) {
    const card = document.createElement("div");
    card.className = "meal-card";
    const emoji = foodEmoji(m.title + " " + m.slot);
    const photo = foodPhoto(m.title);
    card.innerHTML = `
      <div class="mc-photo" style="background-image:url('${photo}');background-size:cover;background-position:center">
        <span class="mc-slot">${esc(m.slot)}</span>
        <div class="mc-actions">
          <button class="mc-act" data-regen="${idx}" title="Regenerate">🔄</button>
        </div>
        ${photo ? "" : `<span>${emoji}</span>`}
      </div>
      <div class="mc-body">
        <h3>${esc(m.title)}</h3>
        <p class="mc-desc">${esc(m.description || "")}</p>
        <div class="mc-macros">
          <span><b>${m.calories}</b> kcal</span><span><b>${m.protein}g</b> P</span>
          <span><b>${m.carbs}g</b> C</span><span><b>${m.fat}g</b> F</span><span><b>${m.fiber}g</b> Fb</span>
        </div>
        <button class="mc-toggle" data-toggle="${idx}">View recipe ▾</button>
        <div class="mc-detail hidden" data-detail="${idx}">
          <h5>Ingredients</h5><ul>${(m.ingredients || []).map((i) => `<li>• ${esc(i.item)} — ${i.grams}g</li>`).join("")}</ul>
          <h5>Preparation</h5><ol>${(m.steps || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
        </div>
      </div>`;
    card.querySelector(`[data-toggle="${idx}"]`).addEventListener("click", (e) => {
      const d = card.querySelector(`[data-detail="${idx}"]`);
      d.classList.toggle("hidden");
      e.target.textContent = d.classList.contains("hidden") ? "View recipe ▾" : "Hide recipe ▴";
    });
    card.querySelector(`[data-regen="${idx}"]`).addEventListener("click", () => regenMeal(m, card));
    return card;
  }

  async function regenMeal(m, card) {
    if (user.plan !== "premium") { return openPaywall("Swapping & regenerating meals is Premium."); }
    card.style.opacity = ".5";
    try {
      const res = await api("/api/mealplan/meal", { method: "POST", body: { slot: m.slot, target_calories: m.calories, modes: activeModes, avoid: m.title } });
      const fresh = mealCard(res.meal, 0, cfg.images_enabled);
      // preserve regen handler index by re-binding via replace
      card.replaceWith(fresh);
    } catch (err) { card.style.opacity = "1"; toast(err.message); }
  }

  /* ---------- curated food photography (fallback when AI images are off) ---------- */
  const PHOTOS = [
    ["oat|porridge|overnight|buckwheat|grechka|kasha", "photo-1517673400267-0251440c45dc"],
    ["yogurt|parfait|berries|granola|tvorog|cottage|kefir|cheesecake|chia|pudding", "photo-1488477181946-6428a0291777"],
    ["syrniki|pancake|oladyi|blini|draniki|waffle|french toast", "photo-1528207776546-365bb710ee93"],
    ["egg|omelet|scrambl|avocado toast", "photo-1525351484163-7529414344d8"],
    ["pancake|waffle|french toast", "photo-1528207776546-365bb710ee93"],
    ["smoothie|shake|protein drink", "photo-1505252585461-04db1eb84625"],
    ["salad|greens|bowl", "photo-1512621776951-a57141f2eefd"],
    ["chicken|grilled|breast", "photo-1604908176997-125f25cc6f3d"],
    ["salmon|fish|tuna", "photo-1467003909585-2f8a72700288"],
    ["rice|stir fry|noodle|asian", "photo-1512058564366-18510be2db19"],
    ["pasta|spaghetti", "photo-1521389508051-d7ffb5dc8d57"],
    ["wrap|burrito|sandwich", "photo-1626700051175-6818013e1d4f"],
    ["soup|stew|curry", "photo-1547592180-85f173990554"],
    ["steak|beef|meat", "photo-1432139509613-5c4255815697"],
    ["tofu|vegan|veggie|vegetable", "photo-1512003867696-6d5ce6835040"],
    ["snack|nuts|fruit|apple", "photo-1490474418585-ba9bad8fd0ea"],
  ];
  // Exact-title overrides — real uploaded photos for specific meals.
  const MEAL_IMAGES = {
    "buckwheat porridge": "assets/meals/buckwheat-porridge.jpg",
    "protein syrniki": "assets/meals/protein-syrniki.jpg",
    "kefir & berry smoothie": "assets/meals/kefir-berry-smoothie.jpg",
    "protein syrniki bites": "assets/meals/protein-syrniki-bites.jpg",
    "tvorog with berries": "assets/meals/tvorog-with-berries.jpg",
    "dark chocolate & almonds": "assets/meals/dark-chocolate-almonds.jpg",
    "light borscht with beans": "assets/meals/light-borscht-beans.jpg",
    "turkey meatballs & buckwheat": "assets/meals/turkey-meatballs-buckwheat.jpg",
    "shrimp veg stir-fry": "assets/meals/shrimp-veg-stir-fry.jpg",
    "cottage cheese zapekanka": "assets/meals/cottage-cheese-zapekanka.jpg",
    "boiled eggs & cucumber": "assets/meals/boiled-eggs-cucumber.jpg",
    // --- audit corrections: meals that previously showed a random or wrong-category
    //     photo are pinned to a verified, correct-category food image. ---
    "chicken & vegetable soup": "assets/meals/chicken-vegetable-soup.jpg",
    "lentil & veg stew": "https://images.unsplash.com/photo-1512003867696-6d5ce6835040?auto=format&fit=crop&w=640&q=70",
    "baked cod & roasted veg": "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=640&q=70",
    "hummus & veggie sticks": "assets/meals/hummus-veggie-sticks.jpg",
    "cottage cheese tartine": "assets/meals/cottage-cheese-tartine.jpg",
    "high-protein rye toast": "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=640&q=70",
    "rice cakes & nut butter": "assets/meals/rice-cakes-nut-butter.jpg",
    "roasted chickpeas": "assets/meals/roasted-chickpeas.jpg",
    "edamame": "assets/meals/edamame.jpg",
    "vinegret with chickpeas": "assets/meals/vinegret-chickpeas.jpg",
    "eggplant & chickpea bake": "assets/meals/eggplant-chickpea-bake.jpg",
    "buckwheat & chicken bowl": "assets/meals/buckwheat-chicken-bowl.jpg",
    "chicken plov (light)": "assets/meals/chicken-plov-light.jpg",
    "tofu teriyaki rice bowl": "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=640&q=70",
    "stuffed peppers": "assets/meals/stuffed-peppers.jpg",
    "light golubtsy": "assets/meals/light-golubtsy.jpg",
    "no-bake protein cheesecake cup": "assets/meals/no-bake-protein-cheesecake-cup.jpg",
    "egg white veggie omelette": "assets/meals/egg-white-veggie-omelette.jpg",
    "shrimp & quinoa salad": "assets/meals/shrimp-quinoa-salad.jpg",
    "apple & almond butter": "assets/meals/apple-almond-butter.jpg",
    "baked draniki & salmon": "assets/meals/baked-draniki-salmon.jpg",
    "tofu veggie scramble": "assets/meals/tofu-veggie-scramble.jpg",
    "veggie chili & rice": "assets/meals/veggie-chili-rice.jpg",
    "tuna & white bean salad": "assets/meals/tuna-white-bean-salad.jpg",
    "salmon & greens salad": "assets/meals/salmon-greens-salad.jpg",
    "baked salmon & asparagus": "assets/meals/baked-salmon-asparagus.jpg",
    "tvorog breakfast bowl": "assets/meals/tvorog-breakfast-bowl.jpg",
  };
  function foodPhoto(title) {
    const t = (title || "").toLowerCase();
    if (MEAL_IMAGES[t]) return MEAL_IMAGES[t];   // uploaded photo wins
    for (const [kw, id] of PHOTOS) { if (new RegExp(kw).test(t)) return unsplash(id); }
    return unsplash(PHOTOS[(hash(t) % PHOTOS.length)][1]);
  }
  const unsplash = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=640&q=70`;
  function foodEmoji(t) { t = (t || "").toLowerCase();
    if (/salad|greens/.test(t)) return "🥗"; if (/chicken/.test(t)) return "🍗";
    if (/salmon|fish/.test(t)) return "🐟"; if (/smoothie|shake/.test(t)) return "🥤";
    if (/egg|omelet/.test(t)) return "🍳"; if (/oat|porridge/.test(t)) return "🥣";
    if (/pasta/.test(t)) return "🍝"; if (/rice|bowl/.test(t)) return "🍚"; return "🍽️"; }
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  /* ===================== workout generator ===================== */
  let workoutCategory = "glutes";
  // Single-select: exactly one category can be active at a time.
  $$("#categoryChips .focus-chip").forEach((chip) => chip.addEventListener("click", () => {
    $$("#categoryChips .focus-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    workoutCategory = chip.dataset.cat;
  }));

  function refreshWorkoutGate() {
    $("#workoutPremiumNote").classList.toggle("hidden", !(user && user.plan !== "premium"));
  }

  // Load the user's ONE active workout (if any) + completed history when the view opens.
  async function loadWorkout() {
    try {
      const [act, hist] = await Promise.all([
        api("/api/workout/active"),
        api("/api/workout/history"),
      ]);
      if (act.plan) renderWorkout(act.plan);
      else showPicker();
      renderHistory(hist.history || []);
    } catch (err) {
      if (err.status === 402) { showPicker(); }
    }
  }

  function showPicker() {
    $("#workoutResult").innerHTML = "";
    $("#workoutPicker").classList.remove("hidden");
  }

  $("#genWorkoutBtn").addEventListener("click", async () => {
    $("#workoutLoading").classList.remove("hidden");
    $("#workoutResult").innerHTML = "";
    const body = {
      category: workoutCategory,
      goal: $("#woGoal") ? $("#woGoal").value : undefined,
      equipment: $("#woEquip") ? $("#woEquip").value : undefined,
      duration: $("#woDuration") ? +$("#woDuration").value : undefined,
      level: $("#woLevel") ? $("#woLevel").value : undefined,
    };
    try {
      const res = await api("/api/workout", { method: "POST", body });
      renderWorkout(res.plan);
    } catch (err) {
      if (err.status === 402) openPaywall(err.message);
      else toast(err.message);
    } finally { $("#workoutLoading").classList.add("hidden"); }
  });

  // Renders exactly ONE active workout: title, exercises, sets/reps/instructions,
  // and the single completion button. Hides the category picker while active.
  function renderWorkout(plan) {
    $("#workoutPicker").classList.add("hidden");
    const wrap = $("#workoutResult"); wrap.innerHTML = "";
    const head = document.createElement("div");
    head.className = "workout-plan-head";
    head.innerHTML = `<h3>${esc(plan.title)}</h3><p>${esc(plan.summary || "")}</p>
      <span class="wo-meta">~${plan.duration_min} min · ${(plan.exercises || []).length} exercises</span>`;
    wrap.appendChild(head);

    const card = document.createElement("div");
    card.className = "day-card";
    card.innerHTML = `<div class="ex-list"></div>`;
    const list = card.querySelector(".ex-list");
    (plan.exercises || []).forEach((ex, i) => list.appendChild(exerciseRow(ex, plan.focus, i)));
    wrap.appendChild(card);

    // honest completion signal — one tap confirms a real workout (feeds streak,
    // achievements, quest, Sunday Reset), then moves it to history.
    const done = document.createElement("button");
    done.className = "btn btn-primary btn-block wo-complete-btn";
    done.innerHTML = "💪 I completed this workout";
    done.addEventListener("click", async () => {
      done.disabled = true;
      try {
        await api("/api/workout/complete", { method: "POST", body: {} });
        toast("Workout completed 💪 — it counts toward your streak.");
        showPicker();                         // no active workout until they generate a new one
        const h = await api("/api/workout/history");
        renderHistory(h.history || []);
        loadNotifications();                  // surface any new achievement/streak notification
      } catch (e) { done.disabled = false; toast(e.message || "Couldn't log that — try again."); }
    });
    wrap.appendChild(done);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const CAT_LABEL = {
    glutes: "🍑 Glutes", full_body: "🏋️ Full Body", upper_body: "💪 Upper Body",
    lower_body: "🦵 Lower Body", abs_core: "🔥 Abs & Core", cardio: "🏃‍♀️ Cardio",
    home: "🏠 Home Workout",
  };
  function renderHistory(items) {
    const block = $("#workoutHistoryBlock"), wrap = $("#workoutHistory");
    if (!items.length) { block.classList.add("hidden"); wrap.innerHTML = ""; return; }
    block.classList.remove("hidden");
    wrap.innerHTML = items.map((h) => {
      const when = (h.completed_at || "").slice(0, 10);
      return `<div class="wh-row"><span class="wh-cat">${esc(CAT_LABEL[h.category] || h.title || "Workout")}</span>
        <span class="wh-date">✅ ${esc(when)}</span></div>`;
    }).join("");
  }

  function exerciseRow(ex, focus, idx) {
    const row = document.createElement("div");
    row.className = "ex";
    const visual = ex.image || exerciseEmoji((ex.target_muscles || []).join(" ") + " " + ex.name + " " + focus);
    const id = `ex${Date.now()}_${idx}`;
    row.innerHTML = `
      <div class="ex-visual"><div><span>${visual}</span><small>${esc(ex.difficulty || "")}</small></div></div>
      <div class="ex-body">
        <h5>${esc(ex.name)}</h5>
        <div class="ex-stats">
          <span class="ex-stat"><b>${ex.sets}</b> sets</span>
          <span class="ex-stat"><b>${esc(ex.reps)}</b> reps</span>
          <span class="ex-stat">rest <b>${esc(ex.rest)}</b></span>
        </div>
        <p class="ex-instr">${esc(ex.instructions)}</p>
        ${ex.target_muscles && ex.target_muscles.length ? `<div class="ex-muscles">🎯 ${ex.target_muscles.map(esc).join(" · ")}</div>` : ""}
        <button class="ex-more" data-more="${id}">Benefits &amp; mistakes ▾</button>
        <div class="ex-detail hidden" data-detail="${id}">
          ${ex.beginner ? `<div class="row"><b>Beginner version</b><span class="ex-beg">${esc(ex.beginner)}</span></div>` : ""}
          ${ex.advanced ? `<div class="row"><b>Advanced version</b><span class="ex-adv">${esc(ex.advanced)}</span></div>` : ""}
          ${ex.benefits && ex.benefits.length ? `<div class="row"><b>Benefits</b><ul>${ex.benefits.map((m) => `<li class="ex-beg">✓ ${esc(m)}</li>`).join("")}</ul></div>` : ""}
          ${ex.common_mistakes && ex.common_mistakes.length ? `<div class="row"><b>Common mistakes</b><ul>${ex.common_mistakes.map((m) => `<li>✗ ${esc(m)}</li>`).join("")}</ul></div>` : ""}
        </div>
      </div>`;
    row.querySelector(`[data-more="${id}"]`).addEventListener("click", (e) => {
      const d = row.querySelector(`[data-detail="${id}"]`);
      d.classList.toggle("hidden");
      e.target.textContent = d.classList.contains("hidden") ? "Benefits & mistakes ▾" : "Benefits & mistakes ▴";
    });
    return row;
  }

  function exerciseEmoji(t) {
    t = (t || "").toLowerCase();
    if (/glute|hip|squat|lunge|bridge|thrust/.test(t)) return "🍑";
    if (/quad|hamstring|calf|leg/.test(t)) return "🦵";
    if (/ab|core|plank|oblique/.test(t)) return "🔥";
    if (/chest|push|bench|tricep|bicep|arm|shoulder|press/.test(t)) return "💪";
    if (/back|row|pull|lat/.test(t)) return "🏋️";
    if (/cardio|jump|burpee|run/.test(t)) return "⚡";
    return "🤸";
  }

  /* ===================== AI coach chat ===================== */
  let coachLoaded = false;

  async function openCoach() {
    const locked = user && user.plan !== "premium";
    $("#coachLocked").classList.toggle("hidden", !locked);
    $("#coachChat").classList.toggle("hidden", locked);
    if (locked || coachLoaded) return;
    coachLoaded = true;
    try {
      const res = await api("/api/coach/history");
      ($("#chatLog").innerHTML = "");
      if (res.messages && res.messages.length) res.messages.forEach((m) => addBubble(m.role === "user" ? "user" : "coach", m.content));
      else chatEmpty();
    } catch (_) { chatEmpty(); }
  }
  function chatEmpty() {
    $("#chatLog").innerHTML = `<div class="chat-empty"><span>💬</span>Hi, I'm your Supermodel Wellness Coach! Ask me anything — nutrition, habits, training, digestion, travel wellness, or just say hi.</div>`;
  }
  function addBubble(who, text) {
    const empty = $("#chatLog .chat-empty"); if (empty) empty.remove();
    const b = document.createElement("div");
    b.className = "bubble " + who; b.textContent = text;
    $("#chatLog").appendChild(b);
    $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
    return b;
  }

  $$("#chatSuggestions button").forEach((b) => b.addEventListener("click", () => sendCoach(b.dataset.suggest)));
  $("#chatForm").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#chatInput").value.trim(); if (v) sendCoach(v); });

  async function sendCoach(message) {
    $("#chatInput").value = "";
    addBubble("user", message);
    const typing = addBubble("coach typing", "Coach is typing…");
    try {
      const res = await api("/api/coach", { method: "POST", body: { message } });
      typing.remove();
      addBubble("coach", res.reply);
    } catch (err) {
      typing.remove();
      if (err.status === 402) { addBubble("coach", "💗 AI Coach Chat is a Premium feature."); openPaywall("AI Coach Chat is a Premium feature."); }
      else if (err.status === 403 && err.data && err.data.needs_verification) { updateVerifyBanner(); addBubble("coach", err.message); }
      else if (err.status === 503) addBubble("coach", err.message || "This feature is temporarily unavailable. Please try again shortly.");
      else addBubble("coach", "⚠️ " + (err.message || "Something went wrong."));
    }
  }

  /* ===================== account / billing ===================== */
  function renderAccount() {
    if (!user) return;
    $("#acctEmail").textContent = user.email;
    $("#acctPlan").textContent = user.plan === "premium" ? "Premium ✨" : "Free";
    $("#acctScans").textContent = user.scans_used;
    const premium = user.plan === "premium";
    $("#upgradeCard").classList.toggle("hidden", premium);
    $("#subCard").classList.toggle("hidden", !premium);
    if (premium) loadSubscription();
    refreshPlanGate();
    if (!cfg.stripe_configured) $("#checkoutNote").textContent = "Payments are in test mode — add Stripe keys to backend/.env to go live.";
    // show current profile picture + wire the editor (opens Club → My Profile)
    api("/api/community/profile").then((d) => {
      const av = $("#acctAvatar"); if (av && d.profile) av.innerHTML = avatarInner(d.profile);
    }).catch(() => {});
    const ep = $("#acctEditPic");
    if (ep) ep.onclick = () => { showView("club"); setClubPane("profile"); };
  }

  async function startCheckout(btn) {
    if (btn) { btn.disabled = true; }
    try {
      const res = await api("/api/billing/checkout", { method: "POST", body: { interval: billingInterval } });
      if (res.url) { window.location.href = res.url; return; }
      toast("Could not start checkout.");
    } catch (err) {
      if (/not configured/i.test(err.message)) toast("Payments aren't live yet — add Stripe keys to backend/.env.");
      else toast(err.message);
    } finally { if (btn) btn.disabled = false; }
  }
  $("#checkoutBtn").addEventListener("click", (e) => startCheckout(e.currentTarget));

  /* ===================== paywall (conversion) ===================== */
  const paywall = $("#paywallModal");
  function openPaywall(reason) {
    if (user && user.plan === "premium") return;
    $("#paywallReason").textContent = reason || "Go unlimited and get the full platform.";
    applyPricing();
    paywall.classList.add("show");
  }
  function closePaywall() { paywall.classList.remove("show"); }
  $("#paywallClose").addEventListener("click", closePaywall);
  paywall.addEventListener("click", (e) => { if (e.target === paywall) closePaywall(); });
  $("#paywallCheckout").addEventListener("click", (e) => startCheckout(e.currentTarget));
  $("#dashUpgrade").addEventListener("click", () => openPaywall("Subscribe to unlock the full platform."));

  /* ---------- subscription management ---------- */
  async function loadSubscription() {
    try {
      const s = await api("/api/billing/status");
      $("#subPlan").textContent = s.manual ? "Premium (complimentary)" : "Premium";
      const statusMap = { active: "Active", trialing: "Trial", past_due: "Payment due", canceled: "Cancelled", manual: "Active" };
      $("#subStatus").textContent = statusMap[s.status] || s.status || "Active";
      $("#subRenewal").textContent = s.cancel_at_period_end ? "Cancels at period end" : s.manual ? "Complimentary — no billing" : "Renews automatically";
      $("#subNextDate").textContent = s.current_period_end
        ? new Date(s.current_period_end * 1000).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—";
      $("#manageSubBtn").classList.toggle("hidden", s.manual);
      $("#subNote").textContent = s.cancel_at_period_end
        ? "Your subscription is set to cancel — access continues until the next billing date." : "";
    } catch (_) {}
  }
  $("#manageSubBtn").addEventListener("click", async () => {
    try { const r = await api("/api/billing/portal", { method: "POST" }); window.location.href = r.url; }
    catch (e) { $("#subNote").textContent = e.message || "Billing portal is unavailable right now."; }
  });

  /* ---------- account deletion ---------- */
  const deleteModal = $("#deleteModal");
  const closeDelete = () => deleteModal.classList.remove("show");
  $("#deleteAcctBtn").addEventListener("click", () => {
    $("#deleteError").classList.add("hidden");
    $("#deleteConfirmChk").checked = false; $("#deleteConfirm").disabled = true;
    $("#deleteSubNote").textContent = (user && user.plan === "premium")
      ? "You have an active subscription. Deleting your account cancels it immediately and removes your billing record — you will not be charged again." : "";
    deleteModal.classList.add("show");
  });
  $("#deleteClose").addEventListener("click", closeDelete);
  $("#deleteCancel").addEventListener("click", closeDelete);
  deleteModal.addEventListener("click", (e) => { if (e.target === deleteModal) closeDelete(); });
  $("#deleteConfirmChk").addEventListener("change", (e) => { $("#deleteConfirm").disabled = !e.target.checked; });
  $("#deleteConfirm").addEventListener("click", async () => {
    $("#deleteConfirm").disabled = true;
    try {
      await api("/api/me", { method: "DELETE" });
      token = null; user = null; localStorage.removeItem(TOKEN_KEY);
      closeDelete();
      toast("Your account and data have been permanently deleted.");
      route();
    } catch (e) {
      $("#deleteError").textContent = e.message || "Couldn't delete your account. Please try again.";
      $("#deleteError").classList.remove("hidden"); $("#deleteConfirm").disabled = false;
    }
  });

  /* ===================== the club (community) ===================== */
  let clubPane = "feed", composerType = "win", composerImg = null, composerImg2 = null;

  async function loadSocialProof() {
    try {
      const s = await api("/api/community/stats", { auth: false });
      const n = (s.members_display || 12400).toLocaleString();
      $$("[data-proof]").forEach((e) => (e.textContent = `${n} women are currently building their dream body 💫`));
      if ($("#clubProof")) $("#clubProof").textContent = `${n} women are building their dream body — welcome to the Club 👑`;
    } catch (_) {}
  }

  async function loadClub() {
    loadSocialProof();
    setClubPane(clubPane);
  }

  function setClubPane(p) {
    clubPane = p;
    $$(".club-tab").forEach((t) => t.classList.toggle("active", t.dataset.club === p));
    $("#clubFeed").classList.toggle("hidden", p !== "feed");
    $("#clubWallPane").classList.toggle("hidden", p !== "wall");
    $("#clubProfilePane").classList.toggle("hidden", p !== "profile");
    if (p === "feed") loadFeed();
    if (p === "wall") loadWall();
    if (p === "profile") loadProfile();
  }
  $$(".club-tab").forEach((t) => t.addEventListener("click", () => setClubPane(t.dataset.club)));

  $$("#composerTypes .ctype").forEach((c) => c.addEventListener("click", () => {
    $$("#composerTypes .ctype").forEach((x) => x.classList.remove("active"));
    c.classList.add("active"); composerType = c.dataset.ptype;
    $("#composerFile2Label").classList.toggle("hidden", composerType !== "transformation");
  }));

  function readImageFile(file, cb) {
    const img = new Image(), r = new FileReader();
    r.onload = () => { img.onload = () => {
      const maxW = 900, s = Math.min(1, maxW / img.width), w = Math.round(img.width * s), h = Math.round(img.height * s);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      cb(cv.toDataURL("image/jpeg", 0.82));
    }; img.src = r.result; };
    r.readAsDataURL(file);
  }
  function renderComposerPhotos() {
    const h = $("#composerPhotos"); h.innerHTML = "";
    if (composerImg) h.insertAdjacentHTML("beforeend", `<img src="${composerImg}" alt=""/>`);
    if (composerImg2) h.insertAdjacentHTML("beforeend", `<img src="${composerImg2}" alt=""/>`);
  }
  $("#composerFile").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) readImageFile(f, (d) => { composerImg = d; renderComposerPhotos(); }); e.target.value = ""; });
  $("#composerFile2").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) readImageFile(f, (d) => { composerImg2 = d; renderComposerPhotos(); }); e.target.value = ""; });

  $("#composerPost").addEventListener("click", async () => {
    const text = $("#composerText").value.trim();
    if (!text && !composerImg) return toast("Share a few words or a photo 💗");
    try {
      await api("/api/community/post", { method: "POST", body: { type: composerType, text, image: composerImg, image2: composerImg2 } });
      $("#composerText").value = ""; composerImg = null; composerImg2 = null; renderComposerPhotos();
      toast("Shared with the Club 💗"); loadFeed();
      // First post counts toward the First Week Quest + unlocks the community
      // achievement — refresh those surfaces immediately, not on next navigation.
      loadRitual(); loadNotifications();
    } catch (err) { toast(err.message); }
  });

  async function loadFeed() {
    const host = $("#clubFeedList");
    if (!host.childElementCount) host.innerHTML = `<div class="feed-skeleton"></div><div class="feed-skeleton"></div>`;
    try {
      renderPosts((await api("/api/community/feed")).posts, host);
      if (!host.childElementCount) host.innerHTML = `<p class="muted" style="text-align:center;padding:24px">No posts yet — be the first to share 💗</p>`;
    } catch (_) {
      host.innerHTML = `<div class="feed-error">Couldn't load the feed. <button class="btn btn-ghost btn-sm" id="feedRetry">Retry</button></div>`;
      const r = document.getElementById("feedRetry"); if (r) r.addEventListener("click", loadFeed);
    }
  }
  async function loadWall() {
    try {
      const d = await api("/api/community/wall"); const host = $("#clubWallList");
      renderPosts(d.posts, host);
      if (!d.posts.length) host.innerHTML = `<p class="muted" style="text-align:center;padding:24px">No transformations yet — share yours and inspire the Club ✨</p>`;
    } catch (_) {}
  }

  function timeAgo(iso) {
    if (!iso) return ""; const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
    const s = (Date.now() - d) / 1000;
    if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m";
    if (s < 86400) return Math.floor(s / 3600) + "h"; return Math.floor(s / 86400) + "d";
  }
  function renderPosts(posts, host) { host.innerHTML = ""; (posts || []).forEach((p) => host.appendChild(postCard(p))); }
  function avatarInner(o) { return o && o.avatar_img ? `<img src="${o.avatar_img}" alt=""/>` : esc((o && o.avatar) || "🌸"); }

  const _likeBusy = new Set();  // prevents duplicate/rapid like requests per post
  function postCard(p) {
    const el = document.createElement("div"); el.className = "post";
    const imgs = (p.type === "transformation" && p.image && p.image2)
      ? `<div class="post-imgs"><figure><img loading="lazy" src="${p.image}"/><figcaption>Before</figcaption></figure><figure><img loading="lazy" src="${p.image2}"/><figcaption>After</figcaption></figure></div>`
      : (p.image ? `<img class="post-img" loading="lazy" src="${p.image}"/>` : "");
    const adminDel = (user && user.is_admin)
      ? `<button class="post-del" data-delp="${p.id}" title="Delete post (admin)" aria-label="Delete post">🗑</button>` : "";
    el.innerHTML = `
      <div class="post-head">
        <div class="post-avatar">${avatarInner(p)}</div>
        <div class="post-who"><b>${esc(p.username)}</b><div class="post-meta">${timeAgo(p.created_at)} · ${esc(p.type)}</div></div>
        <span class="lvl-badge">L${p.level} · ${esc(p.level_name)}</span>
        ${adminDel}
      </div>
      ${p.text ? `<p class="post-text">${esc(p.text)}</p>` : ""}
      ${imgs}
      <div class="post-actions">
        <button class="like-btn${p.liked ? " liked" : ""}" data-like="${p.id}" aria-pressed="${!!p.liked}">${p.liked ? "💗" : "🤍"} <span>${p.likes}</span></button>
        <button class="comment-toggle" data-ct="${p.id}">💬 <span>${p.comments}</span></button>
      </div>
      <div class="comments hidden" data-comments="${p.id}"></div>
      <div class="comment-add hidden" data-cadd="${p.id}">
        <input type="text" placeholder="Add a comment…" data-cinput="${p.id}" maxlength="400"/>
        <button class="btn btn-primary btn-sm" data-csend="${p.id}">Send</button>
      </div>`;
    el.querySelector(`[data-like="${p.id}"]`).addEventListener("click", (e) => likePost(e.currentTarget, p.id));
    el.querySelector(`[data-ct="${p.id}"]`).addEventListener("click", () => toggleComments(el, p.id));
    el.querySelector(`[data-csend="${p.id}"]`).addEventListener("click", () => sendComment(el, p.id));
    el.querySelector(`[data-cinput="${p.id}"]`).addEventListener("keydown", (e) => { if (e.key === "Enter") sendComment(el, p.id); });
    if (adminDel) el.querySelector(`[data-delp="${p.id}"]`).addEventListener("click", () => adminDeletePost(p.id, el));
    return el;
  }

  // Optimistic like — instant UI, reconciled with the server, reverted on error.
  async function likePost(btn, id) {
    if (_likeBusy.has(id)) return;  // ignore rapid double-taps
    _likeBusy.add(id);
    const span = btn.querySelector("span");
    const wasLiked = btn.classList.contains("liked");
    const prevCount = +span.textContent || 0;
    const optLiked = !wasLiked;
    btn.classList.toggle("liked", optLiked);
    btn.setAttribute("aria-pressed", optLiked);
    btn.firstChild.textContent = (optLiked ? "💗" : "🤍") + " ";
    span.textContent = Math.max(0, prevCount + (optLiked ? 1 : -1));
    btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop");  // restart pop anim
    try {
      const r = await api("/api/community/like", { method: "POST", body: { post_id: id } });
      btn.classList.toggle("liked", r.liked);
      btn.setAttribute("aria-pressed", r.liked);
      btn.firstChild.textContent = (r.liked ? "💗" : "🤍") + " ";
      span.textContent = r.likes;  // server is the source of truth
    } catch (err) {
      btn.classList.toggle("liked", wasLiked);  // revert
      btn.setAttribute("aria-pressed", wasLiked);
      btn.firstChild.textContent = (wasLiked ? "💗" : "🤍") + " ";
      span.textContent = prevCount;
      toast("Couldn't update like — check your connection.");
    } finally { _likeBusy.delete(id); }
  }

  async function toggleComments(el, id) {
    const box = el.querySelector(`[data-comments="${id}"]`), add = el.querySelector(`[data-cadd="${id}"]`);
    const willShow = box.classList.contains("hidden");
    box.classList.toggle("hidden", !willShow); add.classList.toggle("hidden", !willShow);
    if (willShow && box.dataset.loaded !== "1") {
      box.innerHTML = `<p class="muted cmt-loading">Loading comments…</p>`;
      try {
        const d = await api(`/api/community/comments?post_id=${id}`);
        renderComments(box, d.comments, id); box.dataset.loaded = "1";
      } catch (_) { box.innerHTML = `<p class="muted" style="font-size:13px">Couldn't load comments — tap 💬 to retry.</p>`; }
    }
  }
  function renderComments(box, comments, postId) {
    if (!comments || !comments.length) {
      box.innerHTML = `<p class="muted" style="font-size:13px">Be the first to cheer her on 💗</p>`; return;
    }
    const canDel = user && user.is_admin;
    box.innerHTML = comments.map((c) => `
      <div class="comment" data-comment="${c.id}">
        <div class="cav">${avatarInner(c)}</div>
        <div class="comment-body"><b>${esc(c.username)}</b>${esc(c.text)}</div>
        ${canDel ? `<button class="cmt-del" data-delc="${c.id}" title="Delete comment (admin)" aria-label="Delete comment">✕</button>` : ""}
      </div>`).join("");
    if (canDel) box.querySelectorAll("[data-delc]").forEach((b) =>
      b.addEventListener("click", () => adminDeleteComment(b.dataset.delc, b, postId, box)));
  }
  async function sendComment(el, id) {
    const inp = el.querySelector(`[data-cinput="${id}"]`), btn = el.querySelector(`[data-csend="${id}"]`);
    const text = inp.value.trim(); if (!text) return;
    btn.disabled = true; inp.disabled = true;
    try {
      const d = await api("/api/community/comment", { method: "POST", body: { post_id: id, text } });
      inp.value = "";
      const box = el.querySelector(`[data-comments="${id}"]`);
      renderComments(box, d.comments, id); box.dataset.loaded = "1";
      const span = el.querySelector(`[data-ct="${id}"] span`); span.textContent = d.comments.length;
    } catch (err) { toast(err.message || "Couldn't post comment."); }
    finally { btn.disabled = false; inp.disabled = false; inp.focus(); }
  }

  // ---- admin moderation ----
  async function adminDeletePost(id, el) {
    if (!confirm("Delete this post for everyone? This cannot be undone.")) return;
    try {
      await api(`/api/admin/community/post?post_id=${id}`, { method: "DELETE" });
      el.style.transition = "opacity .2s, transform .2s"; el.style.opacity = "0"; el.style.transform = "scale(.97)";
      setTimeout(() => el.remove(), 200);
      toast("Post deleted.");
    } catch (err) { toast(err.message || "Delete failed."); }
  }
  async function adminDeleteComment(cid, btn, postId, box) {
    if (!confirm("Delete this comment? This cannot be undone.")) return;
    try {
      await api(`/api/admin/community/comment?comment_id=${cid}`, { method: "DELETE" });
      const row = btn.closest(".comment"); if (row) row.remove();
      // keep the post's comment count in sync
      const span = document.querySelector(`[data-ct="${postId}"] span`);
      if (span) span.textContent = Math.max(0, (+span.textContent || 1) - 1);
      if (!box.querySelector(".comment")) renderComments(box, [], postId);
    } catch (err) { toast(err.message || "Delete failed."); }
  }

  async function loadProfile() {
    try {
      const d = await api("/api/community/profile"); const p = d.profile, host = $("#clubProfilePane");
      host.innerHTML = `
        <div class="cprofile-head">
          <div class="cprofile-avatar">${avatarInner(p)}</div>
          <label class="btn btn-ghost btn-sm" for="cpPic" style="margin-top:8px">📷 Edit profile picture</label>
          <input type="file" id="cpPic" accept="image/*" hidden />
          <h3>${esc(p.username)}</h3>
          <span class="lvl-badge cprofile-lvl">Level ${p.level.level} · ${esc(p.level.name)}</span>
          <div class="cprofile-prog"><i style="width:${p.level.progress}%"></i></div>
          <div class="post-meta">${p.level.points} pts${p.level.next_at ? ` · ${p.level.next_at - p.level.points} to next level` : " · max level 👑"}</div>
          <div class="cprofile-stats">
            <div><b>${p.stats.posts}</b><span>Posts</span></div>
            <div><b>${p.stats.followers}</b><span>Followers</span></div>
            <div><b>${p.stats.following}</b><span>Following</span></div>
          </div>
          <div class="cprofile-edit">
            <input id="cpUser" value="${esc(p.username)}" maxlength="24" placeholder="Username"/>
            <textarea id="cpBio" maxlength="200" placeholder="Your bio">${esc(p.bio || "")}</textarea>
            <button class="btn btn-ghost btn-sm" id="cpSave">Save profile</button>
          </div>
        </div>
        <div class="feed-list" id="cpPosts"></div>`;
      renderPosts(d.posts || [], $("#cpPosts"));
      $("#cpPic").addEventListener("change", (e) => {
        const file = e.target.files[0]; if (!file) return;
        readImageFile(file, async (dataUrl) => {
          try { await api("/api/community/profile", { method: "POST", body: { avatar_img: dataUrl } }); toast("Profile picture updated 💗"); loadProfile(); }
          catch (err) { toast(err.message); }
        });
        e.target.value = "";
      });
      $("#cpSave").addEventListener("click", async () => {
        try { await api("/api/community/profile", { method: "POST", body: { username: $("#cpUser").value, bio: $("#cpBio").value } }); toast("Profile updated 💗"); loadProfile(); }
        catch (err) { toast(err.message); }
      });
    } catch (_) {}
  }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  const r1 = (n) => Math.round((n || 0) * 10) / 10;

  /* ---------- go ---------- */
  boot();
})();
