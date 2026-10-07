// Leest de liedjes uit de lokale map liedjes/songs/*.json (niet in git).
import { readdirSync, readFileSync, existsSync } from 'node:fs';

export function loadLocalSongs() {
  const dir = new URL('../liedjes/songs/', import.meta.url);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')))
    .sort((a, b) => a.num - b.num);
}
