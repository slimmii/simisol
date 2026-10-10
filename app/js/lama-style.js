// Aankleden van de lama: alles wat je kan kopen met de munten die de lama in het spel vangt.
// Elk spulletje hoort bij een plek (vacht, hoofd, ogen, hals, rug, spoor); per plek draag je er één.
// De accessoires worden getekend in de pixels van één frame van de sprite. Per frame staat in
// llama.json waar de bloem (bovenaan het hoofd), het oog en de rug zitten (zie tools/llama_unflower.py),
// zodat alles mee beweegt met lopen en springen.

const ASSETS = 'img/lama/';

export const SLOTS = [
  { id: 'fur', name: 'Vacht', icon: '🎨' },
  { id: 'head', name: 'Hoofd', icon: '👒' },
  { id: 'eyes', name: 'Ogen', icon: '🕶️' },
  { id: 'neck', name: 'Hals', icon: '🧣' },
  { id: 'back', name: 'Rug', icon: '🎒' },
  { id: 'instrument', name: 'Gitaar', icon: '🎸' },
  { id: 'trail', name: 'Spoor', icon: '✨' },
];

const OL = '#5a3530'; // omlijning, zoals de lama zelf
const LW = 1.6;

// ---------- laden (gedeeld door het spel en de winkel) ----------
let loading = null;
export function loadLlama() {
  if (loading) return loading;
  const names = ['llama_walk', 'llama_jump', 'flower', 'coin', 'heart'];
  const img = {};
  loading = Promise.all([
    ...names.map((n) => new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => { img[n] = i; res(); };
      i.onerror = () => rej(new Error(`kan ${n} niet laden`));
      i.src = ASSETS + n + '.png';
    })),
    fetch(ASSETS + 'llama.json').then((r) => r.json()),
  ]).then((res) => ({ img, meta: res[res.length - 1] }));
  return loading;
}

// ---------- tekenhulpjes ----------
function paint(g, fill, path, stroke = true) {
  g.beginPath();
  path();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = LW; g.strokeStyle = OL; g.lineJoin = 'round'; g.stroke(); }
}
const ell = (g, x, y, rx, ry, rot = 0) => g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
function poly(g, pts) { g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); }
function star(g, x, y, r, n = 5, inner = 0.45, rot = -Math.PI / 2) {
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, rr = i % 2 ? r * inner : r;
    i ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}
function heart(g, x, y, s) {
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.3, y, x - s * 0.7, y - s * 0.9, x, y - s * 0.3);
  g.bezierCurveTo(x + s * 0.7, y - s * 0.9, x + s * 1.3, y, x, y + s * 0.9);
  g.closePath();
}
function line(g, w, color, pts) {
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.lineWidth = w; g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
}
function tiny(g, x, y, r, color) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = color; g.fill(); }
function minifl(g, x, y, r, color) { // bloemetje
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; tiny(g, x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, color); }
  tiny(g, x, y, r * 0.55, '#ffd84a');
}

// Ankerpunten van een frame: f = bloem (bovenaan het hoofd, vóór het linkeroor), e = oog,
// h = bovenkant hoofd tussen de oren, n = hals onder de kin (nl..nr = achter- en voorkant), b = midden van de rug.
function anchors(an, w) {
  const [fx, fy, ex, ey, by, nl, nr] = an;
  return { fx, fy, ex, ey, by, w, nl, nr, hx: fx + 13, hy: fy - 19, nx: (nl + nr) / 2, ny: ey + 24, bx: nl - 20 };
}

// ---------- de catalogus ----------
// fur: {tint} wordt over de lama gelegd (multiply). draw(g, a, t, img) tekent in framepixels.
// behind: tekenen achter de lama. trail: deeltjes die achter de lama blijven hangen.
const FUR = (id, name, price, tint, extra = {}) => ({ id, slot: 'fur', name, price, tint, ...extra });

