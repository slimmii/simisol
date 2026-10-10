// De wereld waar de lama door reist: telkens een ander landschap (weide, herfstbos, sneeuw, ...).
// Elk landschap heeft een achtergrond (lucht, bergen, heuvels) en een eigen bodemstrook, allebei naadloos herhaalbaar.
// Een nieuw landschap schuift van rechts binnen met een zachte rand: eerst de bodem (die beweegt even snel als de
// lama loopt), de achtergrond volgt trager, zoals verre bergen. Zo lijkt het alsof de lama echt ver reist.
// De beelden maak je met tools/make_backgrounds.py: elk landschap is één 1584x672 beeld, de achtergrond is
// rij 0..620 en de bodem rij 'split'..672 (split ligt net boven de bodem; zie dat script).

const DIR = 'img/lama/bg/';

export const BIOMES = [
  { id: 'weide', name: 'De weide', split: 594 },
  { id: 'herfst', name: 'Het herfstbos', split: 576 },
  { id: 'sneeuw', name: 'Het sneeuwland', split: 594 },
  { id: 'nacht', name: 'De sterrennacht', split: 580 },
  { id: 'snoep', name: 'Snoepland', split: 594 },
  { id: 'strand', name: 'Het strand', split: 594 },
  { id: 'jungle', name: 'De jungle', split: 593 },
  { id: 'woestijn', name: 'De woestijn', split: 594 },
  { id: 'lava', name: 'Het vulkaanland', split: 594 },
];
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
    const [scenery, ground] = await Promise.all([loadImg(`${DIR}${id}_scenery.webp`), loadImg(`${DIR}${id}_ground.webp`)]);
    this.img[id] = { scenery, ground };
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
