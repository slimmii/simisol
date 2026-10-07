// Eindeloos spel: noten uit de notenkiezer schuiven over de notenbalk naar de speellijn.
// Juist spelen = reeks +1. Een foute noot zet de reeks terug op 0. Te laat is niet erg:
// de noot wacht dan op de speellijn (en wordt oranje) tot je ze speelt.
import { parseNote, soundingMidi, solfege, solfegeOf } from './notes.js';

const VF = window.Vex.Flow;
const SVGNS = 'http://www.w3.org/2000/svg';
const SCALE = 1.7; // vergroting van de notenbalk
const PX_PER_BEAT = 64; // afstand tussen twee noten (onvergroot)
const LEAD_BEATS = 4; // zoveel tellen schuift de eerste noot voor ze aankomt
const EARLY_BEATS = 1; // een noot telt pas als ze minder dan 1 tel van de speellijn is
const LETTER_STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const diatonic = (p) => { const n = parseNote(p); return n.octave * 7 + LETTER_STEP[n.letter]; };
const E4 = 4 * 7 + 2; // onderste lijn
const B4 = 4 * 7 + 6; // middelste lijn

export class Game {
  /**
   * @param {{container: HTMLElement, hud: {streak: HTMLElement, best: HTMLElement, total: HTMLElement, msg: HTMLElement},
   *          ctx: () => AudioContext, click: (t:number, accent:boolean) => void,
   *          setExpect: (midis:number[]) => void, onTarget?: (note:string|null) => void}} opts
   */
  constructor(opts) {
    this.o = opts;
    this.running = false;
    this.pool = ['G4', 'B4', 'E5'];
    this.bpm = 40;
    this.metro = true;
    this.showNames = false;
    this.showFingers = true;
    this.best = 0;
    this.onBest = null; // (best) => void, om het record te bewaren
    this.reset();
  }

  setPool(pool) {
    this.pool = pool.length ? [...pool] : ['G4', 'B4', 'E5'];
    if (!this.running) { this.reset(); this.draw(); }
  }

  reset() {
    this.notes = []; // {p, beat, state: null|'hit'|'late', el, wrongUntil, finger}
    this.beat = 0;
    this.streak = 0;
    this.total = 0;
    this.lastBeatClick = Math.floor(-LEAD_BEATS);
    this.lastFinger = 'i';
    this.prev = [];
    this.lastHit = null;
    this.fill();
    this.updateHud();
    this.say('');
  }

  // Willekeurige volgende noot uit de gekozen noten (niet drie keer na elkaar dezelfde).
  nextPitch() {
    let p, tries = 0;
    do { p = this.pool[Math.floor(Math.random() * this.pool.length)]; tries++; }
    while (this.pool.length > 1 && this.prev.length >= 2 && this.prev.every((x) => x === p) && tries < 10);
    this.prev = [...this.prev.slice(-1), p];
    return p;
  }

  fill() {
    const visible = (this.width || 900) / PX_PER_BEAT + 2;
    let last = this.notes.length ? this.notes[this.notes.length - 1].beat : LEAD_BEATS - 1;
    while (last < this.beat + visible) {
      last += 1;
      this.lastFinger = this.lastFinger === 'm' ? 'i' : 'm';
      this.notes.push({ p: this.nextPitch(), beat: last, state: null, el: null, wrongUntil: 0, finger: this.lastFinger });
    }
  }

  target() { return this.notes.find((n) => n.state !== 'hit') || null; }

