// Lama-winkel: munten uitgeven aan spulletjes en de lama aankleden.
// wallet = { coins, owned: [id], outfit: {slot: id} }. Munten vang je in het lama-spel.
// In de testmodus (?lamatest in de url) is alles van jou en wordt niets bewaard.
import { SLOTS, ITEMS, ITEM, loadLlama, drawLlama, drawParticle, trailParticles, trailRate } from './lama-style.js';

// ---------- overzetten naar een ander toestel ----------
// Een code met je munten, spulletjes en kleren: LAMA-<base64 van de gegevens>-<controlegetal>.
// Het controlegetal vangt tikfouten en half gekopieerde codes op. Bij het inlezen krijg je alle spulletjes erbij
// (je verliest er nooit), je munten worden het hoogste van de twee (niet opgeteld, anders kan je munten maken door
// heen en weer te kopiëren) en elke code werkt maar één keer per toestel.
const SALT = 'simisol-lama';
function checksum(str) { // FNV-1a, 6 hexcijfers
  let h = 0x811c9dc5;
  for (const ch of SALT + str) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0').slice(-6);
}
const toB64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

export function exportCode(w) {
  const data = JSON.stringify({ v: 1, id: Math.random().toString(36).slice(2, 10), c: w.coins, o: w.owned, w: w.outfit });
  const body = toB64(data);
  return `LAMA-${body}-${checksum(body)}`;
}

export function parseCode(code) {
  const m = code.replace(/\s+/g, '').match(/^LAMA-([A-Za-z0-9_-]+)-([0-9a-f]{6})$/i);
  if (!m) throw new Error('Dat is geen lama-code. Ze begint met LAMA-.');
  if (checksum(m[1]) !== m[2].toLowerCase()) throw new Error('De code klopt niet. Is ze volledig gekopieerd?');
  const d = JSON.parse(fromB64(m[1]));
  const owned = (d.o || []).filter((id) => ITEM[id]);
  const outfit = Object.fromEntries(Object.entries(d.w || {}).filter(([s, id]) => ITEM[id]?.slot === s && owned.includes(id)));
  return { id: String(d.id), coins: Math.max(0, Math.floor(+d.c || 0)), owned, outfit };
}

// Een code inlezen in de portemonnee w (in place). Geeft terug wat er bij kwam.
export function importCode(w, code) {
  const d = parseCode(code);
  w.imported ||= [];
  if (w.imported.includes(d.id)) throw new Error('Deze code is op dit toestel al gebruikt. Maak een nieuwe op het andere toestel.');
  const added = d.owned.filter((id) => !w.owned.includes(id));
  const coins = Math.max(w.coins, d.coins);
  const gained = coins - w.coins;
  w.owned.push(...added);
  w.coins = coins;
  w.outfit = { ...d.outfit };
  w.imported.push(d.id);
  return { added: added.length, gained };
}


/**
 * @param {{dialog: HTMLDialogElement, wallet: () => object, save: () => void, onChange: () => void, test: boolean}} o
 */
