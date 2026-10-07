import {
  PRACTICE_NOTES, DEFAULT_SELECTION, FRETBOARD, soundingMidi, writtenMidi, solfege, solfegeOf, describePosition,
} from './notes.js';
import { PitchDetector } from './pitch.js';
import { renderScore } from './score.js';
import { loadSongs, importZip, clearLibrary } from './library.js';
import { renderGuitar } from './guitar.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);

// ---------- instellingen (bewaard in de browser) ----------
const SETTINGS_KEY = 'simisol:settings';
const settings = Object.assign(
  {
    tab: 'practice',
    selection: DEFAULT_SELECTION,
    timeSig: '4/4',
    bars: 8,
    durs: [1, 2, 4],
    song: null,
    rec: 'slow',
    bpm: 70,
    speed: 100,
    metro: true,
    wait: false,
    names: false,
    fingers: true,
    tol: 0.18,
    sens: 0.5,
    latency: 60,
    echo: false,
    gameBpm: 40,
    gameBest: {}, // record per combinatie van noten
  },
  safeRead(SETTINGS_KEY),
);
function safeRead(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

// ---------- audio ----------
let ctx = null;
let detector = null;
function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  return ctx;
}

function click(time, accent) {
  const c = audioCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.frequency.value = accent ? 1760 : 1100;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(accent ? 0.6 : 0.35, time + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
  osc.connect(g).connect(c.destination);
  osc.start(time);
  osc.stop(time + 0.08);
}

async function ensureMic() {
  const c = audioCtx();
  await c.resume();
  if (detector?.running) return true;
  detector = new PitchDetector(c);
  detector.sensitivity = settings.sens;
  detector.latency = settings.latency / 1000;
  detector.echoCancellation = settings.echo;
  detector.onFrame = onFrame;
  detector.onNote = onNote;
  try {
    await detector.start();
    $('micMsg').classList.add('hidden');
    return true;
  } catch (e) {
    $('micMsg').textContent = 'Ik kan de microfoon niet gebruiken. Geef toestemming in je browser (en open de app via http://localhost).';
    $('micMsg').classList.remove('hidden');
    return false;
  }
}

// ---------- huidig stuk ----------
let piece = null; // { title, time, pickup, notes:[{p,d,f,c,l}], audio }
let layout = null;
let starts = [];
let run = null;

const isRest = (n) => n.p === 'r';
const barLen = () => (piece.time[0] * 4) / piece.time[1];

function fillFingers(notes) {
  let last = null;
  return notes.map((n) => {
    if (isRest(n)) return n;
    if (n.f === 'm' || n.f === 'i') { last = n.f; return n; }
    const f = last === 'm' ? 'i' : 'm';
    last = f;
    return { ...n, f };
  });
}

function setPiece(p) {
  stop();
  piece = { ...p, notes: fillFingers(p.notes) };
  let b = 0;
  starts = piece.notes.map((n) => { const s = b; b += n.d; return s; });
  $('scoreTitle').textContent = p.title;
  draw();
  resetCounts();
  buildBeatDots();
  updateExpect(firstPlayable(0));
}

function draw() {
  if (!piece) return;
  layout = renderScore($('score'), piece, {
    showFingers: settings.fingers,
    showNames: settings.names,
    showChords: true,
    showLyrics: true,
  });
  repaintStates();
}

function firstPlayable(i) {
  while (i < piece.notes.length && isRest(piece.notes[i])) i++;
  return i < piece.notes.length ? i : -1;
}

// ---------- oefening maken ----------
function makeExercise() {
  const [num, den] = settings.timeSig.split('/').map(Number);
  const bar = (num * 4) / den;
  const sel = PRACTICE_NOTES.filter((n) => settings.selection.includes(n));
  const pool = sel.length ? sel : DEFAULT_SELECTION;
  let durs = settings.durs.length ? [...settings.durs] : [1];
  const notes = [];
  let prev = null, prev2 = null;
  const pick = () => {
    let p, tries = 0;
    do { p = pool[Math.floor(Math.random() * pool.length)]; tries++; }
    while (pool.length > 1 && p === prev && p === prev2 && tries < 10);
    prev2 = prev; prev = p;
    return p;
  };
  for (let m = 0; m < settings.bars; m++) {
    let left = bar;
    const last = m === settings.bars - 1;
    while (left > 0) {
      let fits = durs.filter((d) => d <= left);
      if (last) {
        // laatste maat: eindig liefst met een lange noot
        const longest = Math.max(...fits, 0);
        if (longest === left) fits = [left];
      }
      const d = fits.length ? fits[Math.floor(Math.random() * fits.length)] : left >= 2 ? 2 : 1;
      notes.push({ p: pick(), d });
      left -= d;
    }
  }
  const names = pool.map(solfegeOf).join(' · ');
  setPiece({ title: `Oefening: ${names}`, time: [num, den], pickup: 0, notes });
}

// ---------- liedjes ----------
const audioCache = new Map();
// Gekozen opname, terugvallend op wat er voor dit liedje bestaat.
function currentRec() {
  if (settings.rec === 'none' || !piece?.audio) return 'none';
  if (piece.audio[settings.rec]) return settings.rec;
  return piece.audio.slow ? 'slow' : piece.audio.fast ? 'fast' : 'none';
}
function songAudio() {
  if (settings.tab !== 'songs') return null;
  const r = currentRec();
  return r === 'none' ? null : piece.audio[r];
}
function syncKey() { return `simisol:sync:${piece?.num}:${currentRec()}`; }
function syncAdjust() {
  try { return parseFloat(localStorage.getItem(syncKey())) || 0; } catch { return 0; }
}
function setSyncAdjust(v) {
  try { localStorage.setItem(syncKey(), String(v)); } catch {}
  updateSyncInfo();
}
function updateSyncInfo() {
  const v = syncAdjust();
  $('syncInfo').textContent = v ? `${v > 0 ? '+' : ''}${Math.round(v * 1000)} ms` : '';
}

// Liedjes komen uit de browseropslag (geïmporteerde zip), niet uit de website zelf.
let SONGS = [];

function fillSongSelect() {
  const sel = $('songSelect');
  sel.innerHTML = SONGS.map((s) => `<option value="${s.num}">${s.num}. ${escapeHtml(s.title)}${s.audio ? ' 🎧' : ''}</option>`).join('');
  if (settings.song != null) sel.value = settings.song;
  const n = SONGS.length, a = SONGS.filter((s) => s.audio).length;
  $('libraryInfo').textContent = n
    ? `${n} liedjes in deze browser (${a} met muziek). Een nieuwe zip vervangt liedjes met hetzelfde nummer.`
    : 'Nog geen liedjes. Importeer de zip met liedjes (gemaakt met tools/make_songs_zip.py).';
  $('clearBtn').classList.toggle('hidden', !n);
  $('songControls').classList.toggle('hidden', !n);
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function showNoSongs() {
  stop();
  piece = null;
  layout = null;
  $('scoreTitle').textContent = 'Liedjes';
  $('score').innerHTML = `<div class="empty-songs">Er staan nog geen liedjes in deze browser.<br>
    Klik links op <b>📦 Liedjes importeren</b> en kies je <code>simisol-liedjes.zip</code>.<br>
    De liedjes blijven daarna bewaard in deze browser, ook als je de pagina sluit.</div>`;
  $('expectName').textContent = '–';
  $('expectWhere').textContent = '';
}

async function refreshLibrary() {
  SONGS = await loadSongs();
  fillSongSelect();
  if (settings.tab === 'songs') loadSong(settings.song);
}

function loadSong(num) {
  if (!SONGS.length) return showNoSongs();
  const s = SONGS.find((x) => x.num === num) || SONGS[0];
  settings.song = s.num;
  save();
  setPiece(s);
  updateRecButtons();
  updateTempoUI();
  updateSyncInfo();
}

function updateRecButtons() {
  document.querySelectorAll('#recSeg button').forEach((b) => {
    const r = b.dataset.rec;
    const available = r === 'none' || !!piece?.audio?.[r];
    b.disabled = !available;
    b.style.opacity = available ? '' : '.35';
  });
  const r = currentRec();
  document.querySelectorAll('#recSeg button').forEach((b) => b.classList.toggle('active', b.dataset.rec === r));
  $('syncBox').classList.toggle('hidden', !songAudio());
}

// ---------- tempo ----------
function usingRecording() { return !!songAudio(); }

function updateTempoUI() {
  const t = $('tempo');
  if (settings.tab === 'game') {
    t.min = 15; t.max = 120; t.step = 1;
    t.value = settings.gameBpm;
    $('tempoOut').textContent = `${settings.gameBpm} noten/min`;
    $('waitWrap').classList.add('disabled');
    t.previousElementSibling.firstChild.textContent = 'Snelheid ';
    return;
  }
  if (usingRecording()) {
    t.min = 50; t.max = 130; t.step = 5;
    t.value = settings.speed;
    const bpm = Math.round(songAudio().bpm * settings.speed / 100);
    $('tempoOut').textContent = `${settings.speed}% · ${bpm} tellen/min`;
    $('waitWrap').classList.add('disabled');
  } else {
    t.min = 30; t.max = 160; t.step = 1;
    t.value = settings.bpm;
    $('tempoOut').textContent = `${settings.bpm} tellen/min`;
    $('waitWrap').classList.remove('disabled');
  }
  t.previousElementSibling.firstChild.textContent = usingRecording() ? 'Snelheid ' : 'Tempo ';
}

// ---------- weergave van de status ----------
const counts = { good: 0, bad: 0, early: 0, missed: 0 };
let states = [];
let judgedAt = [];
function resetCounts() {
  states = piece ? piece.notes.map(() => null) : [];
  judgedAt = [];
  Object.keys(counts).forEach((k) => (counts[k] = 0));
  $('badges').innerHTML = '';
  $('resultMsg').textContent = '';
  updateCounts();
  repaintStates();
}
function updateCounts() {
  $('cGood').textContent = counts.good;
  $('cBad').textContent = counts.bad;
  $('cEarly').textContent = counts.early;
  $('cMissed').textContent = counts.missed;
}

let curIdx = -1;
function repaintStates() {
  if (!layout) return;
  layout.positions.forEach((pos, i) => {
    if (!pos?.el) return;
    const st = states[i];
    pos.el.classList.toggle('is-good', st === 'good');
    pos.el.classList.toggle('is-bad', st === 'bad' || st === 'early');
    pos.el.classList.toggle('is-missed', st === 'missed');
    pos.el.classList.toggle('is-cur', i === curIdx && !st);
  });
}

function setState(i, st, label) {
  if (states[i] === st) return;
  states[i] = st;
  counts[st === 'early' ? 'early' : st]++;
  updateCounts();
  repaintStates();
  if (label) addBadge(i, label);
}

function addBadge(i, text) {
  const pos = layout?.positions[i];
  if (!pos) return;
  const el = document.createElement('div');
  el.className = 'badge';
  el.textContent = text;
  const score = $('score');
  el.style.left = pos.x + score.offsetLeft + 'px';
  el.style.top = pos.labelBottom + score.offsetTop + 2 + 'px';
  $('badges').appendChild(el);
}

function updateExpect(i) {
  if (i < 0 || !piece.notes[i] || isRest(piece.notes[i])) {
    $('expectName').textContent = i >= 0 && piece.notes[i] ? 'rust' : '–';
    $('expectWhere').textContent = '';
    return;
  }
  const p = piece.notes[i].p;
  $('expectName').textContent = solfegeOf(p);
  $('expectWhere').textContent = describePosition(p);
}

function moveCursor(x, row) {
  const c = $('cursor');
  if (row == null || !layout) { c.classList.add('hidden'); return; }
  const score = $('score');
  const pos = layout.positions.find((p) => p && p.row === row);
  c.classList.remove('hidden');
  c.style.left = x + score.offsetLeft + 'px';
  c.style.top = pos.top + score.offsetTop - 8 + 'px';
  c.style.height = pos.bottom - pos.top + 16 + 'px';
}

let lastScrolledRow = -1;
function keepRowVisible(row) {
  if (row === lastScrolledRow || !layout) return;
  lastScrolledRow = row;
  const pos = layout.positions.find((p) => p && p.row === row);
  const score = $('score');
  const r = score.getBoundingClientRect();
  const top = r.top + pos.top - 60, bottom = r.top + pos.bottom + 80;
  if (top < 0 || bottom > window.innerHeight) {
    window.scrollBy({ top: top - window.innerHeight / 3, behavior: 'smooth' });
  }
}

function buildBeatDots() {
  const n = piece ? piece.time[0] : 4;
  $('beatDots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i === 0 ? 'first' : ''}"></i>`).join('');
}
function flashBeat(k) {
  const dots = [...$('beatDots').children];
  dots.forEach((d, i) => d.classList.toggle('on', i === k));
  setTimeout(() => dots[k]?.classList.remove('on'), 120);
}

// ---------- microfoon-feedback ----------
const nameByWritten = new Map(Object.keys(FRETBOARD).map((n) => [writtenMidi(n), n]));
let frameMidi = null;
function onFrame(f) {
  $('levelFill').style.width = Math.round(f.level * 100) + '%';
  if (f.midi != null) {
    frameMidi = f.midi;
    const written = f.midi + 12;
    $('heardName').textContent = solfege(written);
    const nm = nameByWritten.get(written);
    $('heardWhere').textContent = nm ? describePosition(nm) : '';
    $('needle').style.left = 50 + Math.max(-50, Math.min(50, f.cents)) + '%';
    const gt = game.running ? game.target() : null;
    const exp = gt ? soundingMidi(gt.p)
      : curIdx >= 0 && piece.notes[curIdx] && !isRest(piece.notes[curIdx]) ? soundingMidi(piece.notes[curIdx].p) : null;
    $('heardName').classList.toggle('match', exp === f.midi);
  } else if (f.level < 0.05) {
    $('heardName').textContent = '–';
    $('heardWhere').textContent = '';
    $('heardName').classList.remove('match');
  }
}

function onNote(ev) {
  if (game.running) return game.onNote(ev);
  if (!run || !piece || run.demo) return;
  if (run.wait) return judgeWait(ev);
  judgeTimed(ev);
}

// Vertel de detector welke noten nu en zo meteen verwacht worden.
function updateExpected(b) {
  if (!detector || !piece) return;
  const out = [];
  if (run?.wait) {
    if (run.idx >= 0) out.push(soundingMidi(piece.notes[run.idx].p));
  } else {
    piece.notes.forEach((n, i) => {
      if (!isRest(n) && !states[i] && starts[i] + n.d > b - 0.5 && starts[i] < b + 1.5) out.push(soundingMidi(n.p));
    });
  }
  detector.setExpect([...new Set(out)].slice(0, 3));
}

// ---------- beoordelen ----------
function tolBeats() { return settings.tol * run.bpm / 60; }
function lateWindow(i) { return Math.max(tolBeats(), Math.min(0.5, piece.notes[i].d * 0.5)); }

function judgeTimed(ev) {
  const b = run.beatAtCtx(ev.time);
  if (b < -0.5) return;
  const notes = piece.notes;
  const tol = tolBeats();
  const playedName = solfege(ev.midi + 12);

  for (let i = 0; i < notes.length; i++) {
    if (isRest(notes[i]) || states[i]) continue;
    if (b >= starts[i] - tol && b <= starts[i] + lateWindow(i)) {
      if (soundingMidi(notes[i].p) === ev.midi) setState(i, 'good');
      else setState(i, 'bad', `fout: ${playedName}`);
      judgedAt[i] = ev.time;
      return;
    }
    if (starts[i] - tol > b) break;
  }
  // Niets in het venster: was dit te vroeg?
  const sounding = notes.findIndex((n, i) => b >= starts[i] && b < starts[i] + n.d);
  // dubbele detectie van dezelfde aanslag negeren
  if (sounding >= 0 && judgedAt[sounding] != null && ev.time - judgedAt[sounding] < 0.25) return;
  // Alleen een duidelijke nieuwe aanslag kan 'te vroeg' of 'fout' zijn, geen uitklinkende snaar.
  if (ev.attack === false) return;
  const next = notes.findIndex((n, i) => !isRest(n) && !states[i] && starts[i] - tol > b);
  if (next >= 0 && starts[next] - b <= Math.max(1, notes[sounding]?.d ?? 1)) {
    if (soundingMidi(notes[next].p) === ev.midi) setState(next, 'early', 'te vroeg');
    else setState(next, 'bad', `fout: ${playedName}`);
  }
}

function judgeWait(ev) {
  const i = run.idx;
  if (i < 0) return;
  const exp = soundingMidi(piece.notes[i].p);
  if (exp !== ev.midi && ev.attack === false) return; // nagalm, geen nieuwe noot
  if (exp === ev.midi) {
    if (states[i] === 'bad') { states[i] = null; }
    states[i] = 'good';
    counts.good++;
    updateCounts();
    run.idx = firstPlayable(i + 1);
    curIdx = run.idx;
    updateExpected(0);
    repaintStates();
    if (run.idx < 0) return finish();
    updateExpect(run.idx);
    const p = layout.positions[run.idx];
    moveCursor(p.x, p.row);
    keepRowVisible(p.row);
  } else if (states[i] !== 'bad') {
    setState(i, 'bad', `fout: ${solfege(ev.midi + 12)}`);
  }
}

// ---------- spel ----------
const game = new Game({
  container: $('game'),
  hud: { streak: $('gStreak'), best: $('gBest'), total: $('gTotal'), msg: $('gMsg') },
  ctx: audioCtx,
  click,
  setExpect: (midis) => detector?.setExpect(midis),
  onTarget: (p) => {
    $('expectName').textContent = p ? solfegeOf(p) : '–';
    $('expectWhere').textContent = p ? describePosition(p) : '';
  },
});
const selectionKey = () => [...settings.selection].sort().join(',');
game.onBest = (best) => { settings.gameBest[selectionKey()] = best; save(); };

function configureGame() {
  game.bpm = settings.gameBpm;
  game.metro = settings.metro;
  game.showNames = settings.names;
  game.showFingers = settings.fingers;
  game.best = settings.gameBest[selectionKey()] || 0;
  game.setPool(PRACTICE_NOTES.filter((n) => settings.selection.includes(n)));
  game.updateHud();
}

async function startGame() {
  stop();
  await ensureMic();
  configureGame();
  game.start();
  $('startBtn').textContent = '■ Stop';
  $('startBtn').classList.add('stop');
}

// ---------- start / stop ----------
async function start() {
  if (!piece) return;
  stop();
  resetCounts();
  lastScrolledRow = -1;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $('micMsg').classList.add('hidden');
  await ensureMic();
  const c = audioCtx();
  await c.resume();
  if (detector) {
    detector.sensitivity = settings.sens;
    detector.latency = settings.latency / 1000;
  }

  const total = piece.notes.reduce((s, n) => s + n.d, 0);
  const bar = barLen();
  const pickup = piece.pickup || 0;
  const rec = songAudio();

  if (settings.wait && !rec) {
    run = { wait: true, bpm: settings.bpm, idx: firstPlayable(0), total };
    curIdx = run.idx;
    const t0 = c.currentTime + 0.1;
    run.beatAtCtx = (t) => (t - t0) * run.bpm / 60;
    run.ctxAtBeat = (b) => t0 + b * 60 / run.bpm;
    run.nextClick = 0;
    run.metroOnly = true;
    updateExpected(0);
    repaintStates();
    updateExpect(curIdx);
    const p = layout.positions[curIdx];
    moveCursor(p.x, p.row);
  } else if (rec) {
    const audio = audioCache.get(rec.src) || new Audio(rec.src);
    audioCache.set(rec.src, audio);
    audio.preservesPitch = true;
    audio.playbackRate = settings.speed / 100;
    audio.currentTime = 0;
    const rate = audio.playbackRate;
    run = { wait: false, bpm: rec.bpm * rate, audio, total, anchor: null };
    const map = beatMap(rec, syncAdjust());
    run.beatAtCtx = (t) => {
      if (!run.anchor) return -1e9;
      return map.posToBeat(run.anchor.pos + (t - run.anchor.ctx) * rate);
    };
    run.ctxAtBeat = (b) => {
      if (!run.anchor) return Infinity;
      return run.anchor.ctx + (map.beatToPos(b) - run.anchor.pos) / rate;
    };
    run.nextClick = null;
    audio.onended = () => finish();
    audio.play().catch(() => {
      $('micMsg').textContent = 'De muziek kon niet starten. Klik nog eens op Start.';
      $('micMsg').classList.remove('hidden');
      stop();
    });
  } else {
    const spb = 60 / settings.bpm;
    const countIn = pickup ? bar + (bar - pickup) : bar;
    const t0 = c.currentTime + 0.15 + countIn * spb;
    run = { wait: false, bpm: settings.bpm, total, countIn };
    run.beatAtCtx = (t) => (t - t0) / spb;
    run.ctxAtBeat = (b) => t0 + b * spb;
    run.nextClick = -countIn;
  }

  $('startBtn').textContent = '■ Stop';
  $('startBtn').classList.add('stop');
  run.timer = setInterval(scheduler, 25);
  run.raf = requestAnimationFrame(frame);
}

// ---------- voorbeeld: de gesimuleerde gitaar speelt het stukje voor ----------
async function playDemo() {
  if (!piece) return;
  stop();
  resetCounts();
  lastScrolledRow = -1;
  const c = audioCtx();
  await c.resume();
  const rec = songAudio();
  const bpm = rec ? (rec.bpm * settings.speed) / 100 : settings.bpm;
  const spb = 60 / bpm;
  const bar = barLen();
  const pickup = piece.pickup || 0;
  // met metronoom: eerst een maat aftellen, net als bij zelf spelen
  const countIn = settings.metro ? (pickup ? bar + (bar - pickup) : bar) : 0;
  const lead = 0.3;
  const data = renderGuitar(piece.notes, { bpm, sampleRate: c.sampleRate, lead, seed: (piece.num || 1) * 7 });
  const buffer = c.createBuffer(1, data.length, c.sampleRate);
  buffer.copyToChannel(data, 0);
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.connect(c.destination);
  const t0 = c.currentTime + 0.2 + countIn * spb;
  source.start(t0 - lead);

  const total = piece.notes.reduce((s, n) => s + n.d, 0);
  run = { demo: true, wait: false, bpm, total, countIn, source };
  run.beatAtCtx = (t) => (t - t0) / spb;
  run.ctxAtBeat = (b) => t0 + b * spb;
  run.nextClick = -countIn;
  $('demoBtn').textContent = '■ Stop voorbeeld';
  $('demoBtn').classList.add('playing');
  run.timer = setInterval(scheduler, 25);
  run.raf = requestAnimationFrame(frame);
}

function stop() {
  if (game.running) {
    game.stop();
    $('startBtn').textContent = '▶ Start';
    $('startBtn').classList.remove('stop');
  }
  if (!run) return;
  clearInterval(run.timer);
  cancelAnimationFrame(run.raf);
  if (run.audio) { run.audio.pause(); run.audio.onended = null; }
  if (run.source) { try { run.source.stop(); } catch {} }
  $('demoBtn').textContent = '🎧 Voorbeeld';
  $('demoBtn').classList.remove('playing');
  run = null;
  detector?.setExpect([]);
  curIdx = -1;
  repaintStates();
  $('countin').classList.add('hidden');
  $('cursor').classList.add('hidden');
  $('startBtn').textContent = '▶ Start';
  $('startBtn').classList.remove('stop');
}

function finish() {
  if (!run) return;
  if (run.demo) return stop();
  // alles wat nog niet gespeeld is telt als gemist
  if (!run.wait) piece.notes.forEach((n, i) => { if (!isRest(n) && !states[i]) setState(i, 'missed'); });
  const playable = piece.notes.filter((n) => !isRest(n)).length;
  const pct = playable ? Math.round((counts.good / playable) * 100) : 0;
  const wasWait = run.wait;
  stop();
  const msg = wasWait
    ? ''
    : pct >= 90 ? `${pct}% — Super! 🌟` : pct >= 70 ? `${pct}% — Goed bezig!` : `${pct}% — Blijf oefenen 💪`;
  $('resultMsg').textContent = msg || (counts.bad ? `Klaar! ${counts.bad} keer mis gespeeld.` : 'Klaar! Alles in één keer goed 🌟');
}

// Omrekening tussen tijd in de opname en tellen; gebruikt de gemeten tel-tijden als die er zijn.
function beatMap(rec, adjust) {
  const ibi = 60 / rec.bpm;
  const times = (rec.beats?.length >= 2 ? rec.beats : [rec.offset, rec.offset + ibi]).map((t) => t + adjust);
  const n = times.length;
  const firstIbi = times[1] - times[0];
  const lastIbi = times[n - 1] - times[n - 2];
  return {
    beatToPos(b) {
      if (b <= 0) return times[0] + b * firstIbi;
      if (b >= n - 1) return times[n - 1] + (b - (n - 1)) * lastIbi;
      const k = Math.floor(b);
      return times[k] + (b - k) * (times[k + 1] - times[k]);
    },
    posToBeat(p) {
      if (p <= times[0]) return (p - times[0]) / firstIbi;
      if (p >= times[n - 1]) return n - 1 + (p - times[n - 1]) / lastIbi;
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= p) lo = mid; else hi = mid;
      }
      return lo + (p - times[lo]) / (times[lo + 1] - times[lo]);
    },
  };
}

function barPos(b) {
  const bar = barLen();
  const shift = piece.pickup ? bar - piece.pickup : 0;
  return (((b + shift) % bar) + bar) % bar;
}

function scheduler() {
  if (!run) return;
  const c = audioCtx();
  if (run.nextClick == null) {
    if (!run.anchor) return;
    run.nextClick = Math.ceil(run.beatAtCtx(c.currentTime));
  }
  while (true) {
    const t = run.ctxAtBeat(run.nextClick);
    if (!isFinite(t) || t > c.currentTime + 0.12) break;
    const b = run.nextClick;
    const inCountIn = !run.wait && run.countIn && b < 0;
    if (t >= c.currentTime - 0.01 && (inCountIn || settings.metro)) {
      const p = barPos(b);
      click(t, Math.abs(p) < 1e-6);
    }
    const k = Math.floor(barPos(b));
    setTimeout(() => flashBeat(k), Math.max(0, (t - c.currentTime) * 1000));
    run.nextClick++;
    if (!run.wait && b > run.total + 1) break;
  }
}

function frame() {
  if (!run) return;
  run.raf = requestAnimationFrame(frame);
  const c = audioCtx();
  const now = c.currentTime;

  if (run.audio) {
    const a = run.audio;
    if (!a.paused && a.currentTime > 0) {
      const rate = a.playbackRate;
      const pred = run.anchor ? run.anchor.pos + (now - run.anchor.ctx) * rate : null;
      if (pred == null || Math.abs(pred - a.currentTime) > 0.06) run.anchor = { ctx: now, pos: a.currentTime };
    }
  }
  if (run.wait) return;

  const b = run.beatAtCtx(now);
  const ci = $('countin');
  if (run.countIn && b < 0) {
    ci.classList.remove('hidden');
    ci.textContent = Math.floor(barPos(Math.floor(b))) + 1;
  } else ci.classList.add('hidden');

  if (!run.demo) updateExpected(b);

  // gemiste noten
  for (let i = 0; !run.demo && i < piece.notes.length; i++) {
    if (starts[i] > b) break;
    if (!isRest(piece.notes[i]) && !states[i] && b > starts[i] + lateWindow(i)) setState(i, 'missed');
  }

  // huidige noot + cursor
  let i = starts.findIndex((s, k) => b >= s && b < s + piece.notes[k].d);
  if (b < 0) i = 0;
  if (i !== curIdx) {
    curIdx = i;
    repaintStates();
    updateExpect(b < 0 ? firstPlayable(0) : i);
  }
  if (i >= 0 && layout) {
    const p = layout.positions[i];
    let x = p.x;
    const nx = layout.positions[i + 1];
    if (b >= 0 && nx && nx.row === p.row) x = p.x + (nx.x - p.x) * ((b - starts[i]) / piece.notes[i].d);
    moveCursor(x, p.row);
    keepRowVisible(p.row);
  }
  if (b > run.total + 0.5 && !run.audio) finish();
}

// ---------- UI opbouwen ----------
function buildNoteChips() {
  const wrap = $('noteChips');
  wrap.innerHTML = '';
  PRACTICE_NOTES.forEach((n) => {
    const b = document.createElement('button');
    b.className = 'chip' + (settings.selection.includes(n) ? ' on' : '');
    const pos = FRETBOARD[n];
    b.innerHTML = `<b>${solfegeOf(n)}${n === 'G5' || n === 'C5' ? '′' : ''}</b><small>${pos.string}e snaar ${pos.fret ? pos.fret : 'los'}</small>`;
    b.title = describePosition(n);
    b.onclick = () => {
      const s = new Set(settings.selection);
      s.has(n) ? s.delete(n) : s.add(n);
      settings.selection = [...s];
      save();
      b.classList.toggle('on');
      if (settings.tab === 'game') { if (!game.running) configureGame(); }
      else makeExercise();
    };
    wrap.appendChild(b);
  });
}

const ICONS = {
  1: '<svg viewBox="0 0 20 26"><ellipse cx="7" cy="20" rx="5.5" ry="4" transform="rotate(-20 7 20)" fill="currentColor"/><rect x="11.2" y="2" width="1.6" height="18" fill="currentColor"/></svg>',
  2: '<svg viewBox="0 0 20 26"><ellipse cx="7" cy="20" rx="5" ry="3.5" transform="rotate(-20 7 20)" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="11.2" y="2" width="1.6" height="17.5" fill="currentColor"/></svg>',
  3: '<svg viewBox="0 0 20 26"><ellipse cx="7" cy="20" rx="5" ry="3.5" transform="rotate(-20 7 20)" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="11.2" y="2" width="1.6" height="17.5" fill="currentColor"/><circle cx="17" cy="20" r="1.8" fill="currentColor"/></svg>',
  4: '<svg viewBox="0 0 20 26"><ellipse cx="10" cy="15" rx="7" ry="4.5" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
};

function bindUI() {
  // tabs
  document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => switchTab(t.dataset.tab)));

  // duur-keuzes
  document.querySelectorAll('#durChips input').forEach((inp) => {
    inp.checked = settings.durs.includes(+inp.value);
    inp.nextElementSibling.querySelector('.glyph').outerHTML = ICONS[inp.value];
    inp.onchange = () => {
      settings.durs = [...document.querySelectorAll('#durChips input:checked')].map((x) => +x.value);
      save();
      makeExercise();
    };
  });
  $('timeSig').value = settings.timeSig;
  $('timeSig').onchange = (e) => { settings.timeSig = e.target.value; save(); makeExercise(); };
  $('bars').value = String(settings.bars);
  $('bars').onchange = (e) => { settings.bars = +e.target.value; save(); makeExercise(); };
  $('newExercise').onclick = makeExercise;

  // liedjes
  const sel = $('songSelect');
  fillSongSelect();
  sel.onchange = () => loadSong(+sel.value);

  // liedjes importeren uit een zip en bewaren in deze browser
  $('importBtn').onclick = () => $('zipInput').click();
  $('zipInput').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    stop();
    $('importBtn').disabled = true;
    try {
      const r = await importZip(file, (msg) => { $('libraryInfo').textContent = msg; });
      await refreshLibrary();
      $('libraryInfo').textContent = `✓ ${r.songs} liedjes geïmporteerd (${r.audio} opnames). Ze blijven bewaard in deze browser.`;
    } catch (err) {
      $('libraryInfo').textContent = `Importeren mislukt: ${err.message}`;
    } finally {
      $('importBtn').disabled = false;
    }
  };
  // verwijderen vraagt een tweede klik ter bevestiging
  let clearArmed = null;
  $('clearBtn').onclick = async () => {
    if (!clearArmed) {
      $('clearBtn').textContent = 'Zeker? Klik nog eens om alle liedjes te verwijderen';
      clearArmed = setTimeout(() => { clearArmed = null; $('clearBtn').textContent = 'Alle liedjes uit deze browser verwijderen'; }, 4000);
      return;
    }
    clearTimeout(clearArmed);
    clearArmed = null;
    $('clearBtn').textContent = 'Alle liedjes uit deze browser verwijderen';
    await clearLibrary();
    await refreshLibrary();
  };
  document.querySelectorAll('#recSeg button').forEach((b) => (b.onclick = () => {
    stop();
    settings.rec = b.dataset.rec;
    save();
    updateRecButtons();
    updateTempoUI();
    updateSyncInfo();
  }));
  document.querySelectorAll('[data-sync]').forEach((b) => (b.onclick = () => {
    const d = parseFloat(b.dataset.sync);
    setSyncAdjust(d === 0 ? 0 : Math.round((syncAdjust() + d) * 1000) / 1000);
  }));

  // tempo
  $('tempo').oninput = (e) => {
    if (settings.tab === 'game') {
      settings.gameBpm = +e.target.value;
      game.bpm = settings.gameBpm; // mag tijdens het spelen veranderen
    } else if (usingRecording()) {
      settings.speed = +e.target.value;
      if (run?.audio) {
        stop();
      }
    } else {
      settings.bpm = +e.target.value;
      if (run && !run.wait) stop();
      if (run?.wait) run.bpm = settings.bpm;
    }
    save();
    updateTempoUI();
  };

  const toggle = (id, key, after) => {
    $(id).checked = settings[key];
    $(id).onchange = (e) => { settings[key] = e.target.checked; save(); after?.(); };
  };
  toggle('metroToggle', 'metro', () => { game.metro = settings.metro; });
  toggle('waitToggle', 'wait', () => stop());
  toggle('namesToggle', 'names', redraw);
  toggle('echoToggle', 'echo', () => { stop(); detector?.stop(); detector = null; });
  toggle('fingersToggle', 'fingers', redraw);

  $('difficulty').value = String(settings.tol);
  $('difficulty').onchange = (e) => { settings.tol = +e.target.value; save(); };
  $('sens').value = settings.sens;
  $('sens').oninput = (e) => { settings.sens = +e.target.value; if (detector) detector.sensitivity = settings.sens; save(); };
  $('latency').value = settings.latency;
  $('latOut').textContent = settings.latency + ' ms';
  $('latency').oninput = (e) => {
    settings.latency = +e.target.value;
    $('latOut').textContent = settings.latency + ' ms';
    if (detector) detector.latency = settings.latency / 1000;
    save();
  };

  $('startBtn').onclick = () => {
    if (settings.tab === 'game') return game.running ? stop() : startGame();
    return run && !run.demo ? stop() : start();
  };
  $('demoBtn').onclick = () => (run?.demo ? stop() : playDemo());
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      $('startBtn').click();
    }
  });

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(redraw, 150); });
}

