/* Winter Arc — UI layer. Renders the Home announcement card, the 30-day
   calendar, the challenge bottom-sheet, progress and badges. It is driven by a
   small bridge handed in from app.js (api, showView, toast, current user) so it
   reuses the app's real network + navigation + auth without duplicating them.
   The server is the source of truth for availability/completion/rewards. */
(function () {
  "use strict";
  var B = null;            // bridge from app.js
  var CONTENT = null;      // static challenge content
  var STATE = null;        // this user's progress
  var FLAGS = {};
  var $ = function (id) { return document.getElementById(id); };

  // ---- analytics (reuse whatever the app already has; never add a provider) ----
  function track(ev, props) {
    try {
      if (window.CaloriaPixel && typeof window.CaloriaPixel.track === "function") {
        window.CaloriaPixel.track(ev, props || {});
      } else if (typeof window.fbq === "function") {
        window.fbq("trackCustom", ev, props || {});
      }
    } catch (e) {}
    // Always leave a lightweight breadcrumb so events are measurable even before
    // an analytics provider is wired up (documented in the report).
    try { console.debug("[winter]", ev, props || {}); } catch (e) {}
  }

  function reduced() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return false; }
  }

  // ---- boot ----
  async function boot(bridge) {
    B = bridge; FLAGS = (bridge && bridge.flags) || {};
    if (!FLAGS.enabled) return;                       // whole layer off → no-op
    if (FLAGS.snow && window.CaloriaSnow) { try { window.CaloriaSnow.start(); } catch (e) {} }
    seasonalHeaderMascot();                            // swap the top-corner mascot
    wireStaticHandlers();
    if (FLAGS.show_card) renderCardLoading();          // loading state (no blank card)
    try {
      var r = await B.api("/api/winterarc");
      CONTENT = r.content; STATE = r.state; FLAGS = r.flags || FLAGS;
    } catch (e) { if (FLAGS.show_card) renderCardError(); return; }  // visible error, never silent-blank
    if (FLAGS.show_card) { renderCard(); track("winter_arc_card_viewed", { status: STATE.status }); }
    // The app dispatches this after a qualifying action (scan / coach) so the
    // Winter Arc reflects an auto-completion immediately, no page refresh.
    if (!window._waSyncWired) {
      window._waSyncWired = true;
      window.addEventListener("caloria:winter-sync", function () { syncState(); });
    }
    try { if (/[?&]winterarc=1/.test(location.search)) openCalendar(); } catch (e) {}
  }

  // The seasonal mascot replaces the small top-corner brand mascot while the
  // Winter Arc is live (original asset untouched; just the <img src>).
  function seasonalHeaderMascot() {
    try {
      document.querySelectorAll(".brand-mascot").forEach(function (img) {
        img.dataset.origSrc = img.getAttribute("src");
        img.src = "/assets/mascot-winter.png?v=4";
      });
    } catch (e) {}
  }

  function renderCardLoading() {
    var slot = $("winterArcCard"); if (!slot) return;
    slot.innerHTML = '<div class="wa-card"><div class="wa-card-body">' +
      '<span class="wa-eyebrow">Caloria Club Holiday Special</span>' +
      '<h3>Your Winter Arc ❄️</h3><p class="muted">Loading your Winter Arc…</p></div></div>';
    slot.classList.remove("hidden");
  }
  function renderCardError() {
    var slot = $("winterArcCard"); if (!slot) return;
    slot.innerHTML = '<div class="wa-card"><div class="wa-card-body">' +
      '<span class="wa-eyebrow">Caloria Club Holiday Special</span>' +
      '<h3>Your Winter Arc ❄️</h3><p class="muted">We couldn\'t load your Winter Arc just now.</p>' +
      '<button class="btn btn-primary" id="waRetry" type="button">Try again</button></div></div>';
    slot.classList.remove("hidden");
    var rt = $("waRetry"); if (rt) rt.addEventListener("click", function () { boot(B); });
  }

  // ---- Home announcement card ----
  function ctaLabel() {
    if (!STATE.started) return "START YOUR WINTER ARC";
    if (STATE.status === "completed") return "VIEW YOUR WINTER ARC";
    return "CONTINUE YOUR WINTER ARC";
  }
  function renderCard() {
    var slot = $("winterArcCard"); if (!slot) return;
    var pct = STATE.percent || 0;
    var progress = STATE.started
      ? '<div class="wa-mini-progress"><i style="width:' + pct + '%"></i></div>' +
        '<p style="margin:-6px 0 12px;font-size:12px" class="muted">' +
        STATE.completed_count + " / " + STATE.total + " days • " + pct + "% complete</p>"
      : '<p>Your 30-day journey to building feel-good habits starts here.</p>';
    slot.innerHTML =
      '<div class="wa-card">' +
        '<span class="wa-deco d1">❄️</span><span class="wa-deco d2">🎀</span>' +
        '<img class="wa-card-mascot" src="/assets/mascot-winter.png?v=4" ' +
          'alt="Caloria mascot in a Santa hat" loading="lazy" ' +
          'onerror="this.style.display=\'none\'">' +
        '<div class="wa-card-body">' +
          '<span class="wa-eyebrow">Caloria Club Holiday Special</span>' +
          '<h3>Your Winter Arc ❄️</h3>' +
          progress +
          '<button class="btn btn-primary" id="waCardCta" type="button">' + ctaLabel() + '</button>' +
        '</div>' +
      '</div>';
    slot.classList.remove("hidden");
    var cta = $("waCardCta");
    if (cta) cta.addEventListener("click", function () {
      openCalendar();
      // The Arc officially starts only when Day 1 is completed, so for a
      // not-yet-started user we open Day 1's challenge directly.
      if (!STATE.started) { track("winter_arc_started_intent", {}); openChallenge(1); }
    });
  }

  // ---- Calendar ----
  // Re-fetch authoritative state from the server (reflects auto-completions that
  // happened via a scan / coach message, even before this screen was opened).
  async function syncState() {
    try {
      var r = await B.api("/api/winterarc");
      STATE = r.state; CONTENT = r.content || CONTENT; FLAGS = r.flags || FLAGS;
      if (FLAGS.show_card) renderCard();
      var active = document.querySelector(".view.active");
      if (active && active.dataset.view === "winterarc") { renderProgress(); renderBadges(); renderCalendar(); }
    } catch (e) {}
  }

  async function openCalendar() {
    await syncState();                       // always open on the freshest state
    renderProgress(); renderBadges(); renderCalendar();
    B.showView && B.showView("winterarc");
    // Slightly richer snow on the calendar itself.
    if (FLAGS.snow && window.CaloriaSnow) { try { window.CaloriaSnow.setDensity(0.00014); } catch (e) {} }
    track("winter_arc_calendar_opened", { current_day: STATE.current_day });
  }
  function leaveCalendar() {
    if (FLAGS.snow && window.CaloriaSnow) { try { window.CaloriaSnow.setDensity(0.00008); } catch (e) {} }
    B.showView && B.showView("dashboard");
  }

  function renderProgress() {
    var el = $("waProgress"); if (!el) return;
    var pct = STATE.percent || 0;
    el.innerHTML =
      '<div class="wa-prog-top"><span class="wa-prog-num">' +
        (STATE.completed_count || 0) + ' / ' + STATE.total + ' days</span>' +
        '<span class="wa-prog-pct">' + pct + '%</span></div>' +
      '<div class="wa-bar"><i style="width:' + pct + '%"></i></div>';
    var tag = $("waTagline");
    if (tag && CONTENT) tag.textContent = CONTENT.tagline;
  }

  function renderBadges() {
    var el = $("waBadges"); if (!el || !CONTENT) return;
    var earned = STATE.earned_rewards || [];
    el.innerHTML = CONTENT.milestones.map(function (m) {
      var has = earned.indexOf(m.id) !== -1;
      return '<span class="wa-badge ' + (has ? "earned" : "locked") + '">' +
        m.emoji + ' ' + m.title + (has ? '' : ' 🔒') + '</span>';
    }).join("");
  }

  function tileState(day) {
    if ((STATE.completed_days || []).indexOf(day) !== -1) return "completed";
    if (day === STATE.current_day) return "today";
    if (day <= STATE.current_day) return "available";
    return "locked";
  }

  function renderCalendar() {
    var grid = $("waCalendar"); if (!grid) return;
    if (!CONTENT || !CONTENT.challenges || !CONTENT.challenges.length) {
      grid.innerHTML = '<p class="muted" style="grid-column:1/-1;text-align:center;padding:24px">' +
        "Couldn't load the challenges just now — please try again shortly.</p>";
      return;
    }
    grid.innerHTML = "";
    CONTENT.challenges.forEach(function (ch) {
      var st = tileState(ch.day);
      var finale = ch.day === CONTENT.days;
      // Every day is a real button and is clickable — a locked day opens its
      // details in a read-only state that explains when it unlocks (rather than
      // doing nothing on tap).
      var tile = document.createElement("button");
      tile.type = "button";
      tile.className = "wa-tile " + st + (finale ? " finale" : "");
      tile.setAttribute("role", "listitem");
      tile.setAttribute("aria-label",
        "Day " + ch.day + " — " + ch.title + " — " +
        (st === "completed" ? "completed" : st === "locked" ? "locked, tap for details" : "available"));
      if (finale) {
        tile.innerHTML =
          '<span class="wa-num">30</span>' +
          '<div class="wa-finale-copy"><b>Winter Arc Complete</b>' +
          '<small>' + (st === "completed" ? "You did it 🎁" : "The grand finale") + '</small></div>' +
          '<span class="wa-sticker">🎁</span>' +
          '<span class="wa-state-ic"></span>';
      } else {
        tile.innerHTML =
          '<span class="wa-num">' + ch.day + '</span>' +
          '<span class="wa-sticker">' + (ch.sticker || "❄️") + '</span>' +
          '<span class="wa-state-ic"></span>';
      }
      tile.addEventListener("click", function () { openChallenge(ch.day); });   // ALL days clickable
      grid.appendChild(tile);
    });
    var back = $("waBack"); // ensure wired (idempotent via wireStaticHandlers)
    if (back && !back._wired) { back._wired = true; back.addEventListener("click", leaveCalendar); }
  }

  // ---- Challenge sheet ----
  var activeDay = null;
  function challengeFor(day) {
    return (CONTENT.challenges || []).filter(function (c) { return c.day === day; })[0];
  }
  function openChallenge(day) {
    var ch = challengeFor(day); if (!ch) return;
    activeDay = day;
    var done = (STATE.completed_days || []).indexOf(day) !== -1;
    var locked = !done && day > (STATE.current_day || 1);
    var dd = (ch.day < 10 ? "0" : "") + ch.day;       // DAY 01, DAY 02 …
    $("waChDay").textContent = done ? ("DAY " + dd + " COMPLETED ✓")
                             : locked ? ("DAY " + dd + " · LOCKED 🔒") : ("DAY " + dd);
    $("waChTitle").textContent = ch.title;             // real title + full description,
    $("waChDesc").textContent = ch.desc;               // shown for EVERY day incl. locked
    $("waChSticker").textContent = ch.sticker || "❄️";
    $("waChPurpose").textContent = locked ? "" : "Little by little, you're building your Winter Arc ✨";
    var feat = $("waChFeature");
    if (ch.feature && !locked) {
      feat.style.display = ""; feat.textContent = ch.action || "Open";
      feat.onclick = function () { closeChallenge(); B.showView && B.showView(ch.feature); };
    } else { feat.style.display = "none"; }
    var cbtn = $("waChComplete"), dmsg = $("waChDone");
    if (done) {
      cbtn.style.display = "none"; dmsg.classList.remove("hidden");
      dmsg.textContent = "Completed — one more day of showing up for yourself 💗";
    } else if (locked) {
      // Clearly explain WHY it's locked instead of a dead tap.
      cbtn.style.display = "none"; dmsg.classList.remove("hidden");
      dmsg.textContent = STATE.started
        ? "🔒 Unlocks soon — one new day opens each day after you start. You can catch up on earlier days anytime."
        : "🔒 Complete Day 1 to begin your Winter Arc — then a new day unlocks each day.";
    } else {
      cbtn.style.display = ""; cbtn.disabled = false; cbtn.textContent = "MARK AS COMPLETE";
      dmsg.classList.add("hidden");
      cbtn.onclick = function () { completeDay(day); };
    }
    var m = $("waChallengeModal");
    m.classList.add("show"); m.setAttribute("aria-hidden", "false");
    track("winter_arc_challenge_opened", { day: day });
  }
  function closeChallenge() {
    var m = $("waChallengeModal");
    m.classList.remove("show"); m.setAttribute("aria-hidden", "true"); activeDay = null;
  }

  async function completeDay(day) {
    var cbtn = $("waChComplete");
    if (cbtn) cbtn.disabled = true;                   // prevent double-submit
    try {
      var r = await B.api("/api/winterarc/complete", { method: "POST", body: { day: day } });
      STATE = r.state;
      track("winter_arc_challenge_completed", { day: day });
      (r.new_rewards || []).forEach(function (rid) { track("winter_arc_reward_unlocked", { reward: rid }); });
      if (STATE.status === "completed") track("winter_arc_completed", {});
      // Update UI immediately.
      renderCard(); renderProgress(); renderBadges(); renderCalendar();
      markJustDone(day);
      if ((r.new_rewards || []).length) confetti();
      var dmsg = $("waChDone");
      if (cbtn) cbtn.style.display = "none";
      if (dmsg) { dmsg.classList.remove("hidden"); dmsg.textContent = "Nice — one more day of showing up for yourself 💗"; }
      setTimeout(closeChallenge, 900);
    } catch (e) {
      if (cbtn) { cbtn.disabled = false; }
      B.toast && B.toast((e && e.data && e.data.error) || "Couldn't save — try again");
    }
  }

  function markJustDone(day) {
    try {
      var tiles = document.querySelectorAll("#waCalendar .wa-tile");
      // tiles render in day order
      var t = tiles[day - 1];
      if (t) { t.classList.add("just-done"); }
    } catch (e) {}
  }

  function confetti() {
    if (reduced()) return;
    var wrap = document.createElement("div"); wrap.className = "wa-confetti";
    var colors = ["#f24d8c", "#7fe3da", "#e8384f", "#ffd7e7", "#2bb5c9"];
    for (var i = 0; i < 18; i++) {
      var bit = document.createElement("i");
      bit.style.left = Math.random() * 100 + "%";
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = (Math.random() * 0.25) + "s";
      bit.style.transform = "translateY(0) rotate(" + (Math.random() * 360) + "deg)";
      wrap.appendChild(bit);
    }
    document.body.appendChild(wrap);
    setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 1900);
  }

  function wireStaticHandlers() {
    var close = $("waChClose"); if (close && !close._wired) { close._wired = true; close.addEventListener("click", closeChallenge); }
    var m = $("waChallengeModal");
    if (m && !m._wired) { m._wired = true; m.addEventListener("click", function (e) { if (e.target === m) closeChallenge(); }); }
    var back = $("waBack"); if (back && !back._wired) { back._wired = true; back.addEventListener("click", leaveCalendar); }
  }

  window.CaloriaWinter = { boot: boot, open: openCalendar };
})();