export const ITEMS = [
  // vacht
  FUR('roze', 'Roze', 5, '#ffb3cc'),
  FUR('mint', 'Mint', 5, '#b4f0d0'),
  FUR('lavendel', 'Lavendel', 5, '#d2c0ff'),
  FUR('hemel', 'Hemelsblauw', 5, '#b0dcff'),
  FUR('perzik', 'Perzik', 5, '#ffc79a'),
  FUR('choco', 'Chocolade', 10, '#a8754f'),
  FUR('nacht', 'Nacht', 10, '#6b6390'),
  FUR('goud', 'Goud', 15, '#ffd34d', { shine: true }),
  FUR('regenboog', 'Regenboog', 15, 'rainbow'),
  FUR('spook', 'Spook', 15, '#d8ecff', { alpha: 0.55 }),

  // hoofd
  { id: 'bloem', slot: 'head', name: 'Bloem', price: 5, zoom: 1, draw(g, a, t, img) { g.drawImage(img.flower, a.fx - 12, a.fy - 14, 24, 27); } },
  { id: 'strik', slot: 'head', name: 'Strik', price: 5, zoom: 1.1, draw(g, a) {
    const x = a.fx, y = a.fy - 2;
    paint(g, '#ff4f7b', () => poly(g, [x, y, x - 11, y - 8, x - 11, y + 8]));
    paint(g, '#ff4f7b', () => poly(g, [x, y, x + 11, y - 8, x + 11, y + 8]));
    paint(g, '#d62e5a', () => ell(g, x, y, 3.5, 4));
  } },
  { id: 'feesthoed', slot: 'head', name: 'Feesthoedje', price: 5, draw(g, a) {
    const x = a.hx, y = a.hy + 5;
    g.save(); g.translate(x, y); g.rotate(-0.25);
    paint(g, '#5ec8ff', () => poly(g, [-11, 0, 11, 0, 0, -28]));
    g.save(); g.beginPath(); poly(g, [-11, 0, 11, 0, 0, -28]); g.clip();
    for (let i = 0; i < 4; i++) line(g, 3, '#ffe066', [-14, -3 - i * 7, 14, -9 - i * 7]);
    g.restore();
    paint(g, '#ff5a8a', () => ell(g, 0, -29, 4, 4));
    g.restore();
  } },
  { id: 'muts', slot: 'head', name: 'Muts', price: 5, draw(g, a) {
    const x = a.hx, y = a.hy + 8;
    paint(g, '#e8473f', () => { g.moveTo(x - 17, y); g.bezierCurveTo(x - 17, y - 24, x + 17, y - 24, x + 17, y); g.closePath(); });
    for (let i = -12; i <= 12; i += 6) line(g, 1.2, '#b52d27', [x + i, y - 1, x + i * 0.8, y - 14]);
    paint(g, '#fff6e8', () => g.roundRect(x - 18, y - 4, 36, 8, 3));
    paint(g, '#fff6e8', () => ell(g, x, y - 21, 6, 6));
  } },
  { id: 'kroon', slot: 'head', name: 'Kroon', price: 15, draw(g, a, t) {
    const x = a.hx, y = a.hy + 4;
    paint(g, '#ffcf33', () => poly(g, [x - 14, y, x + 14, y, x + 15, y - 16, x + 8, y - 8, x, y - 19, x - 8, y - 8, x - 15, y - 16]));
    tiny(g, x, y - 5, 2.6, '#e8334a'); tiny(g, x - 8, y - 4, 2, '#3b82f6'); tiny(g, x + 8, y - 4, 2, '#22c55e');
    g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5);
    paint(g, '#fff', () => star(g, x + 11, y - 15, 3.5, 4, 0.3), false);
    g.globalAlpha = 1;
  } },
  { id: 'hogehoed', slot: 'head', name: 'Hoge hoed', price: 10, draw(g, a) {
    const x = a.hx, y = a.hy + 5;
    paint(g, '#2d2a3e', () => g.roundRect(x - 11, y - 26, 22, 26, 2));
    paint(g, '#e8473f', () => g.rect(x - 11, y - 8, 22, 5));
    paint(g, '#2d2a3e', () => ell(g, x, y, 18, 3.5));
  } },
  { id: 'cowboy', slot: 'head', name: 'Cowboyhoed', price: 10, draw(g, a) {
    const x = a.hx, y = a.hy + 6;
    paint(g, '#a8693a', () => { g.moveTo(x - 13, y); g.bezierCurveTo(x - 13, y - 22, x + 13, y - 22, x + 13, y); g.closePath(); });
    line(g, 1.4, OL, [x, y - 15, x, y - 9]);
    paint(g, '#5b3519', () => g.rect(x - 13, y - 5, 26, 4));
    paint(g, '#a8693a', () => { g.moveTo(x - 25, y - 6); g.quadraticCurveTo(x, y + 8, x + 25, y - 6); g.quadraticCurveTo(x, y + 2, x - 25, y - 6); });
  } },
  { id: 'heksenhoed', slot: 'head', name: 'Heksenhoed', price: 10, draw(g, a, t) {
    const x = a.hx, y = a.hy + 6;
    paint(g, '#6a3fb5', () => { g.moveTo(x - 12, y); g.lineTo(x + 12, y); g.quadraticCurveTo(x + 4, y - 22, x - 10 + Math.sin(t * 2) * 2, y - 34); g.quadraticCurveTo(x - 4, y - 16, x - 12, y); });
    paint(g, '#ffcf33', () => g.rect(x - 11, y - 6, 22, 4));
    paint(g, '#6a3fb5', () => ell(g, x, y, 22, 4));
  } },
  { id: 'koksmuts', slot: 'head', name: 'Koksmuts', price: 10, draw(g, a) {
    const x = a.hx, y = a.hy + 5;
    paint(g, '#ffffff', () => g.rect(x - 11, y - 10, 22, 10));
    paint(g, '#ffffff', () => { ell(g, x - 8, y - 15, 8, 8); });
    paint(g, '#ffffff', () => { ell(g, x + 8, y - 15, 8, 8); });
    paint(g, '#ffffff', () => { ell(g, x, y - 21, 9, 9); });
    paint(g, '#ffffff', () => g.rect(x - 10, y - 11, 20, 10), false);
    line(g, 1.2, '#d9cbbd', [x - 10, y - 4, x + 10, y - 4]);
  } },
  { id: 'piraat', slot: 'head', name: 'Piratenhoed', price: 15, draw(g, a) {
    const x = a.hx, y = a.hy + 6;
    paint(g, '#24212e', () => { g.moveTo(x - 24, y - 2); g.quadraticCurveTo(x - 10, y - 26, x, y - 20); g.quadraticCurveTo(x + 10, y - 26, x + 24, y - 2); g.quadraticCurveTo(x, y + 4, x - 24, y - 2); });
    line(g, 2, '#ffcf33', [x - 20, y - 3, x, y + 1, x + 20, y - 3]);
    tiny(g, x, y - 12, 3.4, '#fff'); tiny(g, x - 1.2, y - 12.5, 0.9, '#24212e'); tiny(g, x + 1.2, y - 12.5, 0.9, '#24212e');
    line(g, 1.2, '#fff', [x - 4, y - 6, x + 4, y - 9]); line(g, 1.2, '#fff', [x - 4, y - 9, x + 4, y - 6]);
  } },
  { id: 'sombrero', slot: 'head', name: 'Sombrero', price: 10, draw(g, a) {
    const x = a.hx, y = a.hy + 6;
    paint(g, '#f2c14e', () => { g.moveTo(x - 11, y - 2); g.bezierCurveTo(x - 11, y - 24, x + 11, y - 24, x + 11, y - 2); g.closePath(); });
    line(g, 2.5, '#e8473f', [x - 11, y - 6, x + 11, y - 6]);
    paint(g, '#f2c14e', () => ell(g, x, y, 30, 5.5));
    g.save(); g.beginPath(); ell(g, x, y, 30, 5.5); g.clip();
    line(g, 2, '#2fa36b', [x - 30, y + 1, x + 30, y + 1]);
    g.restore();
    for (let i = -24; i <= 24; i += 8) tiny(g, x + i, y + 5.5, 1.5, '#e8473f');
  } },
  { id: 'viking', slot: 'head', name: 'Vikinghelm', price: 15, draw(g, a) {
    const x = a.hx, y = a.hy + 7;
    paint(g, '#fff6e0', () => { g.moveTo(x - 12, y - 8); g.quadraticCurveTo(x - 26, y - 12, x - 22, y - 30); g.quadraticCurveTo(x - 20, y - 18, x - 8, y - 14); g.closePath(); });
    paint(g, '#fff6e0', () => { g.moveTo(x + 12, y - 8); g.quadraticCurveTo(x + 26, y - 12, x + 22, y - 30); g.quadraticCurveTo(x + 20, y - 18, x + 8, y - 14); g.closePath(); });
    paint(g, '#a7b0be', () => { g.moveTo(x - 15, y); g.bezierCurveTo(x - 15, y - 26, x + 15, y - 26, x + 15, y); g.closePath(); });
    paint(g, '#c8a24a', () => g.rect(x - 15, y - 4, 30, 5));
    for (let i = -10; i <= 10; i += 5) tiny(g, x + i, y - 1.5, 0.9, OL);
  } },
  { id: 'eenhoorn', slot: 'head', name: 'Eenhoornhoorn', price: 15, zoom: 1.2, draw(g, a, t) {
    // op het voorhoofd, boven het oog, schuin naar voren
    const x = a.ex + 6, y = a.ey - 18;
    g.save(); g.translate(x, y); g.rotate(0.35);
    paint(g, '#ffe9a8', () => poly(g, [-5, 0, 5, 0, 1, -26]));
    for (let i = 1; i < 4; i++) line(g, 1.2, '#f0a8d0', [-5 + i * 1.4, -i * 6.5 + 1, 5 - i * 1.2, -i * 6.5 - 3]);
    g.restore();
    g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4);
    paint(g, '#fff', () => star(g, x + 14, y - 22, 3, 4, 0.3), false);
    g.globalAlpha = 1;
  } },
  { id: 'propeller', slot: 'head', name: 'Propellerpet', price: 10, draw(g, a, t) {
    const x = a.hx, y = a.hy + 6;
    paint(g, '#ff5a5a', () => { g.moveTo(x - 15, y); g.bezierCurveTo(x - 15, y - 20, x, y - 20, x, y); g.closePath(); });
    paint(g, '#3b82f6', () => { g.moveTo(x, y); g.bezierCurveTo(x, y - 20, x + 15, y - 20, x + 15, y); g.closePath(); });
    paint(g, '#ffe066', () => { g.moveTo(x + 13, y); g.lineTo(x + 26, y + 1); g.lineTo(x + 13, y - 3); g.closePath(); });
    line(g, 1.5, OL, [x, y - 15, x, y - 20]);
    const k = Math.cos(t * 25);
    paint(g, '#ffe066', () => ell(g, x - 7 * k, y - 21, Math.abs(7 * k) + 0.5, 2));
    paint(g, '#ffe066', () => ell(g, x + 7 * k, y - 21, Math.abs(7 * k) + 0.5, 2));
  } },
  { id: 'aureool', slot: 'head', name: 'Aureool', price: 15, draw(g, a, t) {
    const x = a.hx, y = a.hy - 8 + Math.sin(t * 3) * 2;
    g.save(); g.shadowColor = '#fff3a0'; g.shadowBlur = 8;
    g.beginPath(); ell(g, x, y, 14, 4); g.lineWidth = 3.5; g.strokeStyle = '#ffd84a'; g.stroke();
    g.restore();
  } },
  { id: 'bloemenkrans', slot: 'head', name: 'Bloemenkrans', price: 10, draw(g, a) {
    const cols = ['#ff7aa8', '#ffd84a', '#8fd0ff', '#ff9a5a', '#c79bff', '#ff7aa8'];
    for (let i = 0; i < 6; i++) {
      const u = i / 5, x = a.fx - 6 + u * 34, y = a.hy + 12 - Math.sin(u * Math.PI) * 9;
      if (i % 2) tiny(g, x + 3, y + 2, 2.5, '#5fb36b');
      minifl(g, x, y, 3.2, cols[i]);
    }
  } },
  { id: 'koptelefoon', slot: 'head', name: 'Koptelefoon', price: 10, zoom: 1, draw(g, a) {
    // de schelp aan de zijkant van het hoofd, de beugel over de kruin tussen de oren
    const x = a.fx + 2, y = a.fy + 9;
    g.beginPath(); g.moveTo(x, y - 7); g.bezierCurveTo(x - 2, a.hy - 10, a.hx + 8, a.hy - 12, a.hx + 16, a.hy + 6);
    g.lineWidth = 4.5; g.strokeStyle = OL; g.lineCap = 'round'; g.stroke(); g.lineWidth = 2.6; g.strokeStyle = '#4f9cf5'; g.stroke();
    paint(g, '#4f9cf5', () => g.roundRect(x - 7, y - 9, 14, 18, 6));
    paint(g, '#2d2a3e', () => g.roundRect(x - 2.5, y - 6, 5, 12, 2), false);
  } },
  { id: 'zonnebril', slot: 'eyes', name: 'Zonnebril', price: 5, draw(g, a) {
    const x = a.ex, y = a.ey;
    line(g, 1.8, '#1f1d2b', [x - 8, y - 3, a.fx - 4, a.fy + 6]);
    line(g, 1.8, '#1f1d2b', [x + 7, y - 3, x + 15, y - 4]);
    paint(g, '#1f1d2b', () => g.roundRect(x - 8, y - 6, 16, 11, 4));
    line(g, 1.5, 'rgba(255,255,255,.75)', [x - 4, y - 3, x - 1, y - 3]);
  } },
  { id: 'rondebril', slot: 'eyes', name: 'Ronde bril', price: 5, draw(g, a) {
    const x = a.ex, y = a.ey;
    line(g, 1.4, '#7a4a20', [x - 7, y - 2, a.fx - 4, a.fy + 6]);
    line(g, 1.4, '#7a4a20', [x + 7, y - 1, x + 15, y - 2]);
    g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fillStyle = 'rgba(200,235,255,.25)'; g.fill();
    g.lineWidth = 1.8; g.strokeStyle = '#7a4a20'; g.stroke();
  } },
  { id: 'hartjesbril', slot: 'eyes', name: 'Hartjesbril', price: 10, draw(g, a) {
    const x = a.ex, y = a.ey;
    line(g, 1.6, '#e0306a', [x - 8, y - 3, a.fx - 4, a.fy + 6]);
    paint(g, 'rgba(255,90,140,.85)', () => heart(g, x, y, 9));
  } },
  { id: 'sterrenbril', slot: 'eyes', name: 'Sterrenbril', price: 10, draw(g, a) {
    const x = a.ex, y = a.ey;
    line(g, 1.6, '#e8a200', [x - 8, y - 3, a.fx - 4, a.fy + 6]);
    paint(g, 'rgba(255,215,60,.9)', () => star(g, x, y, 10, 5, 0.5));
  } },
  { id: 'monocle', slot: 'eyes', name: 'Monocle', price: 10, draw(g, a) {
    const x = a.ex, y = a.ey;
    g.beginPath(); g.moveTo(x - 3, y + 6); g.quadraticCurveTo(x - 10, y + 16, x - 4, y + 22);
    g.lineWidth = 1; g.strokeStyle = '#d4a017'; g.stroke();
    g.beginPath(); g.arc(x, y, 6.5, 0, Math.PI * 2); g.fillStyle = 'rgba(220,240,255,.25)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = '#d4a017'; g.stroke();
  } },
  { id: 'ooglapje', slot: 'eyes', name: 'Ooglapje', price: 5, draw(g, a) {
    const x = a.ex, y = a.ey;
    line(g, 1.5, '#1f1d2b', [x - 6, y - 4, a.fx - 6, a.fy + 4]);
    line(g, 1.5, '#1f1d2b', [x + 3, y - 7, a.hx + 12, a.hy + 3]);
    paint(g, '#1f1d2b', () => ell(g, x, y, 7, 6.5));
  } },
  { id: '3dbril', slot: 'eyes', name: '3D-bril', price: 5, draw(g, a) {
    const x = a.ex, y = a.ey;
    line(g, 2, '#ffffff', [x - 8, y - 3, a.fx - 4, a.fy + 6]);
    paint(g, '#ffffff', () => g.roundRect(x - 9, y - 7, 26, 13, 2));
    g.fillStyle = 'rgba(230,40,60,.8)'; g.fillRect(x - 7, y - 5, 12, 9);
    g.fillStyle = 'rgba(40,140,255,.8)'; g.fillRect(x + 7, y - 5, 8, 9);
  } },
  { id: 'duikbril', slot: 'eyes', name: 'Duikbril', price: 10, draw(g, a) {
    const x = a.ex, y = a.ey;
    line(g, 3, '#ff7a1a', [x - 8, y - 2, a.fx - 8, a.fy + 4]);
    paint(g, 'rgba(120,220,255,.55)', () => g.roundRect(x - 9, y - 7, 20, 14, 6));
    g.beginPath(); g.roundRect(x - 9, y - 7, 20, 14, 6); g.lineWidth = 2.5; g.strokeStyle = '#ff7a1a'; g.stroke();
    line(g, 1.5, 'rgba(255,255,255,.8)', [x - 5, y - 3, x - 1, y - 4]);
  } },

  // hals: alles volgt de echte randen van de hals (nl = achterkant, nr = keel)
  { id: 'sjaal', slot: 'neck', name: 'Sjaal', price: 5, draw(g, a, t) {
    const l = a.nl - 1, r = a.nr + 1, y = a.ny, w = Math.sin(t * 6) * 3;
    paint(g, '#c9302c', () => { g.moveTo(l + 4, y + 2); g.quadraticCurveTo(l - 4 + w, y + 10, l - 10 + w, y + 22); g.lineTo(l - 2 + w, y + 24); g.quadraticCurveTo(l + 2, y + 12, l + 10, y + 4); g.closePath(); });
    paint(g, '#e8473f', () => { g.moveTo(l, y - 5); g.lineTo(r, y - 3); g.quadraticCurveTo(r + 2, y + 2, r, y + 6); g.lineTo(l, y + 4); g.quadraticCurveTo(l - 2, y - 1, l, y - 5); });
    for (let x = l + 5; x < r - 2; x += 7) line(g, 1.8, '#ffe8d0', [x, y - 4, x + 2, y + 4]);
  } },
  { id: 'vlinderdas', slot: 'neck', name: 'Vlinderdas', price: 5, draw(g, a) {
    const x = a.nr - 1, y = a.ny + 3;
    paint(g, '#2d2a3e', () => poly(g, [x, y, x - 10, y - 7, x - 10, y + 7]));
    paint(g, '#2d2a3e', () => poly(g, [x, y, x + 9, y - 7, x + 9, y + 7]));
    paint(g, '#e8473f', () => ell(g, x, y, 3, 3.5));
  } },
  { id: 'belletje', slot: 'neck', name: 'Belletje', price: 5, draw(g, a, t) {
    const l = a.nl - 1, r = a.nr + 1, y = a.ny;
    paint(g, '#c0392b', () => { g.moveTo(l, y - 2); g.lineTo(r, y); g.lineTo(r, y + 5); g.lineTo(l, y + 3); g.closePath(); });
    for (let x = l + 6; x < r - 4; x += 8) tiny(g, x, y + 1.5 + ((x - l) / (r - l)) * 2, 1, '#ffcf33');
    g.save(); g.translate(r - 6, y + 4); g.rotate(Math.sin(t * 8) * 0.3);
    paint(g, '#ffcf33', () => { g.moveTo(-6, 11); g.quadraticCurveTo(-6, 0, 0, 0); g.quadraticCurveTo(6, 0, 6, 11); g.closePath(); });
    tiny(g, 0, 11.5, 2, OL);
    g.restore();
  } },
  { id: 'parels', slot: 'neck', name: 'Parelketting', price: 10, draw(g, a) {
    const n = 11;
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = a.nl + u * (a.nr - a.nl), y = a.ny - 1 + u * 4 + Math.sin(u * Math.PI) * 5;
      paint(g, '#fffaf2', () => ell(g, x, y, 2.6, 2.6));
    }
  } },
  { id: 'bandana', slot: 'neck', name: 'Bandana', price: 5, draw(g, a) {
    const l = a.nl - 1, r = a.nr + 1, y = a.ny;
    paint(g, '#2f6fdc', () => poly(g, [l, y - 4, r, y - 2, r - 9, y + 17]));
    for (const [u, dy] of [[0.15, -1], [0.35, 0], [0.55, 1], [0.75, 2], [0.6, 6], [0.8, 8], [0.45, 4]]) tiny(g, l + u * (r - l), y + dy, 1.2, '#fff');
  } },
  { id: 'medaille', slot: 'neck', name: 'Medaille', price: 15, draw(g, a, t) {
    const mx = a.nr - 9, my = a.ny + 20;
    line(g, 4, '#2f6fdc', [a.nl + 10, a.ny - 3, mx, my - 5]);
    line(g, 4, '#e8473f', [a.nr - 2, a.ny - 2, mx, my - 5]);
    paint(g, '#ffcf33', () => ell(g, mx, my, 6.5, 6.5));
    paint(g, '#fff3a0', () => star(g, mx, my, 4), false);
    g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5);
    paint(g, '#fff', () => star(g, mx + 5, my - 5, 3, 4, 0.3), false);
    g.globalAlpha = 1;
  } },
  { id: 'slinger', slot: 'neck', name: 'Bloemenslinger', price: 10, draw(g, a) {
    const cols = ['#ff7aa8', '#ffd84a', '#c79bff', '#ff9a5a', '#8fd0ff'];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = a.nl + u * (a.nr - a.nl), y = a.ny + u * 4 + Math.sin(u * Math.PI) * 5;
      minifl(g, x, y, 3, cols[i % cols.length]);
    }
  } },

  // rug
  { id: 'zadel', slot: 'back', name: 'Zadel', price: 5, zoom: 1.2, draw(g, a) {
    const x = a.bx, y = a.by;
    paint(g, '#e8473f', () => { g.moveTo(x - 18, y + 1); g.lineTo(x + 14, y + 1); g.lineTo(x + 12, y + 22); g.lineTo(x - 16, y + 22); g.closePath(); });
    for (let i = 0; i < 4; i++) line(g, 1.5, i % 2 ? '#ffe066' : '#2f6fdc', [x - 16, y + 5 + i * 4, x + 13, y + 5 + i * 4]);
    paint(g, '#8a5a32', () => { g.moveTo(x - 12, y - 3); g.quadraticCurveTo(x - 2, y + 4, x + 10, y - 3); g.lineTo(x + 10, y + 4); g.quadraticCurveTo(x - 2, y + 10, x - 12, y + 4); g.closePath(); });
    paint(g, '#8a5a32', () => g.roundRect(x + 7, y - 7, 4, 8, 1.5));
  } },
  { id: 'cape', slot: 'back', name: 'Cape', price: 10, zoom: 1, draw(g, a, t) {
    // vast rond de hals, valt over de rug naar achteren en wappert aan de staartkant
    const w = Math.sin(t * 7) * 2.5, l = a.nl, r = a.nr, y = a.ny, by = a.by;
    paint(g, '#8b2fc9', () => {
      g.moveTo(r - 6, y + 3); g.lineTo(l, y + 1);
      g.quadraticCurveTo(l - 6, by - 3, a.bx - 22, by + 1);
      g.lineTo(a.bx - 27 + w, by + 20);
      g.quadraticCurveTo(a.bx - 18, by + 16 + w, a.bx - 10, by + 20);
      g.quadraticCurveTo(a.bx - 2, by + 15 - w, a.bx + 6, by + 18);
      g.quadraticCurveTo(l + 2, by + 6, r - 6, y + 9);
      g.closePath();
    });
    paint(g, '#6a1f9e', () => { g.moveTo(r - 4, y + 2); g.lineTo(l - 1, y); g.lineTo(l - 1, y + 5); g.lineTo(r - 4, y + 8); g.closePath(); });
    paint(g, '#ffcf33', () => ell(g, r - 5, y + 5, 3.5, 3.5));
  } },
  { id: 'vlinder', slot: 'back', name: 'Vlindervleugels', price: 10, behind: true, zoom: 1.2, draw(g, a, t) {
    // vanaf de schouders (net achter de hals) schuin omhoog naar achteren
    const x = a.nl - 4, y = a.by + 3, k = 0.7 + 0.3 * Math.sin(t * 10);
    g.save(); g.translate(x, y); g.rotate(0.2); g.scale(1, k);
    paint(g, '#8fd0ff', () => { g.moveTo(0, 0); g.bezierCurveTo(-30, -6, -34, 14, -10, 8); g.closePath(); });
    paint(g, '#ff9ad0', () => { g.moveTo(0, 0); g.bezierCurveTo(-4, -44, -40, -42, -28, -8); g.closePath(); });
    tiny(g, -18, -24, 4, '#fff6a8'); tiny(g, -24, -14, 2.2, '#fff'); tiny(g, -20, 3, 2.5, '#fff');
    g.restore();
  } },
  { id: 'engel', slot: 'back', name: 'Engelenvleugels', price: 15, behind: true, draw(g, a, t) {
    const x = a.nl - 4, y = a.by + 4;
    g.save(); g.translate(x, y); g.rotate(-0.2 + Math.sin(t * 6) * 0.15);
    paint(g, '#ffffff', () => {
      g.moveTo(0, 0); g.quadraticCurveTo(-6, -26, -30, -30);
      g.quadraticCurveTo(-26, -24, -32, -20); g.quadraticCurveTo(-24, -16, -30, -10);
      g.quadraticCurveTo(-20, -8, -24, -2); g.quadraticCurveTo(-12, 0, 0, 0);
    });
    line(g, 1, '#d6dceb', [-6, -6, -22, -22]); line(g, 1, '#d6dceb', [-6, -3, -20, -12]);
    g.restore();
  } },
  { id: 'rugzak', slot: 'back', name: 'Rugzak', price: 5, draw(g, a) {
    const x = a.bx + 2, y = a.by - 5;
    paint(g, '#2fa36b', () => g.roundRect(x - 11, y, 22, 24, 6));
    paint(g, '#27885a', () => g.roundRect(x - 11, y, 22, 9, [6, 6, 3, 3]));
    paint(g, '#27885a', () => g.roundRect(x - 7, y + 13, 14, 8, 3));
    tiny(g, x, y + 9, 1.6, '#ffcf33');
  } },
  { id: 'vogeltje', slot: 'back', name: 'Vogeltje', price: 10, draw(g, a, t) {
    const x = a.bx + 2, y = a.by - 8 - Math.abs(Math.sin(t * 4)) * 4;
    paint(g, '#4fa8f5', () => { g.moveTo(x - 6, y); g.lineTo(x - 14, y - 4); g.lineTo(x - 12, y + 3); g.closePath(); });
    paint(g, '#4fa8f5', () => ell(g, x, y, 8, 7));
    paint(g, '#ffcf33', () => poly(g, [x + 7, y - 3, x + 12, y - 1, x + 7, y + 1]));
    paint(g, '#2f86d6', () => ell(g, x - 2, y + 1, 4.5, 3, -0.3));
    tiny(g, x + 3.5, y - 2.5, 1.3, '#1f1d2b');
    line(g, 1, '#e8a200', [x - 2, y + 7, x - 2, y + 9]); line(g, 1, '#e8a200', [x + 2, y + 7, x + 2, y + 9]);
  } },
  { id: 'raket', slot: 'back', name: 'Raket', price: 15, draw(g, a, t) {
    const x = a.bx + 2, y = a.by - 6;
    for (const dx of [-6, 5]) {
      const f = 7 + Math.random() * 6;
      paint(g, '#ff9a2a', () => poly(g, [x + dx - 4, y + 24, x + dx + 4, y + 24, x + dx, y + 24 + f]), false);
      paint(g, '#ffe066', () => poly(g, [x + dx - 2, y + 24, x + dx + 2, y + 24, x + dx, y + 24 + f * 0.6]), false);
      paint(g, '#c9d1dc', () => g.roundRect(x + dx - 5, y, 10, 25, [5, 5, 2, 2]));
      paint(g, '#e8473f', () => g.rect(x + dx - 5, y + 18, 10, 4));
    }
  } },

  // gitaren (en familie): schuin over de schouder, zie guitar() hieronder
  { id: 'gitaar', slot: 'instrument', name: 'Akoestische gitaar', price: 10, draw: guitar({ body: 'acoustic' }) },
  { id: 'klassiek', slot: 'instrument', name: 'Klassieke gitaar', price: 10, draw: guitar({ body: 'acoustic', fill: '#eec07a', head: 'slotted', rosette: '#2f9e57', strap: '#8b2fc9' }) },
  { id: 'ukelele', slot: 'instrument', name: 'Ukelele', price: 5, draw: guitar({ body: 'acoustic', size: 0.68, neck: 20, tuners: 4, fill: '#f2a65a', strap: '#ff7aa8' }) },
  { id: 'elektrisch', slot: 'instrument', name: 'Elektrische gitaar', price: 10, draw: guitar({ body: 'strat', fill: '#e8473f', head: 'strat' }) },
  { id: 'bas', slot: 'instrument', name: 'Basgitaar', price: 10, draw: guitar({ body: 'strat', fill: '#2f6fdc', size: 1.08, neck: 42, tuners: 4, head: 'strat', strap: '#2d2a3e' }) },
  { id: 'banjo', slot: 'instrument', name: 'Banjo', price: 10, draw: guitar({ body: 'banjo', neck: 38, tuners: 5, strap: '#c0392b' }) },
  { id: 'mandoline', slot: 'instrument', name: 'Mandoline', price: 10, draw: guitar({ body: 'mandolin', fill: '#b5651d', neck: 22, tuners: 8, strap: '#2fa36b' }) },
  { id: 'flyingv', slot: 'instrument', name: 'Flying V', price: 15, draw: guitar({ body: 'flyingv', fill: '#f5f5f5', head: 'v', strap: '#1f1d2b' }) },
  { id: 'vlammen', slot: 'instrument', name: 'Vlammengitaar', price: 15, draw: guitar({ body: 'strat', fill: '#1f1d2b', head: 'strat', deco: 'flames', strap: '#e8473f' }) },
  { id: 'regenbooggitaar', slot: 'instrument', name: 'Regenbooggitaar', price: 15, draw: guitar({ body: 'acoustic', deco: 'rainbow', strap: '#9a6bff' }) },
  { id: 'dubbelhals', slot: 'instrument', name: 'Dubbelhalsgitaar', price: 15, draw: guitar({ body: 'sg', fill: '#9e1b32', necks: 2, head: 'strat', strap: '#2d2a3e' }) },
  { id: 'goud', slot: 'instrument', name: 'Gouden gitaar', price: 15, draw: guitar({ body: 'strat', fill: '#ffcf33', head: 'strat', deco: 'sparkle', strap: '#c98a00' }) },
  { id: 'sterrengitaar', slot: 'instrument', name: 'Sterrengitaar', price: 15, draw: guitar({ body: 'star', fill: '#ffd84a', head: 'v', deco: 'sparkle', strap: '#8b2fc9' }) },

  // sterrenbeloningen: niet te koop, je krijgt ze met sterren (stars = zoveel sterren samen, zie lama-journey.js)
  { id: 'notenbril', slot: 'eyes', name: 'Notenbril', stars: 5, draw(g, a) {
    const x = a.ex, y = a.ey;
    line(g, 1.6, '#2d2a3e', [x - 8, y - 3, a.fx - 4, a.fy + 6]);
    g.beginPath(); g.arc(x, y, 7.5, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = '#2d2a3e'; g.stroke();
    g.font = '900 13px Nunito, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#2f6fdc'; g.fillText('♪', x, y + 0.5);
  } },
  { id: 'sterrensjaal', slot: 'neck', name: 'Sterrensjaal', stars: 10, draw(g, a, t) {
    const l = a.nl - 1, r = a.nr + 1, y = a.ny, w = Math.sin(t * 6) * 3;
    paint(g, '#24306e', () => { g.moveTo(l + 4, y + 2); g.quadraticCurveTo(l - 4 + w, y + 10, l - 10 + w, y + 22); g.lineTo(l - 2 + w, y + 24); g.quadraticCurveTo(l + 2, y + 12, l + 10, y + 4); g.closePath(); });
    paint(g, '#2f3f8f', () => { g.moveTo(l, y - 5); g.lineTo(r, y - 3); g.quadraticCurveTo(r + 2, y + 2, r, y + 6); g.lineTo(l, y + 4); g.quadraticCurveTo(l - 2, y - 1, l, y - 5); });
    for (let x = l + 6, k = 0; x < r - 2; x += 9, k++) paint(g, '#ffd84a', () => star(g, x, y + (k % 2 ? 1 : -1), 3), false);
    paint(g, '#ffd84a', () => star(g, l - 6 + w, y + 18, 2.5), false);
  } },
  { id: 'meesterkroon', slot: 'head', name: 'Meesterkroon', stars: 20, draw(g, a, t) {
    const x = a.hx, y = a.hy + 4;
    paint(g, '#9a6bff', () => poly(g, [x - 15, y, x + 15, y, x + 16, y - 18, x + 8, y - 9, x, y - 22, x - 8, y - 9, x - 16, y - 18]));
    paint(g, '#ffd84a', () => g.rect(x - 15, y - 4, 30, 4));
    paint(g, '#ffd84a', () => star(g, x, y - 12, 5), false);
    for (const [dx, sp] of [[-13, 5], [13, 4]]) { g.globalAlpha = 0.5 + 0.5 * Math.sin(t * sp); paint(g, '#fff', () => star(g, x + dx, y - 22, 3, 4, 0.3), false); }
    g.globalAlpha = 1;
  } },
  { id: 'meestergitaar', slot: 'instrument', name: 'Meestergitaar', stars: 30, draw: guitar({ body: 'flyingv', fill: '#8b2fc9', head: 'v', deco: 'sparkle', strap: '#ffcf33' }) },

  // spoor
  { id: 'glitter', slot: 'trail', name: 'Glitters', price: 5, trail: { rate: 0.04, make: () => ({ kind: 'spark', color: pick(['#fff6a8', '#ffffff', '#ffd84a']), s: 5, life: 0.6, g: 0 }) } },
  { id: 'hartjes', slot: 'trail', name: 'Hartjes', price: 5, trail: { rate: 0.12, make: () => ({ kind: 'heart', s: 12, life: 0.9, g: -60 }) } },
  { id: 'bellen', slot: 'trail', name: 'Bellen', price: 5, trail: { rate: 0.1, make: () => ({ kind: 'bubble', s: 4 + Math.random() * 5, life: 1.2, g: -80 }) } },
  { id: 'noten', slot: 'trail', name: 'Muzieknoten', price: 10, trail: { rate: 0.15, make: () => ({ kind: 'note', text: pick(['♪', '♫', '♩', '♬']), color: pick(['#2f6fdc', '#8b2fc9', '#e0306a', '#2f9e57']), s: 20, life: 1.1, g: -70 }) } },
  { id: 'sterren', slot: 'trail', name: 'Sterren', price: 10, trail: { rate: 0.08, make: () => ({ kind: 'star', color: pick(['#ffd84a', '#ffb02e', '#fff3a0']), s: 6 + Math.random() * 4, life: 0.8, g: 120 }) } },
  { id: 'confetti', slot: 'trail', name: 'Confetti', price: 10, trail: { rate: 0.03, make: () => ({ kind: 'confetti', color: pick(['#ff5a8a', '#5ec8ff', '#ffe066', '#7ee08a', '#c79bff']), s: 6, life: 1, g: 250 }) } },
  { id: 'regenboogspoor', slot: 'trail', name: 'Regenboog', price: 15, trail: { rate: 0.012, rainbow: true } },
  { id: 'vuur', slot: 'trail', name: 'Vuur', price: 15, trail: { rate: 0.02, make: () => ({ kind: 'fire', s: 6 + Math.random() * 6, life: 0.45, g: -160 }) } },
];

