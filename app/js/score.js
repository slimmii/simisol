// Tekent een melodie met VexFlow en geeft de positie van elke noot terug.
import { solfegeOf, parseNote } from './notes.js';

const VF = window.Vex.Flow;

const SVGNS = 'http://www.w3.org/2000/svg';

const DUR = {
  4: { d: 'w', dots: 0 },
  3: { d: 'h', dots: 1 },
  2: { d: 'h', dots: 0 },
  1.5: { d: 'q', dots: 1 },
  1: { d: 'q', dots: 0 },
  0.75: { d: '8', dots: 1 },
  0.5: { d: '8', dots: 0 },
  0.25: { d: '16', dots: 0 },
};

const ROW_H_BASE = 120;

export function splitMeasures(notes, time, pickup) {
  const bar = (time[0] * 4) / time[1];
  const measures = [];
  let cur = { idx: [], len: pickup || bar, beats: 0, pickup: !!pickup };
  for (let i = 0; i < notes.length; i++) {
    if (cur.beats >= cur.len - 1e-6) {
      measures.push(cur);
      cur = { idx: [], len: bar, beats: 0 };
    }
    cur.idx.push(i);
    cur.beats += notes[i].d;
  }
  if (cur.idx.length) measures.push(cur);
  return measures;
}

function vfNote(n, i, opts) {
  const isRest = n.p === 'r';
  const dur = DUR[n.d] || DUR[1];
  let keys = ['b/4'];
  let acc = null;
  if (!isRest) {
    const p = parseNote(n.p);
    keys = [`${p.letter.toLowerCase()}${p.acc}/${p.octave}`];
    acc = p.acc;
  } else if (n.d >= 4) keys = ['d/5'];
  const note = new VF.StaveNote({ keys, duration: dur.d + (isRest ? 'r' : ''), auto_stem: true });
  note.setAttribute('id', 'n' + i);
  if (dur.dots) VF.Dot.buildAndAttach([note], { all: true });
  if (acc) note.addModifier(new VF.Accidental(acc), 0);

  return note;
}

function measureMinWidth(m, notes, opts) {
  let w = 24;
  for (const i of m.idx) {
    const n = notes[i];
    let nw = n.d >= 4 ? 64 : n.d >= 2 ? 52 : n.d >= 1 ? 42 : 30;
    if (opts.showNames) nw = Math.max(nw, 40);
    if (opts.showLyrics && n.l) nw = Math.max(nw, n.l.length * 8 + 10);
    if (opts.showChords && n.c) nw = Math.max(nw, n.c.length * 8 + 6);
    w += nw;
  }
  return w;
}

/**
 * @returns {{ positions: Array<{x:number,row:number,top:number,bottom:number,el:Element|null}>, rows: Array<{top:number,bottom:number}> }}
 */
