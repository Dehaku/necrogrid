import { describe, expect, it } from 'vitest';
import { segmentCircleHit, stepBolt, tryCastBolt } from '../src/combat/bolt';
import { BOLT } from '../src/data/spells';
import { createPlayer } from '../src/entities/player';
import type { Projectile } from '../src/entities/projectile';

const DT = 1 / 60;
const noRock = () => false;

function boltAt(x: number, y: number, dirX: number, dirY: number): Projectile {
  const speed = BOLT.speed / 32;
  return { x, y, prevX: x, prevY: y, vx: dirX * speed, vy: dirY * speed, life: BOLT.lifetime, damage: 12, radius: BOLT.radius, alive: true };
}

describe('tryCastBolt', () => {
  it('costs 5 mana and starts a 0.25 s cooldown', () => {
    const player = createPlayer(0, 0);
    const bolt = tryCastBolt(player, { x: 10, y: 0.5 });
    expect(bolt).toBeDefined();
    expect(player.mana).toBe(95);
    expect(player.boltCooldown).toBe(0.25);
    expect(tryCastBolt(player, { x: 10, y: 0.5 })).toBeUndefined();
  });

  it('flies toward the aim point at 500 px/s from just in front of the player', () => {
    const player = createPlayer(0, 0);
    const bolt = tryCastBolt(player, { x: 0.5, y: 10 })!;
    expect(bolt.vx).toBeCloseTo(0);
    expect(bolt.vy).toBeCloseTo(500 / 32);
    expect(bolt.y).toBeCloseTo(0.5 + BOLT.spawnOffset);
  });

  it('does nothing without enough mana', () => {
    const player = createPlayer(0, 0);
    player.mana = 4;
    expect(tryCastBolt(player, { x: 10, y: 0 })).toBeUndefined();
    expect(player.mana).toBe(4);
  });
});

describe('segmentCircleHit', () => {
  it('finds where a segment first touches a circle', () => {
    expect(segmentCircleHit(0, 0, 10, 0, { x: 5, y: 0 }, 1)).toBeCloseTo(0.4);
    expect(segmentCircleHit(0, 0, 10, 0, { x: 5, y: 2 }, 1)).toBeUndefined();
    expect(segmentCircleHit(0, 0, 1, 0, { x: 5, y: 0 }, 1)).toBeUndefined();
    expect(segmentCircleHit(5, 0, 6, 0, { x: 5, y: 0 }, 1)).toBe(0);
  });
});

describe('stepBolt', () => {
  it('hits the first enemy along its path, not the nearest to its start', () => {
    // Over this step the bolt travels ~1 tile. 'side' is nearer the start (0.85 vs 0.9) but
    // off to one side, so the path touches it later (t ≈ 0.34) than 'ahead' (t ≈ 0.24).
    const bolt = boltAt(0, 0, 1, 0);
    const near = { x: 0.6, y: 0.6, radius: 0.5, id: 'side' };
    const ahead = { x: 0.9, y: 0, radius: 0.5, id: 'ahead' };
    const hit = stepBolt(bolt, DT * 4, [near, ahead], noRock);
    expect(hit?.id).toBe('ahead');
    expect(bolt.alive).toBe(false);
  });

  it('stops at rock', () => {
    const bolt = boltAt(0.5, 0.5, 1, 0);
    for (let i = 0; i < 60 && bolt.alive; i++) stepBolt(bolt, DT, [], (tx) => tx === 3);
    expect(bolt.alive).toBe(false);
    expect(bolt.x).toBeLessThan(3.3);
    expect(bolt.x).toBeGreaterThanOrEqual(3);
  });

  it('hits an enemy hovering over rock: enemies are checked before rock', () => {
    const bolt = boltAt(2.9, 0.5, 1, 0);
    const wraith = { x: 3.3, y: 0.5, radius: 0.5 };
    expect(stepBolt(bolt, DT, [wraith], (tx) => tx === 3)).toBe(wraith);
  });

  it('fizzles after 1 s', () => {
    const bolt = boltAt(0, 0, 1, 0);
    let ticks = 0;
    while (bolt.alive && ticks < 200) {
      stepBolt(bolt, DT, [], noRock);
      ticks++;
    }
    expect(ticks).toBeGreaterThanOrEqual(59);
    expect(ticks).toBeLessThanOrEqual(61);
    expect(bolt.x).toBeCloseTo(500 / 32, 0);
  });
});
