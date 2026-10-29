/* Winter Arc — snow. A single <canvas> of drifting flakes. No library, no DOM
   churn, no app coupling. Decorative only: the canvas is pointer-events:none
   (see winter.css) so it never blocks clicks, scroll, text or keyboard.
   Honors prefers-reduced-motion, pauses when the tab is hidden, and is trivially
   switched off via CaloriaSnow.stop() / the seasonal flag. */
(function () {
  "use strict";
  var canvas = null, ctx = null, raf = 0, flakes = [], running = false;
  var W = 0, H = 0, DPR = 1, density = 0.00008; // flakes per px² (very sparse)
  var MAX = 90;                                  // hard cap for low-end devices

  function reducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return false; }
  }

  function sizeCanvas() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var target = Math.min(MAX, Math.round(W * H * density));
    while (flakes.length < target) flakes.push(makeFlake(true));
    if (flakes.length > target) flakes.length = target;
  }

  function makeFlake(spawnAnywhere) {
    var r = 0.8 + Math.random() * 2.2;
    return {
      x: Math.random() * W,
      y: spawnAnywhere ? Math.random() * H : -8,
      r: r,
      vy: 8 + r * 10,                 // px/sec — bigger flakes fall faster
      drift: 6 + Math.random() * 14,  // horizontal sway amplitude
      phase: Math.random() * Math.PI * 2,
      sway: 0.4 + Math.random() * 0.7,
      opacity: 0.35 + Math.random() * 0.5,
      sparkle: Math.random() < 0.06    // a few shimmer slightly
    };
  }

  var last = 0;
  function frame(ts) {
    if (!running) return;
    var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016; last = ts;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.y += f.vy * dt;
      f.phase += f.sway * dt;
      var x = f.x + Math.sin(f.phase) * f.drift;
      if (f.y - f.r > H) { f.y = -8; f.x = Math.random() * W; }
      var o = f.sparkle ? f.opacity * (0.6 + 0.4 * Math.abs(Math.sin(f.phase * 3))) : f.opacity;
      ctx.beginPath();
      ctx.arc(x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255," + o.toFixed(3) + ")";
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }

  function start(opts) {
    if (running || reducedMotion()) return;          // never run if reduced-motion
    density = (opts && opts.density) || density;
    if (!canvas) {
      var root = document.getElementById("snowRoot") || document.body;
      canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      root.appendChild(canvas);
      ctx = canvas.getContext("2d");
      window.addEventListener("resize", sizeCanvas, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
    }
    running = true; last = 0;
    sizeCanvas();
    raf = requestAnimationFrame(frame);
  }

  function pause() { running = false; cancelAnimationFrame(raf); }
  function resume() { if (!running && canvas && !document.hidden && !reducedMotion()) { running = true; last = 0; raf = requestAnimationFrame(frame); } }
  function onVisibility() { document.hidden ? pause() : resume(); }

  function stop() {
    pause();
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = ctx = null; flakes = [];
    window.removeEventListener("resize", sizeCanvas);
    document.removeEventListener("visibilitychange", onVisibility);
  }

  function setDensity(d) { density = d; if (running) sizeCanvas(); }

  window.CaloriaSnow = { start: start, stop: stop, setDensity: setDensity,
                         isRunning: function () { return running; } };
})();
