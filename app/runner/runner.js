// Lama Run — eindeloze side-scroller demo.
// Spatie / pijltje omhoog / klik / tik = springen (in de lucht nog één keer = dubbele sprong).
// Langer ingedrukt houden = hoger springen.
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // Achtergrond: bg_scenery + bg_ground zijn de bovenste/onderste strook van één 1584x672 beeld.
  const BG_SCALE = H / 672;
  const GROUND_TOP = 594 * BG_SCALE;   // waar de grondstrook begint
  const GROUND_Y = 606 * BG_SCALE;     // hier staan de pootjes
  const PLAYER_X = 190;
  const PLAYER_H = 112;                // tekenhoogte van de staande lama

  const GRAVITY = 2600, JUMP_V = 900, DOUBLE_JUMP_V = 780, JUMP_CUT = 0.45;
  const START_SPEED = 330, MAX_SPEED = 720, SPEED_GAIN = 9; // px/s, px/s per seconde

  const ASSETS = ['bg_scenery', 'bg_ground', 'llama_walk', 'llama_jump', 'cactus', 'bat', 'armadillo', 'coin', 'heart'];
  const img = {};
  let meta = null;

  const load = name => new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('kan ' + name + ' niet laden'));
    const file = { bg_scenery: 'bg/weide_scenery.webp', bg_ground: 'bg/weide_ground.webp' }[name] || name + '.png'; // de weide uit de lama-reis
    i.src = '../img/lama/' + file;
  });

  // ---------- spelstatus ----------
  let state = 'title'; // title | play | over
  let speed, dist, score, coins, lives, best, time, invuln, spawnIn, coinIn;
  let player, entities, particles;

  try { best = +localStorage.getItem('lama-run-best') || 0; } catch { best = 0; }

  function reset() {
    speed = START_SPEED; dist = 0; score = 0; coins = 0; lives = 3; time = 0; invuln = 0;
    spawnIn = 1.6; coinIn = 0.6;
    player = { y: GROUND_Y, vy: 0, onGround: true, jumps: 0, holding: false, landT: 1, walkT: 0, jumpV0: JUMP_V };
    entities = []; particles = [];
  }
  reset();

  // ---------- invoer ----------
  function press() {
    if (state !== 'play') { reset(); state = 'play'; return; }
    if (player.onGround || player.jumps < 2) {
      const v = player.onGround ? JUMP_V : DOUBLE_JUMP_V;
      player.vy = -v; player.jumpV0 = v;
      player.onGround = false; player.jumps++; player.holding = true;
      puff(PLAYER_X, player.y, 6);
    }
  }
  function release() {
    player.holding = false;
    if (player.vy < 0) player.vy *= JUMP_CUT; // korte tik = lage sprong
  }
  const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'];
  addEventListener('keydown', e => { if (JUMP_KEYS.includes(e.code)) { e.preventDefault(); if (!e.repeat) press(); } });
  addEventListener('keyup', e => { if (JUMP_KEYS.includes(e.code)) release(); });
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
  addEventListener('pointerup', release);

  // ---------- spawnen ----------
  const ENEMY = {
    cactus:    { h: 78, ground: true,  speedMul: 1.0,  hit: [0.22, 0.12, 0.22, 0.02] },
    armadillo: { h: 58, ground: true,  speedMul: 1.35, hit: [0.12, 0.25, 0.12, 0.02], flip: true },
    bat:       { h: 58, ground: false, speedMul: 1.15, hit: [0.25, 0.25, 0.25, 0.25] },
  };

  function spawnEnemy() {
    const pool = time < 8 ? ['cactus'] : time < 18 ? ['cactus', 'armadillo'] : ['cactus', 'armadillo', 'bat'];
    const kind = pool[Math.floor(Math.random() * pool.length)];
    const def = ENEMY[kind], im = img[kind];
    const h = def.h, w = im.width * h / im.height;
    const e = { type: 'enemy', kind, def, x: W + w, w, h, t: Math.random() * 6 };
    e.baseY = def.ground ? GROUND_Y : GROUND_Y - 150 - Math.random() * 90;
    e.y = e.baseY;
    entities.push(e);
    // Af en toe een rijtje munten boven een vijand.
    if (def.ground && Math.random() < 0.6) coinArc(e.x - 40, 5, 150);
  }

  function coinArc(x0, n, height) {
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1);
      addCoin(x0 + i * 46, GROUND_Y - 60 - Math.sin(f * Math.PI) * height);
    }
  }
  function addCoin(x, y) { entities.push({ type: 'coin', x, y, w: 34, h: 36, t: Math.random() * 6 }); }

  function spawnCoins() {
    const r = Math.random();
    if (r < 0.35) for (let i = 0; i < 6; i++) addCoin(W + 40 + i * 46, GROUND_Y - 40);
    else if (r < 0.7) coinArc(W + 40, 7, 120 + Math.random() * 120);
    else { const y = GROUND_Y - 220 - Math.random() * 80; for (let i = 0; i < 5; i++) addCoin(W + 40 + i * 46, y); }
    if (lives < 3 && Math.random() < 0.12)
      entities.push({ type: 'heart', x: W + 360, y: GROUND_Y - 260, w: 38, h: 40, t: 0 });
  }

  // ---------- deeltjes ----------
  function puff(x, y, n, color = '#fff6e8') {
    for (let i = 0; i < n; i++)
      particles.push({ x, y, vx: -60 - Math.random() * 120, vy: -Math.random() * 120, life: 0.4 + Math.random() * 0.2, color, s: 4 + Math.random() * 4 });
  }
  function sparkle(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      particles.push({ x, y, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, life: 0.35, color, s: 5 });
    }
  }

  // ---------- botsing ----------
  function playerBox() {
    const h = PLAYER_H * 0.8, w = PLAYER_H * 0.55;
    return { x: PLAYER_X - w / 2, y: player.y - h, w, h };
  }
  function entityBox(e) {
    if (e.type !== 'enemy') return { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };
    const [l, t, r, b] = e.def.hit;
    const top = e.def.ground ? e.y - e.h : e.y - e.h / 2;
    return { x: e.x - e.w / 2 + e.w * l, y: top + e.h * t, w: e.w * (1 - l - r), h: e.h * (1 - t - b) };
  }
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ---------- update ----------
  function update(dt) {
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
    if (state !== 'play') { player.walkT += dt; return; }

    time += dt;
    speed = Math.min(MAX_SPEED, START_SPEED + time * SPEED_GAIN);
    dist += speed * dt;
    score = Math.floor(dist / 40) + coins * 10;
    invuln = Math.max(0, invuln - dt);

    // speler
    const g = player.vy > 0 || !player.holding ? GRAVITY * 1.25 : GRAVITY;
    player.vy += g * dt;
    player.y += player.vy * dt;
    if (player.y >= GROUND_Y) {
      if (!player.onGround) { player.landT = 0; puff(PLAYER_X, GROUND_Y, 5); }
      player.y = GROUND_Y; player.vy = 0; player.onGround = true; player.jumps = 0;
    }
    player.landT += dt;
    player.walkT += dt * (speed / START_SPEED);

    // spawnen
    spawnIn -= dt; coinIn -= dt;
    if (spawnIn <= 0) {
      spawnEnemy();
      const gap = Math.max(0.75, 1.9 - time * 0.02);
      spawnIn = gap + Math.random() * gap;
    }
    if (coinIn <= 0) { spawnCoins(); coinIn = 2.2 + Math.random() * 1.8; }

    // entiteiten
    const pb = playerBox();
    for (const e of entities) {
      e.t += dt;
      e.x -= speed * (e.type === 'enemy' ? e.def.speedMul : 1) * dt;
      if (e.type === 'enemy' && e.kind === 'bat') e.y = e.baseY + Math.sin(e.t * 3) * 40;
      if (e.dead || !overlap(pb, entityBox(e))) continue;
      if (e.type === 'coin') { e.dead = true; coins++; sparkle(e.x, e.y, '#ffd34d'); }
      else if (e.type === 'heart') { e.dead = true; lives = Math.min(3, lives + 1); sparkle(e.x, e.y, '#ff5a8a'); }
      else if (invuln <= 0) {
        // Op een vijand landen = vijand weg + extra sprong.
        if (player.vy > 200 && pb.y + pb.h < entityBox(e).y + 26) {
          e.dead = true; coins += 2; player.vy = -JUMP_V * 0.8; player.jumps = 1;
          sparkle(e.x, e.y - e.h / 2, '#ffffff');
        } else {
          lives--; invuln = 1.4; sparkle(PLAYER_X, player.y - 50, '#ff5a8a');
          if (lives <= 0) gameOver();
        }
      }
    }
    entities = entities.filter(e => !e.dead && e.x > -200);
  }

  function gameOver() {
    state = 'over';
    if (score > best) { best = score; try { localStorage.setItem('lama-run-best', best); } catch {} }
  }

  // ---------- tekenen ----------
  function tile(im, offset, y, h) {
    const w = im.width * h / im.height;
    let x = -(offset % w);
    for (; x < W; x += w) ctx.drawImage(im, Math.floor(x), y, Math.ceil(w) + 1, h);
  }

  function llamaFrame() {
    const m = meta;
    if (!player.onGround) {
      const j = m.jump;
      let f;
      if (player.vy < 0) { // stijgen: takeoff → apex
        const k = 1 - Math.min(1, -player.vy / player.jumpV0);
        f = j.takeoff + k * (j.apex - j.takeoff);
      } else { // vallen: apex → land
        const k = Math.min(1, player.vy / (JUMP_V * 1.1));
        f = j.apex + k * (j.land - j.apex);
      }
      return { sheet: 'llama_jump', i: Math.round(f) };
    }
    if (player.landT < 0.2) { // korte landing-squash
      const j = meta.jump;
      const n = Math.max(1, j.frames - 1 - j.land);
      return { sheet: 'llama_jump', i: Math.min(j.frames - 1, j.land + Math.floor(player.landT / 0.2 * n)) };
    }
    const wk = m.walk;
    return { sheet: 'llama_walk', i: Math.floor(player.walkT * wk.fps) % wk.frames };
  }

  function drawLlama() {
    if (invuln > 0 && Math.floor(invuln * 12) % 2) return;
    const { sheet, i } = llamaFrame();
    const sm = meta[sheet === 'llama_walk' ? 'walk' : 'jump'];
    const s = PLAYER_H / meta.standH;
    const dw = sm.cellW * s, dh = sm.cellH * s;
    ctx.drawImage(img[sheet], i * sm.cellW, 0, sm.cellW, sm.cellH,
      Math.round(PLAYER_X - sm.anchorX * s), Math.round(player.y - dh), Math.round(dw), Math.round(dh));
  }

  function drawEntity(e) {
    if (e.type === 'coin') {
      const sx = Math.abs(Math.cos(e.t * 4)); // draaiende munt
      ctx.drawImage(img.coin, e.x - e.w * sx / 2, e.y - e.h / 2, e.w * Math.max(sx, 0.15), e.h);
    } else if (e.type === 'heart') {
      const b = Math.sin(e.t * 5) * 4;
      ctx.drawImage(img.heart, e.x - e.w / 2, e.y - e.h / 2 + b, e.w, e.h);
    } else {
      const im = img[e.kind];
      const top = e.def.ground ? e.y - e.h : e.y - e.h / 2;
      ctx.save();
      ctx.translate(e.x, top + e.h / 2);
      if (e.def.flip) ctx.scale(-1, 1);
      if (e.kind === 'cactus') ctx.rotate(Math.sin(e.t * 8) * 0.06);          // waggelen
      if (e.kind === 'armadillo') ctx.translate(0, -Math.abs(Math.sin(e.t * 12)) * 3);
      if (e.kind === 'bat') ctx.scale(1, 0.9 + Math.abs(Math.sin(e.t * 14)) * 0.1);
      ctx.drawImage(im, -e.w / 2, -e.h / 2, e.w, e.h);
      ctx.restore();
    }
  }

  function text(str, x, y, size, align = 'center', color = '#fff') {
    ctx.font = `bold ${size}px "Courier New", monospace`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = '#3a2350'; ctx.lineJoin = 'round';
    ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y);
  }

  function draw() {
    ctx.imageSmoothingEnabled = true;
    tile(img.bg_scenery, dist * 0.25, 0, img.bg_scenery.height * BG_SCALE);
    tile(img.bg_ground, dist, GROUND_TOP, H - GROUND_TOP + 1);

    for (const e of entities) drawEntity(e);
    drawLlama();
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2.5);
      ctx.fillStyle = p.color; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;

    // HUD
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i < lives ? 1 : 0.25;
      ctx.drawImage(img.heart, 20 + i * 42, 16, 36, 38);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(img.coin, W - 190, 16, 34, 36);
    text('' + coins, W - 146, 35, 28, 'left', '#ffe066');
    text('' + score, W / 2, 35, 32);

    if (state === 'title') {
      text('LAMA RUN', W / 2, 170, 72, 'center', '#ffd1e3');
      text('Spring over vijanden en raap munten!', W / 2, 250, 24);
      text('SPATIE / TIK = springen · 2x = dubbele sprong', W / 2, 290, 20);
      if (Math.floor(performance.now() / 500) % 2) text('druk om te starten', W / 2, 350, 26, 'center', '#ffe066');
    } else if (state === 'over') {
      text('GAME OVER', W / 2, 180, 64, 'center', '#ff8fb1');
      text(`score ${score}   ·   record ${best}`, W / 2, 255, 28);
      if (Math.floor(performance.now() / 500) % 2) text('druk om opnieuw te spelen', W / 2, 330, 26, 'center', '#ffe066');
    }
  }

  // ---------- lus ----------
  let last = 0;
  function frame(t) {
    const dt = Math.min(0.033, (t - last) / 1000 || 0);
    last = t;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  Promise.all([
    ...ASSETS.map(n => load(n).then(i => { img[n] = i; })),
    fetch('../img/lama/llama.json').then(r => r.json()).then(j => { meta = j; }),
  ]).then(() => requestAnimationFrame(frame)).catch(err => {
    ctx.fillStyle = '#fff'; ctx.font = '20px monospace'; ctx.fillText(err.message, 20, 40);
  });
})();
