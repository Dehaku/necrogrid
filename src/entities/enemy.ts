// Enemy state. GAME_DESIGN.md section 7.

import { ELITE, ENEMIES, type EnemyDef, type EnemyId } from '../data/enemies';
import type { TargetId } from '../combat/targeting';

export interface Enemy {
  readonly id: number;
  readonly type: EnemyId;
  readonly def: EnemyDef;
  readonly elite: boolean;
  /** World position in tiles. */
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Movement heading in radians; turns at a limited rate. */
  heading: number;
  hp: number;
  readonly maxHp: number;
  /** Damage per hit, after the elite multiplier. */
  readonly damage: number;
  /** Seconds until the next attack is allowed. */
  attackCooldown: number;
  target: TargetId | undefined;
  /** False once the enemy should be removed at the end of the tick. */
  alive: boolean;
}

export function createEnemy(id: number, type: EnemyId, x: number, y: number, elite: boolean): Enemy {
  const def = ENEMIES[type];
  const hp = elite ? def.hp * ELITE.hpMultiplier : def.hp;
  return {
    id,
    type,
    def,
    elite,
    x,
    y,
    prevX: x,
    prevY: y,
    heading: 0,
    hp,
    maxHp: hp,
    damage: elite ? def.damage * ELITE.damageMultiplier : def.damage,
    attackCooldown: 0,
    target: undefined,
    alive: true,
  };
}
