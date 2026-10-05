// Frontend test: the password-reset "Resend" must honour HTTP 429 and NOT
// show "New code sent". We extract the REAL requestReset() source from
// js/app.js and run it against a mocked api(), then assert the status it
// returns drives the button/toast branch correctly.
//
// Run:  node tests/test_resend_429.js
const fs = require("fs");
const path = require("path");

const APP = path.join(__dirname, "..", "js", "app.js");
const src = fs.readFileSync(APP, "utf8");

// Pull out the exact `async function requestReset(email) { ... }` block.
const start = src.indexOf("async function requestReset(email)");
if (start < 0) { console.error("FAIL: requestReset not found in app.js"); process.exit(1); }
// Balance braces from the first "{" after the signature.
let i = src.indexOf("{", start), depth = 0, end = -1;
for (let j = i; j < src.length; j++) {
  if (src[j] === "{") depth++;
  else if (src[j] === "}") { depth--; if (depth === 0) { end = j + 1; break; } }
}
const fnSrc = src.slice(start, end);

let PASS = [], FAIL = [];
function check(name, cond) { (cond ? PASS : FAIL).push(name); console.log(`  [${cond ? "PASS" : "FAIL"}] ${name}`); }

// Build a callable requestReset bound to a mock `api`.
function makeRequestReset(apiImpl) {
  // eslint-disable-next-line no-new-func
  return new Function("api", `return (${fnSrc});`)(apiImpl);
}

(async () => {
  // Case 1 — success → {ok:true}
  let called = null;
  let rr = makeRequestReset(async (p, opts) => { called = { p, opts }; return { ok: true }; });
  let r1 = await rr("user@example.com");
  check("success returns ok:true", r1 && r1.ok === true);
  check("calls /api/auth/forgot with the email", called && called.p === "/api/auth/forgot" && called.opts.body.email === "user@example.com");

  // Case 2 — 429 → {ok:false, retryAfter, message} (NOT a fake 'sent')
  rr = makeRequestReset(async () => { const e = new Error("429"); e.status = 429; e.data = { retry_after: 60, error: "Please wait 60 seconds before requesting another code." }; throw e; });
  let r2 = await rr("user@example.com");
  check("429 returns ok:false", r2 && r2.ok === false);
  check("429 surfaces retryAfter=60", r2 && r2.retryAfter === 60);
  check("429 message is the cooldown text (not 'New code sent')",
        r2 && /wait .*seconds/.test(r2.message) && !/New code sent/.test(r2.message));

  // Case 3 — 429 without body → sensible default
  rr = makeRequestReset(async () => { const e = new Error("429"); e.status = 429; throw e; });
  let r3 = await rr("user@example.com");
  check("429 w/o body defaults retryAfter=60", r3 && r3.ok === false && r3.retryAfter === 60);
  check("429 w/o body has a wait message", r3 && /wait 60 seconds/.test(r3.message));

  // Case 4 — other error stays neutral (ok:true, no existence leak)
  rr = makeRequestReset(async () => { const e = new Error("boom"); e.status = 500; throw e; });
  let r4 = await rr("user@example.com");
  check("non-429 error stays neutral (ok:true)", r4 && r4.ok === true);

  // Case 5 — the button branch: simulate what resetResendBtn does with each status
  function buttonMessage(r) { return r.ok ? "New code sent 💌" : r.message; }
  check("button shows cooldown on 429", buttonMessage(r2) === "Please wait 60 seconds before requesting another code.");
  check("button shows 'New code sent' only on success", buttonMessage(r1) === "New code sent 💌");

  console.log(`\nRESULT: ${PASS.length} passed, ${FAIL.length} failed`);
  if (FAIL.length) { console.log("FAILED:", FAIL); process.exit(1); }
  console.log("ALL FRONTEND 429 CHECKS PASSED");
})();
