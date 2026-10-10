#!/usr/bin/env python3
"""Maakt de landschappen voor het lama-spel: art/llama-runner/backgrounds/<id>.png (1584x672, gemaakt met
Nano Banana 2.1 op basis van background_full.png) -> app/img/lama/bg/<id>_scenery.webp + <id>_ground.webp.

- achtergrond = rijen 0..620, bodem = rijen SPLIT..672. De achtergrond loopt door tot onder de bodemrand, zodat
  er tijdens een overgang tussen twee landschappen met een andere SPLIT nooit een gat is.
- SPLIT ligt net boven de bodem (en boven blaadjes/gras die erboven uitsteken): achtergrond en bodem schuiven
  aan een andere snelheid, dus niets mag over die grens lopen. Dezelfde waarden staan in app/js/lama-world.js.
- de randen links en rechts worden in elkaar overgevloeid, zodat elk beeld naadloos herhaalt.
Vereist: pillow, numpy.  python3 tools/make_backgrounds.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'llama-runner', 'backgrounds')
OUT = os.path.join(ROOT, 'app', 'img', 'lama', 'bg')
SPLIT = {'weide': 594, 'herfst': 576, 'sneeuw': 594, 'nacht': 580, 'snoep': 594,
         'strand': 594, 'jungle': 593, 'woestijn': 594, 'lava': 594}
SCENERY_BOTTOM = 620
BLEND = 48  # zoveel kolommen links en rechts in elkaar laten overvloeien


def seamless(a):
    w = a.shape[1] - BLEND
    out = a[:, :w].copy()
    t = (np.arange(BLEND) / BLEND)[None, :, None]
    out[:, :BLEND] = a[:, w:w + BLEND] * (1 - t) + a[:, :BLEND] * t
    return out


os.makedirs(OUT, exist_ok=True)
for name, split in SPLIT.items():
    a = np.array(Image.open(os.path.join(SRC, name + '.png')).convert('RGB').resize((1584, 672), Image.LANCZOS)).astype(float)
    for part, rows in (('scenery', a[:SCENERY_BOTTOM]), ('ground', a[split:])):
        img = Image.fromarray(seamless(rows).round().clip(0, 255).astype(np.uint8))
        img.save(os.path.join(OUT, f'{name}_{part}.webp'), quality=92, method=6)  # ~7x kleiner dan png
    print(name, 'ok')
