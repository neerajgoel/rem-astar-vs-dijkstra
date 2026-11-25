// Synthesizes an original synthwave background track for the A* vs Dijkstra
// video (no samples, no licensing): public/music/astar-vs-dijkstra.mp3
//
// Sections follow the video timeline (src/map/AstarVsDijkstra.tsx, T):
// calm under the explanations, full drums during the races, a riser into
// every countdown, a drop on every "GO!".
//
// Usage: node scripts/generate-music.mjs   (needs ffmpeg for the mp3)

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const RATE = 44100;
const DUR = 180;
const N = RATE * DUR;
const BPM = 112;
const BEAT = 60 / BPM;
const BAR = 4 * BEAT;
const OUT_DIR = "public/music";
const NAME = "astar-vs-dijkstra";

// ---- Arrangement (seconds) ----
// layers: pad, arp, bass, kick (kick+snare), hats, riser
const SECTIONS = [
  [0, 8, { pad: 1, arp: 0.6 }], // hook
  [8, 24, { pad: 1, arp: 0.8, bass: 0.7, hats: 0.5 }], // setup
  [24, 27, { pad: 0.8, riser: 1 }], // race 1 countdown
  [27, 58, { pad: 0.8, arp: 1, bass: 1, kick: 1, hats: 1 }], // race 1 + result
  [58, 60, { pad: 1 }],
  [60, 105, { pad: 0.9, arp: 0.45, hats: 0.35 }], // why: calm, room for reading
  [105, 108, { pad: 0.8, riser: 1 }], // round 2 countdown
  [108, 128, { pad: 0.8, arp: 1, bass: 1, kick: 1, hats: 1 }], // race 2
  [128, 130, { pad: 1 }],
  [130, 133, { pad: 0.8, riser: 1 }], // dial countdown
  [133, 150, { pad: 0.8, arp: 1, bass: 1, kick: 1, hats: 1 }], // dial race
  [150, 160, { pad: 1, arp: 0.6, bass: 0.7 }], // lesson
  [160, 174, { pad: 1, arp: 0.7, hats: 0.5 }], // cheat sheet
  [174, 180, { pad: 1, arp: 1, bass: 1, kick: 1, hats: 0.8 }], // outro
];
const DROPS = [27, 108, 133, 174]; // impacts on "GO!" and the outro

const XF = 0.35; // crossfade between sections (s)
const layerGain = (layer, t) => {
  let g = 0;
  for (const [a, b, l] of SECTIONS) {
    const v = l[layer] ?? 0;
    if (!v) continue;
    const fin = Math.min(1, Math.max(0, (t - a + XF / 2) / XF));
    const fout = Math.min(1, Math.max(0, (b - t + XF / 2) / XF));
    g = Math.max(g, v * Math.min(fin, fout));
  }
  return g;
};

// ---- Harmony: Am - F - C - G (i - VI - III - VII) ----
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];
const chordAt = (t) => CHORDS[Math.floor(t / BAR) % 4];

// ---- Helpers ----
let seed = 12345;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const L = new Float32Array(N);
const R = new Float32Array(N);
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const sq = (ph) => (ph % 1 < 0.5 ? 1 : -1);
const lpA = (fc) => 1 - Math.exp((-2 * Math.PI * fc) / RATE);

// Sidechain pump after every kick (only where the kick plays)
const pump = (t) => {
  const k = layerGain("kick", t);
  if (!k) return 1;
  const since = t % BEAT;
  return 1 - 0.55 * k * Math.exp(-since / 0.11);
};

// ---- Pad: 3 detuned saws per chord note, low-passed, slow swell ----
{
  const det = [-0.11, 0, 0.12];
  const phases = new Float64Array(9);
  let yl = 0;
  let yr = 0;
  for (let i = 0; i < N; i++) {
    const t = i / RATE;
    const g = layerGain("pad", t);
    if (g === 0 && yl === 0) continue;
    const ch = chordAt(t);
    let sl = 0;
    let sr = 0;
    for (let n = 0; n < 3; n++) {
      for (let d = 0; d < 3; d++) {
        const idx = n * 3 + d;
        phases[idx] += midi(ch[n] + det[d]) / RATE; // det in semitones (~11 cents)
        const v = saw(phases[idx]);
        if (d === 0) sl += v;
        else if (d === 2) sr += v;
        else {
          sl += v * 0.5;
          sr += v * 0.5;
        }
      }
    }
    const fc = 900 + 500 * Math.sin((2 * Math.PI * t) / (BAR * 4));
    const a = lpA(fc);
    yl += a * (sl - yl);
    yr += a * (sr - yr);
    const p = pump(t);
    L[i] += yl * 0.055 * g * p;
    R[i] += yr * 0.055 * g * p;
  }
}

// ---- Bass: 8th-note saw on the root, plucky filter ----
{
  let ph = 0;
  let y = 0;
  for (let i = 0; i < N; i++) {
    const t = i / RATE;
    const g = layerGain("bass", t);
    const root = chordAt(t)[0] - 24 + (chordAt(t)[0] < 52 ? 12 : 0);
    ph += midi(root) / RATE;
    const since = t % (BEAT / 2);
    const env = Math.exp(-since / 0.18);
    const a = lpA(180 + 1400 * env);
    y += a * ((saw(ph) * 0.7 + sq(ph * 0.5) * 0.3) - y);
    const v = y * g * (0.35 + 0.65 * env) * 0.32 * pump(t);
    L[i] += v;
    R[i] += v;
  }
}