export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// ---------- gitaren ----------
// Allemaal op dezelfde plek: de riem over de hals, de klankkast bij de schouder en de kop schuin omhoog naar
// achteren (weg van het hoofd). Getekend langs de x-as: de klankkast rond x = -8, de hals van x = 8 naar de kop.
// spec: body (vorm), fill (kleur), size, neck (lengte), necks (1 of 2), tuners, head (kop), deco, strap, rosette.
const BODY = {
  acoustic: (g) => { g.moveTo(10, 0); g.bezierCurveTo(10, -12, -2, -10, -4, -5); g.bezierCurveTo(-8, -14, -22, -12, -22, 0); g.bezierCurveTo(-22, 12, -8, 14, -4, 5); g.bezierCurveTo(-2, 10, 10, 12, 10, 0); },
  strat: (g) => {
    g.moveTo(7, -4); g.quadraticCurveTo(13, -12, 4, -11); g.bezierCurveTo(-4, -10, -6, -13, -14, -13);
    g.bezierCurveTo(-25, -13, -26, -4, -24, 0); g.bezierCurveTo(-26, 7, -22, 13, -13, 13);
    g.bezierCurveTo(-5, 13, -3, 9, 2, 9); g.quadraticCurveTo(9, 9, 7, 4); g.closePath();
  },
  sg: (g) => {
    g.moveTo(8, -9); g.lineTo(2, -15); g.quadraticCurveTo(-4, -10, -10, -14); g.quadraticCurveTo(-26, -16, -26, 0);
    g.quadraticCurveTo(-26, 16, -10, 14); g.quadraticCurveTo(-4, 10, 2, 15); g.lineTo(8, 9); g.closePath();
  },
  flyingv: (g) => { g.moveTo(8, -3); g.lineTo(-24, -17); g.lineTo(-27, -11); g.lineTo(-11, 0); g.lineTo(-27, 11); g.lineTo(-24, 17); g.lineTo(8, 3); g.closePath(); },
  mandolin: (g) => { g.moveTo(9, 0); g.bezierCurveTo(6, -13, -24, -15, -24, 0); g.bezierCurveTo(-24, 15, 6, 13, 9, 0); },
  banjo: (g) => ell(g, -9, 0, 13, 13),
  star: (g) => star(g, -9, 0, 17, 5, 0.5, 0),
};