export function renderScore(container, song, opts) {
  container.innerHTML = '';
  const notes = song.notes;
  const width = Math.max(320, container.clientWidth);
  const measures = splitMeasures(notes, song.time, song.pickup);

  // Maten verdelen over rijen.
  const clefW = 44, timeW = 30, margin = 10;
  const rowsIdx = [];
  let row = [], used = 0;
  measures.forEach((m, k) => {
    const extra = (row.length === 0 ? clefW : 0) + (k === 0 ? timeW : 0);
    const w = measureMinWidth(m, notes, opts) + extra;
    if (row.length && used + w > width - margin * 2) {
      rowsIdx.push(row);
      row = [];
      used = 0;
    }
    row.push({ k, w: measureMinWidth(m, notes, opts) + (row.length === 0 ? clefW : 0) + (k === 0 ? timeW : 0) });
    used += row[row.length - 1].w;
  });
  if (row.length) rowsIdx.push(row);

  const hasChords = opts.showChords && notes.some((n) => n.c);
  const hasLyrics = opts.showLyrics && notes.some((n) => n.l);
  const topPad = 34 + (opts.showFingers ? 22 : 0) + (hasChords ? 22 : 0);
  const botPad = 34 + (opts.showNames ? 20 : 0) + (hasLyrics ? 20 : 0);
  const rowH = ROW_H_BASE - 40 + topPad + botPad;

  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, rowsIdx.length * rowH + 10);
  const ctx = renderer.getContext();

  const vfNotes = notes.map((n, i) => vfNote(n, i, opts));
  const positions = new Array(notes.length);
  const rows = [];

  rowsIdx.forEach((r, ri) => {
    const isLast = ri === rowsIdx.length - 1;
    const total = r.reduce((s, x) => s + x.w, 0);
    const avail = width - margin * 2;
    // Laatste rij niet uitrekken als hij kort is.
    const scale = isLast && total < avail * 0.7 ? 1 : avail / total;
    let x = margin;
    const y = ri * rowH + topPad - 10;
    rows.push({ top: ri * rowH, bottom: (ri + 1) * rowH });
    r.forEach((item, j) => {
      const m = measures[item.k];
      const w = item.w * scale;
      const stave = new VF.Stave(x, y, w);
      if (j === 0) stave.addClef('treble');
      if (item.k === 0) stave.addTimeSignature(`${song.time[0]}/${song.time[1]}`);
      if (item.k === measures.length - 1) stave.setEndBarType(VF.BarlineType.END);
      if (j === 0 && item.k > 0) stave.setMeasure(item.k + (song.pickup ? 0 : 1));
      stave.setContext(ctx).draw();

      const mNotes = m.idx.map((i) => vfNotes[i]);
      const voice = new VF.Voice({ num_beats: song.time[0], beat_value: song.time[1] });
      voice.setMode(VF.Voice.Mode.SOFT);
      voice.addTickables(mNotes);
      const beams = VF.Beam.generateBeams(mNotes.filter((n) => !n.isRest()), {
        groups: VF.Beam.getDefaultBeamGroups(`${song.time[0]}/${song.time[1]}`),
      });
      new VF.Formatter().joinVoices([voice]).format([voice], stave.getNoteEndX() - stave.getNoteStartX() - 14);
      voice.draw(ctx, stave);
      beams.forEach((b) => b.setContext(ctx).draw());

      m.idx.forEach((i) => {
        const n = vfNotes[i];
        const hx = (n.getNoteHeadBeginX() + n.getNoteHeadEndX()) / 2;
        const el = document.getElementById('vf-n' + i);
        const l0 = stave.getYForLine(0), l4 = stave.getYForLine(4);
        let below = l4 + 34;
        const nt = notes[i];
        if (el && nt.p !== 'r') {
          let above = l0 - 22;
          if (opts.showFingers && nt.f) { addText(el, nt.f, hx, above, 'lbl-finger'); above -= 22; }
          if (hasChords && nt.c) addText(el, nt.c, hx, opts.showFingers ? l0 - 44 : l0 - 22, 'lbl-chord');
          if (opts.showNames) { addText(el, solfegeOf(nt.p), hx, below, 'lbl-name'); below += 20; }
          if (hasLyrics && nt.l) addText(el, nt.l, hx, opts.showNames ? below : below, 'lbl-lyric');
        }
        positions[i] = {
          x: hx,
          row: ri,
          top: l0 - 6,
          bottom: l4 + 6,
          labelBottom: l4 + 34 + (opts.showNames ? 20 : 0) + (hasLyrics ? 20 : 0) - 10,
          el,
        };
      });
      x += w;
    });
  });

  return { positions, rows, rowH };
}

function addText(parent, text, x, y, cls) {
  const t = document.createElementNS(SVGNS, 'text');
  t.setAttribute('x', x);
  t.setAttribute('y', y);
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('class', 'nlbl ' + cls);
  t.textContent = text;
  parent.appendChild(t);
}