export function initShop(o) {
  const d = o.dialog;
  const $ = (sel) => d.querySelector(sel);
  let slot = 'head';
  let tryOn = null; // {slot, id}: even passen zonder te kopen
  let confirm = null; // id dat wacht op een tweede klik om te kopen
  let confirmTimer = 0;
  let A = null;
  let raf = 0;

  $('.shop-test').classList.toggle('hidden', !o.test);
  $('.shop-sync').classList.toggle('hidden', o.test); // in de testmodus is niets echt van jou

  // overzetten: code maken en kopiëren, of een code van een ander toestel inlezen
  const say = (msg, ok = true) => { const p = $('.sync-msg'); p.textContent = msg; p.classList.toggle('bad', !ok); };
  $('.sync-make').onclick = () => {
    const out = $('.sync-out');
    out.value = exportCode(o.wallet());
    out.parentElement.classList.remove('hidden');
    out.select();
    say('Kopieer deze code en plak ze op het andere toestel bij “Code inlezen”.');
  };
  $('.sync-copy').onclick = async () => {
    const out = $('.sync-out');
    try { await navigator.clipboard.writeText(out.value); } catch { out.select(); document.execCommand('copy'); }
    say('Gekopieerd! 📋');
  };
  $('.sync-load').onclick = () => {
    const code = $('.sync-in').value.trim();
    if (!code) return say('Plak eerst een code.', false);
    try {
      const r = importCode(o.wallet(), code);
      $('.sync-in').value = '';
      say(`Gelukt! ${r.added} ${r.added === 1 ? 'nieuw spulletje' : 'nieuwe spulletjes'}` + (r.gained ? ` en ${r.gained} munten erbij.` : '.'));
      tryOn = null;
      changed();
    } catch (e) {
      say(e instanceof SyntaxError ? 'De code klopt niet. Is ze volledig gekopieerd?' : e.message, false);
    }
  };
  const tabs = $('.shop-tabs');
  for (const s of SLOTS) {
    const b = document.createElement('button');
    b.className = 'shop-tab';
    b.dataset.slot = s.id;
    b.innerHTML = `<span>${s.icon}</span>${s.name}`;
    b.onclick = () => { slot = s.id; tryOn = null; render(); };
    tabs.appendChild(b);
  }

  const outfit = () => {
    const w = o.wallet(), out = { ...w.outfit };
    if (tryOn) out[tryOn.slot] = tryOn.id;
    return out;
  };

  function changed() { o.save(); o.onChange(); render(); }

  function equip(it) {
    const w = o.wallet();
    if (w.outfit[it.slot] === it.id) delete w.outfit[it.slot];
    else w.outfit[it.slot] = it.id;
    tryOn = null;
    changed();
  }

  function buy(it) {
    const w = o.wallet();
    if (w.coins < it.price) return;
    if (confirm !== it.id) { // eerst bevestigen: een misklik kost anders je munten
      confirm = it.id;
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => { confirm = null; render(); }, 3000);
      return render();
    }
    confirm = null;
    w.coins -= it.price;
    w.owned.push(it.id);
    w.outfit[it.slot] = it.id;
    tryOn = null;
    celebrate = 1.2;
    changed();
  }

  function render() {
    const w = o.wallet();
    const coins = w.coins;
    $('.shop-coins b').textContent = coins;
    $('.shop-coins small').textContent = 'Munten vang je in het spel: speel de noot onder een munt in de lucht.';
    tabs.querySelectorAll('.shop-tab').forEach((b) => b.classList.toggle('active', b.dataset.slot === slot));
    const grid = $('.shop-grid');
    grid.innerHTML = '';
    const none = { id: null, slot, name: slot === 'fur' ? 'Crème' : 'Niets', price: 0 };
    for (const it of [none, ...ITEMS.filter((i) => i.slot === slot)]) {
      const owned = !it.id || w.owned.includes(it.id);
      const worn = (w.outfit[slot] ?? null) === it.id;
      const card = document.createElement('div');
      card.className = 'shop-card' + (worn ? ' worn' : '') + (owned ? ' owned' : '') + (tryOn?.id === it.id && tryOn?.slot === slot ? ' trying' : '');
      const cv = document.createElement('canvas');
      cv.width = 120; cv.height = 112;
      card.appendChild(cv);
      const name = document.createElement('b');
      name.textContent = it.name;
      card.appendChild(name);
      const btn = document.createElement('button');
      if (worn) { btn.textContent = '✓ Aan'; btn.className = 'on'; btn.disabled = !it.id; }
      else if (owned) btn.textContent = it.id ? 'Aandoen' : 'Uitdoen';
      else if (confirm === it.id) { btn.innerHTML = `Zeker? <img src="img/lama/coin.png" alt="">${it.price}`; btn.className = 'buy sure'; }
      else { btn.innerHTML = `<img src="img/lama/coin.png" alt="">${it.price}`; btn.className = 'buy'; btn.disabled = coins < it.price; }
      btn.onclick = (e) => {
        e.stopPropagation();
        if (!it.id) { delete w.outfit[slot]; tryOn = null; return changed(); }
        owned ? equip(it) : buy(it);
      };
      card.appendChild(btn);
      card.onclick = () => { tryOn = { slot, id: it.id }; render(); };
      grid.appendChild(card);
      if (A) {
        const g = cv.getContext('2d');
        const out = { ...outfit(), [slot]: it.id };
        delete out.trail;
        const big = slot === 'head' || slot === 'eyes';
        if (big) drawLlama(g, A, 'walk', 0, -34, 26, 1.15, out, 0.3); // ingezoomd op het hoofd
        else drawLlama(g, A, 'walk', 0, 18, 4, 0.66, out, 0.3);
        if (slot === 'trail' && it.id) trailIcon(g, it.id);
      }
    }
  }

  function trailIcon(g, id) {
    const parts = [];
    for (let i = 0; i < 6; i++) parts.push(...trailParticles(id, 22 - i * 3, 70 + (i % 3) * 6 - 6, 0));
    parts.forEach((p, i) => { p.x -= i * 2; p.life = 0.4; drawParticle(g, p, A.img); });
  }

  // ---------- grote voorvertoning: de lama loopt en springt af en toe ----------
  const cv = $('.shop-preview canvas');
  let parts = [], last = 0, trailT = 0, celebrate = 0;
  function loop(ms) {
    raf = requestAnimationFrame(loop);
    const t = ms / 1000, dt = Math.min(0.1, last ? t - last : 0);
    last = t;
    const W = 300, H = 260, sc = (cv.width = cv.clientWidth * (window.devicePixelRatio || 1)) / W;
    cv.height = H * sc;
    const g = cv.getContext('2d');
    g.setTransform(sc, 0, 0, sc, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#bfe3fb'); sky.addColorStop(1, '#e9f6ff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#8fcf6a'; g.fillRect(0, 214, W, H - 214);
    g.fillStyle = '#76b955'; for (let x = -((t * 60) % 24); x < W; x += 24) g.fillRect(x, 214, 12, 4);
    const m = A.meta, cyc = t % 3.2, jumping = cyc > 2.4;
    let sheet = 'walk', i = Math.floor(t * m.walk.fps) % m.walk.frames, lift = 0;
    if (jumping) {
      const u = (cyc - 2.4) / 0.8, j = m.jump;
      sheet = 'jump';
      i = Math.round(u < 0.5 ? j.takeoff + (u / 0.5) * (j.apex - j.takeoff) : j.apex + ((u - 0.5) / 0.5) * (j.land - j.apex));
      lift = 40 * 4 * u * (1 - u);
    }
    const s = 1.2, sm = m[sheet];
    const x0 = 150 - sm.anchorX * s, y0 = 218 - lift - sm.cellH * s;
    g.fillStyle = 'rgba(0,0,0,.12)';
    g.beginPath(); g.ellipse(150, 218, 46 - lift * 0.3, 7, 0, 0, Math.PI * 2); g.fill();
    const out = outfit();
    if (out.trail) {
      trailT += dt;
      const r = trailRate(out.trail);
      while (trailT > r) { trailT -= r; parts.push(...trailParticles(out.trail, 108, 218 - lift - 80, 60)); }
    }
    if (celebrate > 0) {
      celebrate -= dt;
      if (Math.random() < 0.6) parts.push(...trailParticles('confetti', 150 + (Math.random() - 0.5) * 160, 30, 0));
    }
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g ?? 0) * dt; p.life -= dt; }
    parts = parts.filter((p) => p.life > 0 && p.x > -20);
    for (const p of parts) drawParticle(g, p, A.img);
    drawLlama(g, A, sheet, i, x0, y0, s, out, t);
  }

  return {
    async open() {
      A = A || await loadLlama();
      tryOn = null; confirm = null;
      $('.sync-out').parentElement.classList.add('hidden');
      $('.sync-msg').textContent = '';
      render();
      d.showModal();
      if (!raf) raf = requestAnimationFrame(loop);
    },
    render: () => d.open && render(),
    closed() { cancelAnimationFrame(raf); raf = 0; tryOn = null; },
    randomize() {
      const w = o.wallet();
      for (const s of SLOTS) {
        const mine = ITEMS.filter((i) => i.slot === s.id && w.owned.includes(i.id));
        const pick = mine[Math.floor(Math.random() * (mine.length + 1))]; // ook kans op niets
        if (pick) w.outfit[s.id] = pick.id; else delete w.outfit[s.id];
      }
      tryOn = null;
      changed();
    },
  };
}

export const ALL_ITEM_IDS = ITEMS.map((i) => i.id);
export { ITEM };
