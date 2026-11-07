// Spell values. Data only. GAME_DESIGN.md section 8.1. Chain (M5) and Mend (M6) join later.

export const BOLT = {
  /** Pixels per second. */
  speed: 500,
  /** Seconds before the bolt fizzles. */
  lifetime: 1.0,
  damage: 12,
  manaCost: 5,
  /** Seconds between casts while the button is held. */
  cooldown: 0.25,
  /** Hit radius in tiles, added to the target's radius. */
  radius: 0.15,
  /** The bolt appears this many tiles in front of the necromancer. */
  spawnOffset: 0.6,
  color: '#c9a6ff',
  glowColor: 'rgba(155, 100, 255, 0.35)',
} as const;
