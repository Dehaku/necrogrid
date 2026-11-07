// Sound effects (M10). Listens to a run's events and plays short synthesized sounds.
// Purely an output: nothing here feeds back into the simulation, and the simulation never
// imports it. The Web Audio part sits behind `AudioBackend` so the rules (rate limits,
// distance falloff, volume) are testable without a browser.

import { AUDIO, SOUNDS, type SoundDef, type SoundId } from '../data/audio';
import type { EventBus, GameEvents } from '../core/events';
import type { Point } from '../core/input';
import { Rng } from '../core/rng';

export interface AudioBackend {
  play(def: SoundDef, gain: number): void;
}

/** 1 at the listener, falling linearly to 0 at `AUDIO.falloffTiles`. */
export function distanceFalloff(distance: number): number {
  return Math.min(1, Math.max(0, 1 - distance / AUDIO.falloffTiles));
}

export class SoundPlayer {
  /** Master volume, 0–1 (Settings → Master volume). */
  volume = 0.7;
  private readonly lastPlayed = new Map<SoundId, number>();
  private unsubscribe: (() => void)[] = [];

  constructor(
    private readonly backend: AudioBackend | undefined,
    /** Real time in seconds (rate limits use real time, so 20× debug speed stays bearable). */
    private readonly clock: () => number,
    /** Where positional sounds are heard from: the view center, or undefined for no run. */
    private readonly listener: () => Point | undefined,
  ) {}

  /** Plays a sound unless muted, rate-limited, or too far away. Returns whether it played. */
  play(id: SoundId, at?: Point): boolean {
    if (!this.backend || this.volume <= 0) return false;
    const def = SOUNDS[id];
    const now = this.clock();
    const last = this.lastPlayed.get(id);
    if (last !== undefined && now - last < def.minInterval) return false;
    let gain = def.gain * this.volume;
    if (def.positional && at) {
      const ear = this.listener();
      if (ear) gain *= distanceFalloff(Math.hypot(at.x - ear.x, at.y - ear.y));
    }
    if (gain <= 0.001) return false;
    this.lastPlayed.set(id, now);
    this.backend.play(def, gain);
    return true;
  }

  /** Listen to a run's events. Replaces any earlier run. */
  attach(events: EventBus<GameEvents>): void {
    this.detach();
    this.unsubscribe = [
      events.on('bolt:cast', (e) => this.play(e.source === 'player' ? 'bolt' : 'totem', e)),
      events.on('chain:cast', () => this.play('chain')),
      events.on('enemy:damaged', (e) => {
        if (e.hp > 0) this.play('hit', e);
      }),
      events.on('enemy:died', (e) => this.play(e.elite ? 'eliteDeath' : 'enemyDeath', e)),
      events.on('player:damaged', () => this.play('playerHurt')),
      events.on('phylactery:damaged', () => this.play('phylacteryHit')),
      events.on('corpse:harvested', () => this.play('harvest')),
      events.on('collector:collected', (e) => this.play('collect', { x: e.fromX, y: e.fromY })),
      events.on('building:placed', () => this.play('build')),
      events.on('building:removed', () => this.play('remove')),
      events.on('building:destroyed', (e) => this.play('buildingDestroyed', e)),
      events.on('enemy:fired', (e) => this.play('wraithFire', e)),
      events.on('mend:cast', () => this.play('mend')),
      events.on('gear:crafted', () => this.play('craft')),
      events.on('phase:dusk', () => this.play('warning')),
      events.on('phase:dawn', () => this.play('warning')),
      events.on('run:won', () => this.play('win')),
      events.on('run:lost', () => this.play('lose')),
      events.on('player:respawned', () => this.play('respawn')),
    ];
  }

  detach(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
  }
}

/**
 * Web Audio backend. Browsers only allow audio after a user gesture, so the context is made
 * (or resumed) in `unlock()`, which main.ts calls on the first key press or click.
 */
export class WebAudioBackend implements AudioBackend {
  private ctx: AudioContext | undefined;
  private noise: AudioBuffer | undefined;
  private voices = 0;

  unlock(): void {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = undefined; // no Web Audio: stay silent
    }
  }

  play(def: SoundDef, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.voices >= AUDIO.maxVoices) return;
    const notes = def.notes ?? [1];
    let start = ctx.currentTime;
    for (const mult of notes) {
      this.voice(ctx, def, gain, mult, start);
      start += def.duration;
    }
  }

  private voice(ctx: AudioContext, def: SoundDef, gain: number, mult: number, start: number): void {
    const end = start + def.duration;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.01, def.duration / 4));
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    amp.connect(ctx.destination);

    let source: AudioScheduledSourceNode;
    if (def.wave === 'noise') {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(def.freq * mult, start);
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, def.freqEnd * mult), end);
      filter.connect(amp);
      const buffer = ctx.createBufferSource();
      buffer.buffer = this.noiseBuffer(ctx);
      buffer.connect(filter);
      source = buffer;
    } else {
      const osc = ctx.createOscillator();
      osc.type = def.wave;
      osc.frequency.setValueAtTime(def.freq * mult, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, def.freqEnd * mult), end);
      osc.connect(amp);
      source = osc;
    }
    this.voices++;
    source.onended = () => {
      this.voices--;
      amp.disconnect();
    };
    source.start(start);
    source.stop(end + 0.02);
  }

  /** One second of white noise, made once from a visual-only seeded RNG. */
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const rng = new Rng(0x501d);
    for (let i = 0; i < data.length; i++) data[i] = rng.next() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }
}