  // ---------- tekenen ----------
  draw() {
    const box = this.o.container;
    box.innerHTML = '';
    const pxW = Math.max(320, box.clientWidth);
    const W = pxW / SCALE, H = 146;
    this.width = W;
    const renderer = new VF.Renderer(box, VF.Renderer.Backends.SVG);
    renderer.resize(pxW, H * SCALE);
    const svg = box.querySelector('svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const vctx = renderer.getContext();
    const stave = new VF.Stave(4, 18, W - 8);
    stave.addClef('treble');
    stave.setEndBarType(VF.BarlineType.NONE);
    stave.setContext(vctx).draw();
    this.lineY = (i) => stave.getYForLine(i);
    this.hitX = stave.getNoteStartX() + 34;
    this.svg = svg;

    // speellijn
    const hit = document.createElementNS(SVGNS, 'rect');
    hit.setAttribute('x', this.hitX - 2);
    hit.setAttribute('y', this.lineY(0) - 26);
    hit.setAttribute('width', 4);
    hit.setAttribute('height', this.lineY(4) - this.lineY(0) + 52);
    hit.setAttribute('rx', 2);
    hit.setAttribute('class', 'game-hitline');
    svg.appendChild(hit);

    // noten komen in een eigen laag, afgeknipt links van de sleutel
    const clip = document.createElementNS(SVGNS, 'clipPath');
    clip.setAttribute('id', 'gameClip');
    const cr = document.createElementNS(SVGNS, 'rect');
    cr.setAttribute('x', stave.getNoteStartX() - 6);
    cr.setAttribute('y', 0);
    cr.setAttribute('width', W);
    cr.setAttribute('height', H);
    clip.appendChild(cr);
    svg.appendChild(clip);
    this.layer = document.createElementNS(SVGNS, 'g');
    this.layer.setAttribute('clip-path', 'url(#gameClip)');
    svg.appendChild(this.layer);

    for (const n of this.notes) n.el = null;
    this.fill();
    this.paint();
  }

  makeNote(n) {
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'gnote');
    const d = diatonic(n.p);
    const y = this.lineY(4) - (d - E4) * 5;
    // hulplijntjes
    for (let s = E4 - 2; s >= d; s -= 2) g.appendChild(line(-9, this.lineY(4) - (s - E4) * 5, 9, this.lineY(4) - (s - E4) * 5, 'gledger'));
    for (let s = E4 + 10; s <= d; s += 2) g.appendChild(line(-9, this.lineY(4) - (s - E4) * 5, 9, this.lineY(4) - (s - E4) * 5, 'gledger'));
    const head = document.createElementNS(SVGNS, 'ellipse');
    head.setAttribute('cx', 0);
    head.setAttribute('cy', y);
    head.setAttribute('rx', 6.2);
    head.setAttribute('ry', 4.4);
    head.setAttribute('transform', `rotate(-20 0 ${y})`);
    head.setAttribute('class', 'ghead');
    g.appendChild(head);
    const up = d < B4;
    g.appendChild(up ? line(5.6, y - 1, 5.6, y - 34, 'gstem') : line(-5.6, y + 1, -5.6, y + 34, 'gstem'));
    const acc = parseNote(n.p).acc;
    if (acc) g.appendChild(text(acc === '#' ? '♯' : '♭', -16, y + 5, 'gacc'));
    if (this.showFingers) g.appendChild(text(n.finger, 0, this.lineY(0) - 14, 'gfinger'));
    if (this.showNames) g.appendChild(text(solfegeOf(n.p), 0, this.lineY(4) + 30, 'gname'));
    const tag = text('', 0, this.lineY(4) + (this.showNames ? 46 : 30), 'gtag');
    g.appendChild(tag);
    n.tag = tag;
    this.layer.appendChild(g);
    return g;
  }

  paint() {
    if (!this.layer) return;
    const now = this.o.ctx()?.currentTime ?? 0;
    const tgt = this.target();
    for (const n of this.notes) {
      const x = this.hitX + (n.beat - this.beat) * PX_PER_BEAT;
      if (x > this.width + 20) continue;
      if (!n.el) n.el = this.makeNote(n);
      n.el.setAttribute('transform', `translate(${x},0)`);
      const wrong = n.wrongUntil > now;
      n.el.classList.toggle('is-target', n === tgt && !wrong);
      n.el.classList.toggle('is-late', n.state === 'late' && !wrong);
      n.el.classList.toggle('is-wrong', wrong);
      n.el.classList.toggle('is-hit', n.state === 'hit');
      const early = !wrong && n.earlyUntil > now && n.state !== 'hit';
      const tagText = wrong ? n.wrongText : early ? 'wacht…' : n.lateText || '';
      if (n.tag.textContent !== tagText) n.tag.textContent = tagText;
    }
    // weg met noten die links verdwenen zijn
    while (this.notes.length && this.notes[0].state === 'hit' && this.hitX + (this.notes[0].beat - this.beat) * PX_PER_BEAT < -40) {
      this.notes.shift().el?.remove();
    }
  }

