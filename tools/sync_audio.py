"""Zoekt per opname het tempo (bpm) en het startmoment (offset) van de eerste noot.

Gebruik: python tools/sync_audio.py <songs-json-map> <audio-map> <uit.json> [nummers...]
"""
import json, os, sys, glob
import numpy as np
import librosa

LETTER = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}

def midi(p):
    acc = 1 if '#' in p else -1 if 'b' in p[1:-1] else 0
    return (int(p[-1]) + 1) * 12 + LETTER[p[0]] + acc

def analyse(song, path, bpm_range=None, passes=1):
    y, sr = librosa.load(path, sr=22050, mono=True)
    hop = 256
    fps = sr / hop
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    onset = onset / (np.percentile(onset, 99) + 1e-9)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop, fmin=librosa.note_to_hz('E2'))
    chroma = chroma / (chroma.max(axis=0, keepdims=True) + 1e-9)
    n = onset.shape[0]
    dur = len(y) / sr

    beats, pcs = [], []
    b = 0.0
    for note in song['notes'] * passes:
        if note['p'] != 'r':
            beats.append(b)
            pcs.append(midi(note['p']) % 12)
        b += note['d']
    beats = np.array(beats)
    pcs = np.array(pcs)
    total = b

    rms = librosa.feature.rms(y=y, hop_length=hop, frame_length=1024)[0]
    music_start = float(np.argmax(rms > 0.3 * rms.max()) * hop / sr)
    # Aftelklikken: zacht, vóór het begin van de muziek.
    pre_end = max(1, int((music_start - 0.06) * fps))
    pre = onset[:pre_end] / (onset[:pre_end].max() + 1e-9)
    nclick = int(song['time'][0]) if song['time'][0] > 1 else 4
    def click_score(bpm):
        P = 60 / bpm
        vals = []
        for k in range(1, nclick + 1):
            f = int((music_start - k * P) * fps)
            if f < 0:
                return 0.0
            vals.append(pre[max(0, f - 3):min(pre_end, f + 4)].max() if f < pre_end else 0)
        return float(np.mean(vals))
    tempo_est = float(np.atleast_1d(librosa.beat.beat_track(onset_envelope=onset, sr=sr, hop_length=hop)[0])[0])
    lo, hi = bpm_range or (30, 200)
    best = None
    for bpm in np.arange(lo, hi, 0.5):
        span = total * 60 / bpm
        if span > dur + 1 or span < dur * 0.35:
            continue
        # De opnames beginnen met een aftelmaat; de eerste noot valt (meestal) op het begin van de muziek.
        cands, pen = [], []
        for k in range(0, 5):
            o = np.arange(-0.12, 0.121, 0.01) + music_start + k * 60 / bpm
            cands.append(o); pen.append(np.full(len(o), 0.5 * k))
        offs = np.concatenate(cands); pen = np.concatenate(pen)
        keep = (offs >= 0) & (offs + span <= dur + 1)
        offs, pen = offs[keep], pen[keep]
        if not len(offs):
            continue
        t = offs[:, None] + beats[None, :] * 60 / bpm  # (O, N)
        fi = np.clip((t * fps).astype(int), 0, n - 1)
        fc = np.clip(((t + 0.07) * fps).astype(int), 0, n - 1)
        on = onset[fi]
        # klein venster rond de aanslag
        on = np.maximum(on, onset[np.clip(fi + 1, 0, n - 1)])
        on = np.maximum(on, onset[np.clip(fi - 1, 0, n - 1)])
        ch = chroma[pcs[None, :], fc]
        score = (np.minimum(on, 1.5) + 1.2 * ch).mean(axis=1) - pen + 1.5 * click_score(bpm)
        k = int(np.argmax(score))
        if best is None or score[k] > best[0]:
            best = (float(score[k]), float(bpm), float(offs[k]))
    # verfijnen
    s0, bpm0, off0 = best
    for bpm in np.arange(bpm0 - 0.5, bpm0 + 0.5, 0.05):
        offs = np.arange(max(0, off0 - 0.04), off0 + 0.04, 0.005)
        t = offs[:, None] + beats[None, :] * 60 / bpm
        fi = np.clip((t * fps).astype(int), 0, n - 1)
        fc = np.clip(((t + 0.07) * fps).astype(int), 0, n - 1)
        on = np.maximum.reduce([onset[fi], onset[np.clip(fi + 1, 0, n - 1)], onset[np.clip(fi - 1, 0, n - 1)]])
        score = (np.minimum(on, 1.5) + 1.2 * chroma[pcs[None, :], fc]).mean(axis=1) + 1.5 * click_score(bpm)
        k = int(np.argmax(score))
        if score[k] > s0 and abs(offs[k] - off0) < 0.05:
            s0 = score[k]
            best = (float(score[k]), float(bpm), float(offs[k]))
    # Tellen volgen met een beat-tracker: opnames zijn niet altijd strak op tempo.
    _, bpm_c, off_c = best
    grid_score = best[0]
    beat_times = None
    for guess in (bpm_c, tempo_est, tempo_est / 2, tempo_est * 2):
        if not 30 < guess < 220 or abs(guess / bpm_c - 1) > 0.2:
            continue
        cand = track_beats(y, sr, off_c, guess, int(np.ceil(total)) + 1)
        if cand is not None:
            beat_times = cand
            break
    def melody_score(times):
        t = np.interp(beats, np.arange(len(times)), times)
        fi = np.clip((t * fps).astype(int), 0, n - 1)
        fc = np.clip(((t + 0.07) * fps).astype(int), 0, n - 1)
        on = np.maximum.reduce([onset[fi], onset[np.clip(fi + 1, 0, n - 1)], onset[np.clip(fi - 1, 0, n - 1)]])
        return float((np.minimum(on, 1.5) + 1.2 * chroma[pcs, fc]).mean())
    const_times = off_c + np.arange(int(np.ceil(total)) + 1) * 60 / bpm_c
    s_const, s_track = melody_score(const_times), melody_score(beat_times) if beat_times is not None else -1
    use_track = s_track > s_const + 0.02
    # hoeveel melodienoten vallen samen met een duidelijke aanslag + juiste toonklasse
    _, bpm, off = best
    t = off + beats * 60 / bpm
    fi = np.clip((t * fps).astype(int), 0, n - 1)
    fc = np.clip(((t + 0.07) * fps).astype(int), 0, n - 1)
    hit_pc = float((chroma[pcs, fc] > 0.6).mean())
    return {'bpm': round(bpm, 2), 'offset': round(off, 3), 'score': round(best[0], 3),
            'pitchMatch': round(hit_pc, 2), 'duration': round(dur, 2), 'tempoEstimate': round(tempo_est, 1),
            'end': round(off + total * 60 / bpm, 2), 'musicStart': round(music_start, 2), 'passes': passes,
            'scoreConst': round(s_const, 3), 'scoreTrack': round(s_track, 3),
            'beats': [round(float(x), 3) for x in beat_times] if use_track else None}

