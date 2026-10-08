// Test de noot-detectie met een gesimuleerde gitaar (Karplus-Strong).
// Gebruik: node tools/test_detector.mjs
import { readFileSync } from 'node:fs';
// DETECTOR=<pad> laat toe een andere versie van de detector te testen (ter vergelijking)
const { DetectorCore } = await import(process.env.DETECTOR ? new URL(process.env.DETECTOR, `file://${process.cwd()}/`).href : '../app/js/detector-worklet.js');
import { loadLocalSongs } from './songs_local.mjs';

const SR = 48000;
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiOf = (p) => (+p.at(-1) + 1) * 12 + LETTER[p[0]] + (p.includes('#') ? 1 : 0);
// geschreven noot -> snaar (gitaar klinkt een octaaf lager)
const STRING = { C4: 5, D4: 4, E4: 4, F4: 4, G4: 3, A4: 3, B4: 2, C5: 2, D5: 2, E5: 1, F5: 1, 'F#5': 1, G5: 1, A5: 1 };

let MODEL = 'pluck';
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function synth(events, seconds, { ring = 0.996, noise = 0.002 } = {}) {
  const out = new Float32Array(Math.ceil(seconds * SR));
  const strings = {}; // snaar -> {buf, pos, gain}
  const sorted = [...events].sort((a, b) => a.t - b.t);
  let ei = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    while (ei < sorted.length && sorted[ei].t <= t) {
      const e = sorted[ei++];
      const f = 440 * Math.pow(2, (e.midi - 69) / 12);
      const n = Math.round(SR / f);
      // Tokkel: driehoekige uitwijking op 10–25% van de snaarlengte (zoals een vinger dichtbij de klankgaten),
      // met een beetje ruis voor de aanslag.
      const buf = new Float32Array(n);
      if (MODEL === 'noise') {
        let prev = 0;
        for (let k = 0; k < n; k++) { prev = 0.6 * prev + 0.4 * (rand() * 2 - 1); buf[k] = prev; }
      } else {
        const pos = 0.1 + rand() * 0.15;
        const peak = Math.max(1, Math.round(pos * n));
        for (let k = 0; k < n; k++) buf[k] = (k < peak ? k / peak : (n - k) / (n - peak)) + (rand() * 2 - 1) * 0.05;
      }
      let mean = 0;
      for (let k = 0; k < n; k++) mean += buf[k] / n;
      for (let k = 0; k < n; k++) buf[k] -= mean;
      // uitklinken: tijdconstante tau (s) -> verlies per periode
      const tau = e.tau ?? 0.9;
      strings[e.string] = { buf, pos: 0, gain: e.level ?? 0.3, decay: Math.exp(-1 / (tau * f)) / 0.9995 * 0.9995, burst: Math.round(0.006 * SR), level: e.level ?? 0.3 };
    }
    let s = 0;
    for (const st of Object.values(strings)) {
      // kort tokkelgeluidje (nagel/vinger) bij de aanslag
      if (st.burst > 0) { s += (rand() * 2 - 1) * 0.25 * st.level * (st.burst / (0.006 * SR)); st.burst--; }
      const { buf } = st;
      const j = st.pos, k = (j + 1) % buf.length;
      const y = st.decay * 0.5 * (buf[j] + buf[k]);
      buf[j] = y;
      st.pos = k;
      s += y * st.gain;
    }
    out[i] = s + (rand() * 2 - 1) * noise;
  }
  return out;
}

let dbgs = [];
let onsets = [];
function detect(signal, events = []) {
  dbgs = [];
  onsets = [];
  const notes = [];
  const core = new DetectorCore(SR, (m) => {
    if (m.type === 'note') notes.push(m);
    if (m.type === 'debug') dbgs.push(m);
    if (m.type === 'onsetdbg') onsets.push(m);
  });
  core.latency = 0;
  core.debug = !!process.env.DEBUG;
  core.debugOnset = !!process.env.ONSETDBG;
  const evs = [...events].sort((a, b) => a.t - b.t);
  for (let i = 0; i < signal.length; i += 128) {
    // zoals de app: de huidige en de volgende verwachte noot
    const t = i / SR;
    let k = evs.findIndex((e) => e.t > t + 0.15);
    if (k < 0) k = evs.length;
    core.expect = process.env.NOEXPECT ? [] : [evs[k - 1], evs[k]].filter(Boolean).map((e) => e.expectMidi ?? e.midi);
    const block = signal.subarray(i, Math.min(signal.length, i + 128));
    core.push(block, (i + block.length) / SR);
  }
  return notes;
}