function guitar(spec) {
  const fill = spec.fill || '#d9893b', z = spec.size || 1, L = spec.neck || 32, nTun = spec.tuners || 6;
  const necks = spec.necks === 2 ? [-4.5, 4.5] : [0];
  return function draw(g, a, t) {
    line(g, 2.4, spec.strap || '#2f6fdc', [a.nr - 6, a.ny + 4, a.nl - 4, a.ny + 6, a.bx - 4, a.by + 16]);
    g.save();
    g.translate(a.nl - 12, a.by + 8); g.scale(-1, 1); g.rotate(-0.6); g.scale(z, z);
    // hals(en) en kop
    for (const oy of necks) {
      paint(g, '#5b3519', () => g.roundRect(6, oy - 3, L + 2, 6, 1));
      for (let f = 12; f < L + 6; f += 6) line(g, 0.6, '#c8b08a', [f, oy - 2.6, f, oy + 2.6]);
      const hx = L + 6;
      if (spec.head === 'strat') paint(g, '#3a2214', () => { g.moveTo(hx, oy - 3); g.lineTo(hx + 12, oy - 6); g.quadraticCurveTo(hx + 15, oy - 4, hx + 12, oy - 1); g.lineTo(hx, oy + 3); g.closePath(); });
      else if (spec.head === 'v') paint(g, '#1f1d2b', () => { g.moveTo(hx, oy - 3); g.lineTo(hx + 11, oy - 6); g.lineTo(hx + 8, oy); g.lineTo(hx + 11, oy + 6); g.lineTo(hx, oy + 3); g.closePath(); });
      else {
        paint(g, '#3a2214', () => g.roundRect(hx, oy - 4.5, 10, 9, 2));
        if (spec.head === 'slotted') { g.fillStyle = '#1a0f08'; g.fillRect(hx + 2, oy - 2.5, 6, 1.6); g.fillRect(hx + 2, oy + 0.9, 6, 1.6); }
      }
      const half = Math.ceil(nTun / 2);
      for (let i = 0; i < half; i++) tiny(g, hx + 2.5 + i * (7 / half), oy - 5.5, 1, '#e6e6e6');
      for (let i = 0; i < nTun - half; i++) tiny(g, hx + 2.5 + i * (7 / half), oy + 5.5, 1, '#e6e6e6');
    }
    // klankkast
    const body = () => BODY[spec.body](g);
    if (spec.body === 'banjo') {
      paint(g, '#c0c6cf', body);
      paint(g, '#f6f1e6', () => ell(g, -9, 0, 10.5, 10.5));
      for (let k = 0; k < 10; k++) { const an = (k / 10) * Math.PI * 2; tiny(g, -9 + Math.cos(an) * 11.8, Math.sin(an) * 11.8, 0.8, '#7d8590'); }
    } else {
      paint(g, fill, body);
      g.save(); g.beginPath(); body(); g.clip();
      if (spec.deco === 'rainbow') RAINBOW.forEach((c, k) => { g.fillStyle = c; g.fillRect(-30, -18 + k * 6, 45, 6); });
      if (spec.deco === 'flames') {
        for (const [y, s2] of [[-6, 1], [3, 0.8], [9, 0.6]]) {
          paint(g, '#ff9a2a', () => { g.moveTo(-26, y - 5 * s2); g.quadraticCurveTo(-12, y - 10 * s2, 2, y - 2 * s2); g.quadraticCurveTo(-8, y, -2, y + 4 * s2); g.quadraticCurveTo(-14, y + 2 * s2, -26, y + 5 * s2); }, false);
          paint(g, '#ffe066', () => { g.moveTo(-26, y - 2 * s2); g.quadraticCurveTo(-14, y - 5 * s2, -6, y); g.quadraticCurveTo(-14, y + 2 * s2, -26, y + 2 * s2); }, false);
        }
      }
      g.restore();
      if (spec.body !== 'acoustic' && spec.body !== 'mandolin') { // elektrisch: elementen en knoppen
        g.fillStyle = '#1f1d2b';
        for (const px of [-3, -9, -15]) for (const oy of necks) g.fillRect(px, oy - 3, 2.6, 6);
        tiny(g, -19, 7, 1.6, '#e6e6e6'); tiny(g, -15, 9, 1.6, '#e6e6e6');
      } else {
        paint(g, '#3a2214', () => ell(g, spec.body === 'mandolin' ? -4 : 0, 0, spec.body === 'mandolin' ? 2.6 : 3.6, 3.6), false);
        g.beginPath(); ell(g, 0, 0, 5, 5); g.lineWidth = 1; g.strokeStyle = spec.rosette || '#8a5a32'; if (spec.body === 'acoustic') g.stroke();
      }
    }
    g.fillStyle = '#3a2214'; g.fillRect(-16, -4, 3, 8); // kam
    for (const oy of necks) for (let i = -1.5; i <= 1.5; i += 1) line(g, 0.4, '#f4f0e6', [-15, oy + i, L + 6, oy + i]);
    if (spec.deco === 'sparkle') {
      g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5);
      paint(g, '#fff', () => star(g, -16, -8, 3.5, 4, 0.3), false);
      g.globalAlpha = 0.5 + 0.5 * Math.cos(t * 4);
      paint(g, '#fff', () => star(g, -4, 8, 2.8, 4, 0.3), false);
      g.globalAlpha = 1;
    }
    g.restore();
  };
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const RAINBOW = ['#ff5a5a', '#ff9a2a', '#ffe066', '#5fd36b', '#4fa8f5', '#9a6bff'];

