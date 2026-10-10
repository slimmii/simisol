// De wereld waar de lama door reist: telkens een ander landschap (weide, herfstbos, sneeuw, ...).
// Elk landschap heeft een achtergrond (lucht, bergen, heuvels) en een eigen bodemstrook, allebei naadloos herhaalbaar.
// Een nieuw landschap schuift van rechts binnen met een zachte rand: eerst de bodem (die beweegt even snel als de
// lama loopt), de achtergrond volgt trager, zoals verre bergen. Zo lijkt het alsof de lama echt ver reist.
// De beelden maak je met tools/make_backgrounds.py: elk landschap is één 1584x672 beeld, de achtergrond is
// rij 0..620 en de bodem rij 'split'..672 (split ligt net boven de bodem; zie dat script).

const DIR = 'img/lama/bg/';

// Elk landschap heeft zijn eigen monsters (twee op de grond, één in de lucht); zie MONSTERS hieronder.
export const BIOMES = [
  { id: 'weide', name: 'De weide', split: 594, monsters: ['cactus', 'bat', 'armadillo'] },
  { id: 'herfst', name: 'Het herfstbos', split: 576, monsters: ['pompoen', 'kraai', 'egel'] },
  { id: 'sneeuw', name: 'Het sneeuwland', split: 594, monsters: ['sneeuwman', 'uil', 'pinguin'] },
  { id: 'nacht', name: 'De sterrennacht', split: 580, monsters: ['paddenstoel', 'spookje', 'wasbeer'] },
  { id: 'snoep', name: 'Snoepland', split: 594, monsters: ['gombeer', 'snoepje', 'cupcake'] },
  { id: 'strand', name: 'Het strand', split: 594, monsters: ['krab', 'meeuw', 'kokosnoot'] },
  { id: 'jungle', name: 'De jungle', split: 593, monsters: ['slang', 'papegaai', 'kikker'] },
  { id: 'woestijn', name: 'De woestijn', split: 594, monsters: ['schorpioen', 'gier', 'tuimelkruid'] },
  { id: 'lava', name: 'Het vulkaanland', split: 594, monsters: ['magma', 'vuurbal', 'rotsreus'] },
];

// Monsters: h = hoogte in het spel, lift = hoe hoog boven de grond (vliegers), flip = het beeld kijkt naar rechts
// (de monsters moeten naar de lama kijken), anim = hoe ze bewegen, glow = zacht licht (in het donker). De beelden komen uit tools/make_enemies.py;
// die van de weide zijn de oorspronkelijke (img/lama/<id>.png).
export const MONSTERS = {
  cactus: { h: 74, lift: 0, anim: 'sway', file: 'cactus.png' },
  bat: { h: 50, lift: 34, anim: 'fly', file: 'bat.png' },
  armadillo: { h: 56, lift: 0, flip: true, anim: 'hop', file: 'armadillo.png' },
  pompoen: { h: 60, lift: 0, anim: 'hop' },
  kraai: { h: 52, lift: 34, flip: true, anim: 'fly' },
  egel: { h: 50, lift: 0, flip: true, anim: 'hop' },
  sneeuwman: { h: 76, lift: 0, flip: true, anim: 'sway' },
  uil: { h: 54, lift: 34, anim: 'fly' },
  pinguin: { h: 42, lift: 0, flip: true, anim: 'slide' },
  paddenstoel: { h: 66, lift: 0, anim: 'wobble', glow: true },
  spookje: { h: 56, lift: 30, anim: 'float', glow: true },
  wasbeer: { h: 56, lift: 0, anim: 'hop' },
  gombeer: { h: 66, lift: 0, anim: 'wobble' },
  snoepje: { h: 44, lift: 36, anim: 'fly' },
  cupcake: { h: 58, lift: 0, anim: 'hop' },
  krab: { h: 44, lift: 0, anim: 'scuttle' },
  meeuw: { h: 48, lift: 36, flip: true, anim: 'fly' },
  kokosnoot: { h: 52, lift: 0, anim: 'hop' },
  slang: { h: 64, lift: 0, flip: true, anim: 'sway' },
  papegaai: { h: 56, lift: 32, flip: true, anim: 'fly' },
  kikker: { h: 50, lift: 0, anim: 'hop' },
  schorpioen: { h: 50, lift: 0, flip: true, anim: 'scuttle' },
  gier: { h: 56, lift: 32, anim: 'fly' },
  tuimelkruid: { h: 54, lift: 0, anim: 'roll' },
  magma: { h: 50, lift: 0, anim: 'wobble' },
  vuurbal: { h: 54, lift: 34, anim: 'float' },
  rotsreus: { h: 70, lift: 0, anim: 'stomp' },
};
const SRC_H = 672, SCENERY_BOTTOM = 620; // hoogte van het bronbeeld, onderkant van de achtergrond

export const BIOME_LEN = 4000; // zoveel pixels wandelen per landschap
const FEATHER_GROUND = 90; // breedte van de zachte rand tussen twee bodems
const FEATHER_SKY = 360; // ... en tussen twee achtergronden

