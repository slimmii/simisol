// Maakt een WAV van een liedje met de gesimuleerde gitaar (dezelfde als het voorbeeld in de app).
// Gebruik: node tools/render_synth.mjs <liedjenummer> <uit.wav> [pluck|noise] [bpm]
import { writeFileSync } from 'node:fs';
import { renderGuitar } from '../app/js/guitar.js';
import { loadLocalSongs } from './songs_local.mjs';

const [num = '26', outPath = 'gitaar.wav', model = 'pluck', bpmArg = '80'] = process.argv.slice(2);
const SR = 48000, bpm = +bpmArg;
const song = loadLocalSongs().find((s) => s.num === +num);
if (!song) { console.error(`Liedje ${num} niet gevonden in liedjes/songs/.`); process.exit(1); }
const out = renderGuitar(song.notes, { bpm, sampleRate: SR, lead: 0.5, model, human: 0.02 });

const data = Buffer.alloc(44 + out.length * 2);
data.write('RIFF', 0); data.writeUInt32LE(36 + out.length * 2, 4); data.write('WAVE', 8);
data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
data.write('data', 36); data.writeUInt32LE(out.length * 2, 40);
for (let i = 0; i < out.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i])) * 32767), 44 + i * 2);
writeFileSync(outPath, data);
console.log(`${song.num}. ${song.title} (${model}, ${bpm} bpm) -> ${outPath}`);
