(() => {
  // Wires drawn once to an offscreen canvas; each frame copies that and draws the pulses on top.
  const canvas = document.getElementById("wire");
  const ctx = canvas.getContext("2d", { alpha: false });
  const name = document.querySelector(".name");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const BG = "#05070a";
  const COLOURS = ["232,244,255", "232,244,255", "200,235,255", "159,227,255", "159,227,255", "255,196,128"];
  const STEPS = 10;

  let W = 0, H = 0, dpr = 1;
  let wires = [], pulses = [], glow = {};
  let back, lit, lens, lensCtx, titleBox;
  let last = 0, frame = 0, hum = 0, shownHum = -1;
  const pointer = { x: -1e4, y: -1e4, on: false, last: 0, glow: 0 };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];

  // A wire runs left to right in straight stretches joined by 45° bends, like a trace on a board.
  function makeWire(y0) {
    const pts = [[-60, y0]];
    let x = -60,
      y = y0;
    while (x < W + 60) {
      x += rnd(70, 320);
      pts.push([x, y]);
      if (x >= W + 60) break;
      let d = (Math.random() < 0.5 ? -1 : 1) * rnd(10, 46);
      if (y + d < 6 || y + d > H - 6) d = -d;
      x += Math.abs(d);
      y += d;
      pts.push([x, y]);
    }
    const len = [0];
    for (let i = 1; i < pts.length; i++)
      len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, len, total: len[len.length - 1], weight: Math.random() < 0.18 ? 1.6 : 1 };
  }

  // The point at distance s along a wire.
  function at(w, s, out) {
    const { pts, len } = w;
    if (s <= 0) {
      out[0] = pts[0][0];
      out[1] = pts[0][1];
      return;
    }
    let i = 1;
    while (i < len.length - 1 && len[i] < s) i++;
    const t = Math.min(1, (s - len[i - 1]) / (len[i] - len[i - 1] || 1));
    out[0] = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
    out[1] = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
  }

  // Where a wire crosses x: its y there and the distance along it. x only ever increases along a wire.
  function cross(w, x) {
    const { pts, len } = w;
    let i = 1;
    while (i < pts.length - 1 && pts[i][0] < x) i++;
    const a = pts[i - 1],
      b = pts[i];
    const t = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0] || 1)));
    return { y: a[1] + (b[1] - a[1]) * t, s: len[i - 1] + (len[i] - len[i - 1]) * t };
  }

  function strokeWires(c, alpha, boost) {
    c.lineJoin = "round";
    for (const w of wires) {
      c.strokeStyle = `rgba(150,190,220,${alpha * w.weight})`;
      c.lineWidth = boost * (w.weight > 1 ? 1.2 : 0.8);
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

  // A soft dot, pre-drawn once per colour, stamped at the head of each pulse.
  function glowFor(rgb) {
    if (glow[rgb]) return glow[rgb];
    const [c, x] = surface(32, 32);
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, `rgba(${rgb},0.9)`);
    g.addColorStop(0.25, `rgba(${rgb},0.35)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
    return (glow[rgb] = c);
  }

  function layout() {
    W = innerWidth;
    H = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(W * dpr);
    canvas.height = Math.ceil(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    glow = {};
    wires = [];
    const gap = W < 600 ? 26 : 22;
    for (let y = rnd(4, gap); y < H; y += gap * rnd(0.55, 1.45)) wires.push(makeWire(y));
    let bx;
    [back, bx] = surface(W, H);
    bx.fillStyle = BG;
    bx.fillRect(0, 0, W, H);
    strokeWires(bx, 0.075, 1);
    let lx;
    [lit, lx] = surface(W, H);
    strokeWires(lx, 0.5, 1.1);
    [lens, lensCtx] = surface(240, 240);
    pulses = [];
    for (let i = 0; i < target(); i++) spawn(null, null, Math.random());
    const r = name.getBoundingClientRect();
    titleBox = { x0: r.left - 40, x1: r.right + 40, y0: r.top - 30, y1: r.bottom + 30 };
  }

  const target = () => Math.round(wires.length * (W < 600 ? 0.45 : 0.7));

  // A pulse on wire w at distance s, or entering from one end. `p` places ambient pulses mid-run at
  // first paint, so the screen doesn't start empty.
  function spawn(w, s, p, opts = {}) {
    w = w || pick(wires);
    const fast = Math.random() < 0.35;
    const dir = opts.dir || (Math.random() < 0.62 ? 1 : -1);
    const tail = opts.tail || (fast ? rnd(140, 320) : rnd(30, 110));
    const speed = opts.speed || (fast ? rnd(420, 820) : rnd(90, 260));
    if (s == null) s = p != null ? p * w.total : dir > 0 ? -tail * 0.2 : w.total + tail * 0.2;
    pulses.push({ w, s, dir, tail, speed, rgb: opts.rgb || pick(COLOURS), a: opts.a || rnd(0.55, 1) });
  }

  function nearest(x, y, n) {
    return wires
      .map((w) => ({ w, ...cross(w, x) }))
      .map((h) => ({ ...h, d: Math.abs(h.y - y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, n);
  }

  const P = [0, 0];
  function drawPulse(p) {
    const { w, s, dir, tail, rgb } = p;
    const step = tail / STEPS;
    at(w, s - dir * tail, P);
    let px = P[0],
      py = P[1];
    ctx.lineWidth = w.weight > 1 ? 1.6 : 1.2;
    for (let i = 1; i <= STEPS; i++) {
      at(w, s - dir * (tail - i * step), P);
      const f = i / STEPS;
      ctx.strokeStyle = `rgba(${rgb},${p.a * f * f})`;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(P[0], P[1]);
      ctx.stroke();
      px = P[0];
      py = P[1];
    }
    const g = glowFor(rgb);
    const size = w.weight > 1 ? 26 : 20;
    ctx.globalAlpha = p.a;
    ctx.drawImage(g, px - size / 2, py - size / 2, size, size);
    ctx.globalAlpha = 1;
    return [px, py];
  }

  function draw(dt) {
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(back, 0, 0, W, H);

    // Near the pointer the wires show through more strongly, through a soft round lens.
    pointer.glow += ((pointer.on ? 1 : 0) - pointer.glow) * Math.min(1, dt * 6);
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
    ctx.lineCap = "round";
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
      if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) energy += p.a * Math.min(1, p.speed / 500);
    }
    while (pulses.length < target()) spawn();

    // The name hums brighter while pulses pass behind it.
    hum += (Math.min(1, energy * 0.6) - hum) * Math.min(1, dt * 5);
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

  // Moving the pointer feeds data onto the nearest wire; a click or tap sends a burst both ways.
  addEventListener(
    "pointermove",
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.on = e.pointerType === "mouse";
      if (still.matches || !pointer.on) return;
      const now = performance.now();
      if (now - pointer.last < 90) return;
      pointer.last = now;
      const [h] = nearest(e.clientX, e.clientY, 1);
      if (h && h.d < 30)
        spawn(h.w, h.s, null, {
          dir: e.movementX < 0 ? -1 : 1,
          speed: rnd(500, 800),
          tail: rnd(80, 160),
          rgb: "232,244,255",
        });
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
      for (const h of nearest(e.clientX, e.clientY, 4)) {
        for (const dir of [1, -1])
          spawn(h.w, h.s, null, {
            dir,
            speed: rnd(650, 1000),
            tail: rnd(120, 240),
            rgb: "159,227,255",
            a: 1,
          });
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
