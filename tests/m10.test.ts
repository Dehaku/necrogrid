import { describe, expect, it } from 'vitest';
import { distanceFalloff, SoundPlayer, type AudioBackend } from '../src/audio/sound';
import { EventBus, type GameEvents } from '../src/core/events';
import { AUDIO, SOUNDS, type SoundDef } from '../src/data/audio';
import { PARTICLES, SHAKE } from '../src/data/fx';
import { TILE } from '../src/data/terrain';
import { Game, type PlayerCommand } from '../src/game';
import { Particles } from '../src/render/particles';
import { ScreenShake } from '../src/render/shake';
import { BestScoreTracker, loadBestScore } from '../src/ui/bestScore';

class FakeBackend implements AudioBackend {
  played: { def: SoundDef; gain: number }[] = [];
  play(def: SoundDef, gain: number): void {
    this.played.push({ def, gain });
  }
}

function soundRig(listener = { x: 0, y: 0 }) {
  const backend = new FakeBackend();
  let now = 0;
  const player = new SoundPlayer(backend, () => now, () => listener);
  player.volume = 1;
  return { backend, player, advance: (s: number) => (now += s) };
}

describe('sound effects', () => {
  it('fades positional sounds to silence at the falloff distance', () => {
    expect(distanceFalloff(0)).toBe(1);
    expect(distanceFalloff(AUDIO.falloffTiles / 2)).toBeCloseTo(0.5);
    expect(distanceFalloff(AUDIO.falloffTiles + 5)).toBe(0);
  });

  it('scales by master volume and is silent at 0', () => {
    const { backend, player } = soundRig();
    player.volume = 0.5;
    expect(player.play('bolt')).toBe(true);
    expect(backend.played[0]!.gain).toBeCloseTo(SOUNDS.bolt.gain * 0.5);
    player.volume = 0;
    expect(player.play('chain')).toBe(false);
  });

  it('rate-limits each sound by its minimum interval', () => {
    const { backend, player, advance } = soundRig();
    expect(player.play('enemyDeath')).toBe(true);
    expect(player.play('enemyDeath')).toBe(false);
    advance(SOUNDS.enemyDeath.minInterval + 0.001);
    expect(player.play('enemyDeath')).toBe(true);
    expect(player.play('hit')).toBe(true); // a different sound is not blocked
    expect(backend.played).toHaveLength(3);
  });

  it('skips positional sounds that are too far away, but not global ones', () => {
    const { player } = soundRig({ x: 0, y: 0 });
    expect(player.play('enemyDeath', { x: 100, y: 0 })).toBe(false);
    expect(player.play('playerHurt', { x: 100, y: 0 })).toBe(true);
  });

  it('plays from run events', () => {
    const { backend, player } = soundRig();
    const events = new EventBus<GameEvents>();
    player.attach(events);
    events.emit('bolt:cast', { source: 'player', x: 0, y: 0 });
    events.emit('enemy:died', { id: 1, type: 'imp', elite: true, x: 1, y: 1 });
    events.emit('run:won', { day: 7, kills: 0, corpsesHarvested: 0, score: 0 });
    expect(backend.played.map((p) => p.def)).toEqual([SOUNDS.bolt, SOUNDS.eliteDeath, SOUNDS.win]);
    player.detach();
    events.emit('chain:cast', { points: [] });
    expect(backend.played).toHaveLength(3);
  });

  it('does nothing without an audio backend', () => {
    const player = new SoundPlayer(undefined, () => 0, () => undefined);
    expect(player.play('bolt')).toBe(false);
  });
});

describe('particles', () => {
  it('bursts on enemy death (more for larger corpses and elites) and expires', () => {
    const events = new EventBus<GameEvents>();
    const p = new Particles();
    p.attach(events);
    events.emit('enemy:died', { id: 1, type: 'imp', elite: false, x: 0, y: 0 });
    expect(p.count).toBe(PARTICLES.death.small.count);
    events.emit('enemy:died', { id: 2, type: 'brute', elite: true, x: 0, y: 0 });
    expect(p.count).toBe(PARTICLES.death.small.count + PARTICLES.death.large.count + PARTICLES.eliteBurst.count);
    for (let i = 0; i < 90; i++) p.advance(1 / 60);
    expect(p.count).toBe(0);
  });

  it('never holds more than the maximum', () => {
    const p = new Particles();
    for (let i = 0; i < 200; i++) p.burst(0, 0, PARTICLES.debris, '#fff');
    expect(p.count).toBe(PARTICLES.max);
  });
});

