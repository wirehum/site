(() => {
  // Wires drawn once to an offscreen canvas; each frame copies that and draws the pulses on top.
  const canvas = document.getElementById("wire");
  const ctx = canvas.getContext("2d", { alpha: false });
  const name = document.querySelector(".name");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const BG = "#0a0a0a";
  // Mostly warm white, a few warmer and a few cooler, nothing saturated.
  const COLOURS = ["255,247,235", "255,247,235", "255,247,235", "255,232,204", "232,236,242"];
  const STEP = 6; // px between a wire's points, and between the points of a pulse's tail
  const MARGIN = 60;

  let W = 0,
    H = 0,
    dpr = 1;
  let wires = [],
    pulses = [];
  let back, lit, lens, lensCtx, titleBox;
  let last = 0,
    frame = 0,
    hum = 0,
    shownHum = -1;
  const pointer = { x: -1e4, y: -1e4, on: false, last: 0, glow: 0 };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];

  // A wire is a long, gently sagging line across the page: two slow waves of small height.
  function makeWire(y0) {
    const a1 = rnd(0, 16),
      f1 = rnd(0.0015, 0.004),
      p1 = rnd(0, 6.3);
    const a2 = rnd(0, 5),
      f2 = rnd(0.005, 0.01),
      p2 = rnd(0, 6.3);
    const pts = [];
    for (let x = -MARGIN; x <= W + MARGIN + STEP; x += STEP) {
      pts.push([x, y0 + a1 * Math.sin(x * f1 + p1) + a2 * Math.sin(x * f2 + p2)]);
    }
    const len = [0];
    for (let i = 1; i < pts.length; i++) {
      len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    return { pts, len, total: len[len.length - 1] };
  }

  // The point at distance s along a wire.
  function at(w, s, out) {
    const { pts, len, total } = w;
    s = Math.max(0, Math.min(total, s));
    let lo = 1,
      hi = len.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (len[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    const a = pts[lo - 1],
      b = pts[lo];
    const t = (s - len[lo - 1]) / (len[lo] - len[lo - 1] || 1);
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
  }

  // Where a wire crosses x: its y there and the distance along it. Points are evenly spaced in x.
  function cross(w, x) {
    const i = Math.max(1, Math.min(w.pts.length - 1, Math.ceil((x + MARGIN) / STEP)));
    const a = w.pts[i - 1],
      b = w.pts[i];
    const t = Math.max(0, Math.min(1, (x - a[0]) / STEP));
    return { y: a[1] + (b[1] - a[1]) * t, s: w.len[i - 1] + (w.len[i] - w.len[i - 1]) * t };
  }

  function strokeWires(c, colour) {
    c.strokeStyle = colour;
    c.lineWidth = 1;
    for (const w of wires) {
      c.beginPath();
      c.moveTo(w.pts[0][0], w.pts[0][1]);
      for (let i = 1; i < w.pts.length; i++) c.lineTo(w.pts[i][0], w.pts[i][1]);
      c.stroke();
    }
  }

  function surface(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.ceil(w * dpr);
    c.height = Math.ceil(h * dpr);
    const x = c.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [c, x];
  }

  function layout() {
    W = innerWidth;
    H = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(W * dpr);
    canvas.height = Math.ceil(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wires = [];
    const gap = W < 600 ? 30 : 26;
    for (let y = rnd(6, gap); y < H; y += gap * rnd(0.6, 1.4)) wires.push(makeWire(y));
    let bx;
    [back, bx] = surface(W, H);
    bx.fillStyle = BG;
    bx.fillRect(0, 0, W, H);
    strokeWires(bx, "rgba(235,228,215,0.055)");
    let lx;
    [lit, lx] = surface(W, H);
    strokeWires(lx, "rgba(235,228,215,0.22)");
    [lens, lensCtx] = surface(240, 240);
    pulses = [];
    for (let i = 0; i < target(); i++) spawn(null, null, Math.random());
    const r = name.getBoundingClientRect();
    titleBox = { x0: r.left - 40, x1: r.right + 40, y0: r.top - 30, y1: r.bottom + 30 };
  }

  const target = () => Math.round(wires.length * (W < 600 ? 0.4 : 0.55));

  // A pulse on wire w at distance s, or entering from one end. `p` places ambient pulses mid-run at
  // first paint, so the screen doesn't start empty.
  function spawn(w, s, p, opts = {}) {
    w = w || pick(wires);
    const long = Math.random() < 0.35;
    const dir = opts.dir || (Math.random() < 0.62 ? 1 : -1);
    const tail = opts.tail || (long ? rnd(140, 280) : rnd(40, 120));
    const speed = opts.speed || (long ? rnd(110, 190) : rnd(35, 90));
    if (s == null) s = p != null ? p * w.total : dir > 0 ? 0 : w.total;
    pulses.push({ w, s, dir, tail, speed, rgb: opts.rgb || pick(COLOURS), a: opts.a || rnd(0.55, 1) });
  }

  function nearest(x, y, n) {
    return wires
      .map((w) => ({ w, ...cross(w, x) }))
      .map((h) => ({ ...h, d: Math.abs(h.y - y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, n);
  }

  // One stroke per pulse, fading from nothing at the tail to full at the head.
  const P = [0, 0];
  function drawPulse(p) {
    const { w, s, dir, tail, rgb, a } = p;
    const n = Math.max(2, Math.ceil(tail / STEP));
    ctx.beginPath();
    at(w, s - dir * tail, P);
    const tx = P[0],
      ty = P[1];
    ctx.moveTo(tx, ty);
    for (let i = 1; i <= n; i++) {
      at(w, s - dir * tail * (1 - i / n), P);
      ctx.lineTo(P[0], P[1]);
    }
    const g = ctx.createLinearGradient(tx, ty, P[0], P[1]);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(0.7, `rgba(${rgb},${a * 0.35})`);
    g.addColorStop(1, `rgba(${rgb},${a})`);
    ctx.strokeStyle = g;
    ctx.stroke();
    return P;
  }

  function draw(dt) {
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(back, 0, 0, W, H);

    // Near the pointer the wires show through a little more, through a soft round lens.
    pointer.glow += ((pointer.on ? 1 : 0) - pointer.glow) * Math.min(1, dt * 4);
    if (pointer.glow > 0.01) {
      const R = 120;
      lensCtx.globalCompositeOperation = "copy";
      lensCtx.drawImage(
        lit,
        (pointer.x - R) * dpr,
        (pointer.y - R) * dpr,
        R * 2 * dpr,
        R * 2 * dpr,
        0,
        0,
        R * 2,
        R * 2,
      );
      lensCtx.globalCompositeOperation = "destination-in";
      const g = lensCtx.createRadialGradient(R, R, 0, R, R, R);
      g.addColorStop(0, `rgba(0,0,0,${pointer.glow})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      lensCtx.fillStyle = g;
      lensCtx.fillRect(0, 0, R * 2, R * 2);
      ctx.drawImage(lens, pointer.x - R, pointer.y - R, R * 2, R * 2);
    }

    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 1.25;
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    let energy = 0;
    const b = titleBox;
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.s += p.dir * p.speed * dt;
      const gone = p.dir > 0 ? p.s - p.tail > p.w.total : p.s + p.tail < 0;
      if (gone) {
        pulses.splice(i, 1);
        continue;
      }
      const [x, y] = drawPulse(p);
      if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) energy += p.a;
    }
    while (pulses.length < target()) spawn();

    // The name warms slightly while pulses pass behind it.
    hum += (Math.min(1, energy * 0.5) - hum) * Math.min(1, dt * 3);
    if (Math.abs(hum - shownHum) > 0.01) {
      name.style.setProperty("--hum", hum.toFixed(3));
      shownHum = hum;
    }
  }

  function tick(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    draw(dt);
    frame = requestAnimationFrame(tick);
  }

  function start() {
    cancelAnimationFrame(frame);
    layout();
    if (still.matches) {
      draw(0);
      name.style.setProperty("--hum", "0");
      return;
    }
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  // Moving the pointer feeds a pulse onto the nearest wire; a click or tap sends a few both ways.
  addEventListener(
    "pointermove",
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.on = e.pointerType === "mouse";
      if (still.matches || !pointer.on) return;
      const now = performance.now();
      if (now - pointer.last < 140) return;
      pointer.last = now;
      const [h] = nearest(e.clientX, e.clientY, 1);
      if (h && h.d < 30) {
        spawn(h.w, h.s, null, { dir: e.movementX < 0 ? -1 : 1, speed: rnd(140, 200), tail: rnd(90, 160) });
      }
    },
    { passive: true },
  );
  addEventListener("mouseout", (e) => {
    if (!e.relatedTarget) pointer.on = false;
  });
  addEventListener("blur", () => {
    pointer.on = false;
  });
  addEventListener(
    "pointerdown",
    (e) => {
      if (still.matches || e.target.closest("a")) return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      for (const h of nearest(e.clientX, e.clientY, 3)) {
        for (const dir of [1, -1]) {
          spawn(h.w, h.s, null, { dir, speed: rnd(180, 260), tail: rnd(120, 220), a: 0.9 });
        }
      }
    },
    { passive: true },
  );

  // Phones resize the viewport as the address bar hides; only re-lay the wires for real changes.
  let resizeTimer = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (innerWidth !== W || Math.abs(innerHeight - H) > 140) start();
    }, 150);
  });
  still.addEventListener?.("change", start);
  start();
})();