function redraw() {
  if (settings.tab === 'game') {
    game.showNames = settings.names;
    game.showFingers = settings.fingers;
    game.draw();
  } else draw();
}

function switchTab(tab) {
  stop();
  settings.tab = tab;
  save();
  const isGame = tab === 'game';
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $('pane-practice').classList.toggle('hidden', tab !== 'practice');
  $('pane-songs').classList.toggle('hidden', tab !== 'songs');
  $('pane-game').classList.toggle('hidden', !isGame);
  $('noteField').classList.toggle('hidden', tab === 'songs');
  $('gameWrap').classList.toggle('hidden', !isGame);
  for (const id of ['scoreWrap', 'resultsBar', 'legendBar', 'demoBtn']) $(id).classList.toggle('hidden', isGame);
  if (tab === 'practice') makeExercise();
  else if (tab === 'songs') loadSong(settings.song);
  else {
    configureGame();
    game.draw();
    $('expectName').textContent = '–';
    $('expectWhere').textContent = '';
  }
  updateTempoUI();
}

// Testhaakje: laat toe noten te simuleren vanuit de console.
window.__simisol = { onNote: (ev) => onNote(ev), get run() { return run; }, get ctx() { return ctx; }, get detector() { return detector; }, frame: () => frame(), game, states: () => states };

SONGS = await loadSongs();
buildNoteChips();
bindUI();
switchTab(settings.tab);
