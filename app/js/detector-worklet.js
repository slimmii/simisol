// Toonhoogte- en aanslagdetectie die in de audiothread draait (AudioWorklet).
// Werkt op exacte sample-tijden en wordt niet vertraagd als de pagina druk is of op de achtergrond staat.
// Het bestand is ook als gewone ES-module te importeren (voor tests met node).

const BUF = 2048; // analysevenster voor toonhoogte (~43 ms bij 48 kHz)
const HOP = 256; // elke ~5 ms een analyse
const RMS_WIN = 1024; // ~21 ms: lang genoeg om zweving tussen twee snaren uit te middelen
const FFT_N = 1024;
const SPEC_N = 4096; // fijnere spectra (zero-padded) om de nieuwe toon bij een aanslag te vinden
const RING = 16384;

function yin(buf, sr, threshold, d) {
  const half = buf.length >> 1;
  const minTau = Math.max(2, Math.floor(sr / 1100));
  const maxTau = Math.min(half - 2, Math.floor(sr / 90));
  for (let tau = 1; tau <= maxTau + 1; tau++) {
    let s = 0;
    for (let i = 0; i < half; i++) {
      const v = buf[i] - buf[i + tau];
      s += v * v;
    }
    d[tau] = s;
  }
  d[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxTau + 1; tau++) {
    run += d[tau];
    d[tau] = run ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= maxTau && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  const x0 = d[tau - 1], x1 = d[tau], x2 = d[tau + 1];
  const denom = x0 + x2 - 2 * x1;
  const shift = denom ? (x0 - x2) / (2 * denom) : 0;
  return { freq: sr / (tau + shift), clarity: 1 - x1 };
}

// Iteratieve radix-2 FFT (in place) op re/im.
function makeFFT(n) {
  const levels = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r = (r << 1) | ((i >> b) & 1);
    rev[i] = r;
  }
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const halfSize = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + halfSize; j++, k += step) {
          const l = j + halfSize;
          const tre = re[l] * cos[k] + im[l] * sin[k];
          const tim = -re[l] * sin[k] + im[l] * cos[k];
          re[l] = re[j] - tre; im[l] = im[j] - tim;
          re[j] += tre; im[j] += tim;
        }
      }
    }
  };
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[a.length >> 1];
}

function mode(arr) {
  const c = new Map();
  let best = arr[0], bc = 0;
  for (const x of arr) {
    const n = (c.get(x) || 0) + 1;
    c.set(x, n);
    if (n > bc) { bc = n; best = x; }
  }
  return best;
}

const freqToMidiFloat = (f) => 69 + 12 * Math.log2(f / 440);