// ---- Arp: 16ths over the chord (up two octaves), ping-pong delay ----
{
  const arpL = new Float32Array(N);
  const arpR = new Float32Array(N);
  const pattern = [0, 1, 2, 3, 2, 1, 0, 2];
  let ph = 0;
  let y = 0;
  const step = BEAT / 4;
  for (let i = 0; i < N; i++) {
    const t = i / RATE;
    const g = layerGain("arp", t);
    const k = Math.floor(t / step);
    const ch = chordAt(t);
    const p = pattern[k % pattern.length];
    const note = p === 3 ? ch[0] + 24 : ch[p] + 12;
    ph += midi(note) / RATE;
    const since = t - k * step;
    const env = Math.exp(-since / 0.07);
    // filter opens over the hook, then breathes with an 8-bar LFO
    const open = Math.min(1, t / 8);
    const a = lpA(700 + 3800 * env * (0.4 + 0.6 * open) * (0.75 + 0.25 * Math.sin((2 * Math.PI * t) / (BAR * 8))));
    y += a * ((sq(ph) * 0.6 + saw(ph * 1.003) * 0.4) - y);
    const v = y * env * g * 0.16;
    arpL[i] = v;
    arpR[i] = v;
  }
  // ping-pong delay, dotted 8th: first echo left, then right, ...
  const d = Math.round(RATE * BEAT * 0.75);
  const dl = new Float32Array(N);
  const dr = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const pl = i >= d ? dl[i - d] : 0;
    const pr = i >= d ? dr[i - d] : 0;
    dl[i] = arpL[i] + pr * 0.45;
    dr[i] = pl * 0.9;
    L[i] += arpL[i] + pl * 0.35;
    R[i] += arpR[i] + pr * 0.35;
  }
}

// ---- Drums ----
const addAt = (start, len, fn) => {
  const s0 = Math.floor(start * RATE);
  const n = Math.floor(len * RATE);
  for (let i = 0; i < n && s0 + i < N; i++) {
    const [l, r] = fn(i / RATE);
    L[s0 + i] += l;
    R[s0 + i] += r;
  }
};
for (let b = 0; b * BEAT < DUR; b++) {
  const t0 = b * BEAT;
  const kg = layerGain("kick", t0 + 0.01);
  if (kg > 0) {
    // kick: pitch-dropping sine
    let ph = 0;
    addAt(t0, 0.35, (t) => {
      ph += (45 + 110 * Math.exp(-t / 0.03)) / RATE;
      const v = Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.16) * 0.55 * kg;
      return [v, v];
    });
    // snare / clap on 2 and 4
    if (b % 2 === 1) {
      let y = 0;
      addAt(t0, 0.25, (t) => {
        const nz = rand() * 2 - 1;
        y += 0.5 * (nz - y);
        const v = (nz - y) * Math.exp(-t / 0.06) * 0.32 * kg + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.04) * 0.12 * kg;
        return [v * 0.9, v];
      });
    }
  }
  // hats on 8ths (open hat on the off-beat of beat 4)
  for (let h = 0; h < 2; h++) {
    const th = t0 + h * (BEAT / 2);
    const hg = layerGain("hats", th + 0.01);
    if (!hg) continue;
    const open = h === 1 && b % 4 === 3;
    let prev = 0;
    addAt(th, open ? 0.22 : 0.05, (t) => {
      const nz = rand() * 2 - 1;
      const hp = nz - prev;
      prev = nz;
      const v = hp * Math.exp(-t / (open ? 0.08 : 0.018)) * (h === 1 ? 0.11 : 0.07) * hg;
      return [v * (h ? 0.8 : 1), v * (h ? 1 : 0.8)];
    });
  }
}

// ---- Risers (noise sweep + rising tone) and drops ----
for (const [a, b, l] of SECTIONS) {
  if (!l.riser) continue;
  const len = b - a;
  let y = 0;
  let ph = 0;
  addAt(a, len, (t) => {
    const p = t / len;
    const nz = rand() * 2 - 1;
    y += lpA(300 + 9000 * p * p) * (nz - y);
    ph += (200 + 900 * p * p) / RATE;
    const v = (y * 0.22 + Math.sin(2 * Math.PI * ph) * 0.05) * p * p;
    return [v, v];
  });
}
for (const d of DROPS) {
  let ph = 0;
  let y = 0;
  addAt(d, 1.6, (t) => {
    ph += (38 + 60 * Math.exp(-t / 0.08)) / RATE;
    const nz = rand() * 2 - 1;
    y += lpA(2500 * Math.exp(-t / 0.3) + 100) * (nz - y);
    const v = Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.5) * 0.6 + y * Math.exp(-t / 0.35) * 0.25;
    return [v, v];
  });
}

// ---- Master: fade in/out, soft clip, normalize ----
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / RATE;
  const f = Math.min(1, t / 1.0) * Math.min(1, (DUR - t) / 2.5);
  L[i] = Math.tanh(L[i] * 1.3 * f);
  R[i] = Math.tanh(R[i] * 1.3 * f);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const gain = 0.89 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(RATE, 24);
buf.writeUInt32LE(RATE * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(L[i] * gain * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(R[i] * gain * 32767), 46 + i * 4);
}

mkdirSync(OUT_DIR, { recursive: true });
const wav = `${OUT_DIR}/${NAME}.wav`;
writeFileSync(wav, buf);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "160k", `${OUT_DIR}/${NAME}.mp3`]);
rmSync(wav);
console.log(`Wrote ${OUT_DIR}/${NAME}.mp3 (${DUR}s, ${BPM} BPM)`);
