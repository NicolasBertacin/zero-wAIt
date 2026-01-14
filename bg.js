(() => {
  const canvas = document.getElementById("bg-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: false });
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  // ===== Config (sem cortes + menos brilho) =====
  const CFG = {
    SCALE: 0.62,          // qualidade (mais alto = mais pesado)
    DPR_CAP: 2,
    BG_TINT: "#070708",

    BASE_BLUR: 20,
    HOVER_BLUR: 10,

    BASE_BOOST: 1.10,     // menos brilho
    HOVER_BOOST: 1.35,
    MOUSE_GLOW: 0.12,

    MOUSE_PUSH: 0.16,
    PULSE_SPEED: 1.6,

    // Scroll follow (parallax)
    SCROLL_STRENGTH: 0.55,
    SCROLL_SMOOTH: 0.10
  };

  let w = 0, h = 0, lw = 0, lh = 0;
  let rafId = 0;
  let running = false;

  const mouse = {
    x: 0, y: 0,
    tx: 0, ty: 0,
    active: 0,
    tActive: 0,
    down: 0
  };

  const scroll = { y: 0, ty: 0 };

  // alpha bem mais contido (pra não “estourar”)
  const blobs = [
    { rgb: [255, 255, 255], a: 0.10, r: 0.62, sx: 0.08, sy: 0.07, px: 1.2, py: 2.1 },
    { rgb: [120, 180, 255], a: 0.14, r: 0.70, sx: 0.06, sy: 0.08, px: 2.7, py: 0.9 },
    { rgb: [140, 90, 255], a: 0.13, r: 0.68, sx: 0.07, sy: 0.06, px: 0.4, py: 3.1 },
    { rgb: [255, 180, 120], a: 0.09, r: 0.66, sx: 0.05, sy: 0.07, px: 3.4, py: 1.6 },
    { rgb: [90, 255, 220], a: 0.07, r: 0.64, sx: 0.06, sy: 0.05, px: 1.9, py: 2.8 }
  ];

  // Offscreen (barato)
  const off = document.createElement("canvas");
  const offCtx = off.getContext("2d", { alpha: true });

  const lerp = (a, b, t) => a + (b - a) * t;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;

    lw = Math.max(2, Math.floor(w * CFG.SCALE));
    lh = Math.max(2, Math.floor(h * CFG.SCALE));

    const dpr = Math.min(window.devicePixelRatio || 1, CFG.DPR_CAP);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    off.width = lw;
    off.height = lh;

    mouse.x = mouse.tx = w * 0.5;
    mouse.y = mouse.ty = h * 0.38;
  }

  function drawBlob(x, y, r, rgb, a) {
    const g = offCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`);
    g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    offCtx.fillStyle = g;
    offCtx.beginPath();
    offCtx.arc(x, y, r, 0, Math.PI * 2);
    offCtx.fill();
  }

  function frame(tms) {
    if (!running) return;

    const t = tms * 0.001;

    mouse.active = lerp(mouse.active, mouse.tActive, 0.07);
    mouse.x = lerp(mouse.x, mouse.tx, 0.12);
    mouse.y = lerp(mouse.y, mouse.ty, 0.12);

    scroll.y = lerp(scroll.y, scroll.ty, CFG.SCROLL_SMOOTH);

    // base
    ctx.fillStyle = CFG.BG_TINT;
    ctx.fillRect(0, 0, w, h);

    offCtx.clearRect(0, 0, lw, lh);
    offCtx.globalCompositeOperation = "lighter";

    const mx = (mouse.x / w) * lw;
    const my = (mouse.y / h) * lh;

    const pulse = 1 + (0.07 * mouse.active) * Math.sin(t * CFG.PULSE_SPEED);
    const boost = lerp(CFG.BASE_BOOST, CFG.HOVER_BOOST, mouse.active) * pulse;
    const blur = lerp(CFG.BASE_BLUR, CFG.HOVER_BLUR, mouse.active);

    const dx = (mx - lw * 0.5) * CFG.MOUSE_PUSH * mouse.active;
    const dy = (my - lh * 0.45) * CFG.MOUSE_PUSH * mouse.active;

    // shift do scroll e wrap (nunca “some”)
    const scrollShift = ((scroll.y * CFG.SCROLL_STRENGTH) % lh + lh) % lh;
    const minL = Math.min(lw, lh);

    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];

      const baseX =
        lw * (0.5 + 0.24 * Math.sin(t * b.sx + b.px) + 0.10 * Math.sin(t * (b.sx * 1.8) + b.py));

      const baseY =
        lh * (0.45 + 0.22 * Math.cos(t * b.sy + b.py) + 0.10 * Math.cos(t * (b.sy * 1.7) + b.px));

      const x = baseX + dx;
      const y = ((baseY + dy + scrollShift) % lh + lh) % lh;

      const r = minL * b.r;

      drawBlob(x, y, r * 1.00, b.rgb, b.a * 0.70 * boost);
      drawBlob(x, y, r * 0.72, b.rgb, b.a * 0.55 * boost);
    }

    // glow do mouse (bem mais contido)
    if (mouse.active > 0.02) {
      const extra = CFG.MOUSE_GLOW * mouse.active * (mouse.down ? 1.15 : 1);
      drawBlob(mx, my, minL * 0.42, [255, 255, 255], 0.07 * extra * boost);
      drawBlob(mx, my, minL * 0.28, [120, 180, 255], 0.06 * extra * boost);
      drawBlob(mx, my, minL * 0.16, [140, 90, 255], 0.05 * extra * boost);
    }

    // ===== Render FINAL sem cortes =====
    // IMPORTANTÍSSIMO: desenhar o offscreen escalado pra cobrir a viewport toda
    const pad = Math.max(w, h) * 0.22; // margem extra pra nunca aparecer borda dura

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // glow (blur)
    ctx.filter = `blur(${blur}px)`;
    ctx.globalAlpha = 0.78;
    ctx.drawImage(
      off,
      0, 0, lw, lh,
      -pad, -pad, w + pad * 2, h + pad * 2
    );

    // crisp leve
    ctx.filter = "none";
    ctx.globalAlpha = 0.16;
    ctx.drawImage(
      off,
      0, 0, lw, lh,
      -pad, -pad, w + pad * 2, h + pad * 2
    );

    ctx.restore();

    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // mouse
  window.addEventListener("pointermove", (e) => {
    mouse.tx = e.clientX;
    mouse.ty = e.clientY;
    mouse.tActive = 1;
  }, { passive: true });

  window.addEventListener("pointerdown", () => { mouse.down = 1; mouse.tActive = 1; }, { passive: true });
  window.addEventListener("pointerup", () => { mouse.down = 0; }, { passive: true });

  // se o mouse some, reduz efeito suavemente
  window.addEventListener("blur", () => { mouse.tActive = 0; mouse.down = 0; });
  document.addEventListener("mouseleave", () => { mouse.tActive = 0; mouse.down = 0; });

  // scroll follow
  window.addEventListener("scroll", () => {
    scroll.ty = window.scrollY || document.documentElement.scrollTop || 0;
  }, { passive: true });

  // pausa quando aba some
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (!reduceMotion) start();
  });

  // resize
  let rAf = 0;
  window.addEventListener("resize", () => {
    if (rAf) cancelAnimationFrame(rAf);
    rAf = requestAnimationFrame(() => {
      resize();
      rAf = 0;
    });
  });

  // menu mobile (se existir)
  const burger = document.getElementById("burger");
  const menu = document.getElementById("menu");
  if (burger && menu) {
    burger.addEventListener("click", () => {
      const isOpen = menu.classList.toggle("menu--open");
      burger.setAttribute("aria-expanded", String(isOpen));
    });
  }

  resize();

  if (reduceMotion) {
    ctx.fillStyle = CFG.BG_TINT;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  } else {
    start();
  }
})();
