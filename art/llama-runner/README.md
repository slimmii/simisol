# Lama Run — bronbestanden

Gegenereerd met OpenArt (project `OMF8m7Pkdq19IDX0vQe3`). De speelklare versies staan in `app/runner/assets/`.

| Bestand | Model | Opmerking |
|---|---|---|
| `llama_base_2048.png` | Nano Banana 2.1 (text2image) | basisbeeld van de lama |
| `llama_walk.mp4` | Seedance 2.5 (image2video, 720p, 4 s) | start- én eindframe = basisbeeld |
| `llama_jump.mp4` | Seedance 2.5 (image2video, 720p, 4 s) | start- én eindframe = basisbeeld |
| `background_full.png` | Nano Banana 2.1 | naadloos herhaalbaar; gesplitst in `bg_scenery` + `bg_ground` |
| `enemies_sheet.png` | Nano Banana 2.1 | cactus, vleermuis, gordeldier |
| `items_sheet.png` | Nano Banana 2.1 | munt, hartje, bloem |

Sprite sheets (`llama_walk.png`, `llama_jump.png`, `llama.json`):
- walk = frames 24–53 van de walk-video (naadloze lus van 30 frames, 24 fps)
- jump = frames 26–86 (om de 2) van de jump-video, elk frame onderaan uitgelijnd; `takeoff`/`apex`/`land` in `llama.json` zijn frame-indexen die het spel aan de verticale snelheid koppelt
- witte achtergrond weggehaald met een flood fill vanaf de rand