function check(name, events, seconds, opts) {
  // vaste willekeur per test, zodat het toevoegen van tests de andere niet verandert
  seed = 1 + [...(MODEL + name)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 2147483646, 7);
  const sig = synth(events, seconds, opts);
  const got = detect(sig, events);
  const used = new Set();
  let ok = 0, wrongPitch = 0, missed = 0, sumErr = 0, maxErr = 0, falseOk = 0;
  for (const e of events) {
    const k = got.findIndex((g, i) => !used.has(i) && Math.abs(g.time - e.t) < 0.12);
    if (k < 0) { missed++; continue; }
    used.add(k);
    const err = Math.abs(got[k].time - e.t);
    sumErr += err; maxErr = Math.max(maxErr, err);
    if (got[k].midi === e.midi) ok++; else wrongPitch++;
    // gevaarlijk: de verwachte noot gemeld terwijl er iets anders gespeeld werd (= foute noot goedgerekend)
    if (e.expectMidi != null && e.expectMidi !== e.midi && got[k].midi === e.expectMidi) falseOk++;
  }
  const extra = got.filter((_, i) => !used.has(i));
  if (process.env.VERBOSE && name.includes(process.env.VERBOSE)) {
    console.log('   events: ' + got.map((x) => `${x.time.toFixed(2)}:${x.midi}${x.attack ? '' : 'L'}`).join(' '));
    for (const e of events) {
      const g = got.find((x) => Math.abs(x.time - e.t) < 0.12);
      const d = dbgs.find((x) => Math.abs(x.t - e.t) < 0.12);
      const bad = !g || g.midi !== e.midi;
      if (bad && process.env.ONSETDBG) {
        for (const o of onsets.filter((o) => o.t > e.t - 0.03 && o.t < e.t + 0.08))
          console.log(`        t=${o.t.toFixed(3)} rms=${o.rms.toFixed(4)} before=${o.before.toFixed(4)} flux=${o.flux.toFixed(2)} cd=${o.cd.toFixed(2)} cdMed=${o.cdMed.toFixed(2)}`);
      }
      if (bad || !process.env.ONLYBAD) console.log(`   ${bad ? '✗' : ' '} ${e.t.toFixed(2)} verwacht ${e.midi}  kreeg ${g ? g.midi + (g.attack ? '' : 'L') + ' @' + g.time.toFixed(2) : '—'}` + (d ? `   votes=${d.votes} strict=${d.strict} best=${d.best} fy=${d.fy} fb=${d.fb} ch=${d.ch}` : ''));
    }
  }
  const pass = ok === events.length && extra.length === 0;
  totals.falseOk += falseOk;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${name.padEnd(34)} goed ${ok}/${events.length}${falseOk ? `  ⚠ FOUT GOEDGEREKEND ${falseOk}` : ''}  foute toon ${wrongPitch}  gemist ${missed}  extra ${extra.length}` +
    `  timing gem ${(1000 * sumErr / Math.max(1, ok + wrongPitch)).toFixed(0)} ms, max ${(1000 * maxErr).toFixed(0)} ms` +
    (extra.length ? `  extra: ${extra.map((x) => `${x.time.toFixed(2)}s:${x.midi}${x.attack ? '' : 'L'}`).join(' ')}` : ''));
  return pass;
}

const ev = (t, written, extra = {}) => ({ t, midi: midiOf(written) - 12, string: STRING[written], ...extra });
let allPass = true;
const totals = { falseOk: 0 };
const run = (...a) => { allPass = check(...a) && allPass; };
const SONGS = loadLocalSongs(); // leeg als de map liedjes/ ontbreekt: dan enkel de basistests
for (const model of (process.env.MODEL || 'pluck,noise').split(',')) {
  MODEL = model;
  seed = 1;
  console.log(`\n--- gitaarmodel: ${model} ---`);

// 1. Eén noot die lang doorklinkt mag maar één keer tellen.
run('lang doorklinken (sol)', [ev(0.5, 'G4', { tau: 3 })], 8);
run('lang doorklinken (mi, luid)', [ev(0.5, 'E5', { tau: 3, level: 0.6 })], 8);
// 2. Dezelfde snaar opnieuw aanslaan terwijl ze nog trilt.
run('herhaald sol, 80 bpm', [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ev(0.5 + k * 0.75, 'G4', { tau: 3 })), 7.5);
run('herhaald mi, 120 bpm, zachter', [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ev(0.5 + k * 0.5, 'E5', { tau: 2, level: 0.15 + 0.1 * (k % 2) })), 5);
// 3. Andere snaar terwijl de vorige nog naklinkt.
run('sol-si-mi met nagalm', ['G4', 'B4', 'E5', 'B4', 'G4', 'E5'].map((p, k) => ev(0.5 + k * 0.8, p, { tau: 3 })), 6.5);
run('do-re op dezelfde snaar', ['C5', 'D5', 'C5', 'D5', 'B4', 'C5'].map((p, k) => ev(0.5 + k * 0.6, p, { tau: 1.5 })), 5);
// 3b. Foute noot: verwacht sol, maar la gespeeld op dezelfde snaar -> mag NIET als sol tellen.
run('foute la i.p.v. sol (zelfde snaar)', [ev(0.5, 'G4'), ev(1.25, 'G4'), ev(2.0, 'G4'), { ...ev(2.75, 'A4'), expectMidi: 55 }, ev(3.5, 'G4')], 5);
run('foute si i.p.v. sol', [ev(0.5, 'G4'), ev(1.25, 'G4'), { ...ev(2.0, 'B4'), expectMidi: 55 }, ev(2.75, 'G4')], 4);
// 3c. Buurnoot gespeeld terwijl de app een andere noot verwacht: moet de GESPEELDE noot geven,
//     nooit de verwachte (anders wordt een fout goedgerekend).
{
  const pairs = [['G4', 'A4'], ['A4', 'G4'], ['C5', 'D5'], ['D5', 'E5'], ['E5', 'F5'], ['F5', 'E5'], ['B4', 'C5'], ['C5', 'B4'],
    ['D4', 'E4'], ['E4', 'F4'], ['C4', 'D4'], ['G5', 'F5'],
    // verkeerde octaaf: lage sol/mi/re i.p.v. de hoge (en omgekeerd)
    ['G4', 'G5'], ['G5', 'G4'], ['E4', 'E5'], ['E5', 'E4'], ['D4', 'D5'], ['C4', 'C5']];
  for (const [played, expected] of pairs) {
    const evs = [];
    for (let k = 0; k < 6; k++) evs.push({ ...ev(0.5 + k * 0.7, k % 2 ? played : 'B4'), expectMidi: midiOf(k % 2 ? expected : 'B4') - 12 });
    run(`${played} gespeeld, ${expected} verwacht`, evs, 5);
  }
}
// 4. Wisselend volume en zachte noot na een luide.
run('zacht na luid', [ev(0.5, 'G4', { level: 0.8, tau: 3 }), ev(1.3, 'B4', { level: 0.12 }), ev(2.1, 'E5', { level: 0.1 })], 4);

// 5. Hele liedjes uit het boek, met wat menselijke onnauwkeurigheid.
for (const num of [7, 9, 12, 26, 28, 31, 36, 40]) {
  const song = SONGS.find((s) => s.num === num);
  if (!song) continue;
  const bpm = 80, spb = 60 / bpm;
  let b = 0;
  const events = [];
  for (const n of song.notes) {
    if (n.p !== 'r') events.push(ev(0.5 + b * spb + (rand() - 0.5) * 0.04, n.p, { level: 0.15 + rand() * 0.15, tau: 0.6 + rand() * 1.2 }));
    b += n.d;
  }
  run(`liedje ${num} ${song.title}`.slice(0, 34), events, 1.5 + b * spb);
}

}

console.log(`\nFoute noten die als de verwachte noot werden goedgerekend: ${totals.falseOk}`);
console.log(allPass ? '\nAlles OK' : '\nEr zijn fouten');
process.exit(allPass ? 0 : 1);
