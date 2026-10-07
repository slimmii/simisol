// Gesimuleerde gitaar (Karplus-Strong): elke snaar is een korte vertragingslijn die bij het aanslaan
// de vorm van een getokkelde snaar krijgt en daarna langzaam uitdempt. Wordt gebruikt voor het
// voorbeeld in de app en voor de tests in tools/.
import { FRETBOARD } from './notes.js';

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// geschreven noot -> klinkende midi (gitaar klinkt een octaaf lager dan genoteerd)
const soundingMidi = (p) => (+p.at(-1) + 1) * 12 + LETTER[p[0]] + (p.includes('#') ? 1 : 0) - 12;

/**
 * Rendert een melodie als mono-audio.
 * @param {Array<{p:string,d:number}>} notes  geschreven noten ('r' = rust), d in tellen
 * @param {{bpm:number, sampleRate:number, lead?:number, seed?:number, model?:'pluck'|'noise', human?:number}} opts
 * @returns {Float32Array} audio; de eerste noot valt op `lead` seconden
 */
export function renderGuitar(notes, { bpm, sampleRate: SR, lead = 0.3, seed = 1, model = 'pluck', human = 0.01 }) {
  let rnd = seed;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const spb = 60 / bpm;
  const events = [];
  let b = 0;
  for (const n of notes) {
    if (n.p !== 'r') {
      events.push({
        t: lead + b * spb + (rand() - 0.5) * 2 * human,
        midi: soundingMidi(n.p),
        string: FRETBOARD[n.p]?.string ?? soundingMidi(n.p),
        level: 0.22 + rand() * 0.08,
        tau: 1.0 + rand() * 0.6, // uitklinktijd in s
      });
    }
    b += n.d;
  }
  const out = new Float32Array(Math.ceil((lead + b * spb + 1.5) * SR));
  const strings = {};
  let active = []; // snel te doorlopen lijst van de snaren die klinken
  let ei = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    while (ei < events.length && events[ei].t <= t) {
      const e = events[ei++];
      const f = 440 * Math.pow(2, (e.midi - 69) / 12);
      const n = Math.max(2, Math.round(SR / f));
      const buf = new Float32Array(n);
      if (model === 'noise') {
        let prev = 0;
        for (let k = 0; k < n; k++) { prev = 0.6 * prev + 0.4 * (rand() * 2 - 1); buf[k] = prev; }
      } else {
        // tokkel: driehoekige uitwijking op 10–25% van de snaarlengte, met een beetje ruis
        const peak = Math.max(1, Math.round((0.1 + rand() * 0.15) * n));
        let mean = 0;
        for (let k = 0; k < n; k++) { buf[k] = (k < peak ? k / peak : (n - k) / (n - peak)) + (rand() * 2 - 1) * 0.05; mean += buf[k] / n; }
        for (let k = 0; k < n; k++) buf[k] -= mean;
      }
      // dezelfde snaar opnieuw aanslaan vervangt de vorige trilling; andere snaren klinken door
      strings[e.string] = { buf, pos: 0, gain: e.level, decay: Math.exp(-1 / (e.tau * f)), burst: Math.round(0.006 * SR), level: e.level };
      active = Object.values(strings);
    }
    let s = 0;
    for (let a = 0; a < active.length; a++) {
      const st = active[a];
      if (st.burst > 0) { s += (rand() * 2 - 1) * 0.25 * st.level * (st.burst / (0.006 * SR)); st.burst--; }
      const j = st.pos, k = (j + 1) % st.buf.length;
      const y = st.decay * 0.5 * (st.buf[j] + st.buf[k]);
      st.buf[j] = y;
      st.pos = k;
      s += y * st.gain;
    }
    out[i] = s;
  }
  let peak = 0;
  for (const x of out) peak = Math.max(peak, Math.abs(x));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.8 / peak;
  return out;
}
