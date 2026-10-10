#!/usr/bin/env python3
"""Knipt de monsters per landschap uit art/llama-runner/enemies/<landschap>.png (drie wezens naast elkaar op wit,
gemaakt met Nano Banana 2.1 in de stijl van enemies_sheet.png) -> app/img/lama/monsters/<id>.png.

Het wit rond de wezens wordt doorzichtig (flood fill vanaf de rand, zoals bij de andere sprites), de drie
wezens worden gescheiden op de witte kolommen ertussen, en elk wordt 200 px hoog (zoals cactus.png).
Welke id bij welk wezen hoort (links, midden, rechts) staat in SHEETS; dezelfde id's staan in app/js/lama-world.js.
Vereist: pillow, numpy, scipy.  python3 tools/make_enemies.py
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'llama-runner', 'enemies')
OUT = os.path.join(ROOT, 'app', 'img', 'lama', 'monsters')
SHEETS = {
    'herfst': ['pompoen', 'kraai', 'egel'],
    'sneeuw': ['sneeuwman', 'uil', 'pinguin'],
    'nacht': ['paddenstoel', 'spookje', 'wasbeer'],
    'snoep': ['gombeer', 'snoepje', 'cupcake'],
    'strand': ['krab', 'meeuw', 'kokosnoot'],
    'jungle': ['slang', 'papegaai', 'kikker'],
    'woestijn': ['schorpioen', 'gier', 'tuimelkruid'],
    'lava': ['magma', 'vuurbal', 'rotsreus'],
}
HEIGHT = 200

os.makedirs(OUT, exist_ok=True)
for sheet, ids in SHEETS.items():
    a = np.array(Image.open(os.path.join(SRC, sheet + '.png')).convert('RGB')).astype(int)
    whiteish = (a.min(axis=2) > 232) & (np.ptp(a, axis=2) < 24)
    lab, _ = ndimage.label(whiteish)
    edge = set(lab[0]) | set(lab[-1]) | set(lab[:, 0]) | set(lab[:, -1])
    bg = np.isin(lab, [l for l in edge if l])
    # zachte rand: lichte pixels net naast de achtergrond half doorzichtig
    near = ndimage.binary_dilation(bg) & ~bg & (a.min(axis=2) > 200)
    alpha = np.where(bg, 0, np.where(near, 128, 255)).astype(np.uint8)
    fg = alpha > 0
    # de drie wezens: groepen kolommen met iets erin, gescheiden door brede witte stroken
    cols = ndimage.binary_closing(fg.any(axis=0), structure=np.ones(40))
    runs, n = ndimage.label(cols)
    spans = sorted(ndimage.find_objects(runs), key=lambda s: s[0].stop - s[0].start, reverse=True)[:3]
    spans = sorted(spans, key=lambda s: s[0].start)
    assert len(spans) == 3, (sheet, n)
    rgba = np.dstack([a.astype(np.uint8), alpha])
    for mid, (sx,) in zip(ids, spans):
        part = fg[:, sx]
        ys = np.nonzero(part.any(axis=1))[0]
        crop = rgba[ys.min():ys.max() + 1, sx.start:sx.stop]
        im = Image.fromarray(crop)
        w = round(im.width * HEIGHT / im.height)
        im.resize((w, HEIGHT), Image.LANCZOS).save(os.path.join(OUT, mid + '.png'), optimize=True)
        print(sheet, mid, w, 'x', HEIGHT)
