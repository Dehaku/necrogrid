// Sound effect values. Data only. GAME_DESIGN.md section 14 (M10) and section 12 (volume).
// Every sound is a short synthesized placeholder (an oscillator or noise burst with a pitch
// sweep), so the game ships with no audio files. Swapping in recorded sounds later only
// changes the backend in src/audio/.

export type SoundId =
  | 'bolt'
  | 'totem'
  | 'chain'
  | 'hit'
  | 'enemyDeath'
  | 'eliteDeath'
  | 'playerHurt'
  | 'phylacteryHit'
  | 'harvest'
  | 'collect'
  | 'build'
  | 'remove'
  | 'buildingDestroyed'
  | 'wraithFire'
  | 'mend'
  | 'craft'
  | 'warning'
  | 'win'
  | 'lose'
  | 'respawn';

export type Waveform = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise';

export interface SoundDef {
  readonly wave: Waveform;
  /** Start and end pitch in Hz (for noise: the low-pass filter cutoff). */
  readonly freq: number;
  readonly freqEnd: number;
  /** Seconds per note. */
  readonly duration: number;
  /** Peak gain before master volume (0–1). */
  readonly gain: number;
  /** The same sound never starts again within this many seconds (keeps swarms from roaring). */
  readonly minInterval: number;
  /** Optional melody: each entry multiplies `freq`/`freqEnd` for one note, played in sequence. */
  readonly notes?: readonly number[];
  /** Positional: quieter with distance from the view center. Otherwise always full volume. */
  readonly positional: boolean;
}

export const SOUNDS: Readonly<Record<SoundId, SoundDef>> = {
  bolt: { wave: 'triangle', freq: 880, freqEnd: 440, duration: 0.08, gain: 0.12, minInterval: 0.05, positional: false },
  totem: { wave: 'triangle', freq: 1100, freqEnd: 700, duration: 0.06, gain: 0.06, minInterval: 0.12, positional: true },
  chain: { wave: 'sawtooth', freq: 1400, freqEnd: 300, duration: 0.22, gain: 0.12, minInterval: 0.1, positional: false },
  hit: { wave: 'noise', freq: 2400, freqEnd: 900, duration: 0.05, gain: 0.08, minInterval: 0.04, positional: true },
  enemyDeath: { wave: 'noise', freq: 1200, freqEnd: 200, duration: 0.18, gain: 0.14, minInterval: 0.06, positional: true },
  eliteDeath: { wave: 'square', freq: 330, freqEnd: 110, duration: 0.35, gain: 0.14, minInterval: 0.2, positional: true },
  playerHurt: { wave: 'square', freq: 180, freqEnd: 90, duration: 0.14, gain: 0.16, minInterval: 0.15, positional: false },
  phylacteryHit: { wave: 'sine', freq: 140, freqEnd: 70, duration: 0.25, gain: 0.18, minInterval: 0.6, positional: false },
  harvest: { wave: 'sine', freq: 520, freqEnd: 780, duration: 0.12, gain: 0.1, minInterval: 0.08, positional: false },
  collect: { wave: 'sine', freq: 600, freqEnd: 900, duration: 0.09, gain: 0.06, minInterval: 0.1, positional: true },
  build: { wave: 'square', freq: 260, freqEnd: 200, duration: 0.07, gain: 0.08, minInterval: 0.05, positional: false },
  remove: { wave: 'square', freq: 200, freqEnd: 140, duration: 0.07, gain: 0.07, minInterval: 0.05, positional: false },
  buildingDestroyed: { wave: 'noise', freq: 700, freqEnd: 120, duration: 0.4, gain: 0.2, minInterval: 0.15, positional: true },
  wraithFire: { wave: 'sine', freq: 300, freqEnd: 520, duration: 0.2, gain: 0.08, minInterval: 0.2, positional: true },
  mend: { wave: 'sine', freq: 400, freqEnd: 800, duration: 0.35, gain: 0.12, minInterval: 0.3, positional: false },
  craft: { wave: 'triangle', freq: 523, freqEnd: 523, duration: 0.1, gain: 0.12, minInterval: 0.3, notes: [1, 1.26, 1.5], positional: false },
  warning: { wave: 'triangle', freq: 392, freqEnd: 392, duration: 0.16, gain: 0.12, minInterval: 1, notes: [1, 0.84], positional: false },
  win: { wave: 'triangle', freq: 392, freqEnd: 392, duration: 0.22, gain: 0.16, minInterval: 2, notes: [1, 1.26, 1.5, 2], positional: false },
  lose: { wave: 'sawtooth', freq: 220, freqEnd: 200, duration: 0.3, gain: 0.14, minInterval: 2, notes: [1, 0.94, 0.84, 0.67], positional: false },
  respawn: { wave: 'sine', freq: 260, freqEnd: 520, duration: 0.5, gain: 0.14, minInterval: 1, positional: false },
};

export const AUDIO = {
  /** Positional sounds fade linearly to silence at this many tiles from the view center. */
  falloffTiles: 30,
  /** Most sounds playing at once; extra ones are skipped. */
  maxVoices: 24,
} as const;
