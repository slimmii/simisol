// Lama-spel: de lama loopt vanzelf door het landschap. Boven in de lucht hangt een notenbalk;
// elke noot staat recht boven een monster. De blauwe balk (vlak voor de lama) is het venster
// waarin je de noot moet spelen. Speel je ze juist terwijl ze in de balk staat, dan springt de
// lama meteen over het monster (+1 punt). Fout gespeeld, of de noot is de balk uit: het monster
// botst tegen de lama (-1 leven). Na 3 botsingen is het spel uit.
// Af en toe hangt er in plaats van een monster een munt in de lucht: speel die noot en de lama springt
// en vangt de munt (voor de winkel). Mis je ze, dan vliegt ze weg; botsen doe je niet. Onsterfelijk: geen munten.
// Op de reis staat er aan de grens met een nieuw landschap een poortwachter (queueBoss): speel zijn noot
// (de nieuwe noot) een paar keer juist en hij is verslagen. Zijn wolkjes kosten geen leven.
import { parseNote, soundingMidi, solfege, solfegeOf, describePosition } from './notes.js';
import { loadLlama, drawLlama, drawParticle, trailParticles, trailRate } from './lama-style.js';
import { World, MONSTERS } from './lama-world.js';

const VF = window.Vex.Flow;
const SVGNS = 'http://www.w3.org/2000/svg';

// Spelwereld in canvas-eenheden (het canvas wordt geschaald naar de breedte van de pagina).
const W = 960, H = 540;
const BG_SCALE = H / 672; // achtergrond + bodem van elk landschap zijn de boven-/onderstrook van een 1584x672 beeld
const GROUND_Y = 606 * BG_SCALE; // hier staan de pootjes
const PLAYER_X = 190;
const PLAYER_H = 112;
const PX_PER_BEAT = 220; // afstand tussen twee monsters (= twee noten)
const K = 1.6; // vergroting van de notenbalk t.o.v. VexFlow-eenheden
const LEAD_BEATS = 4; // zoveel tellen loopt de lama voor het eerste monster komt

// Beoordeling. Het speelvenster (de blauwe balk) ligt tussen BAR_LATE en BAR_LATE + breedte
// pixels vóór de lama: zolang de noot daarin staat, is het monster eronder nog niet bij de lama.
const CONTACT_PX = 34; // het monster raakt de lama als het zo dicht bij is
const BAR_LATE = CONTACT_PX + 18; // linkerrand van de balk (laatste moment om te spelen)
const GRACE = 0.15; // s na de botsing waarin een (vertraagd herkende) juiste tokkel nog telt
const JUMP_MARGIN = 20; // px extra lucht achter het monster

const LETTER_STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const diatonic = (p) => { const n = parseNote(p); return n.octave * 7 + LETTER_STEP[n.letter]; };
const E4 = 4 * 7 + 2; // onderste lijn
const B4 = 4 * 7 + 6; // middelste lijn

const COIN_Y = GROUND_Y - 165; // hoogte van de munten: daar zit de lama bovenaan haar sprong
const COIN_CHANCE = 1 / 2; // kans op een munt na minstens één monster: gemiddeld 1 op 3 noten (nooit twee na elkaar)
const BOSS_X = 770; // daar blijft de poortwachter staan
const BOSS_H = 150;

export class LamaGame {
  /**
   * @param {{container: HTMLElement, hud: {score: HTMLElement, best: HTMLElement, lives: HTMLElement, msg: HTMLElement},
   *          ctx: () => AudioContext, click: (t:number, accent:boolean) => void,
   *          setExpect: (midis:number[]) => void, onTarget?: (note:string|null) => void,
   *          onOver?: () => void}} opts
   */
  constructor(opts) {
    this.o = opts;
    this.running = false;
    this.over = false;
    this.pool = ['G4', 'B4', 'E5'];
    this.bpm = 30;
    this.metro = true;
    this.showNames = false;
    this.showFingers = true;
    this.bigName = true;
    this.maxLives = 3; // 0 = onsterfelijk: botsen mag, het spel stopt nooit // naam van de noot die aan de beurt is, groot in de lucht
    this.barBeats = 0.45; // breedte van het speelvenster in tellen
    this.best = 0;
    this.onBest = null; // (best) => void, om het record te bewaren
    this.onCoin = null; // () => void, als de lama een munt vangt
    this.onJudge = null; // (noot, juist) => void, voor elke beslissing (voor sterren en de voortgang op de reis)
    this.onBossWon = null; // (boss) => void
    this.coinChance = COIN_CHANCE;
    this.fresh = {}; // noot -> hoe vaak ze nog extra vaak (en met naam) moet komen, net nadat ze nieuw is
    this.boss = null;
    this.outfit = {}; // wat de lama draagt (zie lama-style.js)
    this.trailT = 0;
    this.img = {};
    this.world = new World({ W, H, top: 0 });
    this.dist = W; // afgelegde weg (loopt ook in het startscherm); zo begint ook de achtergrond in de weide
    this.biomeNow = null;
    this.banner = null; // naam van een nieuw landschap, even in beeld
    this.ready = this.load();
    this.reset();
  }

  async load() {
    const [A] = await Promise.all([loadLlama(), this.world.load()]);
    this.A = A;
    Object.assign(this.img, A.img);
    this.meta = A.meta;
  }

