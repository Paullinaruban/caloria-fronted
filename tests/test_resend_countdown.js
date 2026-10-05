// Frontend test: the reset "Resend" cooldown is a LIVE countdown.
// Extracts the real runResendCooldown() from js/app.js and drives it with a
// fake setInterval + fake DOM, asserting it ticks once/sec, keeps the button
// disabled, and restores "Resend" exactly when the cooldown reaches zero.
//
// Run:  node tests/test_resend_countdown.js
const fs = require("fs");
const path = require("path");

const APP = path.join(__dirname, "..", "js", "app.js");
const src = fs.readFileSync(APP, "utf8");

const start = src.indexOf("function runResendCooldown(retryAfter)");
if (start < 0) { console.error("FAIL: runResendCooldown not found"); process.exit(1); }
let i = src.indexOf("{", start), depth = 0, end = -1;
for (let j = i; j < src.length; j++) {
  if (src[j] === "{") depth++;
  else if (src[j] === "}") { depth--; if (depth === 0) { end = j + 1; break; } }
}
const fnSrc = src.slice(start, end);

let PASS = [], FAIL = [];
const check = (n, c) => { (c ? PASS : FAIL).push(n); console.log(`  [${c ? "PASS" : "FAIL"}] ${n}`); };

// Fake DOM: one button + one message element, selected by id via $.
const btn = { disabled: false };
const msg = { textContent: "" };
const $ = (sel) => (sel === "#resetResendBtn" ? btn : msg);

// Fake timer: capture the interval callback so the test can tick it manually.
let intervalCb = null, intervalCleared = false, intervalMs = null;
const setIntervalFake = (cb, ms) => { intervalCb = cb; intervalMs = ms; return 123; };
const clearIntervalFake = (id) => { if (id === 123) intervalCleared = true; };
const tick = () => { if (intervalCb && !intervalCleared) intervalCb(); };

// Build the real function with injected deps.
const run = new Function("$", "setInterval", "clearInterval", "parseInt", "Math",
                         `return (${fnSrc});`)($, setIntervalFake, clearIntervalFake, parseInt, Math);

// Start a 5-second cooldown.
run(5);
check("interval runs once per second (1000ms)", intervalMs === 1000);
check("button disabled immediately", btn.disabled === true);
check("initial message shows 5 seconds", msg.textContent === "Please wait 5 seconds before requesting another code.");

tick(); // ->4
check("after 1s: 4 seconds", msg.textContent === "Please wait 4 seconds before requesting another code.");
check("still disabled at 4", btn.disabled === true);
tick(); // ->3
tick(); // ->2
check("after 3s: 2 seconds", msg.textContent === "Please wait 2 seconds before requesting another code.");
tick(); // ->1
check("singular at 1 second", msg.textContent === "Please wait 1 second before requesting another code.");
check("still disabled at 1", btn.disabled === true);
check("not cleared yet", intervalCleared === false);

tick(); // ->0  (expiry)
check("button RE-ENABLED exactly at expiry", btn.disabled === false);
check("message cleared at expiry", msg.textContent === "");
check("interval cleared at expiry", intervalCleared === true);

// A further stray tick must not run (cleared) — guarded by tick()'s check.
const before = { d: btn.disabled, m: msg.textContent };
tick();
check("no further ticks after clear", btn.disabled === before.d && msg.textContent === before.m);

// Clamp: retryAfter > 60 is capped to 60; bad input -> 60.
btn.disabled = false; msg.textContent = ""; intervalCb = null; intervalCleared = false;
run(999);
check("retryAfter is clamped to <=60", msg.textContent === "Please wait 60 seconds before requesting another code.");
btn.disabled = false; msg.textContent = ""; intervalCb = null; intervalCleared = false;
run(undefined);
check("missing retryAfter defaults to 60", msg.textContent === "Please wait 60 seconds before requesting another code.");

console.log(`\nRESULT: ${PASS.length} passed, ${FAIL.length} failed`);
if (FAIL.length) { console.log("FAILED:", FAIL); process.exit(1); }
console.log("ALL RESEND COUNTDOWN CHECKS PASSED");
