// The necromancer: movement, facing, terrain collision, marsh slow, timers, and Mend.
// GAME_DESIGN.md section 8.

import { MEND } from '../data/spells';
import { PLAYER, TILE_SIZE } from '../data/tuning';
import type { Point } from '../core/input';
import { resolveCircleCollision } from '../world/grid';

export interface Player {
  /** World position in tiles. */
  x: number;
  y: number;
  /** Position at the start of the current tick, for render interpolation. */
  prevX: number;
  prevY: number;
  /** Aim direction in radians (0 = east, +π/2 = south). */
  facing: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  /** Seconds of invulnerability left after a hit. */
  invulnerable: number;
  /** Seconds until Bolt can be cast again. */
  boltCooldown: number;
  /** Seconds until Chain can be cast again. */
  chainCooldown: number;
  /** Seconds until Mend can be cast again. */
  mendCooldown: number;
  /** HP still to be healed by the current Mend. */
  mendHealLeft: number;
}

export interface MoveIntent {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/** What the player needs to know about the ground under and around it. */
export interface PlayerTerrain {
  /** Speed multiplier for the tile at a world position (marsh slows). */
  speedMultiplierAt(x: number, y: number): number;
  /** True if the player cannot enter this tile. */
  isBlocked(tileX: number, tileY: number): boolean;
}

/** Creates the player standing on the center of a tile. */
export function createPlayer(tileX: number, tileY: number): Player {
  const x = tileX + 0.5;
  const y = tileY + 0.5;
  return {
    x,
    y,
    prevX: x,
    prevY: y,
    facing: -Math.PI / 2,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    mana: PLAYER.maxMana,
    maxMana: PLAYER.maxMana,
    invulnerable: 0,
    boltCooldown: 0,
    chainCooldown: 0,
    mendCooldown: 0,
    mendHealLeft: 0,
  };
}

/**
 * One simulation tick: move at constant speed (diagonals are not faster), slowed by the
 * tile underfoot, slide along blocked tiles, and face the aim point.
 */
export function updatePlayer(
  player: Player,
  move: MoveIntent,
  aim: Point,
  dt: number,
  terrain: PlayerTerrain,
  /** Mana per second, from stats (gear). */
  manaRegen: number = PLAYER.manaRegen,
): void {
  player.prevX = player.x;
  player.prevY = player.y;
  player.mana = Math.min(player.maxMana, player.mana + manaRegen * dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.boltCooldown = Math.max(0, player.boltCooldown - dt);
  player.chainCooldown = Math.max(0, player.chainCooldown - dt);
  player.mendCooldown = Math.max(0, player.mendCooldown - dt);
  if (player.mendHealLeft > 0) {
    // Mend heals evenly over its duration; taking damage does not interrupt it.
    const heal = Math.min(player.mendHealLeft, (MEND.heal / MEND.duration) * dt);
    player.mendHealLeft -= heal;
    player.hp = Math.min(player.maxHp, player.hp + heal);
  }

  const dx = (move.right ? 1 : 0) - (move.left ? 1 : 0);
  const dy = (move.down ? 1 : 0) - (move.up ? 1 : 0);
  const length = Math.hypot(dx, dy);
  if (length > 0) {
    const tilesPerSecond = (PLAYER.moveSpeed / TILE_SIZE) * terrain.speedMultiplierAt(player.x, player.y);
    const resolved = resolveCircleCollision(
      player.x + (dx / length) * tilesPerSecond * dt,
      player.y + (dy / length) * tilesPerSecond * dt,
      PLAYER.radius,
      (tx, ty) => terrain.isBlocked(tx, ty),
    );
    player.x = resolved.x;
    player.y = resolved.y;
  }

  const ax = aim.x - player.x;
  const ay = aim.y - player.y;
  if (ax !== 0 || ay !== 0) player.facing = Math.atan2(ay, ax);
}

/** Why Mend cannot be cast now, or undefined if it can (section 8.2). */
export function mendProblem(player: Player, flesh: number): string | undefined {
  if (player.mendCooldown > 0) return 'Mend is recovering';
  if (player.hp >= player.maxHp) return 'Already at full health';
  if (flesh < MEND.fleshCost) return `Needs ${MEND.fleshCost} Flesh`;
  return undefined;
}

/** Starts Mend's heal-over-time and cooldown. The caller pays the Flesh. */
export function startMend(player: Player): void {
  player.mendCooldown = MEND.cooldown;
  player.mendHealLeft = MEND.heal;
}
