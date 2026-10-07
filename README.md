# Simisol — notentrainer voor beginnende gitaristen

Lees noten op de notenbalk en speel ze op je gitaar. De app luistert via de microfoon
en kleurt elke noot:

- **blauw**: deze noot moet je nu spelen
- **groen**: goed gespeeld
- **rood**: verkeerde noot of te vroeg gespeeld
- **grijs**: gemist

## Starten

Dubbelklik op `start.command`, of in een terminal:

```
python3 serve.py
```

De browser opent dan op <http://localhost:8765>. Geef toestemming voor de microfoon.
Gebruik bij liedjes met muziek liefst een koptelefoon, anders hoort de microfoon de muziek ook.

## Twee modi

- **Noten oefenen**: kies welke noten (do re mi fa sol la si do), de maat (2/4, 3/4, 4/4),
  de notenwaarden (hele, halve, gepunte halve, kwartnoot) en het aantal maten.
  Elke keer verschijnt een nieuwe willekeurige oefening.
- **Liedjes**: de stukjes uit het cursusboek, met de opnames uit de Drive-map
  (`langzaam` en `sneller`). Met *Zonder muziek* speel je op de metronoom.

Overal kan je de metronoom aan/uit zetten en het tempo met de schuifregelaar kiezen
(bij een opname verandert dat de afspeelsnelheid, zonder dat de toonhoogte verandert).
Met **Wachten op mij** wacht de app tot je de juiste noot speelt, zonder maat.

Met **🎧 Voorbeeld** speelt een gesimuleerde gitaar het stukje voor in het gekozen tempo, terwijl
de cursor meeloopt (met de metronoom aan telt hij eerst een maat af). Zo hoor je hoe het moet klinken.

Loopt de muziek net niet gelijk met de cursor? Gebruik *Synchronisatie* (◀ vroeger / later ▶);
dat wordt per liedje onthouden. Hoor je dat de app je noten te laat registreert, pas dan
*Microfoonvertraging* aan onder **Meer instellingen**.

## Hoe de noot-herkenning werkt

De microfoon wordt geanalyseerd in de audiothread (`app/js/detector-worklet.js`), op exacte
sample-tijden. Een noot telt alleen bij een echte **aanslag**:

- het volume stijgt duidelijk, of de fase van de klank springt (zo wordt ook dezelfde snaar die
  nog trilt herkend als je ze opnieuw aanslaat);
- een snaar die gewoon **doorklinkt of zweeft** geeft geen nieuwe noot, en kan dus ook geen
  "te vroeg" of "fout" veroorzaken;
- de app vertelt de detector welke noot er nu verwacht wordt. Bij een aanslag kijkt hij welke toon
  er *bijgekomen* is (spectrum na min vóór de aanslag), zodat een snaar die nog naklinkt niet
  verward wordt met de nieuwe noot.

Testen zonder gitaar: `node tools/test_detector.mjs` speelt gesimuleerde gitaarliedjes
(Karplus-Strong) af en telt goed / fout / gemist / extra. Dezelfde gitaar (`app/js/guitar.js`)
zit achter de knop Voorbeeld; `node tools/render_synth.mjs 26 twinkel.wav` maakt er een WAV-bestand van.

## Liedjes aanpassen

De liedjes staan als JSON in `app/data/songs/<nummer>.json`:

```json
{ "num": 12, "title": "...", "time": [4, 4], "pickup": 0,
  "notes": [ { "p": "B4", "d": 1, "f": "m", "c": "G", "l": "Mie" }, { "p": "r", "d": 1 } ] }
```

- `p` = noot zoals ze op de notenbalk staat (`G4` = sol op de 2e lijn, `E5` = mi in de bovenste tussenruimte), `r` = rust
- `d` = duur in tellen (4 hele, 3 gepunte halve, 2 halve, 1 kwart, 0.5 achtste)
- `f` = vinger (`m`/`i`), `c` = akkoord, `l` = tekst — allemaal optioneel

Na het aanpassen: `python3 tools/build_songs.py`.

Het tempo en het startpunt van elke opname staan in `app/data/sync.json`. Die werden
automatisch berekend met `tools/sync_audio.py` (vereist `numpy` en `librosa`).
