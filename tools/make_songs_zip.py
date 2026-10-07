"""Maakt simisol-liedjes.zip uit de lokale map liedjes/ (noten, synchronisatie en opnames).

Die zip importeer je in de app (tabblad Liedjes → Liedjes importeren). Zo blijven de liedjes uit het
cursusboek los van GitHub en staan ze enkel in jouw browser.

Gebruik: python3 tools/make_songs_zip.py [bronmap] [uit.zip]
         (standaard: liedjes/  →  simisol-liedjes.zip)

Inhoud van de zip:
  songs.json        {"format": "simisol-liedjes", "version": 1, "songs": [...]}
  audio/<n>-slow.mp3, audio/<n>-fast.mp3
"""
import glob, json, os, sys, zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'liedjes')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'simisol-liedjes.zip')

sync_path = os.path.join(src, 'sync.json')
sync = json.load(open(sync_path)) if os.path.exists(sync_path) else {}
songs, files = [], []
for f in glob.glob(os.path.join(src, 'songs', '*.json')):
    s = json.load(open(f))
    num = str(s['num'])
    audio = {}
    for kind in ('slow', 'fast'):
        mp3 = os.path.join(src, 'audio', f'{num}-{kind}.mp3')
        if os.path.exists(mp3) and kind in sync.get(num, {}):
            r = sync[num][kind]
            a = {'file': f'audio/{num}-{kind}.mp3', 'bpm': r['bpm'], 'offset': r['offset'], 'passes': r.get('passes', 1)}
            if r.get('beats'):
                a['beats'] = r['beats']
            audio[kind] = a
            files.append((mp3, a['file']))
    song = {k: s[k] for k in ('num', 'title', 'time', 'pickup', 'notes')}
    song['notes'] = [{k: v for k, v in n.items() if k in ('p', 'd', 'f', 'c', 'l')} for n in s['notes']]
    song['audio'] = audio or None
    songs.append(song)
songs.sort(key=lambda s: s['num'])

with zipfile.ZipFile(out, 'w') as z:
    z.writestr('songs.json', json.dumps({'format': 'simisol-liedjes', 'version': 1, 'songs': songs},
                                        ensure_ascii=False, separators=(',', ':')), compress_type=zipfile.ZIP_DEFLATED)
    for path, name in files:
        z.write(path, name, compress_type=zipfile.ZIP_STORED)  # mp3 is al gecomprimeerd
print(f'{len(songs)} liedjes, {len(files)} opnames → {out} ({os.path.getsize(out) / 1e6:.1f} MB)')
