// Noten zoals ze op de notenbalk staan (gitaarnotatie klinkt een octaaf lager dan geschreven).
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SOLFEGE = ['do', 'do#', 're', 'mib', 'mi', 'fa', 'fa#', 'sol', 'sol#', 'la', 'sib', 'si'];

// Waar je elke geschreven noot op de gitaar vindt.
export const FRETBOARD = {
  C4: { string: 5, fret: 3 },
  D4: { string: 4, fret: 0 },
  E4: { string: 4, fret: 2 },
  F4: { string: 4, fret: 3 },
  G4: { string: 3, fret: 0 },
  A4: { string: 3, fret: 2 },
  B4: { string: 2, fret: 0 },
  C5: { string: 2, fret: 1 },
  D5: { string: 2, fret: 3 },
  E5: { string: 1, fret: 0 },
  F5: { string: 1, fret: 1 },
  'F#5': { string: 1, fret: 2 },
  G5: { string: 1, fret: 3 },
  A5: { string: 1, fret: 5 },
};

// Noten die je in de oefenmodus kan kiezen, van laag naar hoog.
export const PRACTICE_NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'];
export const DEFAULT_SELECTION = ['G4', 'B4', 'E5'];

export function parseNote(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('Onbekende noot: ' + name);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return { letter: m[1], acc: m[2], octave: +m[3], midi: (+m[3] + 1) * 12 + LETTER[m[1]] + acc };
}

export const writtenMidi = (name) => parseNote(name).midi;
// Gitaar klinkt een octaaf lager dan genoteerd.
export const soundingMidi = (name) => writtenMidi(name) - 12;

export const solfege = (midi) => SOLFEGE[((midi % 12) + 12) % 12];
export const solfegeOf = (name) => solfege(writtenMidi(name));

export const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
export const freqToMidiFloat = (f) => 69 + 12 * Math.log2(f / 440);

export function describePosition(name) {
  const pos = FRETBOARD[name];
  if (!pos) return '';
  return pos.fret === 0 ? `${pos.string}e snaar, los` : `${pos.string}e snaar, ${pos.fret}e vakje`;
}