  setPool(pool) {
    this.pool = pool.length ? [...pool] : ['G4', 'B4', 'E5'];
    if (!this.running) { this.reset(); this.layer && this.rebuildNotes(); }
  }

  reset() {
    this.notes = []; // {p, beat, kind, finger, state: null|'hit'|'wrong'|'missed', el, ...}
    this.beat = 0;
    this.score = 0;
    this.lives = this.maxLives;
    this.bumps = 0;
    this.over = false;
    this.lastBeatClick = -1;
    this.hist = [];
    this.prev = [];
    this.lastFinger = 'i';
    this.sinceCoin = 0;
    this.coins = 0; // munten gevangen in dit spel
    this.boss = null;
    this.lastHit = null;
    this.player = { y: GROUND_Y, jump: null, queue: [], landT: 1, walk: 0, hurt: 0 }; // queue: noten om over te springen
    this.particles = [];
    this.floaters = [];
    this.shake = 0;
    this.fill();
    this.updateHud();
    this.say('');
  }

  // Willekeurige noot uit de pool; een net nieuwe noot (fresh) komt drie keer zo vaak.
  pickPitch() {
    const w = this.pool.map((p) => (this.fresh[p] > 0 ? 3 : 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return this.pool[i];
    return this.pool[0];
  }

  nextPitch() {
    let p, tries = 0;
    do { p = this.pickPitch(); tries++; }
    while (this.pool.length > 1 && this.prev.length >= 2 && this.prev.every((x) => x === p) && tries < 10);
    this.prev = [...this.prev.slice(-1), p];
    return p;
  }

  fill() {
    const visible = W / PX_PER_BEAT + 2;
    let last = this.notes.length ? this.notes[this.notes.length - 1].beat : LEAD_BEATS - 1;
    while (last < this.beat + visible) {
      last += 1;
      this.lastFinger = this.lastFinger === 'm' ? 'i' : 'm';
      const b = this.boss;
      if (b && !b.won) { // poortwachter: al zijn noten zijn de nieuwe noot, met naam erbij
        this.notes.push({
          p: b.notes[b.made++ % b.notes.length], beat: last, state: null, el: null, finger: this.lastFinger,
          kind: b.minion, boss: true, showName: true, t: Math.random() * 6,
        });
        continue;
      }
      const coin = !this.immortal() && last >= LEAD_BEATS + 2 && this.sinceCoin >= 1 && Math.random() < this.coinChance;
      this.sinceCoin = coin ? 0 : this.sinceCoin + 1;
      const p = this.nextPitch();
      const fresh = this.fresh[p] > 0;
      if (fresh) this.fresh[p]--;
      this.notes.push({
        p, beat: last, state: null, el: null, finger: this.lastFinger, showName: fresh,
        // het monster hoort bij het landschap waar het staat
        kind: coin ? 'coin' : this.world.monsterAt(this.worldX(last)), t: Math.random() * 6,
      });
    }
  }

  // Waar (afgelegde weg) de noot op tel 'beat' op de bodem staat.
  worldX(beat) { return this.dist + PLAYER_X + (beat - this.beat) * PX_PER_BEAT; }

  // ---------- poortwachter ----------
  // b = {notes: [nieuwe noten], need: aantal keer juist, monster: id van de wachter, minion: id van zijn wolkjes, name}
  queueBoss(b) {
    if (this.boss) return;
    this.boss = { ...b, hits: 0, made: 0, won: false, x: W + 140, flash: 0, dieT: 0 };
    this.banner = { text: `Een poortwachter! Speel ${b.notes.map(solfegeOf).join(' en ')}`, life: 3.5 };
    this.say(`De poortwachter van ${b.name} laat je pas door als je ${b.need} keer ${b.notes.map(solfegeOf).join('/')} speelt.`);
  }

  hitBoss(n) {
    const b = this.boss;
    b.hits++;
    b.flash = 0.35;
    for (let i = 0; i < 12; i++) { // een straal sterretjes van de lama naar de wachter
      const u = i / 12;
      this.particles.push({ kind: 'spark', x: PLAYER_X + u * (b.x - PLAYER_X), y: GROUND_Y - 80 - Math.sin(u * Math.PI) * 60, vx: 0, vy: -20, g: 0, life: 0.5 + u * 0.2, color: '#ffe066', s: 7, rot: 0 });
    }
    this.floaters.push({ x: b.x, y: GROUND_Y - BOSS_H - 50, text: `${b.hits}/${b.need}`, life: 0.9 });
    if (b.hits >= b.need) this.winBoss();
  }

  winBoss() {
    const b = this.boss;
    b.won = true;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260;
      this.particles.push({ kind: 'confetti', x: b.x, y: GROUND_Y - BOSS_H / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 150, g: 400, life: 1.4, rot: a,
        color: ['#ff5a8a', '#5ec8ff', '#ffe066', '#7ee08a', '#c79bff'][i % 5], s: 8 });
    }
    // de app maakt de noot vrij, geeft de munten en zet het volgende landschap klaar
    const coins = this.onBossWon?.(b) || 0;
    if (coins) this.floaters.push({ x: b.x + 20, y: GROUND_Y - BOSS_H - 30, text: `+${coins}`, life: 2.2, coin: true });
    this.say(coins ? `Poortwachter verslagen! +${coins} munten 🪙` : 'Poortwachter verslagen!');
    // de wolkjes die nog komen, worden gewone noten (met de nieuwe noot erbij)
    for (const n of this.notes) {
      if (!n.boss || n.state) continue;
      n.boss = false; n.showName = false;
      n.p = this.nextPitch();
      n.kind = this.world.monsterAt(this.worldX(n.beat));
      n.el?.remove(); n.el = null;
    }
    this.sendExpect();
  }

  // De noot die nu aan de beurt is: de eerste die nog niet beslist is.
  target() { return this.notes.find((n) => !n.state) || null; }

  // ---------- opbouw (canvas + notenbalk erboven als SVG, zoals in het andere spel) ----------
  draw() {
    const box = this.o.container;
    box.innerHTML = '';
    box.classList.add('lama');
    const canvas = document.createElement('canvas');
    box.appendChild(canvas);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = Math.max(320, box.clientWidth);
    const s = (cssW * dpr) / W;
    canvas.width = Math.round(W * s);
    canvas.height = Math.round(H * s);
    this.g = canvas.getContext('2d');
    this.g.setTransform(s, 0, 0, s, 0, 0);

    const SW = W / K, SH = H / K;
    const renderer = new VF.Renderer(box, VF.Renderer.Backends.SVG);
    renderer.resize(cssW, (cssW * H) / W);
    const svg = box.querySelector('svg');
    svg.setAttribute('viewBox', `0 0 ${SW} ${SH}`);
    svg.classList.add('lama-sky');
    // wolkje achter de notenbalk
    const panel = document.createElementNS(SVGNS, 'rect');
    panel.setAttribute('x', 4); panel.setAttribute('y', 3);
    panel.setAttribute('width', SW - 8); panel.setAttribute('height', 104);
    panel.setAttribute('rx', 12);
    panel.setAttribute('class', 'lama-panel');
    svg.appendChild(panel);
    const vctx = renderer.getContext();
    const stave = new VF.Stave(8, -14, SW - 16);
    stave.addClef('treble');
    stave.setEndBarType(VF.BarlineType.NONE);
    stave.setContext(vctx).draw();
    this.lineY = (i) => stave.getYForLine(i);
    this.svg = svg;

    // speelvenster: de blauwe balk, met een dun lijntje voor het ideale moment
    const top = this.lineY(0) - 22, height = this.lineY(4) - this.lineY(0) + 44;
    this.bar = document.createElementNS(SVGNS, 'rect');
    this.bar.setAttribute('y', top);
    this.bar.setAttribute('height', height);
    this.bar.setAttribute('rx', 6);
    this.bar.setAttribute('class', 'lama-bar');
    svg.appendChild(this.bar);
    this.barMid = document.createElementNS(SVGNS, 'rect');
    this.barMid.setAttribute('y', top + 4);
    this.barMid.setAttribute('width', 2);
    this.barMid.setAttribute('height', height - 8);
    this.barMid.setAttribute('class', 'lama-bar-mid');
    svg.appendChild(this.barMid);
    this.placeBar();

    const clip = document.createElementNS(SVGNS, 'clipPath');
    clip.setAttribute('id', 'lamaClip');
    const cr = document.createElementNS(SVGNS, 'rect');
    cr.setAttribute('x', stave.getNoteStartX() - 4);
    cr.setAttribute('y', 0);
    cr.setAttribute('width', SW - 8 - stave.getNoteStartX());
    cr.setAttribute('height', SH);
    clip.appendChild(cr);
    svg.appendChild(clip);
    this.layer = document.createElementNS(SVGNS, 'g');
    this.layer.setAttribute('clip-path', 'url(#lamaClip)');
    svg.appendChild(this.layer);
    this.rebuildNotes();
  }

  rebuildNotes() {
    this.layer.innerHTML = '';
    for (const n of this.notes) n.el = null;
  }

  makeNote(n) {
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'gnote');
    const d = diatonic(n.p);
    const base = this.lineY(4);
    const y = base - (d - E4) * 5;
    for (let s = E4 - 2; s >= d; s -= 2) g.appendChild(line(-9, base - (s - E4) * 5, 9, base - (s - E4) * 5, 'gledger'));
    for (let s = E4 + 10; s <= d; s += 2) g.appendChild(line(-9, base - (s - E4) * 5, 9, base - (s - E4) * 5, 'gledger'));
    const head = document.createElementNS(SVGNS, 'ellipse');
    head.setAttribute('cx', 0);
    head.setAttribute('cy', y);
    head.setAttribute('rx', 6.2);
    head.setAttribute('ry', 4.4);
    head.setAttribute('transform', `rotate(-20 0 ${y})`);
    head.setAttribute('class', 'ghead');
    g.appendChild(head);
    g.appendChild(d < B4 ? line(5.6, y - 1, 5.6, y - 34, 'gstem') : line(-5.6, y + 1, -5.6, y + 34, 'gstem'));
    const acc = parseNote(n.p).acc;
    if (acc) g.appendChild(text(acc === '#' ? '♯' : '♭', -16, y + 5, 'gacc'));
    if (this.showFingers) g.appendChild(text(n.finger, 0, this.lineY(0) - 13, 'gfinger'));
    const named = this.showNames || n.showName; // nieuwe noten en die van de poortwachter: altijd met naam
    if (named) g.appendChild(text(solfegeOf(n.p), 0, base + 24, 'gname'));
    n.tag = text('', 0, base + (named ? 36 : 26), 'gtag');
    g.appendChild(n.tag);
    this.layer.appendChild(g);
    return g;
  }

