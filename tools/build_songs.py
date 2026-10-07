"""Bundelt app/data/songs/*.json + app/data/sync.json tot app/js/songs.js."""
import json, glob, os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'app')
sync = json.load(open(os.path.join(ROOT, 'data', 'sync.json')))
songs = []
for f in glob.glob(os.path.join(ROOT, 'data', 'songs', '*.json')):
    s = json.load(open(f))
    num = str(s['num'])
    audio = {}
    for kind in ('slow', 'fast'):
        src = f'audio/{num}-{kind}.mp3'
        if os.path.exists(os.path.join(ROOT, src)) and kind in sync.get(num, {}):
            r = sync[num][kind]
            audio[kind] = {'src': src, 'bpm': r['bpm'], 'offset': r['offset'], 'passes': r.get('passes', 1)}
            if r.get('beats'):
                audio[kind]['beats'] = r['beats']
    song = {k: s[k] for k in ('num', 'title', 'time', 'pickup', 'notes')}
    song['notes'] = [{k: v for k, v in n.items() if k in ('p', 'd', 'f', 'c', 'l')} for n in s['notes']]
    song['audio'] = audio or None
    songs.append(song)
songs.sort(key=lambda s: s['num'])
with open(os.path.join(ROOT, 'js', 'songs.js'), 'w') as out:
    out.write('// Gegenereerd door tools/build_songs.py — niet met de hand aanpassen.\n')
    out.write('export const SONGS = ' + json.dumps(songs, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(songs), 'liedjes')
