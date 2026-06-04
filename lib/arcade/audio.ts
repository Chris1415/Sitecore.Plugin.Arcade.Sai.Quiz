/* All game sound synthesized via Web Audio — no asset files.
 * Includes the Sitecore Arcade brand S-chime (C5 -> G5 -> C6 square) plus SFX.
 * No-op-safe when Web Audio is unavailable or muted. Lazily creates the
 * AudioContext on first use (after a user gesture, per browser autoplay rules).
 */

let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "square", peak = 0.25) {
  const c = ac();
  if (!c || muted) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function sweep(f1: number, f2: number, start: number, dur: number, type: OscillatorType = "sawtooth", peak = 0.2) {
  const c = ac();
  if (!c || muted) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f1, t0);
  osc.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const Sound = {
  resume() {
    const c = ac();
    if (c && c.state === "suspended") void c.resume();
  },
  setMuted(m: boolean) {
    muted = m;
  },
  isMuted() {
    return muted;
  },
  /** Brand 3-note stinger. */
  chime() {
    tone(523.25, 0, 0.12, "square", 0.3);
    tone(783.99, 0.08, 0.12, "square", 0.3);
    tone(1046.5, 0.16, 0.18, "square", 0.3);
  },
  start() {
    tone(392, 0, 0.08, "square", 0.25);
    tone(523.25, 0.08, 0.12, "square", 0.25);
  },
  select() {
    tone(660, 0, 0.05, "square", 0.15);
  },
  tick() {
    tone(880, 0, 0.03, "square", 0.08);
  },
  correct() {
    tone(659.25, 0, 0.1, "square", 0.28);
    tone(783.99, 0.09, 0.1, "square", 0.28);
    tone(1046.5, 0.18, 0.2, "square", 0.3);
  },
  wrong() {
    sweep(220, 110, 0, 0.32, "sawtooth", 0.22);
    tone(155, 0, 0.3, "square", 0.12);
  },
  timeout() {
    sweep(330, 120, 0, 0.4, "triangle", 0.2);
  },
  fanfare() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.12, 0.16, "square", 0.28));
    tone(1318.5, 4 * 0.12, 0.3, "square", 0.3);
  },
};