// ---------- de lama tekenen, met vacht en accessoires ----------
let off = null;
function tinted(img, sx, cw, ch, fur, t) {
  off ||= document.createElement('canvas');
  if (off.width !== cw || off.height !== ch) { off.width = cw; off.height = ch; }
  const o = off.getContext('2d');
  o.globalCompositeOperation = 'source-over';
  o.globalAlpha = 1;
  o.clearRect(0, 0, cw, ch);
  o.drawImage(img, sx, 0, cw, ch, 0, 0, cw, ch);
  o.globalCompositeOperation = 'multiply';
  if (fur.tint === 'rainbow') {
    const gr = o.createLinearGradient(0, 0, cw, ch);
    for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, `hsl(${(i * 60 + t * 90) % 360}, 90%, 78%)`);
    o.fillStyle = gr;
  } else o.fillStyle = fur.tint;
  o.fillRect(0, 0, cw, ch);
  if (fur.shine) { // glinstering die over de vacht schuift
    o.globalCompositeOperation = 'lighter';
    const p = ((t * 0.6) % 1.6) * cw * 1.6 - cw * 0.6;
    const gr = o.createLinearGradient(p - 18, 0, p + 18, 30);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,250,210,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    o.fillStyle = gr;
    o.fillRect(0, 0, cw, ch);
  }
  o.globalCompositeOperation = 'destination-in';
  o.drawImage(img, sx, 0, cw, ch, 0, 0, cw, ch);
  return off;
}