  // ---------- lus ----------
  // Ook buiten het spel loopt de lama (in het startscherm en na game over).
  show() {
    if (this.raf) return;
    this.lastT = null;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.tick();
    };
    this.ready.then(() => { if (!this.raf) loop(); }).catch((e) => this.say(e.message));
  }

  hide() {
    this.stop();
    cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  clock() { return this.running ? this.o.ctx().currentTime : performance.now() / 1000; }

  start() {
    this.reset();
    if (!this.layer) this.draw(); else this.rebuildNotes();
    this.running = true;
    this.lastT = this.clock();
    this.sendExpect();
    this.show();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.lastT = null;
    this.o.setExpect([]);
    this.o.onTarget?.(null);
  }

  gameOver() {
    this.stop();
    this.over = true;
    if (!this.immortal() && this.score > this.best) { this.best = this.score; this.onBest?.(this.best); }
    this.updateHud();
    this.say(`Game over! ${this.score} ${this.score === 1 ? 'punt' : 'punten'}.`);
    this.o.onOver?.();
  }

  immortal() { return !this.maxLives; }

  barW() { return this.barBeats * PX_PER_BEAT; }
  // afstand (px) van de noot tot de lama: in de balk als BAR_LATE <= d <= BAR_LATE + barW()
  inBar(d) { return d >= BAR_LATE && d <= BAR_LATE + this.barW(); }

  setBarBeats(b) {
    this.barBeats = b;
    if (this.bar) this.placeBar();
  }

  placeBar() {
    const x0 = (PLAYER_X + BAR_LATE) / K, w = this.barW() / K;
    this.bar.setAttribute('x', x0);
    this.bar.setAttribute('width', w);
    this.barMid.setAttribute('x', x0 + w / 2 - 1);
  }

  spb() { return 60 / this.bpm; }
  speed() { return (PX_PER_BEAT * this.bpm) / 60; } // px per seconde
  xOf(n) { return PLAYER_X + (n.beat - this.beat) * PX_PER_BEAT; }

  tick() {
    const now = this.clock();
    const dt = this.lastT == null ? 0 : Math.max(0, Math.min(0.1, now - this.lastT));
    this.lastT = now;
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g ?? 500) * dt; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) { f.y -= 40 * dt; f.life -= dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.shake = Math.max(0, this.shake - dt);
    const pl = this.player;
    pl.hurt = Math.max(0, pl.hurt - dt);

    if (this.running) {
      const next = this.beat + (dt * this.bpm) / 60;
      // metronoom: tik telkens een noot in het midden van de blauwe balk staat
      const mid = (BAR_LATE + this.barW() / 2) / PX_PER_BEAT;
      const whole = Math.floor(next + mid + 1e-6);
      if (whole > this.lastBeatClick) {
        this.lastBeatClick = whole;
        if (this.metro) this.o.click(now, whole % 4 === 0);
      }
      this.beat = next;
      this.dist += this.speed() * dt;
      this.hist.push({ t: now, beat: next });
      while (this.hist.length > 2 && now - this.hist[0].t > 4) this.hist.shift();
      this.fill();
      this.collide(now);
    } else if (!this.over) {
      this.dist += 60 * dt; // rustig wandelen in het startscherm
    }

    // springen (een juiste noot tijdens een sprong: na de landing meteen opnieuw)
    if (!pl.jump && pl.queue.length) {
      const D = this.jumpTime(pl.queue.shift());
      pl.jump = { t0: now, D, h: 105 + 45 * Math.min(1, D) };
    }
    if (pl.jump) {
      const u = (now - pl.jump.t0) / pl.jump.D;
      if (u >= 1) { pl.jump = null; pl.y = GROUND_Y; pl.landT = 0; this.puff(PLAYER_X, GROUND_Y, 5); }
      else pl.y = GROUND_Y - 4 * pl.jump.h * u * (1 - u);
    }
    pl.landT += dt;
    // spoor achter de lama (zie de winkel)
    if (this.outfit.trail && !this.over) {
      const r = trailRate(this.outfit.trail);
      this.trailT = Math.min(this.trailT + dt, 0.3);
      while (this.trailT > r) {
        this.trailT -= r;
        this.particles.push(...trailParticles(this.outfit.trail, PLAYER_X - 36, pl.y - 50, this.running ? this.speed() : 60));
      }
    }
    for (const n of this.notes) n.t += dt;
    // een nieuw landschap onder de pootjes: even de naam tonen
    const here = this.world.biomeAt(this.dist + PLAYER_X);
    if (this.biomeNow && here !== this.biomeNow && this.running) this.banner = { text: here.name, life: 3 };
    this.biomeNow = here;
    if (this.boss) {
      const b = this.boss;
      b.flash = Math.max(0, b.flash - dt);
      if (b.won) { b.dieT += dt; if (b.dieT > 1.2) this.boss = null; }
      else b.x = Math.max(BOSS_X, b.x - 160 * dt); // komt binnen en blijft dan staan
    }
    if (this.banner) { this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
    if (!this.over) pl.walk += dt * Math.max(0.5, this.running ? this.bpm / 30 : 0.5);

    this.render(now);
    this.paintNotes(now);
  }

  // Luchttijd: de lama blijft in de lucht tot het monster van noot n helemaal onder haar door is.
  // Bij een munt: zo lang dat ze bovenaan haar sprong is als de munt bij haar is.
  jumpTime(n) {
    const d = this.xOf(n) - PLAYER_X;
    if (n.kind === 'coin') return Math.min(Math.max((2 * d) / this.speed(), 0.4), 0.95 * this.spb() + 0.3);
    return Math.min(Math.max((d + CONTACT_PX + JUMP_MARGIN) / this.speed(), 0.35), 0.95 * this.spb() + 0.3);
  }

  collide(now) {
    for (const n of this.notes) {
      const x = this.xOf(n);
      if (n.kind === 'coin' && n.state === 'hit' && !n.caught && x <= PLAYER_X + 20) this.catchCoin(n, x);
      if (n.bumped || n.state === 'hit') continue;
      if (x > PLAYER_X + CONTACT_PX) break;
      if (n.kind === 'coin') { // een munt botst niet: gemist is gemist
        if (n.state === 'wrong') { n.bumped = true; continue; }
        if (n.contactAt == null) n.contactAt = now;
        if (now - n.contactAt < GRACE) continue;
        n.state = 'missed'; n.wrongText = 'gemist'; n.bumped = true; n.lostT = n.t;
        this.judge(n, false);
        this.say('Munt gemist…');
        this.sendExpect();
        continue;
      }
      if (n.contactAt == null) n.contactAt = now;
      // even wachten: de herkenning van een tokkel die nét op tijd was, heeft wat tijd nodig
      if (n.state !== 'wrong' && now - n.contactAt < GRACE) continue;
      if (!n.state) { n.state = 'missed'; n.wrongText = 'te laat'; this.judge(n, false); }
      if (n.boss) { // een wolkje van de poortwachter: even schrikken, maar geen leven kwijt
        n.bumped = true; n.poof = true;
        this.player.hurt = 0.5; this.shake = 0.2;
        this.say(`Bijna! De poortwachter wil ${solfegeOf(n.p)} horen (${describePosition(n.p)}).`);
      } else this.bump(n);
      this.sendExpect();
    }
    while (this.notes.length && this.xOf(this.notes[0]) < -120) this.notes.shift().el?.remove();
  }

  judge(n, ok) { this.onJudge?.(n.p, ok, n); }

  catchCoin(n, x) {
    n.caught = true;
    this.coins++;
    this.onCoin?.();
    this.floaters.push({ x: x + 30, y: COIN_Y - 40, text: '+1', life: 1.2, coin: true });
    this.sparkle(x, COIN_Y, '#ffd84a');
    this.sparkle(x, COIN_Y, '#fff6a8');
    this.say(this.coins === 1 ? 'Een munt! 🪙 Daarmee koop je iets in de winkel.' : `Munt gevangen! (${this.coins} dit spel)`);
  }

  bump(n) {
    n.bumped = true;
    n.poof = true;
    this.bumps++;
    if (!this.immortal()) this.lives--;
    this.player.hurt = 1.2;
    this.shake = 0.35;
    this.sparkle(PLAYER_X + 30, GROUND_Y - 50, '#ff5a8a');
    this.updateHud(true);
    if (!this.immortal() && this.lives <= 0) return this.gameOver();
    this.say(n.state === 'wrong' ? `Au! Dat was ${solfegeOf(n.p)}, niet ${n.played}.` : `Au! Te laat voor ${solfegeOf(n.p)}.`);
  }

  // Positie van de wereld op tijdstip t (bv. het moment van een tokkel, al gecorrigeerd voor de microfoonvertraging).
  beatAt(t) {
    const h = this.hist;
    if (!h.length || t >= h[h.length - 1].t) return this.beat;
    if (t <= h[0].t) return h[0].beat;
    let i = h.length - 1;
    while (i > 0 && h[i - 1].t > t) i--;
    const a = h[i - 1], b = h[i];
    return a.beat + ((b.beat - a.beat) * (t - a.t)) / (b.t - a.t || 1);
  }

  sendExpect() {
    const open = this.notes.filter((n) => !n.state).slice(0, 2).map((n) => soundingMidi(n.p));
    this.o.setExpect([...new Set(open)]);
    this.o.onTarget?.(this.target()?.p ?? null);
  }

  onNote(ev) {
    if (!this.running) return;
    const tgt = this.target();
    if (!tgt) return;
    const now = this.o.ctx().currentTime;
    const at = Math.min(ev.time ?? now, now);
    // Waar stond de noot op het moment van de tokkel (niet: toen de herkenning klaar was)?
    const d = (tgt.beat - this.beatAt(at)) * PX_PER_BEAT;
    // Nog niet in de blauwe balk: niet meetellen en niet bestraffen, enkel laten zien.
    if (d > BAR_LATE + this.barW()) {
      if (ev.attack !== false) tgt.earlyUntil = now + 0.6;
      return;
    }
    // Voorbij de balk en het monster is al bij de lama: te laat, het gaat botsen.
    // (Net na de balk, maar vóór de botsing, telt nog: een kleine onzichtbare marge.)
    if (d < CONTACT_PX && ev.midi === soundingMidi(tgt.p)) return;
    if (ev.midi === soundingMidi(tgt.p) && tgt.kind === 'coin') { // springen om de munt te vangen, geen punt
      tgt.state = 'hit';
      this.judge(tgt, true);
      this.lastHit = { midi: ev.midi, time: ev.time };
      this.player.queue.push(tgt);
      this.sendExpect();
      return;
    }
    if (ev.midi === soundingMidi(tgt.p)) {
      tgt.state = 'hit';
      this.judge(tgt, true);
      if (tgt.boss && this.boss && !this.boss.won) this.hitBoss(tgt);
      this.lastHit = { midi: ev.midi, time: ev.time };
      this.score++;
      if (!this.immortal() && this.score > this.best) { this.best = this.score; this.onBest?.(this.best); }
      this.updateHud();
      this.say(this.score % 10 === 0 ? `${this.score} punten! 🔥` : '');
      this.floaters.push({ x: PLAYER_X, y: GROUND_Y - PLAYER_H - 20, text: '+1', life: 0.8 });
      this.player.queue.push(tgt); // meteen springen, over het monster van deze noot

      this.sendExpect();
      return;
    }
    // Alleen een duidelijke nieuwe aanslag kan fout zijn: geen nagalm, geen dubbele detectie van de vorige noot.
    if (ev.attack === false) return;
    if (this.lastHit && ev.midi === this.lastHit.midi && ev.time - this.lastHit.time < 0.3) return;
    tgt.state = 'wrong';
    tgt.played = solfege(ev.midi + 12);
    tgt.wrongText = `fout: ${tgt.played}`;
    this.judge(tgt, false);
    if (tgt.boss) this.say(`Fout: ${tgt.played}. De poortwachter wil ${solfegeOf(tgt.p)} horen.`);
    else if (tgt.kind === 'coin') { tgt.lostT = tgt.t; this.say(`Fout: ${tgt.played}. De munt vliegt weg…`); }
    else this.say(`Fout: ${tgt.played}. De lama gaat botsen…`);
    this.sendExpect();
  }

  // ---------- tekenen ----------
  render(now) {
    const g = this.g;
    if (!g || !this.meta) return;
    const dist = this.dist;
    g.save();
    if (this.shake > 0) g.translate((Math.random() - 0.5) * 10 * this.shake, (Math.random() - 0.5) * 6 * this.shake);
    g.imageSmoothingEnabled = true;
    this.world.draw(g, dist);

    for (const n of this.notes) {
      const x = this.xOf(n);
      if (x > W + 80 || x < -120) continue;
      if (n.kind === 'coin') { this.drawCoin(n, x); continue; }
      if (n.poof) { this.poofMonster(n, x); continue; }
      this.drawMonster(n, x);
    }
    if (this.banner && this.running) {
      g.globalAlpha = Math.min(1, this.banner.life, (3 - this.banner.life) * 3);
      label(g, this.banner.text, W / 2, 340, 38, '#fff6c8');
      g.globalAlpha = 1;
    }
    if (this.boss) this.drawBoss(now);
    for (const p of this.particles) if (p.kind) drawParticle(g, p, this.img); // spoor: achter de lama
    this.drawLlama(now);
    if (this.bigName && this.running) this.drawBigName();
    for (const p of this.particles) {
      if (p.kind) continue;
      g.globalAlpha = Math.max(0, p.life * 2.5);
      g.fillStyle = p.color;
      g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    g.globalAlpha = 1;
    for (const f of this.floaters) {
      g.globalAlpha = Math.min(1, f.life * 2);
      if (f.coin) g.drawImage(this.img.coin, f.x - 48, f.y - 18, 34, 36);
      label(g, f.text, f.x, f.y, 30, f.coin ? '#ffd84a' : '#2f9e57');
    }
    g.globalAlpha = 1;
    g.restore();

    if (!this.running) {
      g.fillStyle = 'rgba(43,36,32,.35)';
      g.fillRect(0, 0, W, H);
      if (this.over) {
        label(g, 'GAME OVER', W / 2, 260, 64, '#ff8fb1');
        label(g, `${this.score} ${this.score === 1 ? 'punt' : 'punten'} · record ${this.best}`, W / 2, 320, 28, '#fff');
        label(g, 'Klik op ▶ Start om opnieuw te spelen', W / 2, 370, 22, '#ffe066');
      } else {
        label(g, 'Speel de noot, dan springt de lama!', W / 2, 270, 34, '#fff');
        label(g, this.immortal() ? 'Fout of te laat = botsen. Onsterfelijk: je kan niet verliezen.'
          : `Fout of te laat = botsen. Je hebt ${this.maxLives} ${this.maxLives === 1 ? 'leven' : 'levens'}.`, W / 2, 320, 22, '#ffe066');
        label(g, this.immortal() ? 'Onsterfelijk: er zijn geen munten te verdienen.'
          : 'Een munt in de lucht? Speel die noot en de lama vangt ze!', W / 2, 360, 20, '#ffd84a');
        label(g, 'Klik op ▶ Start', W / 2, 400, 22, '#fff');
      }
    }
  }

  // Grote naam van de noot die nu aan de beurt is, met waar je ze vindt. Fel blauw zodra ze in de balk staat.
  drawBigName() {
    const t = this.target();
    if (!t) return;
    const g = this.g;
    const x = 560, y = 232;
    const name = solfegeOf(t.p);
    const hot = this.inBar(this.xOf(t) - PLAYER_X);
    const ink = t.kind === 'coin' ? '#c98a00' : '#2f6fdc'; // een munt: goud in plaats van blauw
    g.font = '900 64px Nunito, system-ui, sans-serif';
    const w = Math.max(170, g.measureText(name).width + 70);
    g.fillStyle = hot ? ink : 'rgba(255, 255, 255, .88)';
    g.strokeStyle = hot ? '#ffffff' : ink + '8c';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(x - w / 2, y - 48, w, 96, 22);
    g.fill();
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = hot ? '#ffffff' : ink;
    g.fillText(name, x, y - 8);
    g.font = '800 16px Nunito, system-ui, sans-serif';
    g.fillStyle = hot ? '#dce8ff' : '#7d7067';
    g.fillText(describePosition(t.p), x, y + 30);
  }

  drawMonster(n, x) {
    const g = this.g, def = MONSTERS[n.kind], im = this.world.monster[n.kind];
    const h = def.h, w = (im.width * h) / im.height, t = n.t;
    const cy = GROUND_Y - def.lift - h / 2;
    g.save();
    g.translate(x, cy);
    switch (def.anim) {
      case 'sway': g.translate(0, h / 2); g.rotate(Math.sin(t * 8) * 0.06); g.translate(0, -h / 2); break; // wiebelen op de voet
      case 'hop': g.translate(0, -Math.abs(Math.sin(t * 12)) * 3); break;
      case 'fly': g.translate(0, Math.sin(t * 3) * 6); g.scale(1, 0.9 + Math.abs(Math.sin(t * 14)) * 0.1); break;
      case 'float': g.translate(0, Math.sin(t * 2) * 8); break;
      case 'slide': g.translate(0, Math.sin(t * 6) * 1.5); g.rotate(Math.sin(t * 3) * 0.04); break;
      case 'wobble': g.translate(0, h / 2); g.scale(1 + Math.sin(t * 7) * 0.05, 1 - Math.sin(t * 7) * 0.05); g.translate(0, -h / 2); break;
      case 'scuttle': g.translate(Math.sin(t * 18) * 2, -Math.abs(Math.sin(t * 18)) * 1.5); break;
      case 'roll': g.rotate(-t * 4); break; // rolt naar de lama toe
      case 'stomp': g.translate(0, -Math.max(0, Math.sin(t * 5)) * 4); break;
    }
    if (def.flip) g.scale(-1, 1);
    if (def.glow) { g.shadowColor = 'rgba(190, 215, 255, .9)'; g.shadowBlur = 14; }
    if (n.state === 'wrong') g.rotate(Math.sin(n.t * 30) * 0.08); // boos
    if (n.state === 'hit') g.globalAlpha = 0.85;
    g.drawImage(im, -w / 2, -h / 2, w, h);
    g.restore();
    if (n.state === 'wrong') label(this.g, '!', x, cy - h / 2 - 16, 30, '#dc3b3b');
  }

  // De poortwachter: een groot monster van het volgende landschap, met kroon en levensbolletjes.
  drawBoss(now) {
    const g = this.g, b = this.boss, def = MONSTERS[b.monster], im = this.world.monster[b.monster];
    if (!im) return;
    const k = b.won ? Math.max(0, 1 - b.dieT / 1.2) : 1;
    const h = BOSS_H * k, w = (im.width * h) / im.height;
    const x = b.x + (b.flash > 0 ? Math.sin(now * 80) * 5 : 0), y = GROUND_Y - h / 2 + Math.sin(now * 3) * 3;
    g.save();
    g.globalAlpha = k;
    g.translate(x, y);
    if (def.flip) g.scale(-1, 1);
    g.drawImage(im, -w / 2, -h / 2, w, h);
    if (b.flash > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = b.flash * 1.5; g.drawImage(im, -w / 2, -h / 2, w, h); }
    g.restore();
    if (b.won) return;
    // kroon
    const cy = y - h / 2 - 6;
    g.beginPath();
    g.moveTo(x - 20, cy + 8); g.lineTo(x - 22, cy - 10); g.lineTo(x - 10, cy); g.lineTo(x, cy - 14); g.lineTo(x + 10, cy); g.lineTo(x + 22, cy - 10); g.lineTo(x + 20, cy + 8);
    g.closePath(); g.fillStyle = '#ffcf33'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#5a3530'; g.stroke();
    // levensbolletjes: hoeveel keer nog
    const left = b.need - b.hits, r = 7, gap = 18, x0 = x - ((b.need - 1) * gap) / 2;
    for (let i = 0; i < b.need; i++) {
      g.beginPath(); g.arc(x0 + i * gap, cy - 30, r, 0, Math.PI * 2);
      g.fillStyle = i < left ? '#ff5a8a' : 'rgba(255,255,255,.35)'; g.fill();
      g.lineWidth = 2; g.strokeStyle = '#3a2350'; g.stroke();
    }
    label(g, 'Poortwachter', x, cy - 54, 20, '#fff6c8');
  }

  // Munt in de lucht: draait en zweeft. Gemist of fout: ze vliegt omhoog weg.
  drawCoin(n, x) {
    if (n.caught) return;
    const g = this.g, im = this.img.coin;
    let y = COIN_Y + Math.sin(n.t * 3) * 5, alpha = 1;
    if (n.lostT != null) {
      const u = n.t - n.lostT;
      y -= u * 260; alpha = Math.max(0, 1 - u * 1.5);
      if (!alpha) return;
    }
    const h = 42, w = h * (im.width / im.height) * (0.3 + 0.7 * Math.abs(Math.cos(n.t * 2.5)));
    g.save();
    g.globalAlpha = alpha;
    g.shadowColor = 'rgba(255, 220, 80, .9)';
    g.shadowBlur = 14;
    g.drawImage(im, x - w / 2, y - h / 2, w, h);
    g.restore();
  }

  poofMonster(n, x) {
    if (n.poofed) return;
    n.poofed = true;
    const def = MONSTERS[n.kind];
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({ x, y: GROUND_Y - def.lift - def.h / 2, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200 - 80, life: 0.5, color: '#fff6e8', s: 7 });
    }
  }

  llamaFrame(now) {
    const m = this.meta, pl = this.player, j = m.jump;
    if (pl.jump) {
      const u = (now - pl.jump.t0) / pl.jump.D;
      const f = u < 0.5 ? j.takeoff + (u / 0.5) * (j.apex - j.takeoff) : j.apex + ((u - 0.5) / 0.5) * (j.land - j.apex);
      return ['jump', j, Math.round(f)];
    }
    if (pl.landT < 0.2) {
      const n = Math.max(1, j.frames - 1 - j.land);
      return ['jump', j, Math.min(j.frames - 1, j.land + Math.floor((pl.landT / 0.2) * n))];
    }
    return ['walk', m.walk, Math.floor(pl.walk * m.walk.fps) % m.walk.frames];
  }

  drawLlama(now) {
    const pl = this.player;
    if (pl.hurt > 0 && Math.floor(pl.hurt * 12) % 2) return;
    const [sheet, sm, i] = this.llamaFrame(now);
    const s = PLAYER_H / this.meta.standH;
    drawLlama(this.g, this.A, sheet, i, Math.round(PLAYER_X - sm.anchorX * s), Math.round(pl.y - sm.cellH * s), s, this.outfit, now);
  }

  paintNotes(now) {
    if (!this.layer) return;
    const tgt = this.running ? this.target() : null;
    for (const n of this.notes) {
      const x = this.xOf(n);
      if (x > W + 30) continue;
      if (!n.el) n.el = this.makeNote(n);
      n.el.setAttribute('transform', `translate(${x / K},0)`);
      const early = n.earlyUntil > now && !n.state;
      n.el.classList.toggle('is-target', n === tgt);
      n.el.classList.toggle('in-bar', n === tgt && this.inBar(x - PLAYER_X));
      n.el.classList.toggle('is-wrong', n.state === 'wrong');
      n.el.classList.toggle('is-missed', n.state === 'missed');
      n.el.classList.toggle('is-hit', n.state === 'hit');
      n.el.classList.toggle('is-coin', n.kind === 'coin');
      const tagText = n.state === 'wrong' || n.state === 'missed' ? n.wrongText : early ? 'wacht…' : '';
      if (n.tag.textContent !== tagText) n.tag.textContent = tagText;
    }
  }

  puff(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.particles.push({ x, y, vx: -60 - Math.random() * 120, vy: -Math.random() * 120, life: 0.4 + Math.random() * 0.2, color: '#fff6e8', s: 4 + Math.random() * 4 });
    }
  }

  sparkle(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.particles.push({ x, y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 0.4, color, s: 6 });
    }
  }

  updateHud(hurt = false) {
    const h = this.o.hud;
    h.score.textContent = this.score;
    h.best.textContent = this.best;
    if (this.immortal()) {
      h.livesLabel.textContent = 'Botsingen';
      if (h.lives.dataset.mode !== 'inf') { h.lives.innerHTML = '<b class="inf">∞</b><b class="bumps"></b>'; h.lives.dataset.mode = 'inf'; }
      h.lives.querySelector('.bumps').textContent = this.bumps;
    } else {
      h.livesLabel.textContent = 'Levens';
      if (h.lives.dataset.mode !== String(this.maxLives)) {
        h.lives.innerHTML = '<img src="img/lama/heart.png" alt="">'.repeat(this.maxLives);
        h.lives.dataset.mode = String(this.maxLives);
        h.lives.classList.toggle('many', this.maxLives > 5);
      }
      [...h.lives.children].forEach((el, i) => el.classList.toggle('lost', i >= this.lives));
    }
    if (hurt) {
      h.lives.classList.remove('shake');
      void h.lives.offsetWidth;
      h.lives.classList.add('shake');
      clearTimeout(this.shakeTimer);
      this.shakeTimer = setTimeout(() => h.lives.classList.remove('shake'), 900);
    }
  }

  say(msg) { this.o.hud.msg.textContent = msg; }
}

function label(g, str, x, y, size, color) {
  g.font = `900 ${size}px Nunito, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(4, size / 5);
  g.strokeStyle = '#3a2350';
  g.strokeText(str, x, y);
  g.fillStyle = color;
  g.fillText(str, x, y);
}

function line(x1, y1, x2, y2, cls) {
  const l = document.createElementNS(SVGNS, 'line');
  l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
  l.setAttribute('class', cls);
  return l;
}

function text(s, x, y, cls) {
  const t = document.createElementNS(SVGNS, 'text');
  t.setAttribute('x', x); t.setAttribute('y', y);
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('class', cls);
  t.textContent = s;
  return t;
}
