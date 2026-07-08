/* ===================== Caloria Club — founding members ===================== */
/* Powers the landing-page Club section (join form, referral capture, social
   proof) and the /club.html success experience (position, referral link,
   sharing). Same design language + API conventions as js/app.js. */
(function () {
  "use strict";

  const API = window.CALORIA_API || `http://${location.hostname || "localhost"}:8787`;
  const $ = (s, r = document) => r.querySelector(s);
  const CODE_KEY = "caloria.club.code";
  const REF_KEY = "caloria.club.ref";

  async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(API + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error(data.error || `Error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ---------- referral capture (?ref=CODE works on every page) ---------- */
  const params = new URLSearchParams(location.search);
  const refParam = (params.get("ref") || "").trim().toUpperCase();
  if (refParam) {
    try { localStorage.setItem(REF_KEY, refParam); } catch (_) {}
  }

  /* ===================== landing section ===================== */
  const form = $("#clubForm");
  if (form) initLanding();

  function initLanding() {
    const emailInput = $("#clubEmail");
    const submitBtn = $("#clubSubmit");
    const field = $("#clubField");
    const errBox = $("#clubError");

    // Invited visitors land on /?ref=CODE#club — greet them like a guest list.
    if (refParam) {
      const proof = $("#clubProofLine");
      if (proof) proof.textContent = "💌 You've been personally invited — your place is reserved.";
      // Glide down to the Club section — and re-align once images have loaded,
      // because their arrival shifts the layout and strands the first scroll.
      const glide = () => {
        const el = $("#club");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      };
      setTimeout(glide, 600);
      if (document.readyState === "complete") setTimeout(glide, 1200);
      else window.addEventListener("load", () => setTimeout(glide, 350), { once: true });
    }

    // Live social proof — real member count, phrased like a club, not a metric.
    loadProof();
    async function loadProof() {
      try {
        const s = await api("/api/club/stats");
        if (s.total >= 10 && !refParam) {
          $("#clubProofLine").textContent = `${s.total.toLocaleString()} women are already inside. Founding memberships are limited.`;
        }
      } catch (_) { /* proof line keeps its default copy */ }
    }

    function showError(msg) {
      errBox.textContent = msg;
      errBox.classList.remove("hidden");
      field.classList.add("shake");
      setTimeout(() => field.classList.remove("shake"), 500);
    }

    emailInput.addEventListener("input", () => {
      errBox.classList.add("hidden");
      field.classList.remove("invalid");
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submitBtn.classList.contains("loading") || submitBtn.classList.contains("done")) return;
      const email = emailInput.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        field.classList.add("invalid");
        return showError("Please enter a valid email address.");
      }
      errBox.classList.add("hidden");
      submitBtn.classList.add("loading");
      let ref = "";
      try { ref = localStorage.getItem(REF_KEY) || ""; } catch (_) {}
      try {
        const res = await api("/api/club/join", { method: "POST", body: { email, ref } });
        try { localStorage.setItem(CODE_KEY, res.referral_code); } catch (_) {}
        submitBtn.classList.remove("loading");
        submitBtn.classList.add("done");
        field.classList.add("success");
        if (res.already) {
          // She's already inside — no re-onboarding, straight to her page.
          toast("You're already one of us 🤍 Taking you to your founder page…");
          setTimeout(() => {
            location.href = "/club.html?m=" + encodeURIComponent(res.referral_code);
          }, 900);
          return;
        }
        if (window.caloriaTrack) caloriaTrack("waitlist_signup", { referred: ref ? "yes" : "no" });
        // A beat to enjoy the ✓, then the founding questions.
        setTimeout(() => startQuestions(res.referral_code), 700);
      } catch (err) {
        submitBtn.classList.remove("loading");
        showError(err.message || "Something went wrong. Please try again.");
      }
    });
  }

  /* ---------- founding onboarding questions ---------- */
  // Answers save one tap at a time (fire-and-forget) so nothing is lost if she
  // closes the tab mid-flow. The full-text labels are stored verbatim — that's
  // what Paullina reads in the admin panel.
  const QUESTIONS = [
    {
      key: "goal",
      title: "What’s your biggest wellness goal right now?",
      sub: "So Caloria is built around you from day one 🤍",
      options: ["Lose weight", "Build healthy habits", "Feel more confident",
                "Improve my relationship with food", "Other"],
    },
    {
      key: "struggle",
      title: "What do you struggle with the most?",
      sub: "Be honest — this stays between us.",
      options: ["Staying consistent", "Knowing what to eat", "Motivation",
                "Overeating", "Having too many different apps"],
    },
    {
      key: "excited",
      title: "What’s one feature you’re most excited about?",
      sub: "You’ll be the very first to try it.",
      options: ["AI Wellness Coach", "Meal Scan", "Personalized Meal Plans",
                "Workouts", "Community"],
    },
  ];

  function startQuestions(code) {
    const flow = $("#clubFlow");
    $("#clubForm").classList.add("hidden");
    flow.classList.remove("hidden");
    const proof = $("#clubProofLine");
    if (proof) proof.classList.add("hidden");
    let step = 0;

    function saveAnswer(key, value) {
      // Fire-and-forget — the flow never waits on the network.
      api("/api/club/answers", { method: "POST", body: { code, [key]: value } }).catch(() => {});
    }

    function renderStep() {
      const q = QUESTIONS[step];
      $("#cfStepLabel").textContent = `Question ${step + 1} of ${QUESTIONS.length}`;
      Array.from($("#cfDots").children).forEach((d, i) => d.classList.toggle("on", i <= step));
      $("#cfTitle").textContent = q.title;
      $("#cfSub").textContent = q.sub;
      $("#cfOther").classList.add("hidden");
      const wrap = $("#cfOptions");
      wrap.innerHTML = "";
      q.options.forEach((label) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cf-opt";
        b.textContent = label;
        b.addEventListener("click", () => pick(q, b, label));
        wrap.appendChild(b);
      });
      const body = $("#cfBody");
      body.classList.remove("cf-in");
      void body.offsetWidth;           // restart the entrance animation
      body.classList.add("cf-in");
    }

    function pick(q, btn, label) {
      if (btn.classList.contains("sel")) return;
      Array.from($("#cfOptions").children).forEach((b) => (b.disabled = true));
      btn.classList.add("sel");
      if (label === "Other") {
        // Her own words matter more than our list.
        $("#cfOther").classList.remove("hidden");
        Array.from($("#cfOptions").children).forEach((b) => { if (b !== btn) b.classList.add("dim"); });
        const inp = $("#cfOtherInput");
        inp.value = "";
        setTimeout(() => inp.focus(), 60);
        const go = () => {
          saveAnswer(q.key, inp.value.trim() ? "Other: " + inp.value.trim() : "Other");
          advance();
        };
        $("#cfOtherGo").onclick = go;
        inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } };
        // Re-enable only the Other button so she can still change her mind.
        btn.disabled = false;
        return;
      }
      saveAnswer(q.key, label);
      setTimeout(advance, 420);        // a beat to see her choice glow
    }

    function advance() {
      step += 1;
      if (step < QUESTIONS.length) return renderStep();
      // All three answered — welcome her in.
      if (window.caloriaTrack) caloriaTrack("questionnaire_complete", {});
      $("#cfBody").classList.add("hidden");
      $(".cf-head").classList.add("hidden");
      $("#cfFinish").classList.remove("hidden");
      setTimeout(() => {
        location.href = "/club.html?m=" + encodeURIComponent(code) + "&joined=1";
      }, 1400);
    }

    renderStep();
  }

  /* ===================== success page ===================== */
  const successPage = $("#clubSuccess");
  if (successPage) initSuccess();

  async function initSuccess() {
    let code = (params.get("m") || "").trim().toUpperCase();
    if (!code) {
      try { code = localStorage.getItem(CODE_KEY) || ""; } catch (_) {}
    }
    if (!code) return showMissing();

    let st;
    try {
      st = await api("/api/club/status?code=" + encodeURIComponent(code));
    } catch (_) {
      return showMissing();
    }
    try { localStorage.setItem(CODE_KEY, code); } catch (_) {}
    render(st);
  }

  function showMissing() {
    $("#clubMissing").classList.remove("hidden");
  }

  function render(st) {
    successPage.classList.remove("hidden");
    $("#csBadgeNum").textContent = "№" + st.position;
    $("#csTotal").textContent = st.total.toLocaleString();
    $("#csReferrals").textContent = st.referral_count;
    $("#csLink").value = st.referral_link;
    countUp($("#csPosition"), st.position);

    const link = st.referral_link;
    const shareText = "I just became a Founding Member of Caloria Club 🤍 — a private wellness club for women, before public launch. Join me:";

    async function copyLink(doneMsg) {
      try {
        await navigator.clipboard.writeText(link);
      } catch (_) {
        const inp = $("#csLink");
        inp.focus(); inp.select();
        try { document.execCommand("copy"); } catch (_) {}
      }
      toast(doneMsg || "Link copied 🤍");
    }

    $("#csCopy").addEventListener("click", async () => {
      await copyLink();
      const b = $("#csCopy");
      b.textContent = "Copied ✓";
      setTimeout(() => { b.textContent = "Copy Link"; }, 1800);
    });
    // Instagram & TikTok have no web share-intent — the premium flow is:
    // copy the link, open the app, paste into a story / bio / DM.
    $("#csInstagram").addEventListener("click", async () => {
      await copyLink("Link copied — paste it in your story or DMs 🤍");
      window.open("https://www.instagram.com/", "_blank", "noopener");
    });
    $("#csTiktok").addEventListener("click", async () => {
      await copyLink("Link copied — paste it in your bio or comments 🤍");
      window.open("https://www.tiktok.com/", "_blank", "noopener");
    });
    $("#csShare").addEventListener("click", async () => {
      if (navigator.share) {
        try { await navigator.share({ title: "Caloria Club", text: shareText, url: link }); } catch (_) {}
      } else {
        await copyLink();
      }
    });
  }

  // Elegant count-up for the position number — arrival should feel earned.
  function countUp(el, target) {
    const dur = 1100, start = performance.now();
    const from = Math.max(1, target - Math.min(60, target - 1));
    function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = "#" + Math.round(from + (target - from) * eased).toLocaleString();
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
})();