function loadImg(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(`kan ${src} niet laden`));
    i.src = src;
  });
}

export class World {
  /** @param {{W:number, H:number, top:number}} lay: breedte en hoogte van het spel; top = waar rij 0 van het beeld komt */
  constructor(lay) {
    this.lay = lay;
    this.img = {}; // id -> {scenery, ground}
    this.monster = {}; // id van een monster -> beeld
    this.off = null;
  }

  // Het eerste landschap meteen, de rest op de achtergrond (dan start het spel snel).
  async load() {
    await this.loadBiome(BIOMES[0].id);
    this.rest = (async () => {
      for (const b of BIOMES.slice(1)) await this.loadBiome(b.id).catch(() => {});
    })();
  }

  async loadBiome(id) {
    const b = BIOMES.find((x) => x.id === id);
    const [scenery, ground, ...mons] = await Promise.all([
      loadImg(`${DIR}${id}_scenery.webp`), loadImg(`${DIR}${id}_ground.webp`),
      ...b.monsters.map((m) => loadImg('img/lama/' + (MONSTERS[m].file || `monsters/${m}.png`))),
    ]);
    b.monsters.forEach((m, i) => { this.monster[m] = mons[i]; });
    this.img[id] = { scenery, ground }; // pas nu telt het landschap als klaar (ook de monsters)
  }

  // Een willekeurig monster voor wie op afgelegde weg d op de bodem staat.
  monsterAt(d) {
    const list = this.biome(this.indexAt(d)).monsters;
    return list[Math.floor(Math.random() * list.length)];
  }

  // Landschap nummer k (blijft rondgaan); nog niet geladen: het vorige dat wel klaar is.
  biome(k) {
    const n = BIOMES.length;
    for (let i = 0; i < n; i++) {
      const b = BIOMES[(((k - i) % n) + n) % n];
      if (this.img[b.id]) return b;
    }
    return BIOMES[0];
  }

  // Het landschap waar een punt op afgelegde weg d op de bodem bij hoort.
  indexAt(d) { return Math.floor(d / BIOME_LEN); }

  draw(g, dist) {
    // bodem: de grens met het volgende landschap ligt vast in de wereld en schuift mee met de bodem
    const kg = this.indexAt(dist);
    const ge = (kg + 1) * BIOME_LEN - dist;
    this.layer(g, 'ground', kg, ge, FEATHER_GROUND, dist);
    // achtergrond: dezelfde grens, maar trager (de helft) en dus later voorbij
    const ds = dist - this.lay.W;
    const ks = this.indexAt(ds);
    const se = ((ks + 1) * BIOME_LEN - ds) / 2;
    this.layer(g, 'scenery', ks, se, FEATHER_SKY, dist * 0.25);
  }

  // Waar (y) en hoe hoog (h) een deel van een landschap op het scherm komt.
  place(biome, part) {
    const L = this.lay, k = (L.H - L.top) / SRC_H;
    return part === 'scenery'
      ? { y: L.top, h: SCENERY_BOTTOM * k }
      : { y: L.top + biome.split * k, h: (SRC_H - biome.split) * k + 1 };
  }

  layer(g, part, k, edge, feather, offset) {
    const ba = this.biome(k), bb = this.biome(k + 1);
    const a = this.img[ba.id][part], b = this.img[bb.id][part];
    const pa = this.place(ba, part), pb = this.place(bb, part);
    // eerst het huidige landschap, de grens zit nog achter de rechterrand
    tile(g, a, offset, pa.y, pa.h, this.lay.W);
    if (a === b || edge - feather / 2 >= this.lay.W) return;
    // het volgende landschap op een apart doek, met een zachte rand (doorzichtig links van de grens)
    const c = g.canvas;
    this.off ||= document.createElement('canvas');
    const off = this.off;
    if (off.width !== c.width || off.height !== c.height) { off.width = c.width; off.height = c.height; }
    const o = off.getContext('2d');
    const s = c.width / this.lay.W;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, off.width, off.height);
    o.setTransform(s, 0, 0, s, 0, 0);
    o.imageSmoothingEnabled = true;
    tile(o, b, offset, pb.y, pb.h, this.lay.W);
    o.globalCompositeOperation = 'destination-in';
    const gr = o.createLinearGradient(edge - feather / 2, 0, edge + feather / 2, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,1)');
    o.fillStyle = gr;
    o.fillRect(0, 0, this.lay.W, this.lay.H);
    o.globalCompositeOperation = 'source-over';
    g.drawImage(off, 0, 0, this.lay.W, (off.height / off.width) * this.lay.W);
  }
}

export function tile(g, im, offset, y, h, W) {
  const w = (im.width * h) / im.height;
  for (let x = -(((offset % w) + w) % w); x < W; x += w) g.drawImage(im, Math.floor(x), y, Math.ceil(w) + 1, h);
}