describe('screen shake', () => {
  it('shakes on big player hits only, then decays to still', () => {
    const events = new EventBus<GameEvents>();
    const s = new ScreenShake();
    s.attach(events, () => true);
    events.emit('player:damaged', { amount: 4, hp: 96 });
    expect(s.trauma).toBe(0);
    events.emit('player:damaged', { amount: 18, hp: 78 });
    expect(s.trauma).toBeCloseTo(SHAKE.playerHit.trauma);
    s.advance(0.05);
    const o = s.offset();
    expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(SHAKE.maxOffset * s.trauma * s.trauma * 1.5);
    for (let i = 0; i < 60; i++) s.advance(1 / 60);
    expect(s.trauma).toBe(0);
    expect(s.offset()).toEqual({ x: 0, y: 0 });
  });

  it('only shakes for buildings destroyed on screen, and caps trauma at 1', () => {
    const events = new EventBus<GameEvents>();
    const s = new ScreenShake();
    s.attach(events, (x) => x < 10);
    events.emit('building:destroyed', { id: 1, kind: 'wall', x: 50, y: 0, drop: {} });
    expect(s.trauma).toBe(0);
    for (let i = 0; i < 6; i++) events.emit('building:destroyed', { id: 1, kind: 'wall', x: 1, y: 0, drop: {} });
    expect(s.trauma).toBe(1);
  });

  it('has no offset when turned off in Settings', () => {
    const s = new ScreenShake();
    s.add(1);
    s.advance(0.01);
    s.enabled = false;
    expect(s.offset()).toEqual({ x: 0, y: 0 });
  });
});

describe('best score', () => {
  function memoryStore(initial?: string) {
    const data = new Map<string, string>();
    if (initial !== undefined) data.set('necrogrid.best', initial);
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  }

  it('saves a new best and keeps it across loads; ties and lower scores do not replace it', () => {
    const store = memoryStore();
    const tracker = new BestScoreTracker(store);
    expect(tracker.best).toBeUndefined();
    expect(tracker.record({ score: 500, day: 3, won: false })).toBe(true);
    expect(tracker.record({ score: 500, day: 4, won: false })).toBe(false);
    expect(tracker.record({ score: 200, day: 2, won: false })).toBe(false);
    expect(new BestScoreTracker(store).best).toEqual({ score: 500, day: 3, won: false });
    expect(tracker.record({ score: 900, day: 7, won: true })).toBe(true);
    expect(loadBestScore(store)).toEqual({ score: 900, day: 7, won: true });
  });

  it('ignores junk and survives blocked storage', () => {
    expect(loadBestScore(memoryStore('not json'))).toBeUndefined();
    expect(loadBestScore(memoryStore('{"score":-5}'))).toBeUndefined();
    expect(loadBestScore(undefined)).toBeUndefined();
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const tracker = new BestScoreTracker(blocked);
    expect(tracker.record({ score: 10, day: 1, won: false })).toBe(true);
    expect(tracker.best?.score).toBe(10);
  });
});

describe('bolt events', () => {
  it('emits bolt:cast for the necromancer and for Totems', () => {
    const events = new EventBus<GameEvents>();
    const game = new Game(3, events, { startingBase: false });
    game.director.paused = true;
    for (let x = 10; x <= 50; x++) for (let y = 10; y <= 50; y++) game.map.setTile(x, y, TILE.grass);
    game.player.x = game.player.prevX = 30.5;
    game.player.y = game.player.prevY = 30.5;
    const casts: string[] = [];
    events.on('bolt:cast', (e) => casts.push(e.source));
    game.placeBuilding('totem', 20, 20, { free: true });
    game.spawnEnemy('shambler', 22.5, 20.5, false);
    const c: PlayerCommand = { move: { up: false, down: false, left: false, right: false }, aim: { x: 40, y: 30.5 }, bolt: true, chain: false };
    game.tick(1 / 60, c);
    expect(casts).toContain('player');
    expect(casts).toContain('totem');
  });
});

describe('audio keep-alive', () => {
  it('starts one inaudible looping source when audio unlocks, so the output never sleeps', async () => {
    const { WebAudioBackend } = await import('../src/audio/sound');
    const started: { loop: boolean; gain: number }[] = [];
    class FakeContext {
      state = 'running';
      sampleRate = 8000;
      destination = {};
      createBuffer() {
        return { getChannelData: () => new Float32Array(8000) };
      }
      createGain() {
        return { gain: { value: 1 }, connect() {} };
      }
      createBufferSource() {
        const node = {
          buffer: null as unknown,
          loop: false,
          gainNode: undefined as { gain: { value: number } } | undefined,
          connect(g: { gain: { value: number } }) {
            node.gainNode = g;
          },
          start() {
            started.push({ loop: node.loop, gain: node.gainNode!.gain.value });
          },
        };
        return node;
      }
      resume() {
        return Promise.resolve();
      }
    }
    const g = globalThis as { AudioContext?: unknown };
    const original = g.AudioContext;
    g.AudioContext = FakeContext;
    try {
      const backend = new WebAudioBackend();
      backend.unlock();
      backend.unlock(); // a second gesture does not start another
      expect(started).toEqual([{ loop: true, gain: AUDIO.keepAliveLevel }]);
      expect(AUDIO.keepAliveLevel).toBeLessThan(1e-4);
    } finally {
      g.AudioContext = original;
    }
  });
});
