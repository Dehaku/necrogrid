// Spell values. Data only. GAME_DESIGN.md sections 8.1 (Bolt, Chain) and 8.2 (Mend).

export const MEND = {
  /** Flesh spent per cast. */
  fleshCost: 5,
  /** HP healed in total, applied evenly over `duration` seconds. */
  heal: 25,
  duration: 1,
  cooldown: 4,
  color: '#d27a7a',
} as const;

export const CHAIN = {
  /** The first target is the nearest enemy within this many tiles of the cursor. */
  castRadius: 6,
  /** Further enemies the chain can jump to after the first hit. */
  maxJumps: 3,
  /** Each jump reaches the nearest unhit enemy within this many tiles of the last one hit. */
  jumpRange: 4,
  /** Damage on the first hit; each jump multiplies it by `falloff`. */
  damage: 18,
  falloff: 0.75,
  manaCost: 15,
  cooldown: 1.0,
  /** Visual: seconds for the links to fade. */
  fade: 0.2,
  /** Visual: jagged segments of about this many tiles, offset up to `jitter` tiles sideways. */
  segmentLength: 0.45,
  jitter: 0.22,
  coreColor: '#f1e9ff',
  glowColor: 'rgba(170, 130, 255, 0.45)',
} as const;

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
