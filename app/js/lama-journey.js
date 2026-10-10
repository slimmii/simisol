// De reis van de lama: elk landschap leert je een nieuwe noot. Je begint in de weide met de drie losse snaren;
// speel je de noten die je kent goed genoeg, dan staat er aan de grens een poortwachter. Versla hem door de
// nieuwe noot een paar keer juist te spelen: dan ken je die noot en reis je verder.
// Daarnaast krijgt elke noot sterren (hoe vaak juist, over de laatste pogingen); sterren geven speciale spulletjes.
import { BIOMES } from './lama-world.js';

// Stap i van de reis = landschap BIOMES[i]; notes = de noten die je daar leert. Volgorde: eerst losse snaren,
// dan noten met één vinger dicht bij de losse snaren, de lage noten op het einde.
export const STAGES = [
  { notes: ['G4', 'B4', 'E5'] }, // weide: de losse snaren 3, 2 en 1
  { notes: ['D4'] }, // herfstbos: re, 4e snaar los
  { notes: ['A4'] }, // sneeuwland: la, 3e snaar 2
  { notes: ['C5'] }, // sterrennacht: do', 2e snaar 1
  { notes: ['F5'] }, // snoepland: fa, 1e snaar 1
  { notes: ['G5'] }, // strand: sol', 1e snaar 3
  { notes: ['D5'] }, // jungle: re, 2e snaar 3
  { notes: ['E4'] }, // woestijn: mi, 4e snaar 2
  { notes: ['F4', 'C4'] }, // vulkaanland: fa en do, 4e en 5e snaar 3
].map((s, i) => ({ ...s, biome: i, name: BIOMES[i].name }));

export const GATE_HITS = 30; // zoveel juiste noten in een landschap voor de poortwachter komt
export const GATE_ACC = 0.8; // ... en minstens zo vaak juist bij de laatste RECENT pogingen
const RECENT = 20;
export const BOSS_HITS = 5; // zo vaak moet je elke nieuwe noot spelen om de poortwachter te verslaan
export const BOSS_COINS = 15;
export const FRESH = 12; // een nieuwe noot komt de eerste 12 keer extra vaak, met naam erbij
export const STAR_MIN_NOTES = 3; // bij vrij oefenen tellen sterren pas met minstens zoveel noten (één noot is te makkelijk)

export function newJourney() {
  // stage = verste landschap; at = het landschap dat je nu speelt (je kan bereikte landschappen opnieuw spelen)
  return { mode: 'reis', stage: 0, at: 0, progress: 0, recent: [], stars: {}, fresh: {}, newNotes: [] };
}

export const unlockedNotes = (stage) => STAGES.slice(0, stage + 1).flatMap((s) => s.notes);
export const isLastStage = (stage) => stage >= STAGES.length - 1;
export const accuracy = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

// Klaar voor de poortwachter?
export function ready(j) {
  return !isLastStage(j.stage) && j.progress >= GATE_HITS && j.recent.length >= RECENT / 2 && accuracy(j.recent) >= GATE_ACC;
}

// Elke beslissing over een noot bijhouden. journey = telt voor de poort (op de reis, in je verste landschap);
// boss = een noot van de poortwachter (telt niet voor de poort); stars = telt voor de sterren.
export function record(j, note, ok, { journey, boss, stars = true }) {
  if (stars) {
    const st = (j.stars[note] ||= []);
    st.push(ok ? 1 : 0);
    if (st.length > RECENT) st.shift();
  }
  if (!journey || boss) return;
  j.recent.push(ok ? 1 : 0);
  if (j.recent.length > RECENT) j.recent.shift();
  if (ok) j.progress++;
}

// Sterren van één noot: pas na 10 pogingen; 70% juist = 1, 85% = 2, 95% = 3.
export function starsOf(j, note) {
  const st = j.stars[note];
  if (!st || st.length < 10) return 0;
  const a = accuracy(st);
  return a >= 0.95 ? 3 : a >= 0.85 ? 2 : a >= 0.7 ? 1 : 0;
}
export const totalStars = (j) => Object.keys(j.stars).reduce((t, n) => t + starsOf(j, n), 0);

// De poortwachter voor de volgende stap (monster en wolkjes uit het volgende landschap).
export function bossFor(stage) {
  const next = STAGES[stage + 1], b = BIOMES[stage + 1];
  return { stage: stage + 1, notes: next.notes, need: BOSS_HITS * next.notes.length, monster: b.monsters[0], minion: b.monsters[1], name: b.name };
}

// De poortwachter is verslagen: de nieuwe noten zijn vrij.
export function advance(j) {
  j.stage++;
  j.at = j.stage;
  j.progress = 0;
  j.recent = [];
  j.newNotes = [...STAGES[j.stage].notes];
  for (const n of j.newNotes) j.fresh[n] = FRESH;
}

// Twee reizen samenvoegen (overzetten naar een ander toestel): de verste stap, per noot de meeste pogingen.
export function mergeJourney(j, other) {
  if (!other) return;
  if ((other.s ?? 0) > j.stage) { j.stage = Math.min(other.s, STAGES.length - 1); j.at = j.stage; j.progress = 0; j.recent = []; }
  for (const [n, st] of Object.entries(other.st || {})) {
    if (Array.isArray(st) && st.length > (j.stars[n]?.length || 0)) j.stars[n] = st.map((x) => (x ? 1 : 0)).slice(-RECENT);
  }
}
