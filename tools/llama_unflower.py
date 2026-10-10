#!/usr/bin/env python3
"""Haalt de bloem uit de lama-sprites en bewaart per frame waar het hoofd zit (voor de accessoires).

Bron: art/llama-runner/llama_{walk,jump}_flower.png (de originele sprites, met bloem).
Uit:  app/img/lama/llama_{walk,jump}.png (zonder bloem) en de 'anchors' in app/img/lama/llama.json:
      per frame [bloemX, bloemY, oogX, oogY, rugY, halsL, halsR] in pixels van het frame.
Vereist: pillow, numpy.  python3 tools/llama_unflower.py
"""
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'art', 'llama-runner')
OUT = os.path.join(ROOT, 'app', 'img', 'lama')


def dilate(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


def flower_mask(a):
    """Roze van de bloem, en alles wat bij de bloem hoort (hartje, randjes) maar geen bruine omlijning is."""
    R, G, B, A = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    h = A.shape[0]
    pink = (A > 100) & (R > 150) & (R - G > 45) & (B > G - 10)
    pink[h // 2:] = False  # de bloem zit op het hoofd, de blosjes/pootjes laten we met rust
    mask = dilate(pink, 3) & (A > 0)
    for _ in range(3):  # gaatjes (het hartje) dichten
        mask |= (np.roll(mask, 1, 0) & np.roll(mask, -1, 0)) | (np.roll(mask, 1, 1) & np.roll(mask, -1, 1))
    outline = (R < 180) & (R - G < 60) & (B <= G + 4)  # de bruine omlijning van hoofd en gezicht blijft staan
    stray = dilate(pink, 8) & (A > 100) & (R - G > 60) & (B > G - 20)  # losse roze puntjes errond
    return pink, (mask & (A > 200) & ~outline) | stray


def fill(a, mask):
    """Gat opvullen van buiten naar binnen met het gemiddelde van de buren, en dan afronden naar de
    vachtkleuren errond (pixel-art, geen waas). Het roze binnenin het oor telt niet mee als bron."""
    R, G, A = a[..., 0], a[..., 1], a[..., 3]
    h, w = A.shape
    src = ~mask & (A > 200) & (R > 200) & (R - G < 40)  # enkel vacht: geen omlijning, oor of doorzichtig
    out = a.copy()
    todo = mask.copy()
    while todo.any():
        known = src | (mask & ~todo)
        acc = np.zeros_like(out); cnt = np.zeros((h, w))
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)):
            k = np.roll(np.roll(known, dy, 0), dx, 1)
            acc += np.roll(np.roll(out, dy, 0), dx, 1) * k[..., None]
            cnt += k
        edge = todo & (cnt > 0)
        if not edge.any():
            break
        out[edge] = acc[edge] / cnt[edge][:, None]
        todo &= ~edge
    ring = a[dilate(mask, 4) & src][:, :3]
    pal = np.unique((ring // 8) * 8, axis=0).astype(float)
    px = out[mask][:, :3]
    out[mask, :3] = pal[np.argmin(((px[:, None, :] - pal[None]) ** 2).sum(-1), axis=1)]
    out[mask, 3] = 255
    return out


def register(ref, a, box, skip_ref, skip_a, guess):
    """Verschuiving (dx, dy) waarmee het hoofd in frame a op dat van het referentieframe valt."""
    x0, y0, x1, y1 = box
    best, bd = None, guess
    for dy in range(guess[1] - 6, guess[1] + 7):
        for dx in range(guess[0] - 6, guess[0] + 7):
            r = ref[y0:y1, x0:x1]
            f = a[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
            if f.shape != r.shape:
                continue
            ok = ~skip_ref[y0:y1, x0:x1] & ~skip_a[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
            cost = np.abs(r - f)[ok].mean()
            if best is None or cost < best:
                best, bd = cost, (dx, dy)
    return bd


# Eén schone 'pleister' (uit het eerste loopframe) voor alle frames, mee verschoven met het hoofd:
# zo is de plek waar de bloem zat in elk frame hetzelfde en flikkert er niets tijdens de animatie.
REF = None


def process(frame):
    a = frame.astype(float)
    R, G, B, A = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    h, w = A.shape
    pink, mask = flower_mask(a)
    ys, xs = np.nonzero(pink)
    fx, fy = xs.mean(), ys.mean()
    out = a.copy()
    ra, rmask, rclean, (rfx, rfy) = REF
    box = (int(rfx) - 22, int(rfy) - 26, int(rfx) + 36, int(rfy) + 28)
    dx, dy = register(ra, a, box, dilate(rmask, 2), dilate(mask, 2), (round(fx - rfx), round(fy - rfy)))
    my, mx = np.nonzero(mask)
    qy, qx = my - dy, mx - dx
    ok = (qy >= 0) & (qy < h) & (qx >= 0) & (qx < w)
    good = np.zeros(len(my), bool)
    good[ok] = rclean[qy[ok], qx[ok], 3] > 200
    out[my[good], mx[good]] = rclean[qy[good], qx[good]]
    if not good.all():  # wat buiten de pleister valt: gewoon opvullen
        rest = np.zeros_like(mask); rest[my[~good], mx[~good]] = True
        out = fill(out, rest)
    # losse roodachtige puntjes (randjes van de bloem) tussen de vacht: de kleur van de buren geven
    Ro, Go, Bo = out[..., 0], out[..., 1], out[..., 2]
    light = (Ro > 200) & (out[..., 3] > 200)
    nb = sum(np.roll(np.roll(light, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)
    lone = dilate(mask, 6) & (Ro - Go > 40) & (Bo > Go) & (Ro < 200) & (nb >= 6)
    for y, x in zip(*np.nonzero(lone)):
        ring = out[y - 1:y + 2, x - 1:x + 2].reshape(-1, 4)
        out[y, x] = np.median(ring[ring[:, 0] > 200], axis=0)
    # oog: de donkerste vlek rechts van de bloem
    eye = (A > 200) & (R < 96) & (G < 64)
    eye[:int(fy) - 4] = False; eye[int(fy) + 26:] = False
    eye[:, :int(fx) + 8] = False; eye[:, int(fx) + 32:] = False
    ey_, ex_ = np.nonzero(eye)
    ex, ey = ex_.mean(), ey_.mean()
    # rug: bovenkant van het lijf, net achter de nek
    col = A[:, int(w * 0.22):int(w * 0.32)].max(axis=1)
    back = int(np.argmax(col[h // 3:] > 100)) + h // 3
    solid = A > 100

    def span(y):
        xs = np.nonzero(solid[int(round(y))])[0]
        return int(xs.min()), int(xs.max())
    # hals: linker- en rechterrand van de hals, iets onder de kin
    nl, nr = span(ey + 24)
    return out.round().clip(0, 255).astype(np.uint8), [round(fx, 1), round(fy, 1), round(ex, 1), round(ey, 1), back, nl, nr]


def make_ref(cw):
    global REF
    im = np.array(Image.open(os.path.join(ART, 'llama_walk_flower.png')).convert('RGBA'))
    a = im[:, :cw].astype(float)
    pink, mask = flower_mask(a)
    ys, xs = np.nonzero(pink)
    REF = (a, mask, fill(a, mask), (xs.mean(), ys.mean()))


def sheet(name, cw):
    im = np.array(Image.open(os.path.join(ART, f'llama_{name}_flower.png')).convert('RGBA'))
    n = im.shape[1] // cw
    anchors = []
    for i in range(n):
        out, anc = process(im[:, i * cw:(i + 1) * cw])
        im[:, i * cw:(i + 1) * cw] = out
        anchors.append(anc)
    Image.fromarray(im).save(os.path.join(OUT, f'llama_{name}.png'), optimize=True)
    return anchors


meta_path = os.path.join(OUT, 'llama.json')
meta = json.load(open(meta_path))
make_ref(meta['walk']['cellW'])
meta['walk']['anchors'] = sheet('walk', meta['walk']['cellW'])
meta['jump']['anchors'] = sheet('jump', meta['jump']['cellW'])
meta['anchors'] = 'per frame [bloemX, bloemY, oogX, oogY, rugY, halsL, halsR] (tools/llama_unflower.py)'
with open(meta_path, 'w') as f:
    f.write(json.dumps(meta, indent=2).replace(',\n        ', ', ').replace('[\n        ', '[').replace('\n      ]', ']') + '\n')
