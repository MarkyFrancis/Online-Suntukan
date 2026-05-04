import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = join("public", "assets", "sfx");
mkdirSync(outDir, { recursive: true });

const sampleRate = 44100;

function clamp(value) {
  return Math.max(-1, Math.min(1, value));
}

function writeWavNamedMp3(filename, duration, generator) {
  const totalSamples = Math.floor(sampleRate * duration);
  const dataSize = totalSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const sample = clamp(generator(t, i, totalSamples));
    buffer.writeInt16LE(Math.floor(sample * 32767), 44 + i * 2);
  }

  writeFileSync(join(outDir, filename), buffer);
}

function env(t, duration, attack = 0.015, release = 0.14) {
  if (t < attack) return t / attack;
  const tail = Math.max(0, duration - t);
  return Math.min(1, tail / release);
}

function noise(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

writeWavNamedMp3("punch_hit.mp3", 0.28, (t, i) => {
  const thud = Math.sin(2 * Math.PI * (74 - t * 90) * t) * 0.95;
  const slap = noise(i) * Math.exp(-t * 32) * 0.55;
  return (thud + slap) * env(t, 0.28, 0.006, 0.18);
});

writeWavNamedMp3("kick_hit.mp3", 0.36, (t, i) => {
  const low = Math.sin(2 * Math.PI * (62 - t * 52) * t) * 0.9;
  const pop = Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 16) * 0.42;
  return (low + pop + noise(i) * 0.18) * env(t, 0.36, 0.008, 0.22);
});

writeWavNamedMp3("whoosh.mp3", 0.26, (t, i) => {
  const sweep = Math.sin(2 * Math.PI * (220 + t * 1260) * t) * 0.34;
  return (noise(i) * 0.58 + sweep) * Math.sin(Math.PI * t / 0.26);
});

writeWavNamedMp3("block.mp3", 0.24, (t, i) => {
  const clack = Math.sin(2 * Math.PI * 520 * t) * Math.exp(-t * 24);
  const knock = Math.sin(2 * Math.PI * 118 * t) * Math.exp(-t * 15);
  return (clack * 0.55 + knock * 0.7 + noise(i) * 0.2) * env(t, 0.24, 0.003, 0.13);
});

writeWavNamedMp3("ko.mp3", 0.82, (t, i) => {
  const fallingPitch = 420 - t * 360;
  const wobble = Math.sin(2 * Math.PI * fallingPitch * t + Math.sin(t * 34) * 4);
  const boom = Math.sin(2 * Math.PI * 48 * t) * Math.exp(-Math.max(0, t - 0.38) * 8);
  return (wobble * 0.42 + boom * 0.65 + noise(i) * 0.08) * env(t, 0.82, 0.02, 0.36);
});

writeWavNamedMp3("menu_select.mp3", 0.18, (t) => {
  const chirp = Math.sin(2 * Math.PI * (560 + t * 880) * t);
  const ping = Math.sin(2 * Math.PI * 1120 * t) * 0.32;
  return (chirp * 0.6 + ping) * env(t, 0.18, 0.004, 0.12);
});

writeWavNamedMp3("round_start.mp3", 0.58, (t) => {
  const horn = Math.sin(2 * Math.PI * 176 * t + Math.sin(t * 18) * 0.8);
  const octave = Math.sin(2 * Math.PI * 352 * t) * 0.34;
  return (horn * 0.72 + octave) * env(t, 0.58, 0.035, 0.22);
});

writeFileSync(
  join(outDir, "CREDITS.md"),
  `# Sound Credits

All placeholder sound effects in this folder are locally generated synthetic clips created for this project.

| File | Source | License |
| --- | --- | --- |
| punch_hit.mp3 | Locally generated synthetic impact | CC0 / no attribution required |
| kick_hit.mp3 | Locally generated synthetic impact | CC0 / no attribution required |
| whoosh.mp3 | Locally generated synthetic sweep | CC0 / no attribution required |
| block.mp3 | Locally generated synthetic block impact | CC0 / no attribution required |
| ko.mp3 | Locally generated synthetic KO sting | CC0 / no attribution required |
| menu_select.mp3 | Locally generated synthetic UI chirp | CC0 / no attribution required |
| round_start.mp3 | Locally generated synthetic round horn | CC0 / no attribution required |

Note: these are intentionally goofy placeholder sounds. Replace them with true MP3 files using the same names when you have final assets.
`,
);

console.log(`Generated placeholder SFX in ${outDir}`);