  // ---------- spelen ----------
  start() {
    this.reset();
    if (!this.layer) this.draw();
    else { this.layer.innerHTML = ''; for (const n of this.notes) n.el = null; }
    this.running = true;
    this.lastT = this.o.ctx().currentTime;
    this.sendExpect();
    const loop = () => {
      if (!this.running) return;
      this.tick();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.o.setExpect([]);
    this.o.onTarget?.(null);
  }

  tick() {
    const c = this.o.ctx();
    const now = c.currentTime;
    const dt = Math.min(0.1, now - this.lastT);
    this.lastT = now;
    const tgt = this.target();
    let next = this.beat + (dt * this.bpm) / 60;
    // te laat: de noot wacht op de speellijn tot je ze speelt
    if (tgt && next >= tgt.beat) {
      next = tgt.beat;
      if (tgt.state !== 'late') { tgt.state = 'late'; tgt.lateText = 'te laat'; }
    }
    // metronoom: tik telkens een noot de speellijn bereikt
    const whole = Math.floor(next + 1e-6);
    if (whole > this.lastBeatClick && (!tgt || whole <= tgt.beat)) {
      this.lastBeatClick = whole;
      if (this.metro) this.o.click(now, whole % 4 === 0);
    }
    this.beat = next;
    this.fill();
    this.paint();
  }

  sendExpect() {
    const open = this.notes.filter((n) => n.state !== 'hit').slice(0, 2).map((n) => soundingMidi(n.p));
    this.o.setExpect([...new Set(open)]);
    this.o.onTarget?.(this.target()?.p ?? null);
  }

  onNote(ev) {
    if (!this.running) return;
    const tgt = this.target();
    if (!tgt) return;
    const exp = soundingMidi(tgt.p);
    const now = this.o.ctx().currentTime;
    // Nog te ver van de speellijn: niet meetellen en niet bestraffen, enkel laten zien.
    if (tgt.beat - this.beat > EARLY_BEATS) {
      if (ev.attack !== false) { tgt.earlyUntil = now + 0.6; }
      return;
    }
    if (ev.midi === exp) {
      tgt.state = 'hit';
      this.lastHit = { midi: ev.midi, time: ev.time };
      this.streak++;
      this.total++;
      if (this.streak > this.best) { this.best = this.streak; this.onBest?.(this.best); }
      this.updateHud();
      if (tgt.lateText) tgt.lateText = 'te laat';
      this.say(this.streak > 0 && this.streak % 10 === 0 ? `${this.streak} op rij! 🔥` : '');
      this.sendExpect();
      return;
    }
    // Alleen een duidelijke nieuwe aanslag kan fout zijn: geen nagalm, geen dubbele detectie van de vorige noot.
    if (ev.attack === false) return;
    if (this.lastHit && ev.midi === this.lastHit.midi && ev.time - this.lastHit.time < 0.3) return;
    tgt.wrongUntil = now + 0.6;
    tgt.wrongText = `fout: ${solfege(ev.midi + 12)}`;
    const had = this.streak;
    this.streak = 0;
    this.updateHud(true);
    this.say(had ? `Fout! Je reeks van ${had} is weg. Opnieuw vanaf 0.` : 'Fout, probeer opnieuw.');
  }

  updateHud(shake = false) {
    const h = this.o.hud;
    h.streak.textContent = this.streak;
    h.best.textContent = this.best;
    h.total.textContent = this.total;
    if (shake) {
      h.streak.parentElement.classList.remove('shake');
      void h.streak.parentElement.offsetWidth;
      h.streak.parentElement.classList.add('shake');
      clearTimeout(this.shakeTimer);
      this.shakeTimer = setTimeout(() => h.streak.parentElement.classList.remove('shake'), 900);
    }
  }

  say(msg) { this.o.hud.msg.textContent = msg; }
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
