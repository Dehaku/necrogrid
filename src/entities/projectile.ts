// Projectiles. M4: the player's Bolt. GAME_DESIGN.md section 8.1.

export interface Projectile {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Tiles per second. */
  vx: number;
  vy: number;
  /** Seconds left before it fizzles. */
  life: number;
  damage: number;
  /** Hit radius in tiles. */
  radius: number;
  alive: boolean;
  /** Who fired it (for drawing). */
  source?: 'player' | 'totem';
}