/**
 * Teken de lama (frame i van sheet 'walk' of 'jump') met outfit, linksboven op (x, y), geschaald met s.
 * outfit: {fur, head, eyes, neck, back, trail} met id's uit ITEMS (of leeg).
 */
export function drawLlama(g, A, sheet, i, x, y, s, outfit = {}, t = 0) {
  const sm = A.meta[sheet], img = A.img['llama_' + sheet];
  const cw = sm.cellW, ch = sm.cellH;
  const a = anchors(sm.anchors[i], cw);
  const worn = ['back', 'instrument', 'neck', 'eyes', 'head'].map((k) => ITEM[outfit[k]]).filter((it) => it?.draw);
  const fur = ITEM[outfit.fur];
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  for (const it of worn) if (it.behind) drawItem(g, it, a, t, A.img);
  if (fur) {
    g.save();
    if (fur.alpha) g.globalAlpha *= fur.alpha;
    g.drawImage(tinted(img, i * cw, cw, ch, fur, t), 0, 0, cw, ch);
    g.restore();
  } else g.drawImage(img, i * cw, 0, cw, ch, 0, 0, cw, ch);
  for (const it of worn) if (!it.behind) drawItem(g, it, a, t, A.img);
  g.restore();
}

// Iets groter tekenen dan de lama zelf, rond het ankerpunt van de plek: anders zie je het nauwelijks in het spel.
const ZOOM = { head: ['hx', 'hy', 1.35], eyes: ['ex', 'ey', 1.2], neck: ['nx', 'ny', 1], back: ['bx', 'by', 1.45], instrument: ['bx', 'by', 1.2] };
function drawItem(g, it, a, t, img) {
  const [kx, ky, z0] = ZOOM[it.slot], z = it.zoom ?? z0;
  g.save();
  g.translate(a[kx], a[ky]); g.scale(z, z); g.translate(-a[kx], -a[ky]);
  it.draw(g, a, t, img);
  g.restore();
}

