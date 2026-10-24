'use strict';
// Todos os sons são sintetizados (sem arquivos de áudio), então o jogo roda offline.
const Sfx = {
  ctx: null, out: null, crowd: null, crowdBase: 0.05, muted: false, suppress: false,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.out = c.createGain(); this.out.gain.value = 0.8; this.out.connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // torcida ambiente
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.5;
    const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 1600;
    this.crowd = c.createGain(); this.crowd.gain.value = 0;
    src.connect(f); f.connect(f2); f2.connect(this.crowd); this.crowd.connect(this.out); src.start();
    this.crowd.gain.setTargetAtTime(this.crowdBase, c.currentTime, 1.5);
  },

  noise(type, freq, q, gain, dur, attack = 0.003) {
    if (!this.ctx || this.muted || this.suppress) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  },

  tone(freq, type, gain, dur, freqEnd, attack = 0.004) {
    if (!this.ctx || this.muted || this.suppress) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  },

  stick(p = 1) { this.noise('highpass', 2500, 0.7, 0.22 * p + 0.04, 0.06); this.tone(1100, 'triangle', 0.07 * p, 0.05, 500); },
  pass() { this.noise('bandpass', 1800, 1, 0.12, 0.05); },
  pad() { this.noise('lowpass', 900, 0.8, 0.35, 0.12); this.tone(180, 'sine', 0.2, 0.1, 90); },
  glove() { this.noise('lowpass', 600, 0.8, 0.3, 0.09); },
  boards(p = 1) { this.tone(90, 'sine', Math.min(0.6, 0.15 * p), 0.3, 45); this.noise('lowpass', 500, 0.7, Math.min(0.4, 0.1 * p), 0.25); },
  post() { this.tone(2093, 'sine', 0.35, 0.9); this.tone(3140, 'sine', 0.15, 0.6); this.tone(1046, 'triangle', 0.1, 0.5); },
  hit(p = 1) { this.tone(60, 'sine', Math.min(0.7, 0.14 * p), 0.35, 35); this.noise('lowpass', 350, 0.8, Math.min(0.6, 0.12 * p), 0.3); },
  spray() { this.noise('bandpass', 5000, 0.6, 0.07, 0.3, 0.02); },

  whistle(long) {
    const c = this.ctx; if (!c || this.muted || this.suppress) return;
    const t = c.currentTime, dur = long ? 0.9 : 0.5;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 3000;
    const lfo = c.createOscillator(); lfo.frequency.value = 32;
    const lg = c.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.setValueAtTime(0.16, t + dur - 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  },

  horn() {
    const c = this.ctx; if (!c || this.muted || this.suppress) return;
    const t = c.currentTime, dur = 3.2;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1300;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.08);
    g.gain.setValueAtTime(0.3, t + dur - 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(this.out);
    [146.8, 185, 220, 293.7].forEach(fr => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr;
      o.connect(f); o.start(t); o.stop(t + dur + 0.1);
    });
  },

  buzzer() {
    const c = this.ctx; if (!c || this.muted || this.suppress) return;
    this.tone(220, 'square', 0.12, 1.3, null, 0.01); this.tone(277, 'square', 0.08, 1.3, null, 0.01);
  },

  swell(level = 0.35, hold = 1.5) {
    if (!this.crowd) return;
    const t = this.ctx.currentTime, g = this.crowd.gain;
    g.cancelScheduledValues(t); g.setTargetAtTime(level, t, 0.15); g.setTargetAtTime(this.crowdBase, t + hold, 0.8);
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.out) this.out.gain.value = this.muted ? 0 : 0.8;
    return this.muted;
  },
};