export class DetectorCore {
  constructor(sampleRate, emit) {
    this.sr = sampleRate;
    this.emit = emit; // ({type:'frame'|'note', ...})
    this.sensitivity = 0.5;
    this.latency = 0.06;
    this.expect = []; // klinkende midi-noten die de app nu (of zo meteen) verwacht

    this.ring = new Float32Array(RING);
    this.writePos = 0;
    this.filled = 0;
    this.sinceHop = 0;
    this.hopCount = 0;
    this.win = new Float32Array(BUF);
    this.yinBuf = new Float32Array(BUF);

    this.fft = makeFFT(FFT_N);
    this.fftBig = makeFFT(SPEC_N);
    this.bre = new Float32Array(SPEC_N);
    this.bim = new Float32Array(SPEC_N);
    this.hannBig = new Float32Array(BUF).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (BUF - 1)));
    this.re = new Float32Array(FFT_N);
    this.im = new Float32Array(FFT_N);
    this.hann = new Float32Array(FFT_N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_N - 1)));
    const hz = sampleRate / FFT_N;
    this.binLo = Math.ceil(80 / hz);
    this.binHi = Math.min(FFT_N / 2 - 1, Math.floor(5000 / hz));
    this.prevMag = new Float32Array(FFT_N / 2);
    // voor fase-afwijking (complex domain onset): vorige twee frames per bin
    this.prevRe1 = new Float32Array(FFT_N / 2); this.prevIm1 = new Float32Array(FFT_N / 2);
    this.prevRe2 = new Float32Array(FFT_N / 2); this.prevIm2 = new Float32Array(FFT_N / 2);
    this.cdHist = [];

    this.rmsHist = [];
    this.fluxHist = [];
    this.noiseFloor = 0.002;
    this.peak = 0;
    this.lastTime = 0;
    this.lastOnset = -1;
    this.pending = null;
    this.recentAttack = null;
    this.current = null;
    this.lastEmitted = null;
    this.stable = { midi: null, count: 0, since: 0 };
    this.silentSince = 0;
    this.lastPitch = { midi: null, looseMidi: null, cents: 0, freq: null };
    this.lastFrameSent = 0;
  }

  gate() {
    const base = 0.03 * Math.pow(0.08, this.sensitivity); // 0.03 .. 0.0024
    return Math.max(base, this.noiseFloor * 2.5);
  }

  /** Voeg samples toe; endTime = tijd (s) net na het laatste sample. */
  push(samples, endTime) {
    const n = samples.length;
    for (let i = 0; i < n; i++) {
      this.ring[this.writePos] = samples[i];
      this.writePos = (this.writePos + 1) % this.ring.length;
      this.sinceHop++;
      if (this.sinceHop >= HOP) {
        this.sinceHop = 0;
        this.filled = Math.min(this.ring.length, this.filled + HOP);
        if (this.filled >= BUF) this.analyse(endTime - (n - 1 - i) / this.sr);
      }
    }
  }

  copyWindow(target = this.win, back = 0) {
    const L = this.ring.length;
    let p = (this.writePos - BUF - back + 2 * L) % L;
    for (let i = 0; i < BUF; i++) {
      target[i] = this.ring[p];
      p = p + 1 === L ? 0 : p + 1;
    }
  }

  // Magnitudespectrum (4096 punten) van een venster van 2048 samples dat `back` samples geleden eindigde.
  bigSpectrum(back) {
    const tmp = this.tmpWin || (this.tmpWin = new Float32Array(BUF));
    this.copyWindow(tmp, back);
    this.bre.fill(0);
    this.bim.fill(0);
    for (let i = 0; i < BUF; i++) this.bre[i] = tmp[i] * this.hannBig[i];
    this.fftBig(this.bre, this.bim);
    const mag = new Float32Array(SPEC_N / 2);
    for (let k = 0; k < SPEC_N / 2; k++) mag[k] = Math.hypot(this.bre[k], this.bim[k]);
    return mag;
  }

  // Welke toon is er bij de aanslag bijgekomen? Vergelijkt het spectrum na de aanslag met dat ervoor.
  // Geeft { newFrac(midi), best } terug: newFrac = aandeel van de harmonischen dat nieuw is (0..1).
  analyseAttack(pre, post) {
    const n = SPEC_N / 2;
    const hz = this.sr / SPEC_N;
    const diff = new Float32Array(n);
    for (let k = 0; k < n; k++) diff[k] = Math.max(0, post[k] - pre[k]);
    const peakIn = (arr, f) => {
      const lo = Math.max(1, Math.floor((f * 0.97) / hz)), hi = Math.min(n - 1, Math.ceil((f * 1.03) / hz));
      let m = 0;
      for (let k = lo; k <= hi; k++) if (arr[k] > m) m = arr[k];
      return m;
    };
    const f0Of = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
    const isOvertoneOf = (m, l) => {
      const r = f0Of(m) / f0Of(l), k = Math.round(r);
      return k >= 2 && k <= 6 && Math.abs(r / k - 1) < 0.03;
    };
    const newFrac = (midi) => {
      const f0 = f0Of(midi);
      let d = 0, p = 0;
      for (let h = 1; h <= 6; h++) { d += peakIn(diff, f0 * h); p += peakIn(post, f0 * h); }
      return p ? d / p : 0;
    };
    let postMax = 0;
    for (let k = Math.floor(70 / hz); k < Math.min(n, Math.ceil(2000 / hz)); k++) postMax = Math.max(postMax, post[k]);
    // Klinkt toon m echt (en niet een octaaf hoger)? Kijk naar de oneven harmonischen (1, 3, 5):
    // een noot een octaaf hoger heeft enkel de even harmonischen van m. Werkt ook als de grondtoon zwak is.
    // Gebeurt dat in de nieuwe energie (diff): dan tellen snaren die nog naklinken niet mee
    // (hun boventonen kunnen toevallig op de oneven harmonischen van een lagere toon vallen).
    const present = (m) => {
      const f0 = f0Of(m);
      const odd = peakIn(diff, f0) + peakIn(diff, 3 * f0) + peakIn(diff, 5 * f0);
      const even = peakIn(diff, 2 * f0) + peakIn(diff, 4 * f0) + peakIn(diff, 6 * f0);
      const oddPost = peakIn(post, f0) + peakIn(post, 3 * f0) + peakIn(post, 5 * f0);
      return oddPost >= 0.1 * postMax && odd >= 0.03 * postMax && odd >= 0.25 * even;
    };
    // Beste nieuwe kandidaat: grondtoon goed hoorbaar én grotendeels nieuw.
    let best = null, bestS = 0;
    for (let midi = 40; midi <= 84; midi++) {
      const f0 = f0Of(midi);
      if (!present(midi) || peakIn(diff, f0) + peakIn(diff, 3 * f0) < 0.1 * postMax) continue;
      let sc = 0;
      for (let h = 1; h <= 8 && f0 * h <= 5000; h++) sc += peakIn(diff, f0 * h);
      if (sc > bestS) { bestS = sc; best = midi; }
    }
    // Kies uit de kandidaten (en hun octaven) de toon die het best past:
    // grondtoon hoorbaar, sterke harmonischen, en zo veel mogelijk nieuw bij deze aanslag.
    const choose = (cands) => {
      this.lastChoose = [];
      const reps = [];
      for (const c of new Set(cands.filter((x) => x != null))) {
        // Binnen één toonklasse: de laagste octaaf met hoorbare grondtoon die (ongeveer) even nieuw is.
        // Een octaaf hoger heeft dezelfde harmonischen minus de oneven, dus 'hoger' is enkel juist
        // als de lagere grondtoon ontbreekt of oud is (een andere snaar die naklinkt).
        const oct = [c - 12, c, c + 12].filter((m) => m >= 40 && m <= 84 && present(m));
        if (!oct.length) continue;
        const maxNew = Math.max(...oct.map(newFrac));
        reps.push(oct.find((x) => newFrac(x) >= 0.6 * maxNew));
      }
      // Een kandidaat die gewoon een boventoon is van een lagere kandidaat die ook (deels) nieuw is,
      // is die lagere noot opnieuw aangeslagen: de hoge boventonen zijn dan 'nieuwer' dan de grondtoon.
      const isOvertone = (m, l) => {
        const r = f0Of(m) / f0Of(l);
        const k = Math.round(r);
        return k >= 2 && k <= 6 && Math.abs(r / k - 1) < 0.03;
      };
      let pick = null, pickS = 0;
      for (const m of reps) {
        if (reps.some((l) => l < m && isOvertone(m, l) && newFrac(l) >= 0.25)) continue;
        const f0 = f0Of(m);
        let sal = 0;
        for (let h = 1; h <= 6; h++) sal += peakIn(post, f0 * h);
        const sc = sal * (0.3 + newFrac(m));
        if (this.debug) this.lastChoose.push(`${m}:${sal.toFixed(1)}*${newFrac(m).toFixed(2)}`);
        if (sc > pickS) { pickS = sc; pick = m; }
      }
      return pick;
    };
    // Is deze (verwachte) noot bij de aanslag echt nieuw aangeslagen?
    const confirms = (m, yinPitch) => {
      // YIN (zeker) en verwachting zijn het eens, en de toon is minstens deels nieuw: klaar.
      if (yinPitch === m && newFrac(m) >= 0.15) return true;
      if (!present(m)) {
        // Dezelfde snaar opnieuw aangeslagen: de toon zat al in 'pre', dus weinig nieuwe energie bij de
        // grondtoon. Aanvaard als de toon duidelijk klinkt en er geen andere, echt nieuwe toon bij kwam.
        const f0 = f0Of(m);
        const oddPost = peakIn(post, f0) + peakIn(post, 3 * f0) + peakIn(post, 5 * f0);
        const evenPost = peakIn(post, 2 * f0) + peakIn(post, 4 * f0) + peakIn(post, 6 * f0);
        const clear = oddPost >= 0.15 * postMax && oddPost >= 0.3 * evenPost && newFrac(m) >= 0.1;
        const other = best != null && best % 12 !== m % 12 && !isOvertoneOf(best, m) && newFrac(best) >= 0.6;
        return clear && !other;
      }
      const nf = newFrac(m);
      if (nf < (yinPitch === m ? 0.15 : 0.25)) return false;
      // Klinkt eigenlijk de noot een octaaf lager (nieuw)? Dan is dat gespeeld, niet m.
      const low = m - 12;
      if (low >= 40 && present(low) && newFrac(low) >= 0.25 && yinPitch !== m) return false;
      return true;
    };
    return { newFrac, best, choose, confirms };
  }

  // Geeft { flux, cd }: relatieve toename van de spectrale grootte, en de 'complex domain'-afwijking:
  // hoe slecht elk frequentiebin te voorspellen is uit de twee vorige frames (zelfde grootte, zelfde
  // faseverloop). Een snaar die gewoon doorklinkt of zweeft is goed voorspelbaar; een nieuwe aanslag
  // — ook op dezelfde, nog trillende snaar — verstoort de fase en springt eruit.
  spectralFlux() {
    const off = BUF - FFT_N;
    for (let i = 0; i < FFT_N; i++) {
      this.re[i] = this.win[off + i] * this.hann[i];
      this.im[i] = 0;
    }
    this.fft(this.re, this.im);
    let up = 0, total = 0, dev = 0;
    for (let k = this.binLo; k <= this.binHi; k++) {
      const re = this.re[k], im = this.im[k];
      const m = Math.hypot(re, im);
      const d = m - this.prevMag[k];
      if (d > 0) up += d;
      total += m;
      // voorspelling: grootte van vorig frame, fase = 2*fase(t-1) - fase(t-2)
      const r1 = this.prevRe1[k], i1 = this.prevIm1[k], r2 = this.prevRe2[k], i2 = this.prevIm2[k];
      const m1 = Math.hypot(r1, i1), m2 = Math.hypot(r2, i2);
      if (m1 > 0 && m2 > 0) {
        // e^{j(2φ1-φ2)} = (z1/|z1|)^2 * conj(z2/|z2|)
        const ur = r1 / m1, ui = i1 / m1, vr = r2 / m2, vi = -i2 / m2;
        const sr = ur * ur - ui * ui, si = 2 * ur * ui;
        const pr = m1 * (sr * vr - si * vi), pi = m1 * (sr * vi + si * vr);
        dev += Math.hypot(re - pr, im - pi);
      } else {
        dev += m;
      }
      this.prevRe2[k] = r1; this.prevIm2[k] = i1;
      this.prevRe1[k] = re; this.prevIm1[k] = im;
      this.prevMag[k] = m;
    }
    return { flux: total > 0 ? up / total : 0, cd: total > 0 ? dev / total : 0 };
  }

  analyse(now) {
    this.hopCount++;
    this.copyWindow();
    const w = this.win;
    let s = 0;
    for (let i = BUF - RMS_WIN; i < BUF; i++) s += w[i] * w[i];
    const rms = Math.sqrt(s / RMS_WIN);

    const hist = this.rmsHist;
    hist.push({ t: now, rms });
    while (hist.length && now - hist[0].t > 0.15) hist.shift();
    // volume van ~40 ms geleden (vóór een eventuele aanslag)
    let before = hist[0].rms;
    for (const h of hist) { if (now - h.t >= 0.04) before = h.rms; else break; }

    // Ruisvloer = minimum-volgend: zakt meteen mee, stijgt maar heel traag (~10%/s).
    // (Een gemiddelde van stille stukken kroop omhoog tijdens lang naklinken.)
    this.noiseFloor = Math.max(1e-5, Math.min(rms, this.noiseFloor * 1.0005));
    const gate = this.gate();

    // Piekvolume dat langzaam wegzakt (halveert per 2 s): een uitklinkende noot zit daar ver onder.
    const dt = this.lastTime ? now - this.lastTime : 0;
    this.lastTime = now;
    const peakBefore = this.peak * Math.pow(0.5, dt / 2);
    this.peak = Math.max(rms, peakBefore);

    // Toonhoogte om de 2 hops (~10 ms), alleen als er geluid is.
    if (this.hopCount % 2 === 0) {
      let midi = null, looseMidi = null, cents = 0, freq = null;
      if (rms > gate) {
        const res = yin(w, this.sr, 0.15, this.yinBuf);
        if (res && res.clarity > 0.65) {
          const mf = freqToMidiFloat(res.freq);
          looseMidi = Math.round(mf);
          freq = res.freq;
          if (res.clarity > 0.8) {
            midi = looseMidi;
            cents = Math.round((mf - midi) * 100);
          }
        }
      }
      this.lastPitch = { midi, looseMidi, cents, freq };
      if (midi != null) {
        if (this.stable.midi === midi) this.stable.count++;
        else this.stable = { midi, count: 1, since: now };
      }
    }
    const { midi, looseMidi, cents, freq } = this.lastPitch;

    if (now - this.lastFrameSent > 0.03) {
      this.lastFrameSent = now;
      this.emit({ type: 'frame', time: now, freq, midi, cents, rms, level: Math.min(1, rms / (gate * 8)) });
    }

    // Spectrale flux: een aanslag geeft plots nieuwe energie in veel frequenties, een uitklinkende snaar niet.
    const { flux, cd } = this.spectralFlux();
    this.fluxHist.push(flux);
    if (this.fluxHist.length > 60) this.fluxHist.shift();
    this.cdHist.push(cd);
    if (this.cdHist.length > 60) this.cdHist.shift();
    const fluxOnset = flux > 0.3 && flux > median(this.fluxHist) * 5;
    // alleen een stijgende flank telt: vlak na een aanslag blijft de fase nog even 'onrustig'
    const recentCd = this.cdHist.slice(-9, -1);
    const cdRising = !recentCd.length || cd > 2 * Math.min(...recentCd);
    const cdOnset = cdRising && cd > Math.max(0.25, median(this.cdHist) * 5);
    if (this.debugOnset) this.emit({ type: 'onsetdbg', t: now, rms, before, flux, cd, cdMed: median(this.cdHist) });
    const rise = rms > before * 1.35 + gate * 0.3;
    // Zwevingen in een uitklinkende snaar mogen geen aanslag lijken: eis ook genoeg volume t.o.v. de piek.
    const sinceOnset = now - this.lastOnset;
    const attack = rms > gate && rms > peakBefore * 0.1 && sinceOnset > 0.12 &&
      (rise || (sinceOnset > 0.2 && ((fluxOnset && rms > before * 1.1) || (cdOnset && rms > before * 0.6))));
    if (attack) {
      this.lastOnset = now;
      // spectrum van vlak vóór de aanslag (venster dat ~16 ms geleden eindigde)
      const pre = this.bigSpectrum(Math.round(0.016 * this.sr));
      // het volumevenster loopt ~half achter op de echte aanslag
      this.pending = { time: now - this.latency - (RMS_WIN / 2) / this.sr, at: now, votes: [], strength: rms / Math.max(before, 1e-6), pre };
      // een toon die al klonk vóór deze aanslag mag later niet als 'nieuwe' toonwissel tellen
      this.stable = { midi: null, count: 0, since: 0 };
    }

    if (rms < gate * 0.7) {
      this.current = null;
      this.stable = { midi: null, count: 0, since: 0 };
      if (!this.silentSince) this.silentSince = now;
      if (now - this.silentSince > 0.3) this.lastEmitted = null;
    } else {
      this.silentSince = 0;
    }

    if (this.hopCount % 2 !== 0) return; // beslissingen alleen na een nieuwe toonhoogtemeting

    if (this.pending) {
      const age = now - this.pending.at;
      // het venster (~45 ms) bevat net na de aanslag nog de vorige noot
      if (age >= 0.045) {
        if (midi != null) this.pending.votes.push(midi);
        else if (looseMidi != null) (this.pending.loose ||= []).push(looseMidi);
      }
      // twijfelachtige metingen alleen gebruiken als er na 120 ms nog niets beters is
      const v = this.pending.votes.length || age < 0.12 ? this.pending.votes : this.pending.loose || [];
      // Zodra het venster helemaal na de aanslag ligt: welke toon kwam erbij?
      if (age >= 0.06 && !this.pending.ana) {
        this.pending.ana = this.analyseAttack(this.pending.pre, this.bigSpectrum(0));
      }
      const ana = this.pending.ana;
      const y = v.length ? mode(v) : null;
      // Eerst: is het een van de noten die de app nu verwacht? (betrouwbaarder dan blind zoeken)
      const hit = ana ? this.expect.find((e) => ana.confirms(e, y)) : undefined;
      if ((ana && (hit != null || v.length >= 2)) || v.length >= 3 || (age > 0.15 && (v.length || ana?.best != null))) {
        // Anders: YIN hoort soms de snaar die nog naklinkt, of een octaaf ernaast; kies de toon
        // die bij deze aanslag nieuw is en waarvan de harmonischen het best kloppen.
        let m = hit ?? y;
        if (ana && hit == null) m = ana.choose([y, ana.best]) ?? y ?? ana.best;
        if (this.debug) this.emit({ type: 'debug', t: this.pending.time, votes: [...v], strict: this.pending.votes.length, y, best: ana?.best, ch: this.lastChoose?.join(' '), fy: ana && y != null ? +ana.newFrac(y).toFixed(2) : null, fb: ana?.best != null ? +ana.newFrac(ana.best).toFixed(2) : null, m });
        this.current = m;
        this.lastEmitted = m;
        this.emit({ type: 'note', time: this.pending.time, midi: m, attack: true, strength: this.pending.strength });
        this.pending = null;
      } else if (age > 0.4) {
        // Geen duidelijke toon gevonden: onthoud de aanslag, de stabiele toon kan nog volgen.
        this.recentAttack = this.pending;
        this.pending = null;
      }
    } else if (this.stable.count >= 4 && rms > gate && (this.stable.midi !== this.current || this.recentAttack)) {
      const m = this.stable.midi;
      const ra = this.recentAttack;
      this.recentAttack = null;
      if (ra && now - ra.at < 0.8) {
        this.current = m;
        this.lastEmitted = m;
        this.emit({ type: 'note', time: ra.time, midi: m, attack: true, strength: ra.strength });
        return;
      }
      // Toonwissel zonder aanslag. Negeer het als het de nagalm van de vorige noot is:
      // dezelfde toon, een boventoon ervan, of een wegstervend volume.
      const diff = this.lastEmitted == null ? null : Math.abs(m - this.lastEmitted);
      const echo = diff === 0 || diff === 12 || diff === 19 || diff === 24;
      const fading = rms < before * 0.95 || rms < peakBefore * 0.4;
      this.current = m;
      if (!echo && !fading) {
        this.lastEmitted = m;
        this.emit({ type: 'note', time: this.stable.since - this.latency, midi: m, attack: false, strength: 1 });
      }
    }
  }
}

if (typeof registerProcessor === 'function') {
  registerProcessor(
    'simisol-detector',
    class extends AudioWorkletProcessor {
      constructor() {
        super();
        this.core = new DetectorCore(sampleRate, (msg) => this.port.postMessage(msg));
        this.port.onmessage = (e) => {
          const { sensitivity, latency, expect } = e.data || {};
          if (Array.isArray(expect)) this.core.expect = expect.filter((x) => Number.isInteger(x));
          if (typeof sensitivity === 'number') this.core.sensitivity = sensitivity;
          if (typeof latency === 'number') this.core.latency = latency;
        };
      }
      process(inputs) {
        const ch = inputs[0]?.[0];
        if (ch) this.core.push(ch, (currentFrame + ch.length) / sampleRate);
        return true;
      }
    },
  );
}
