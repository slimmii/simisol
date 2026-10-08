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

## Online zetten (GitHub Pages)

Bij elke push naar `main` publiceert `.github/workflows/deploy.yml` de map `app/` op GitHub Pages.
Eenmalig instellen op GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
De app staat dan op `https://<gebruiker>.github.io/<repo>/`. Via https werkt de microfoon gewoon.

## Drie modi

- **Noten oefenen**: kies welke noten (do re mi fa sol la si do), de maat (2/4, 3/4, 4/4),
  de notenwaarden (hele, halve, gepunte halve, kwartnoot) en het aantal maten.
  Elke keer verschijnt een nieuwe willekeurige oefening.
- **Liedjes**: de stukjes uit het cursusboek, met de opnames (`langzaam` en `sneller`). Die
  importeer je eerst zelf als zip (zie *Liedjes* hieronder). Met *Zonder muziek* speel je op de metronoom.

- **Spel 🔥**: eindeloos spel met de noten uit de notenkiezer. De noten schuiven naar de blauwe
  speellijn; speel elke noot als ze daar aankomt. Elke juiste noot maakt je **reeks** één langer,
  een **foute noot** zet de reeks terug op 0. Te laat is niet erg: de noot wacht op de lijn (oranje,
  "te laat") tot je ze speelt. Te vroeg (meer dan één tel voor de lijn) telt niet mee en wordt ook
  niet bestraft. Je **record** wordt per combinatie van noten onthouden. De schuifregelaar zet de
  snelheid in noten per minuut.

Overal kan je de metronoom aan/uit zetten en het tempo met de schuifregelaar kiezen
(bij een opname verandert dat de afspeelsnelheid, zonder dat de toonhoogte verandert).
Met **Wachten op mij** wacht de app tot je de juiste noot speelt, zonder maat.

Met **🎧 Voorbeeld** speelt een gesimuleerde gitaar het stukje voor in het gekozen tempo, terwijl
de cursor meeloopt (met de metronoom aan telt hij eerst een maat af). Zo hoor je hoe het moet klinken.

Loopt de muziek net niet gelijk met de cursor? Gebruik *Synchronisatie* (◀ vroeger / later ▶);
dat wordt per liedje onthouden. Worden je noten als te laat (of te vroeg) beoordeeld terwijl je
op de maat speelt, gebruik dan **Meer instellingen → 🎯 Vertraging meten**: je tokkelt 8 keer een
losse snaar op een tik, en de app stelt de *Microfoonvertraging* zelf in. Pikt de microfoon
geluiden op die geen noten zijn, zet dan de *Microfoongevoeligheid* lager (tot "heel laag").

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

## Liedjes (lokaal, niet op GitHub)

De liedjes uit het cursusboek (noten en opnames) staan **niet** in deze repository en ook niet op
de website. Je bewaart ze lokaal in de map `liedjes/` (staat in `.gitignore`):

```
liedjes/
  songs/<nummer>.json   noten per liedje
  sync.json             tempo en startpunt van elke opname
  audio/<nummer>-slow.mp3, <nummer>-fast.mp3
```

Maak er een zip van en importeer die in de app (tabblad **Liedjes → 📦 Liedjes importeren**):

```
python3 tools/make_songs_zip.py        # → simisol-liedjes.zip
```

De app bewaart de liedjes en opnames in de opslag van je browser (IndexedDB). Ze blijven daar
staan tot je ze verwijdert of de sitegegevens van je browser wist. Een nieuwe zip vervangt
liedjes met hetzelfde nummer. Gebruik je een andere browser of computer, importeer dan daar
dezelfde zip.

### Een liedje aanpassen

```json
{ "num": 12, "title": "...", "time": [4, 4], "pickup": 0,
  "notes": [ { "p": "B4", "d": 1, "f": "m", "c": "G", "l": "Mie" }, { "p": "r", "d": 1 } ] }
```

- `p` = noot zoals ze op de notenbalk staat (`G4` = sol op de 2e lijn, `E5` = mi in de bovenste tussenruimte), `r` = rust
- `d` = duur in tellen (4 hele, 3 gepunte halve, 2 halve, 1 kwart, 0.5 achtste)
- `f` = vinger (`m`/`i`), `c` = akkoord, `l` = tekst — allemaal optioneel

Maak daarna opnieuw de zip en importeer hem.

Het tempo en het startpunt van elke opname (`liedjes/sync.json`) worden automatisch berekend met
`tools/sync_audio.py` (vereist `numpy` en `librosa`):

```
python3 tools/sync_audio.py liedjes/songs liedjes/audio liedjes/sync.json
```
