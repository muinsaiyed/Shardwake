// Fully synthesized audio: a small step sequencer for per-sector music plus
// procedural sound effects. No samples or external files are used.

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

// Each track: tempo, key, scale, chord roots (scale degrees, one per bar),
// and 16-step patterns. 'x' = hit, '.' = rest. Arp/bass patterns index chord tones.
export const TRACKS = {
  title: {
    bpm: 80, root: 50, scale: 'minor', chords: [0, 5, 3, 4],
    kick: '................', hat: '................', clap: '................',
    bass: '................', arp: 'a.......c.......', arpOct: 2, pad: true, arpWave: 'sine',
  },
  vestibule: {
    bpm: 96, root: 50, scale: 'minor', chords: [0, 5, 2, 6],
    kick: 'x.......x.......', hat: '..x...x...x...x.', clap: '................',
    bass: 'a.....a...a.....', arp: 'a..b..c..b..a..c', arpOct: 2, pad: true, arpWave: 'triangle',
  },
  orrery: {
    bpm: 108, root: 52, scale: 'dorian', chords: [0, 3, 4, 6],
    kick: 'x...x...x...x...', hat: '..x...x...x...xx', clap: '........x.......',
    bass: 'a..a..a...a.a...', arp: 'abcbabcdabcbabcd', arpOct: 2, pad: true, arpWave: 'sine',
  },
  foundry: {
    bpm: 120, root: 48, scale: 'phrygian', chords: [0, 1, 0, 6],
    kick: 'x..x..x...x.x...', hat: 'x.xxx.xxx.xxx.xx', clap: '....x.......x...',
    bass: 'aa.aa.a.aa.a.aa.', arp: 'a...c...a..dc...', arpOct: 1, pad: false, arpWave: 'square', grit: true,
  },
  atrium: {
    bpm: 126, root: 45, scale: 'lydian', chords: [0, 4, 5, 3],
    kick: 'x...x...x...x...', hat: '..x.xxx...x.xxx.', clap: '....x.......x..x',
    bass: 'a.aa..a.a.aa..ab', arp: 'acbdacbeacbdcbda', arpOct: 2, pad: true, arpWave: 'triangle',
  },
  core: {
    bpm: 70, root: 45, scale: 'lydian', chords: [0, 4, 5, 1],
    kick: '................', hat: '................', clap: '................',
    bass: 'a...............', arp: 'a...c...e...d...', arpOct: 2, pad: true, arpWave: 'sine',
  },
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.track = null;
    this.nextTrack = null;
    this.step = 0;
    this.bar = 0;
  }

  // Must be called from a user gesture (browser autoplay policy).
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);

    // Music bus with a lowpass we can sweep (stasis / pause / game over).
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicFilter.connect(this.musicGain).connect(this.master);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);

    // Shared reverb from a generated impulse response.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.6, 2.2);
    const revGain = ctx.createGain(); revGain.gain.value = 0.35;
    this.reverb.connect(revGain).connect(this.master);

    // Tempo-free feedback delay for arps.
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.28;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 3000;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    const dOut = ctx.createGain(); dOut.gain.value = 0.4;
    dl.connect(dOut).connect(this.musicFilter);

    this.noise = this._noiseBuffer();
    this.dist = this._distCurve(30);

    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this._schedule(), 25);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  // Switch track at next bar boundary (or immediately if nothing is playing).
  play(name, immediate = false) {
    const t = TRACKS[name];
    if (!t || t === this.track) return;
    if (!this.track || immediate) { this.track = t; this.step = 0; this.bar = 0; if (this.delay) this.delay.delayTime.value = (60 / t.bpm) * 0.75; }
    else this.nextTrack = t;
  }

  // 0..1 amount of muffling on the music (0 = clear).
  muffle(amount, time = 0.3) {
    if (!this.ctx) return;
    const f = 18000 * Math.pow(1 - amount, 3) + 350 * amount;
    this.musicFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, time);
  }

  _schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.track) return;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this._playStep(this.nextTime);
      const spb = 60 / this.track.bpm / 4;
      this.nextTime += spb;
      this.step++;
      if (this.step >= 16) {
        this.step = 0; this.bar++;
        if (this.nextTrack) {
          this.track = this.nextTrack; this.nextTrack = null; this.bar = 0;
          this.delay.delayTime.setValueAtTime((60 / this.track.bpm) * 0.75, this.nextTime);
        }
      }
    }
  }

  _degree(deg, octave = 0) {
    const t = this.track, sc = SCALES[t.scale];
    const o = Math.floor(deg / sc.length);
    const d = ((deg % sc.length) + sc.length) % sc.length;
    return t.root + sc[d] + 12 * (o + octave);
  }

  _playStep(time) {
    const t = this.track, s = this.step;
    const chord = t.chords[this.bar % t.chords.length];
    const tones = [0, 2, 4, 6, 7].map((i) => chord + i); // a b c d e → chord tones (triad + 7th + octave)
    const idx = (ch) => 'abcde'.indexOf(ch);

    if (t.kick[s] === 'x') this._kick(time);
    if (t.hat[s] === 'x') this._hat(time, s % 4 === 2 ? 0.09 : 0.05);
    if (t.clap[s] === 'x') this._clap(time);
    const b = t.bass[s];
    if (b !== '.') this._bass(time, mtof(this._degree(tones[idx(b)], -1)), 60 / t.bpm / 4 * 1.6, t.grit);
    const a = t.arp[s];
    if (a !== '.') this._arp(time, mtof(this._degree(tones[idx(a)], t.arpOct - 1)), t.arpWave);
    if (t.pad && s === 0) this._pad(time, tones.slice(0, 3).map((d) => mtof(this._degree(d, 0))), (60 / t.bpm) * 4);
  }

  // ---------- instruments ----------
  _env(g, time, a, peak, d) {
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + a);
    g.gain.exponentialRampToValueAtTime(0.0001, time + a + d);
  }
  _kick(time) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.14);
    this._env(g, time, 0.003, 0.9, 0.32);
    o.connect(g).connect(this.musicFilter);
    o.start(time); o.stop(time + 0.4);
  }
  _hat(time, vol) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 7500;
    this._env(g, time, 0.001, vol, 0.05);
    n.connect(f).connect(g).connect(this.musicFilter);
    n.start(time, Math.random()); n.stop(time + 0.08);
  }
  _clap(time) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.8;
    this._env(g, time, 0.002, 0.35, 0.18);
    n.connect(f).connect(g); g.connect(this.musicFilter); g.connect(this.reverb);
    n.start(time, Math.random()); n.stop(time + 0.25);
  }
  _bass(time, freq, dur, grit) {
    const ctx = this.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq;
    f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(grit ? 1800 : 1100, time);
    f.frequency.exponentialRampToValueAtTime(140, time + dur);
    this._env(g, time, 0.005, grit ? 0.28 : 0.32, dur);
    let node = o.connect(f);
    if (grit) { const ws = ctx.createWaveShaper(); ws.curve = this.dist; node = node.connect(ws); }
    node.connect(g).connect(this.musicFilter);
    o.start(time); o.stop(time + dur + 0.05);
  }
  _arp(time, freq, wave) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave; o.frequency.value = freq;
    this._env(g, time, 0.004, wave === 'square' ? 0.05 : 0.11, 0.25);
    o.connect(g); g.connect(this.musicFilter); g.connect(this.delay);
    o.start(time); o.stop(time + 0.32);
  }
  _pad(time, freqs, dur) {
    const ctx = this.ctx, f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.06, time + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 1.05);
    f.connect(g); g.connect(this.musicFilter); g.connect(this.reverb);
    for (const fr of freqs) for (const det of [-8, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det;
      o.connect(f); o.start(time); o.stop(time + dur * 1.1);
    }
  }

  // ---------- SFX ----------
  _out(pan = 0) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfx);
    return p;
  }
  _noiseBurst(time, { type = 'bandpass', freq = 3000, q = 1, vol = 0.3, dur = 0.2, pan = 0, sweepTo = null, rev = 0 }) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noise; f.type = type; f.frequency.setValueAtTime(freq, time); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, time + dur);
    this._env(g, time, 0.002, vol, dur);
    n.connect(f).connect(g).connect(this._out(pan));
    if (rev) { const rg = ctx.createGain(); rg.gain.value = rev; g.connect(rg).connect(this.reverb); }
    n.start(time, Math.random() * 1.5); n.stop(time + dur + 0.05);
  }
  _tone(time, freq, { type = 'sine', vol = 0.2, a = 0.003, dur = 0.3, pan = 0, slideTo = null, rev = 0.3 }) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, time);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, time + dur);
    this._env(g, time, a, vol, dur);
    o.connect(g).connect(this._out(pan));
    if (rev) { const rg = ctx.createGain(); rg.gain.value = rev; g.connect(rg).connect(this.reverb); }
    o.start(time); o.stop(time + a + dur + 0.05);
  }

  throw(pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(t, { type: 'bandpass', freq: 600, sweepTo: 2400, q: 2, vol: 0.12, dur: 0.12, pan });
    this._tone(t, 220, { type: 'triangle', vol: 0.05, dur: 0.08, slideTo: 440, rev: 0 });
  }
  glass(size = 1, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(t, { type: 'highpass', freq: 3500, vol: 0.35 * Math.min(1.4, size), dur: 0.35 + 0.2 * size, pan, rev: 0.5 });
    this._noiseBurst(t, { type: 'bandpass', freq: 1200, q: 0.7, vol: 0.2, dur: 0.08, pan });
    const n = 4 + Math.floor(size * 3);
    for (let i = 0; i < n; i++) {
      const dt = Math.random() * 0.25 * size;
      this._tone(t + dt, 2500 + Math.random() * 5000, { vol: 0.04 + Math.random() * 0.04, dur: 0.05 + Math.random() * 0.15, pan: pan + (Math.random() - 0.5) * 0.6, rev: 0.6 });
    }
  }
  crystal(level = 0, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 880 * Math.pow(2, (level % 12) / 12);
    [1, 1.5, 2].forEach((m, i) => this._tone(t + i * 0.045, base * m, { type: 'sine', vol: 0.12, dur: 0.5, pan, rev: 0.8 }));
    this._noiseBurst(t, { type: 'highpass', freq: 6000, vol: 0.12, dur: 0.2, pan });
  }
  metal(pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [320, 517, 841].forEach((f) => this._tone(t, f * (0.95 + Math.random() * 0.1), { type: 'square', vol: 0.03, dur: 0.18, pan, rev: 0.4 }));
    this._noiseBurst(t, { type: 'bandpass', freq: 2500, q: 3, vol: 0.12, dur: 0.05, pan });
  }
  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 90, { type: 'sine', vol: 0.9, dur: 0.5, slideTo: 30, rev: 0.2 });
    this._noiseBurst(t, { type: 'lowpass', freq: 1400, vol: 0.6, dur: 0.45, sweepTo: 200 });
    this._noiseBurst(t, { type: 'highpass', freq: 3000, vol: 0.4, dur: 0.6, rev: 0.6 });
    this._tone(t, 180, { type: 'sawtooth', vol: 0.12, dur: 0.4, slideTo: 60 });
  }
  switchOn(pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 660, { type: 'square', vol: 0.08, dur: 0.08, pan });
    this._tone(t + 0.08, 990, { type: 'square', vol: 0.08, dur: 0.14, pan, rev: 0.5 });
  }
  door() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(t, { type: 'lowpass', freq: 300, sweepTo: 900, vol: 0.35, dur: 0.7, q: 4 });
    this._tone(t, 55, { type: 'sawtooth', vol: 0.12, dur: 0.6, slideTo: 80, rev: 0 });
  }
  explode(pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 120, { type: 'sine', vol: 0.6, dur: 0.4, slideTo: 35, pan });
    this._noiseBurst(t, { type: 'lowpass', freq: 3000, sweepTo: 300, vol: 0.5, dur: 0.5, pan, rev: 0.5 });
  }
  powerup(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = { overdrive: 440, nova: 330, stasis: 523 }[kind] || 440;
    this._tone(t, base, { type: 'sawtooth', vol: 0.1, dur: 0.6, slideTo: base * 4, rev: 0.6 });
    [0, 4, 7, 12].forEach((s, i) => this._tone(t + 0.07 * i, base * 2 * Math.pow(2, s / 12), { type: 'triangle', vol: 0.1, dur: 0.35, rev: 0.6 }));
  }
  streakUp(n) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const root = 523 * Math.pow(2, (n - 2) * 2 / 12);
    [0, 4, 7, 11, 14].slice(0, n + 1).forEach((s, i) => this._tone(t + 0.05 * i, root * Math.pow(2, s / 12), { type: 'triangle', vol: 0.1, dur: 0.6, rev: 0.8 }));
  }
  streakBreak() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 660, { type: 'triangle', vol: 0.12, dur: 0.35, slideTo: 220, rev: 0.3 });
  }
  miss() {
    if (!this.ctx) return;
    this._tone(this.ctx.currentTime, 300, { type: 'sine', vol: 0.06, dur: 0.15, slideTo: 200, rev: 0 });
  }
  gameOver() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, -3, -7, -12].forEach((s, i) => this._tone(t + i * 0.18, 330 * Math.pow(2, s / 12), { type: 'triangle', vol: 0.14, dur: 0.6, rev: 0.8 }));
  }
  sectorEnter() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(t, { type: 'bandpass', freq: 200, sweepTo: 6000, q: 3, vol: 0.2, dur: 1.2, rev: 0.8 });
    this._tone(t + 0.3, 1320, { vol: 0.08, dur: 1.2, rev: 1 });
  }
  victory() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 11, 14, 19].forEach((s, i) => this._tone(t + i * 0.1, 440 * Math.pow(2, s / 12), { type: 'triangle', vol: 0.12, dur: 1.4, rev: 1 }));
  }

  // ---------- helpers ----------
  _noiseBuffer() {
    const len = this.ctx.sampleRate * 2;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate, len = rate * seconds;
    const b = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  _distCurve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x)); }
    return c;
  }
}
