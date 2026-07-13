/* Caloria Admin — application logic. Lives in a file (not inline)
   because the production CSP is script-src 'self'. */
  const API = window.CALORIA_API || `http://${location.hostname || "localhost"}:8787`;
  const TOKEN_KEY = "caloria.admin.token";
  let token = localStorage.getItem(TOKEN_KEY) || null;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  async function api(path, { method = "GET", body } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = {}; try { data = await res.json(); } catch (_) {}
    if (!res.ok) { const e = new Error(data.error || `Error ${res.status}`); e.status = res.status; throw e; }
    return data;
  }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  const money = (n) => "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const planTag = (p) => `<span class="tag ${p === "premium" ? "premium" : "free"}">${esc(p)}</span>`;
  const yesno = (b, good) => `<span class="tag ${b ? (good||"ok") : "bad"}">${b ? "Yes" : "No"}</span>`;
  const barCls = (p) => p >= 100 ? "bad" : p >= 75 ? "warn" : "";
  function usageCell(v, lim) { const p = lim ? Math.round(v / lim * 100) : 0;
    return `${v}/${lim} <span class="muted">${p}%</span><div class="bar"><i class="${barCls(p)}" style="width:${Math.min(100,p)}%"></i></div>`; }

  /* ---------------- Business ---------------- */
  async function loadBusiness() {
    const o = await api("/api/admin/overview");
    $("#bizKpis").innerHTML = [
      ["Total members", o.users, ""],
      ["Paying members", o.paying, ""],
      ["Monthly revenue (MRR)", money(o.mrr), "big"],
      ["Conversion rate", o.conversion_rate_pct + "%", ""],
      ["New this month", o.new_users_this_month, ""],
    ].map(([k, v, c]) => `<div class="kpi"><b class="${c}">${v}</b><span>${k}</span></div>`).join("");
    $("#bizActive").innerHTML = o.most_active.length
      ? `<table><thead><tr><th>Member</th><th>Scans</th><th>Coach msgs</th></tr></thead><tbody>` +
        o.most_active.map((u) => `<tr><td class="email">${esc(u.email)}</td><td>${u.scans}</td><td>${u.coach}</td></tr>`).join("") + `</tbody></table>`
      : `<div class="muted">No activity yet this month.</div>`;
    $("#bizApproach").innerHTML = o.approaching_limit.length
      ? `<table><thead><tr><th>Member</th><th>Scans</th><th>Coach</th></tr></thead><tbody>` +
        o.approaching_limit.map((u) => `<tr><td class="email">${esc(u.email)}</td><td>${usageCell(u.scans,u.scan_limit)}</td><td>${usageCell(u.coach,u.coach_limit)}</td></tr>`).join("") + `</tbody></table>`
      : `<div class="muted">Nobody is close to a limit. 👍</div>`;
  }

  /* ---------------- Caloria Club (founding members) ---------------- */
  const fmtDate = (s) => esc(String(s || "").replace("T", " ").slice(0, 16));
  async function loadClubHealth() {
    let h;
    try { h = await api("/api/club/admin/health"); }
    catch (e) { h = { api: false, db: false, email_configured: false, members: "?", emails_sent_today: "?" }; }
    const light = (ok, on, off) => `<span class="tag ${ok ? "ok" : "bad"}">${ok ? on : off}</span>`;
    $("#clubHealth").innerHTML = [
      ["Backend / API", light(h.api, "Online", "UNREACHABLE")],
      ["Database", light(h.db, "Healthy · read/write OK", "ERROR")],
      ["Email service (Resend)", light(h.email_configured, "Configured", "NOT CONFIGURED")],
      ["Members stored", `<b>${h.members}</b>`],
      ["Emails sent today", `<b>${h.emails_sent_today}</b> <span class="muted">/ ~100 free-plan limit</span>`],
    ].map(([k, v]) => `<div class="kpi"><b style="font-size:16px">${v}</b><span>${k}</span></div>`).join("");
    $("#clubHealthTime").textContent = "· checked " + new Date().toLocaleTimeString();
  }
  $("#clubHealthRefresh").addEventListener("click", loadClubHealth);

  async function loadClub() {
    loadClubHealth();
    const o = await api("/api/club/admin/overview");
    $("#clubKpis").innerHTML = [
      ["Total Founding Members", o.total, "big"],
      ["New today", o.new_today, ""],
      ["New this week", o.new_7d, ""],
      ["Referral signups", `${o.referred} (${o.referred_pct}%)`, ""],
      ["Direct signups", o.direct, ""],
      ["Avg referrals / member", o.avg_referrals, ""],
      ["Welcome emails sent", o.welcome_sent, ""],
      ["Pending welcome emails", o.welcome_missing || 0, o.welcome_missing ? "big" : ""],
      ["Emails sent today", `${o.emails_sent_today} / ~100`, ""],
      ["Unsubscribed", o.unsubscribed, ""],
      ["Top referrer", o.top_referrer ? `${o.top_referrer.referrals} — ${esc(o.top_referrer.email)}` : "—", ""],
    ].map(([k, v, c]) => `<div class="kpi"><b class="${c}" style="font-size:${String(v).length > 14 ? 15 : ""}px">${v}</b><span>${k}</span></div>`).join("");
    const g = o.growth || [], gmax = Math.max(1, ...g.map((x) => x.n));
    $("#clubGrowth").innerHTML = g.map((x) => `<div class="b" style="height:${Math.max(4, Math.round(x.n / gmax * 100))}%"><span>${x.n || ""}</span></div>`).join("");
    $("#clubGrowthLbls").innerHTML = g.map((x) => `<div class="lbl" style="flex:1">${x.day.slice(5)}</div>`).join("");
    const rw = $("#clubResendWelcomes");
    rw.style.display = o.welcome_missing ? "" : "none";
    rw.textContent = `Resend ${o.welcome_missing} missing welcome letter${o.welcome_missing === 1 ? "" : "s"}`;
    const ans = o.answers || {};
    const noAns = '<div class="muted">No answers yet.</div>';
    $("#clubAnsGoal").innerHTML = (ans.goal || []).length ? bars(ans.goal, (x) => x.answer, "count", (v) => v) : noAns;
    $("#clubAnsStruggle").innerHTML = (ans.struggle || []).length ? bars(ans.struggle, (x) => x.answer, "count", (v) => v) : noAns;
    $("#clubAnsExcited").innerHTML = (ans.excited || []).length ? bars(ans.excited, (x) => x.answer, "count", (v) => v) : noAns;
    await Promise.all([loadClubMembers(), loadClubBoard(), loadClubUpdates()]);
  }
  function clubFilterQs(extra = "") {
    const p = new URLSearchParams();
    const q = $("#clubSearch").value.trim();
    if (q) p.set("q", q);
    if ($("#clubSince").value !== "0") p.set("since", $("#clubSince").value);
    if (+$("#clubMinRef").value > 0) p.set("min_ref", $("#clubMinRef").value);
    if ($("#clubInvited").checked) p.set("invited", "1");
    if (extra) p.set("limit", extra);
    const s = p.toString();
    return s ? "?" + s : "";
  }
  let clubMembersData = [], clubSort = { key: "id", dir: -1 };
  async function loadClubMembers() {
    const d = await api("/api/club/admin/members" + clubFilterQs());
    clubMembersData = d.members;
    renderClubMembers();
  }
  function renderClubMembers() {
    const ansCell = (v) => v ? `<td class="email" style="max-width:180px;white-space:normal">${esc(v)}</td>` : '<td><span class="muted">—</span></td>';
    const rows = [...clubMembersData].sort((a, b) => {
      const k = clubSort.key;
      const x = k === "created_at" ? a.created_at : a[k], y = k === "created_at" ? b.created_at : b[k];
      if (typeof x === "string" || typeof y === "string") { const sx = String(x||""), sy = String(y||""); return sx < sy ? -clubSort.dir : sx > sy ? clubSort.dir : 0; }
      return ((x||0) - (y||0)) * clubSort.dir;
    });
    const arr = (k) => clubSort.key === k ? (clubSort.dir > 0 ? " ▲" : " ▼") : "";
    $("#clubMembers").innerHTML = rows.length
      ? `<table><thead><tr>
          <th class="sortable" data-ck="position">#${arr("position")}</th><th>Email</th>
          <th>Goal</th><th>Struggle</th><th>Excited about</th><th>Referral code</th>
          <th class="sortable" data-ck="referral_count">Referrals${arr("referral_count")}</th>
          <th>Invited by</th><th>Welcome email</th><th>Emails</th>
          <th class="sortable" data-ck="created_at">Joined${arr("created_at")}</th></tr></thead><tbody>` +
        rows.map((m) => `<tr>
          <td>№${m.position}</td><td class="email">${esc(m.email)}</td>
          ${ansCell(m.goal)}${ansCell(m.struggle)}${ansCell(m.excited)}
          <td><span class="tag premium">${esc(m.referral_code)}</span></td>
          <td>${m.referral_count}</td><td>${m.referred_by ? `<span class="tag ok">${esc(m.referred_by)}</span>` : '<span class="muted">—</span>'}</td>
          <td>${yesno(m.welcome_sent)}</td>
          <td>${m.unsubscribed ? '<span class="tag bad">Unsubscribed</span>' : '<span class="tag ok">Subscribed</span>'}</td>
          <td>${fmtDate(m.created_at)}</td></tr>`).join("") + `</tbody></table>`
      : `<div class="muted">No members match those filters.</div>`;
    $$("#clubMembers th.sortable").forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.ck;
      clubSort = { key: k, dir: clubSort.key === k ? -clubSort.dir : (k === "position" ? 1 : -1) };
      renderClubMembers();
    }));
  }
  async function loadClubBoard() {
    const d = await api("/api/club/admin/leaderboard");
    const rows = d.leaderboard.filter((m) => m.referral_count > 0);
    $("#clubBoard").innerHTML = rows.length
      ? `<table><thead><tr><th>Rank</th><th>Email</th><th>Referrals</th><th>Code</th><th>Joined</th></tr></thead><tbody>` +
        rows.map((m) => `<tr><td>${m.rank <= 3 ? ["🥇","🥈","🥉"][m.rank - 1] : m.rank}</td>
          <td class="email">${esc(m.email)}</td><td><b>${m.referral_count}</b></td>
          <td><span class="tag premium">${esc(m.referral_code)}</span></td><td>${fmtDate(m.created_at)}</td></tr>`).join("") + `</tbody></table>`
      : `<div class="muted">No referrals yet — the leaderboard fills in as members invite friends.</div>`;
  }
  async function loadClubUpdates() {
    const d = await api("/api/club/admin/updates");
    $("#cuHistory").innerHTML = d.updates.length
      ? `<table><thead><tr><th>When</th><th>Subject</th><th>Audience</th><th>Delivered</th><th>Failed</th><th>Status</th><th></th></tr></thead><tbody>` +
        d.updates.map((u) => `<tr><td>${fmtDate(u.created_at)}</td><td class="email">${esc(u.subject)}${u.campaign_label ? ` <span class="tag premium">${esc(u.campaign_label)}</span>` : ""}</td>
          <td>${esc(u.audience_label || u.audience || "All members")}</td>
          <td>${u.sent}/${u.total}</td><td>${u.failed || 0}</td>
          <td><span class="tag ${u.status === "done" ? "ok" : u.status === "interrupted" ? "bad" : "warn"}">${esc(u.status)}</span></td>
          <td>${u.status === "interrupted" ? `<button class="btn sm" data-resume="${u.id}">Resume</button>` : ""}</td></tr>`).join("") + `</tbody></table>`
      : `<div class="muted">No founder updates sent yet.</div>`;
    $$("#cuHistory [data-resume]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Resume this campaign? It continues where it stopped — nobody receives it twice.")) return;
      try { await api("/api/club/admin/resume-update", { method: "POST", body: { id: +b.dataset.resume } }); loadClubUpdates(); }
      catch (e) { $("#cuMsg").innerHTML = `<span class="msg err">${esc(e.message)}</span>`; }
    }));
    // While a broadcast is running, keep the progress live.
    clearTimeout(loadClubUpdates._t);
    if (d.updates.some((u) => u.status === "sending")) loadClubUpdates._t = setTimeout(loadClubUpdates, 3000);
  }
  // ---- drafts: autosaved locally as you type, restored on load ----
  const DRAFT_KEY = "caloria.admin.club.draft";
  function saveDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      subject: $("#cuSubject").value, message: $("#cuMessage").value,
      audience: $("#cuAudience").value, at: Date.now(),
    }));
    $("#cuDraftNote").textContent = "Draft saved " + new Date().toLocaleTimeString();
  }
  function restoreDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (!d || (!d.subject && !d.message)) return;
      $("#cuSubject").value = d.subject || ""; $("#cuMessage").value = d.message || "";
      if (d.audience) $("#cuAudience").value = d.audience;
      $("#cuDraftNote").textContent = "Draft restored from " + new Date(d.at).toLocaleString();
    } catch (_) {}
  }
  let draftTimer = null;
  ["cuSubject", "cuMessage", "cuAudience"].forEach((id) => $("#" + id).addEventListener("input", () => {
    clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 600);
  }));
  restoreDraft();

  // ---- preview (rendered exactly as members receive it) ----
  async function showPreview() {
    const subject = $("#cuSubject").value.trim(), message = $("#cuMessage").value.trim();
    if (!subject || !message) { $("#cuMsg").innerHTML = `<span class="msg err">Add a subject and a message first.</span>`; return; }
    try {
      const r = await api("/api/club/admin/preview-update", { method: "POST", body: { subject, message } });
      $("#cuPreviewWrap").classList.remove("hidden");
      $("#cuPreviewSubject").textContent = "Subject: " + r.subject;
      $("#cuPreviewFrame").srcdoc = r.html;
      $("#cuMsg").textContent = "";
    } catch (e) { $("#cuMsg").innerHTML = `<span class="msg err">${esc(e.message)}</span>`; }
  }
  $("#cuPreview").addEventListener("click", showPreview);
  $("#cuPvDesktop").addEventListener("click", () => { $("#cuPreviewFrame").style.maxWidth = "640px"; });
  $("#cuPvMobile").addEventListener("click", () => { $("#cuPreviewFrame").style.maxWidth = "375px"; });
  $("#cuPvClose").addEventListener("click", () => $("#cuPreviewWrap").classList.add("hidden"));

  // ---- test send (to the signed-in admin only) ----
  $("#cuTest").addEventListener("click", async () => {
    const subject = $("#cuSubject").value.trim(), message = $("#cuMessage").value.trim();
    if (!subject || !message) { $("#cuMsg").innerHTML = `<span class="msg err">Add a subject and a message first.</span>`; return; }
    $("#cuTest").disabled = true;
    try {
      const r = await api("/api/club/admin/test-update", { method: "POST", body: { subject, message } });
      $("#cuMsg").innerHTML = `<span class="msg ok">Test sent to ${esc(r.test_sent_to)} — check your inbox.</span>`;
    } catch (e) { $("#cuMsg").innerHTML = `<span class="msg err">${esc(e.message)}</span>`; }
    $("#cuTest").disabled = false;
  });
  async function clubExportCsv() {
    const d = await api("/api/club/admin/members" + clubFilterQs("10000"));  // respects active filters
    const cols = ["position", "email", "goal", "struggle", "excited", "referral_code", "referral_count", "referred_by", "welcome_sent", "unsubscribed", "created_at"];
    const esc2 = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lines = [cols.join(",")].concat(d.members.map((m) => cols.map((c) => esc2(m[c])).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `caloria-club-members-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  }
  $("#clubSearchBtn").addEventListener("click", () => loadClubMembers());
  $("#clubSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") loadClubMembers(); });
  $("#clubSince").addEventListener("change", () => loadClubMembers());
  $("#clubInvited").addEventListener("change", () => loadClubMembers());
  $("#clubCsv").addEventListener("click", clubExportCsv);
  $("#clubCopyEmails").addEventListener("click", async () => {
    // Copies the emails of the CURRENTLY FILTERED list — great for quick pastes.
    if (!clubMembersData.length) { $("#clubMembersMsg").innerHTML = `<span class="msg err">Nothing to copy — adjust the filters.</span>`; return; }
    const list = clubMembersData.map((m) => m.email).join(", ");
    try { await navigator.clipboard.writeText(list); }
    catch (_) { const ta = document.createElement("textarea"); ta.value = list; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
    $("#clubMembersMsg").innerHTML = `<span class="msg ok">Copied ${clubMembersData.length} email${clubMembersData.length === 1 ? "" : "s"} to the clipboard.</span>`;
  });
  $("#clubResendWelcomes").addEventListener("click", async () => {
    if (!confirm("Resend welcome letters to every member who never received one? Members who already got theirs are never re-sent.")) return;
    try {
      const r = await api("/api/club/admin/resend-welcomes", { method: "POST", body: {} });
      $("#clubMembersMsg").innerHTML = `<span class="msg ok">Resending ${r.queued} welcome letter${r.queued === 1 ? "" : "s"} in the background — refresh in a minute.</span>`;
    } catch (e) { $("#clubMembersMsg").innerHTML = `<span class="msg err">${esc(e.message)}</span>`; }
  });
  $("#cuSend").addEventListener("click", async () => {
    const subject = $("#cuSubject").value.trim(), message = $("#cuMessage").value.trim();
    const audience = $("#cuAudience").value;
    $("#cuMsg").textContent = "";
    if (!subject || !message) { $("#cuMsg").innerHTML = `<span class="msg err">Add a subject and a message first.</span>`; return; }
    $("#cuSend").disabled = true;
    try {
      // Live recipient count for an informed confirmation — never a blind send.
      const a = await api("/api/club/admin/audience-count?audience=" + encodeURIComponent(audience));
      if (!a.count) { $("#cuMsg").innerHTML = `<span class="msg err">“${esc(a.label)}” has no members yet.</span>`; $("#cuSend").disabled = false; return; }
      if (!confirm(`Are you sure you want to send “${subject}” to ${a.count.toLocaleString()} member${a.count === 1 ? "" : "s"} (${a.label})?\n\nTip: use “Send test to me” first.`)) {
        $("#cuSend").disabled = false; return;
      }
      const r = await api("/api/club/admin/send-update", { method: "POST", body: { subject, message, audience } });
      $("#cuMsg").innerHTML = `<span class="msg ok">Sending to ${r.total.toLocaleString()} members — live progress below.</span>`;
      $("#cuSubject").value = ""; $("#cuMessage").value = "";
      localStorage.removeItem(DRAFT_KEY); $("#cuDraftNote").textContent = "";
      $("#cuPreviewWrap").classList.add("hidden");
      loadClubUpdates();
    } catch (e) { $("#cuMsg").innerHTML = `<span class="msg err">${esc(e.message)}</span>`; }
    $("#cuSend").disabled = false;
  });

  // ---- pre-built launch campaigns (Tomorrow / Early Access) ----
  async function sendCampaign(kind, label, btn) {
    $("#campMsg").textContent = "";
    btn.disabled = true;
    try {
      const c = await api("/api/club/admin/campaign-count?kind=" + encodeURIComponent(kind));
      if (!c.recipients) { $("#campMsg").innerHTML = `<span class="msg err">No subscribed members to send to yet.</span>`; btn.disabled = false; return; }
      const skippedNote = c.skipped ? `\n(${c.skipped} unsubscribed member${c.skipped === 1 ? "" : "s"} will be skipped.)` : "";
      if (!confirm(`Send the “${label}” email to ${c.recipients.toLocaleString()} member${c.recipients === 1 ? "" : "s"}?${skippedNote}\n\nThis cannot be undone.`)) { btn.disabled = false; return; }
      const r = await api("/api/club/admin/send-campaign", { method: "POST", body: { kind } });
      $("#campMsg").innerHTML = `<span class="msg ok">Sending “${esc(label)}” to ${r.total.toLocaleString()} members — live delivery report below (skipped ${r.skipped}).</span>`;
      loadClubUpdates();
    } catch (e) { $("#campMsg").innerHTML = `<span class="msg err">${esc(e.message)}</span>`; }
    btn.disabled = false;
  }
  $("#campTomorrow").addEventListener("click", (e) => sendCampaign("tomorrow", "Tomorrow", e.currentTarget));
  $("#campEarly").addEventListener("click", (e) => sendCampaign("early_access", "Early Access", e.currentTarget));

  /* ---- Follow-up Early Access campaign: Send Test / Preview / Send to Waitlist ---- */
  $("#campFollowupSend").addEventListener("click", (e) => sendCampaign("followup", "Follow-up Early Access", e.currentTarget));
  $("#campFollowupTest").addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true; $("#campMsg").textContent = "";
    try {
      const r = await api("/api/club/admin/test-campaign", { method: "POST", body: { kind: "followup" } });
      $("#campMsg").innerHTML = `<span class="msg ok">Test sent to ${esc(r.test_sent_to)} — check your inbox (and Spam/Promotions).</span>`;
    } catch (err) { $("#campMsg").innerHTML = `<span class="msg err">${esc(err.message)}</span>`; }
    btn.disabled = false;
  });
  async function previewFollowup() {
    $("#campMsg").textContent = "";
    try {
      const r = await api("/api/club/admin/preview-campaign", { method: "POST", body: { kind: "followup" } });
      $("#campFollowupSubject").textContent = "Subject: " + r.subject;
      $("#campFollowupFrame").srcdoc = r.html;
      $("#campFollowupPreviewWrap").classList.remove("hidden");
    } catch (err) { $("#campMsg").innerHTML = `<span class="msg err">${esc(err.message)}</span>`; }
  }
  $("#campFollowupPreview").addEventListener("click", previewFollowup);
  $("#campFollowupPvDesktop").addEventListener("click", () => { $("#campFollowupFrame").style.maxWidth = "640px"; });
  $("#campFollowupPvMobile").addEventListener("click", () => { $("#campFollowupFrame").style.maxWidth = "375px"; });
  $("#campFollowupPvClose").addEventListener("click", () => $("#campFollowupPreviewWrap").classList.add("hidden"));

  /* ---------------- Users ---------------- */
  async function loadUsers(q = "") {
    const d = await api("/api/admin/users" + (q ? "?q=" + encodeURIComponent(q) : ""));
    $("#userList").innerHTML = d.users.length
      ? `<table><thead><tr><th>Email</th><th>Name</th><th>Plan</th><th>Verified</th><th>Active</th><th>Status</th><th>Scans</th><th></th></tr></thead><tbody>` +
        d.users.map((u) => `<tr>
          <td class="email">${esc(u.email)}</td><td>${esc(u.name)}</td><td>${planTag(u.plan)}</td>
          <td>${yesno(u.verified)}</td><td>${yesno(u.active)}</td><td>${esc(u.subscription_status)}</td><td>${u.scans}</td>
          <td><button class="btn ghost sm" data-view="${esc(u.email)}">View</button></td></tr>`).join("") + `</tbody></table>`
      : `<div class="muted">No matching users.</div>`;
    $$('#userList [data-view]').forEach((b) => b.addEventListener("click", () => showUser(b.dataset.view)));
  }
  async function showUser(email) {
    let u; try { u = await api("/api/admin/user?email=" + encodeURIComponent(email)); } catch (e) { return; }
    $("#userDetailCard").classList.remove("hidden");
    const issues = u.issues.length ? u.issues.map((i) => `<span class="tag ${i.includes("limit")||i.includes("deactiv")||i.includes("failed")?"bad":"warn"}">${esc(i)}</span>`).join(" ") : `<span class="tag ok">No issues</span>`;
    const hist = u.billing_history.length
      ? `<table><thead><tr><th>When</th><th>Event</th><th>Status</th></tr></thead><tbody>` +
        u.billing_history.map((e) => `<tr><td>${esc((e.created_at||"").slice(0,16))}</td><td>${esc(e.type)}</td><td>${esc(e.status||"")}</td></tr>`).join("") + `</tbody></table>`
      : `<span class="muted">No billing events.</span>`;
    const pr = u.profile || {};
    $("#userDetail").innerHTML = `
      <dl>
        <dt>Email</dt><dd>${esc(u.email)} ${yesno(u.verified)}</dd>
        <dt>Name</dt><dd>${esc(u.name) || "—"}</dd>
        <dt>Joined</dt><dd>${esc(u.joined)}</dd>
        <dt>Plan</dt><dd>${planTag(u.plan)} · ${esc(u.subscription_status)}${u.plan_interval ? ` · <span class="tag ok">${esc(u.plan_interval)}</span>` : ""}</dd>
        <dt>Purchased</dt><dd>${u.subscribed_at ? esc(u.subscribed_at.slice(0,10)) : '<span class="muted">—</span>'}</dd>
        <dt>Stripe customer</dt><dd>${u.stripe_customer ? `<code>${esc(u.stripe_customer)}</code>` : '<span class="muted">—</span>'}</dd>
        <dt>Stripe subscription</dt><dd>${u.stripe_subscription ? `<code>${esc(u.stripe_subscription)}</code>` : '<span class="muted">—</span>'}</dd>
        <dt>Founding</dt><dd>${u.founding_member ? '<span class="tag premium">👑 Founding Member</span>' : '<span class="muted">—</span>'}</dd>
        <dt>Active</dt><dd>${yesno(u.active)}</dd>
        <dt>Goal</dt><dd>${esc(pr.goal || pr.physique || "—")}</dd>
        <dt>Scans (month)</dt><dd>${usageCell(u.usage.scans, u.usage.scan_limit)}</dd>
        <dt>Coach (month)</dt><dd>${usageCell(u.usage.coach, u.usage.coach_limit)}</dd>
        <dt>Saved meals</dt><dd>${u.usage.saved_meals} (last: ${esc((u.usage.last_meal||"—")).slice(0,16)})</dd>
        <dt>Issues</dt><dd>${issues}</dd>
        <dt>Billing</dt><dd>${hist}</dd>
      </dl>
      <div class="pillrow" style="margin-top:14px">
        ${u.active ? `<button class="btn danger sm" data-act="deactivate">Deactivate</button>` : `<button class="btn good sm" data-act="activate">Reactivate</button>`}
        ${u.plan === "premium" ? `<button class="btn ghost sm" data-act="revoke_premium">Revoke premium</button>` : `<button class="btn good sm" data-act="grant_premium">Grant premium</button>`}
        ${u.founding_member ? `<button class="btn ghost sm" data-act="revoke_founding">Revoke founding</button>` : `<button class="btn good sm" data-act="grant_founding">Grant founding 👑</button>`}
        <button class="btn danger sm" data-act="delete" style="margin-left:auto">Delete user…</button>
      </div>`;
    $$('#userDetail [data-act]').forEach((b) => b.addEventListener("click", async () => {
      const act = b.dataset.act;
      if (act === "delete" && !confirm(`Permanently delete ${u.email}? This removes their account, meals and community activity. This cannot be undone.`)) return;
      try { const r = await api("/api/admin/user/action", { method: "POST", body: { action: act, email: u.email } });
        if (r && r.deleted) { $("#userMsg").innerHTML = `<span class="msg ok">User deleted.</span>`; $("#userDetailCard").classList.add("hidden"); loadUsers($("#userSearch").value.trim()); return; }
        $("#userMsg").innerHTML = `<span class="msg ok">Done.</span>`; showUser(u.email); loadUsers($("#userSearch").value.trim()); }
      catch (e) { $("#userMsg").innerHTML = `<span class="msg err">${esc(e.message)}</span>`; }
    }));
  }
  $("#userSearchBtn").addEventListener("click", () => loadUsers($("#userSearch").value.trim()));
  $("#userSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") loadUsers($("#userSearch").value.trim()); });

  /* ---------------- Subscriptions ---------------- */
  function subTable(rows, cols) {
    if (!rows.length) return `<div class="muted">None.</div>`;
    return `<table><thead><tr>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>` +
      rows.map((r) => `<tr>${cols.map((c) => `<td class="email">${esc(r[c[1]] || "")}</td>`).join("")}</tr>`).join("") + `</tbody></table>`;
  }
  async function loadSubs() {
    const s = await api("/api/admin/subscriptions");
    $("#subsActive").innerHTML = subTable(s.active, [["Email","email"],["Name","name"],["Plan","interval"],["Status","status"],["Purchased","purchased"]]);
    $("#subsPastDue").innerHTML = subTable(s.past_due, [["Email","email"],["Name","name"],["Plan","interval"],["Purchased","purchased"]]);
    $("#subsCanceled").innerHTML = subTable(s.canceled, [["Email","email"],["Name","name"],["Plan","interval"],["Since","since"]]);
    $("#subsFailed").innerHTML = subTable(s.failed_payments, [["Email","email"],["When","created_at"]]);
  }

  /* ---------------- Analytics ---------------- */
  async function loadAnalytics() {
    const a = await api("/api/admin/analytics");
    $("#anPeriod").textContent = a.period;
    $("#anKpis").innerHTML = [
      ["Total users", a.total_users], ["Verified", `${a.verified_users} (${a.verified_pct}%)`],
      ["Paying subscribers", a.paying_subscribers], ["Conversion", a.conversion_rate_pct + "%"],
      ["Monthly subs", a.monthly_subscribers], ["Yearly subs", a.yearly_subscribers],
      ["MRR", money(a.mrr)], ["ARR (est.)", money(a.arr)],
      ["New users (mo)", a.new_users_this_month], ["New subs (mo)", a.new_subscribers_this_month],
      ["Retention", a.retention_pct + "%"], ["Churn", a.churn_pct + "%"],
      ["Past due", a.past_due], ["Scans this month", a.usage_this_month.scans],
    ].map(([k, v]) => `<div class="kpi"><b>${v}</b><span>${k}</span></div>`).join("");
    const g = a.growth, max = Math.max(1, ...g.map((x) => x.new_users));
    $("#anGrowth").innerHTML = g.map((x) => `<div class="b" style="height:${Math.round(x.new_users / max * 100)}%"><span>${x.new_users}</span></div>`).join("");
    $("#anGrowthLbls").innerHTML = g.map((x) => `<div class="lbl" style="flex:1">${x.month.slice(5)}</div>`).join("");
  }

  /* ---------------- Community moderation ---------------- */
  async function loadCommunity() {
    const d = await api("/api/admin/community");
    $("#commKpis").innerHTML = [
      ["Posts", d.post_count], ["Comments", d.comment_count],
    ].map(([k, v]) => `<div class="kpi"><b>${v}</b><span>${k}</span></div>`).join("");
    $("#commPostCount").textContent = d.post_count ? `· ${d.post_count}` : "";
    $("#commCommentCount").textContent = d.comment_count ? `· ${d.comment_count}` : "";
    $("#commPosts").innerHTML = d.posts.length
      ? `<table><thead><tr><th>When</th><th>Author</th><th>Type</th><th>Post</th><th>♥</th><th>💬</th><th></th></tr></thead><tbody>` +
        d.posts.map((p) => `<tr>
          <td>${esc((p.created_at||"").slice(0,16))}</td>
          <td class="email">${esc(p.author_email || "—")}</td>
          <td><span class="tag free">${esc(p.type||"")}</span></td>
          <td class="email">${esc((p.text||"").slice(0,140)) || (p.image ? "<span class='muted'>[image]</span>" : "")}</td>
          <td class="num">${p.likes}</td><td class="num">${p.comments}</td>
          <td><button class="btn danger sm" data-del-post="${p.id}">Delete</button></td></tr>`).join("") + `</tbody></table>`
      : `<div class="muted">No posts yet.</div>`;
    $("#commComments").innerHTML = d.comments.length
      ? `<table><thead><tr><th>When</th><th>Author</th><th>Post</th><th>Comment</th><th></th></tr></thead><tbody>` +
        d.comments.map((cm) => `<tr>
          <td>${esc((cm.created_at||"").slice(0,16))}</td>
          <td class="email">${esc(cm.author_email || "—")}</td>
          <td class="num">#${cm.post_id}</td>
          <td class="email">${esc((cm.text||"").slice(0,160))}</td>
          <td><button class="btn danger sm" data-del-comment="${cm.id}">Delete</button></td></tr>`).join("") + `</tbody></table>`
      : `<div class="muted">No comments yet.</div>`;
    $$('#commPosts [data-del-post]').forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Delete this post and its likes & comments? This cannot be undone.")) return;
      try { await api("/api/admin/community/post?post_id=" + b.dataset.delPost, { method: "DELETE" });
        $("#commMsg").innerHTML = `<span class="msg ok">Post deleted.</span>`; loadCommunity(); }
      catch (e) { $("#commMsg").innerHTML = `<span class="msg err">${esc(e.message)}</span>`; }
    }));
    $$('#commComments [data-del-comment]').forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Delete this comment? This cannot be undone.")) return;
      try { await api("/api/admin/community/comment?comment_id=" + b.dataset.delComment, { method: "DELETE" });
        $("#commMsg").innerHTML = `<span class="msg ok">Comment deleted.</span>`; loadCommunity(); }
      catch (e) { $("#commMsg").innerHTML = `<span class="msg err">${esc(e.message)}</span>`; }
    }));
  }
  $("#commRefresh").addEventListener("click", loadCommunity);

  /* ---------------- Usage & alerts ---------------- */
  async function loadUsage() {
    const d = await api("/api/admin/dashboard");
    $("#usageAll").innerHTML = d.users.length
      ? `<table><thead><tr><th>Email</th><th>Plan</th><th>Scans</th><th>Coach</th></tr></thead><tbody>` +
        d.users.map((u) => `<tr><td class="email">${esc(u.email)}</td><td>${planTag(u.plan)}</td><td>${usageCell(u.scans,u.scan_limit)}</td><td>${usageCell(u.coach,u.coach_limit)}</td></tr>`).join("") + `</tbody></table>`
      : `<div class="muted">No members yet.</div>`;
    const a = await api("/api/admin/alerts");
    $("#alertsBox").innerHTML = a.alerts.length
      ? `<table><thead><tr><th>When</th><th>Email</th><th>Metric</th><th>Threshold</th></tr></thead><tbody>` +
        a.alerts.map((x) => `<tr><td>${esc((x.created_at||"").slice(0,16))}</td><td class="email">${esc(x.email)}</td><td>${esc(x.metric)}</td><td><span class="tag ${x.threshold>=100?"bad":"warn"}">${x.threshold}%</span></td></tr>`).join("") + `</tbody></table>`
      : `<div class="muted">No alerts yet.</div>`;
  }
  function syncOv() { const a = $("#ovAction").value, show = a === "set_limit" || a === "grant_bonus";
    $("#ovScans").parentElement.style.display = show ? "" : "none"; $("#ovCoach").parentElement.style.display = show ? "" : "none";
    $("#lblScans").textContent = a === "set_limit" ? "Scan limit" : "Bonus scans"; $("#lblCoach").textContent = a === "set_limit" ? "Coach limit" : "Bonus coach"; }
  $("#ovAction").addEventListener("change", syncOv);
  $("#ovBtn").addEventListener("click", async () => {
    const action = $("#ovAction").value, email = $("#ovEmail").value.trim(), s = $("#ovScans").value, c = $("#ovCoach").value;
    const body = { action, email };
    if (action === "set_limit") { if (s !== "") body.scan_limit = +s; if (c !== "") body.coach_limit = +c; }
    if (action === "grant_bonus") { body.scans = +s || 0; body.coach = +c || 0; }
    try { const r = await api("/api/admin/override", { method: "POST", body }); const u = r.user;
      $("#ovMsg").innerHTML = `<span class="msg ok">${esc(u.email)} — scans ${u.scans}/${u.scan_limit}, coach ${u.coach}/${u.coach_limit}</span>`; loadUsage(); }
    catch (e) { $("#ovMsg").innerHTML = `<span class="msg err">${esc(e.message)}</span>`; }
  });

  /* ---------------- AI cost & analytics dashboard ---------------- */
  const usd = (n) => "$" + (Number(n||0) >= 1 ? Number(n||0).toFixed(2) : Number(n||0).toFixed(5));
  const ms = (n) => Math.round(Number(n||0)).toLocaleString() + " ms";
  const KIND_LABEL = { scan_vision: "Scan · vision", scan_text: "Scan · text", coach: "Coach" };
  let aiData = null, aiRecent = [], aiSort = { key: "id", dir: -1 }, aiTimer = null;

  function bars(items, label, val, fmt, cls) {
    const max = Math.max(1, ...items.map((x) => Number(x[val]) || 0));
    if (!items.length) return '<div class="muted">No data yet.</div>';
    return items.map((x, i) => {
      const w = Math.max(2, Math.round((Number(x[val]) || 0) / max * 100));
      const c = cls ? `m${(i % 4) + 1}` : "";
      return `<div class="row2"><span class="clbl">${esc(label(x))}</span>`
           + `<span class="cbar ${c}" style="width:${w}%"></span>`
           + `<span class="cval">${fmt(x[val])}</span></div>`;
    }).join("");
  }

  async function loadAiCost() {
    const qs = new URLSearchParams();
    if ($("#aiStart").value) qs.set("start", $("#aiStart").value);
    if ($("#aiEnd").value) qs.set("end", $("#aiEnd").value);
    if ($("#aiKind").value) qs.set("kind", $("#aiKind").value);
    qs.set("limit", "1000");
    let d;
    try { d = await api("/api/admin/ai-usage?" + qs.toString()); }
    catch (e) { $("#aiKpis").innerHTML = `<div class="msg err">${esc(e.message)}</div>`; return; }
    aiData = d.analytics; aiRecent = d.recent || [];
    $("#aiLive").textContent = "· updated " + new Date().toLocaleTimeString();
    renderAi();
  }

  function renderAi() {
    const a = aiData; if (!a) return;
    const sp = a.spend, t = a.totals, p = a.performance, u = a.users;
    $("#aiKpis").innerHTML = [
      ["Total spend", usd(sp.total), "big"], ["Today", usd(sp.today)], ["Last 7 days", usd(sp.week)],
      ["Est. monthly bill", usd(sp.est_monthly), "big"], ["Total AI requests", t.requests],
      ["Avg / meal scan", usd(t.avg_cost_per_scan)], ["Avg / coach msg", usd(t.avg_cost_per_coach)],
      ["Success rate", p.success_rate + "%"],
    ].map(([k, v, c]) => `<div class="kpi"><b class="${c || ""}">${v}</b><span>${k}</span></div>`).join("");

    $("#aiDayChart").innerHTML = bars([...a.cost.by_day].reverse(), (x) => x.bucket, "cost", usd);
    $("#aiModelChart").innerHTML = bars(a.cost.by_model, (x) => x.model, "cost", usd, true);
    $("#aiKindChart").innerHTML = bars(a.cost.by_kind, (x) => KIND_LABEL[x.kind] || x.kind, "cost", usd, true);

    $("#aiPerf").innerHTML = [
      ["Avg response", ms(p.avg_ms)], ["Avg scan", ms(p.avg_scan_ms)], ["Avg coach", ms(p.avg_coach_ms)],
      ["Success", p.success_rate + "%"], ["Errors", p.error_rate + "%"], ["Timeouts", p.timeout_rate + "%"],
    ].map(([k, v]) => `<div class="kpi"><b>${v}</b><span>${k}</span></div>`).join("");
    $("#aiSlowest").innerHTML = tbl(p.slowest, [
      ["created_at", "Time", (r) => fmtTs(r.created_at)], ["kind", "Endpoint", (r) => KIND_LABEL[r.kind] || r.kind],
      ["email", "User", (r) => esc(r.email || ("#" + (r.user_id ?? "—")))], ["duration_ms", "Duration", (r) => ms(r.duration_ms), 1],
      ["cost_usd", "Cost", (r) => usd(r.cost_usd), 1],
    ]);

    $("#aiUserKpis").innerHTML = [
      ["Total AI users", u.total_ai_users], ["Active today", u.dau], ["Active 7d", u.wau], ["Active 30d", u.mau],
      ["Avg scans/day", u.avg_scans_per_day], ["Avg coach/day", u.avg_coach_per_day],
    ].map(([k, v]) => `<div class="kpi"><b>${v}</b><span>${k}</span></div>`).join("");
    $("#aiActive").innerHTML = tbl(u.most_active, [
      ["email", "User", (r) => esc(r.email || ("#" + (r.user_id ?? "—")))], ["scans", "Scans", (r) => r.scans, 1],
      ["coach", "Coach", (r) => r.coach, 1], ["requests", "Requests", (r) => r.requests, 1],
      ["cost", "Cost", (r) => usd(r.cost), 1],
    ]);

    $("#aiTop20").innerHTML = tbl(a.cost.top20, [
      ["created_at", "Time", (r) => fmtTs(r.created_at)], ["kind", "Endpoint", (r) => KIND_LABEL[r.kind] || r.kind],
      ["model", "Model", (r) => esc(r.model)], ["email", "User", (r) => esc(r.email || ("#" + (r.user_id ?? "—")))],
      ["total_tokens", "Tokens", (r) => r.total_tokens, 1], ["duration_ms", "ms", (r) => r.duration_ms, 1],
      ["cost_usd", "Cost", (r) => usd(r.cost_usd), 1],
    ]);
    renderAiLog();
  }

  function fmtTs(s) { return esc(String(s || "").replace("T", " ").slice(0, 19)); }
  function tbl(rows, cols) {
    if (!rows || !rows.length) return '<div class="muted">No data yet.</div>';
    const head = "<tr>" + cols.map((c) => `<th${c[3] ? ' class="num"' : ""}>${c[1]}</th>`).join("") + "</tr>";
    const body = rows.map((r) => "<tr>" + cols.map((c) => `<td${c[3] ? ' class="num"' : (c[0] === "email" ? ' class="email"' : "")}>${c[2](r)}</td>`).join("") + "</tr>").join("");
    return `<table>${head}${body}</table>`;
  }

  // sortable + searchable request log
  const LOG_COLS = [
    ["created_at", "Time", (r) => fmtTs(r.created_at)],
    ["email", "User", (r) => esc(r.email || ("#" + (r.user_id ?? "—")))],
    ["kind", "Endpoint", (r) => KIND_LABEL[r.kind] || r.kind],
    ["model", "Model", (r) => esc(r.model)],
    ["prompt_tokens", "In", (r) => r.prompt_tokens, 1],
    ["completion_tokens", "Out", (r) => r.completion_tokens, 1],
    ["total_tokens", "Total", (r) => r.total_tokens, 1],
    ["duration_ms", "ms", (r) => r.duration_ms, 1],
    ["cost_usd", "Cost", (r) => usd(r.cost_usd), 1],
    ["status", "Status", (r) => `<span class="tag ${r.status === "ok" ? "ok" : "bad"}">${esc(r.status)}</span>`],
  ];
  function renderAiLog() {
    const q = ($("#aiSearch").value || "").toLowerCase();
    let rows = aiRecent.filter((r) => !q || `${r.email||""} ${r.model||""} ${r.kind||""} ${r.status||""}`.toLowerCase().includes(q));
    const k = aiSort.key, dir = aiSort.dir;
    rows = [...rows].sort((a, b) => {
      let x = a[k], y = b[k];
      if (typeof x === "string" || typeof y === "string") { x = String(x||""); y = String(y||""); return x < y ? -dir : x > y ? dir : 0; }
      return ((x||0) - (y||0)) * dir;
    });
    $("#aiLogCount").textContent = `· ${rows.length} requests`;
    const head = "<tr>" + LOG_COLS.map((c) => {
      const arr = aiSort.key === c[0] ? (aiSort.dir > 0 ? "▲" : "▼") : "";
      return `<th class="sortable${c[3] ? " num" : ""}" data-k="${c[0]}">${c[1]} <span class="arr">${arr}</span></th>`;
    }).join("") + "</tr>";
    const body = rows.map((r) => "<tr>" + LOG_COLS.map((c) => `<td${c[3] ? ' class="num"' : (c[0]==="email"?' class="email"':"")}>${c[2](r)}</td>`).join("") + "</tr>").join("");
    $("#aiLog").innerHTML = `<table>${head}${body}</table>`;
    $$("#aiLog th.sortable").forEach((th) => th.addEventListener("click", () => {
      const key = th.dataset.k;
      aiSort = { key, dir: aiSort.key === key ? -aiSort.dir : -1 };
      renderAiLog();
    }));
  }

  function aiExportCsv() {
    const cols = ["created_at","user_id","email","kind","model","prompt_tokens","completion_tokens","total_tokens","cost_usd","duration_ms","status"];
    const esc2 = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lines = [cols.join(",")].concat(aiRecent.map((r) => cols.map((c) => esc2(r[c])).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `caloria-ai-usage-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  $("#aiRefresh").addEventListener("click", loadAiCost);
  $("#aiKind").addEventListener("change", loadAiCost);
  $("#aiStart").addEventListener("change", loadAiCost);
  $("#aiEnd").addEventListener("change", loadAiCost);
  $("#aiSearch").addEventListener("input", renderAiLog);
  $("#aiCsv").addEventListener("click", aiExportCsv);
  $("#aiAuto").addEventListener("change", (e) => {
    clearInterval(aiTimer); aiTimer = null;
    if (e.target.checked) aiTimer = setInterval(loadAiCost, 30000);
  });

  /* ---------------- tabs / boot ---------------- */
  const LOADERS = { business: loadBusiness, club: loadClub, users: () => loadUsers(), subs: loadSubs, community: loadCommunity, analytics: loadAnalytics, usage: loadUsage, aicost: loadAiCost };
  function showTab(name) {
    $$('#tabs button').forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $$('section[data-panel]').forEach((s) => s.classList.toggle("hidden", s.dataset.panel !== name));
    (LOADERS[name] || (() => {}))();
  }
  $$('#tabs button').forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

  function showApp(on) { $("#loginCard").classList.toggle("hidden", on); $("#app").classList.toggle("hidden", !on); $("#logoutBtn").style.display = on ? "" : "none"; }
  async function boot() {
    if (!token) return showApp(false);
    try { await loadBusiness(); showApp(true); syncOv(); }
    catch (e) { token = null; localStorage.removeItem(TOKEN_KEY); showApp(false);
      if (e.status === 403) $("#loginMsg").innerHTML = `<span class="msg err">That account is not an administrator.</span>`; }
  }
  // Login is a real <form>: Enter submits, the button shows progress, and
  // network failures are reported instead of failing silently. "Create your
  // admin account" bootstraps the very first login on a fresh deployment —
  // anyone can create an account, but only ADMIN_EMAILS ever get in here.
  let loginMode = "login";
  $("#loginModeToggle").addEventListener("click", (e) => {
    e.preventDefault();
    loginMode = loginMode === "login" ? "signup" : "login";
    $("#loginTitle").textContent = loginMode === "login" ? "Admin sign in" : "Create admin account";
    $("#loginBtn").textContent = loginMode === "login" ? "Sign in" : "Create account & sign in";
    $("#loginModeToggle").textContent = loginMode === "login" ? "Create your admin account" : "Back to sign in";
    $("#loginMsg").textContent = "";
  });
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#loginMsg").textContent = "";
    const btn = $("#loginBtn");
    btn.disabled = true; btn.textContent = "One moment…";
    try {
      const path = loginMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const r = await api(path, { method: "POST", body: { email: $("#email").value.trim(), password: $("#password").value } });
      token = r.token; localStorage.setItem(TOKEN_KEY, token);
      await loadBusiness(); showApp(true); syncOv();
    } catch (e2) {
      let msg = e2.message || "Something went wrong.";
      if (e2.status === 403) { msg = "That account is not an administrator."; token = null; localStorage.removeItem(TOKEN_KEY); }
      else if (e2 instanceof TypeError || !e2.status) msg = "Can't reach the API server — check that the backend is running.";
      $("#loginMsg").innerHTML = `<span class="msg err">${esc(msg)}</span>`;
    }
    btn.disabled = false;
    btn.textContent = loginMode === "login" ? "Sign in" : "Create account & sign in";
  });
  $("#logoutBtn").addEventListener("click", () => { token = null; localStorage.removeItem(TOKEN_KEY); showApp(false); });
  boot();