// ---------- spoor ----------
// Nieuwe deeltjes achter de lama (x, y = midden van de rug, in canvaspixels); speed = hoe snel de wereld schuift.
export function trailParticles(id, x, y, speed) {
  const tr = ITEM[id]?.trail;
  if (!tr) return [];
  if (tr.rainbow) {
    return RAINBOW.map((color, k) => ({ kind: 'band', x, y: y - 14 + k * 5, vx: -speed, vy: 0, g: 0, life: 0.7, color, s: 5 }));
  }
  const p = tr.make();
  return [{ x: x + (Math.random() - 0.5) * 12, y: y + (Math.random() - 0.5) * 24, vx: -speed * 0.9 - 20 - Math.random() * 40, vy: (Math.random() - 0.5) * 50, rot: Math.random() * 6, ...p }];
}
export const trailRate = (id) => ITEM[id]?.trail?.rate ?? 0;

// Teken één deeltje met een 'kind' (de gewone stofwolkjes tekent het spel zelf).
export function drawParticle(g, p, img) {
  const life = Math.max(0, Math.min(1, p.life * 2.5));
  g.globalAlpha = life;
  switch (p.kind) {
    case 'spark': g.fillStyle = p.color; g.beginPath(); star(g, p.x, p.y, p.s, 4, 0.3, p.rot); g.fill(); break;
    case 'heart': g.drawImage(img.heart, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s * 1.08); break;
    case 'bubble': g.beginPath(); g.arc(p.x, p.y, p.s, 0, Math.PI * 2); g.fillStyle = 'rgba(200,235,255,.3)'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke(); break;
    case 'note': g.font = `900 ${p.s}px Nunito, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = p.color; g.fillText(p.text, p.x, p.y); break;
    case 'star': g.fillStyle = p.color; g.beginPath(); star(g, p.x, p.y, p.s, 5, 0.45, p.rot); g.fill(); break;
    case 'confetti': g.save(); g.translate(p.x, p.y); g.rotate(p.rot + p.life * 8); g.fillStyle = p.color; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); break;
    case 'band': g.fillStyle = p.color; g.fillRect(p.x - 4, p.y - p.s / 2, 9, p.s); break;
    case 'fire': {
      const u = 1 - p.life / 0.45;
      g.fillStyle = u < 0.3 ? '#fff3a0' : u < 0.6 ? '#ffb02e' : '#ff5a2a';
      g.beginPath(); g.arc(p.x, p.y, p.s * (1 - u * 0.6), 0, Math.PI * 2); g.fill(); break;
    }
  }
  g.globalAlpha = 1;
}