def track_beats(y, sr, offset, bpm, count):
    """Tijdstip van elke tel vanaf de eerste noot, gevolgd met librosa's beat-tracker."""
    start = max(0.0, offset - 0.2)
    seg = y[int(start * sr):]
    _, fr = librosa.beat.beat_track(y=seg, sr=sr, start_bpm=bpm, tightness=300)
    bt = librosa.frames_to_time(fr, sr=sr) + start
    if len(bt) < 4:
        return None
    ibi = 60 / bpm
    bt = bt[bt > offset - 0.4 * ibi]
    if len(bt) < 4:
        return None
    if abs(float(np.median(np.diff(bt))) / ibi - 1) > 0.2:
        return None  # tracker zit op een ander niveau (bv. achtsten)
    ibi = float(np.median(np.diff(bt[:5])))
    # De tracker slaat het begin soms over: tussen eerste noot en eerste getrackte tel gelijk verdelen.
    k = int(round((bt[0] - offset) / ibi))
    if k <= 0:
        out = [float(bt[0])]
    else:
        step = (bt[0] - offset) / k
        if abs(step / ibi - 1) > 0.25:
            return None
        out = list(np.linspace(offset, bt[0], k + 1))
    i0 = 0
    for t in bt[i0 + 1:]:
        gap = t - out[-1]
        local = (out[-1] - out[-4]) / 3 if len(out) >= 4 else ibi
        if gap < 0.6 * local:
            continue
        while gap > 1.5 * local:  # gemiste tel invoegen
            out.append(out[-1] + local)
            gap = t - out[-1]
        out.append(t)
        if len(out) >= count:
            break
    while len(out) < count:  # extrapoleren
        local = (out[-1] - out[-5]) / 4 if len(out) >= 5 else ibi
        out.append(out[-1] + local)
    return np.array(out[:count])

if __name__ == '__main__':
    songs_dir, audio_dir, out = sys.argv[1:4]
    only = set(sys.argv[4:])
    res = json.load(open(out)) if os.path.exists(out) else {}
    # Handmatige hints (tempo-bereik, aantal keer gespeeld) voor opnames die de automatische zoektocht verwarren.
    ov_path = os.path.join(os.path.dirname(__file__), 'sync_overrides.json')
    overrides = json.load(open(ov_path)) if os.path.exists(ov_path) else {}
    for f in sorted(glob.glob(os.path.join(songs_dir, '*.json')), key=lambda x: int(os.path.basename(x)[:-5])):
        song = json.load(open(f))
        num = str(song['num'])
        if only and num not in only:
            continue
        for kind in ('slow', 'fast'):
            path = os.path.join(audio_dir, f'{num}-{kind}.mp3')
            if not os.path.exists(path):
                continue
            ov = overrides.get(num, {}).get(kind)
            if ov:
                r = analyse(song, path, bpm_range=tuple(ov['bpm']), passes=ov.get('passes', 1))
                res.setdefault(num, {})[kind] = r
                print(num, kind, '(override)', r, flush=True)
                continue
            r = analyse(song, path)
            # Speelt de opname het stuk twee keer?
            if r['duration'] - r['end'] > 0.4 * (r['end'] - r['offset']):
                r2 = analyse(song, path, passes=2)
                if r2['score'] > r['score'] - 0.05:
                    r = r2
            res.setdefault(num, {})[kind] = r
            print(num, kind, r, flush=True)
        # Als één versie het stuk herhaalt, doet de andere dat waarschijnlijk ook.
        rs = res.get(num, {})
        if num not in overrides and len(rs) == 2 and rs['slow'].get('passes', 1) != rs['fast'].get('passes', 1):
            for kind in ('slow', 'fast'):
                if rs[kind].get('passes', 1) == 1:
                    r2 = analyse(song, os.path.join(audio_dir, f'{num}-{kind}.mp3'), passes=2)
                    if r2['score'] > rs[kind]['score'] - 0.1:
                        rs[kind] = r2
                    print(num, kind, '(2x)', r2, flush=True)
        json.dump(res, open(out, 'w'), indent=1)
