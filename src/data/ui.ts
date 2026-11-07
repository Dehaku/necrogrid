// HUD, menu, and effect values. Data only. GAME_DESIGN.md sections 7 (swipes), 8.4 (HUD), 8.5 (title).

import { DAY_CYCLE } from './time';

export const CRESCENT = {
  /** Distance from the necromancer's center, in tiles. */
  radius: 1,
  /** Stroke thickness in pixels. */
  thickness: 4,
  /** Degrees of arc each crescent spans. */
  span: 150,
  healthColor: '#d23a3a',
  manaColor: '#3a6ed2',
  background: 'rgba(0, 0, 0, 0.7)',
} as const;

export const HEALTH_BAR = {
  /** Pixels narrower than the footprint. */
  inset: 4,
  height: 4,
  /** Pixels above the top of the shape. */
  gap: 4,
  background: 'rgba(0, 0, 0, 0.7)',
  high: '#4caf50',
  mid: '#e8c547',
  low: '#d23a3a',
} as const;

export const SPELL_BAR = {
  /** Pixels below the necromancer's on-screen position. */
  offsetY: 48,
  iconSize: 20,
  gap: 4,
  background: 'rgba(12, 10, 16, 0.85)',
  border: 'rgba(201, 194, 176, 0.5)',
  cooldownShade: 'rgba(0, 0, 0, 0.6)',
  labelColor: '#d8d0c0',
} as const;

export const RESOURCE_HUD = {
  /** Top-left corner of the counters. */
  x: 16,
  y: 16,
  rowHeight: 20,
  /** Seconds a counter stays after its resource last changed, then fades over `fade`. */
  linger: 3,
  fade: 0.5,
  /** The counters all stay visible within this many tiles of an Altar (M7). */
  altarRadius: 5,
} as const;

export const PICKUP_POPUPS = {
  /** Seconds a "+3 Bone" line rises and fades. */
  lifetime: 1,
  rise: 1,
  lineHeight: 0.45,
} as const;

/** The gray jagged line from a Corpse Collector to the corpse it harvests. */
export const COLLECTOR_LINK = {
  /** Seconds to fade out. */
  fade: 0.35,
  segmentLength: 0.4,
  jitter: 0.16,
  color: 'rgba(190, 190, 196, 0.9)',
} as const;

/** Warning banners (section 8.4). */
export const WARNINGS = {
  /** Seconds a banner stays up (it fades over the last 0.5 s). */
  duration: 3,
  /** "Dusk approaching" and "Dawn approaching" show this many seconds before the phase. */
  leadTime: 10,
  /** "Phylactery under attack!" shows at most once per this many seconds. */
  attackCooldown: 15,
  /** "Phylactery critical!" below this share of max HP; again only after repaired above it. */
  criticalShare: 0.25,
  text: {
    dusk: 'Dusk approaching',
    dawn: 'Dawn approaching. The swarm returns',
    underAttack: 'Phylactery under attack!',
    critical: 'Phylactery critical!',
    finalDay: `Day ${DAY_CYCLE.winDay}. The binding begins`,
    complete: 'The Phylactery is complete',
  },
} as const;

export const CORPSES = {
  /** How dark a corpse is drawn compared to the living enemy (0–1). */
  darken: 0.45,
  eliteOutline: '#c9a227',
} as const;

/** Section 12. Saved in local storage under `storageKey`. */
export const SETTINGS = {
  storageKey: 'necrogrid.settings',
  corpseRenderCount: { default: 300, min: 50, max: 1000, step: 50 },
  masterVolume: { default: 70, min: 0, max: 100, step: 10 },
  screenShake: true,
  damageNumbers: true,
} as const;

export const DAMAGE_NUMBERS = {
  /** Seconds a number stays up. */
  lifetime: 0.6,
  /** Tiles it rises over its lifetime. */
  rise: 0.7,
  color: '#ffffff',
} as const;

export const SWIPE = {
  /** Seconds to sweep across and fade out. */
  duration: 0.18,
  /** Degrees the crescent covers. */
  span: 100,
  /** Center offset in front of the enemy: drawSize × offsetPerSize + offsetBase tiles. */
  offsetPerSize: 0.6,
  offsetBase: 0.3,
  /** Outer radius: radiusBase × (drawSize / radiusSizeRef) tiles. */
  radiusBase: 0.5,
  radiusSizeRef: 0.4,
  /** Inner edge as a fraction of the outer radius. */
  innerRatio: 0.62,
  /** Opacity of the bright leading edge. */
  startOpacity: 0.9,
  /** Degrees of fading trail behind the leading edge. */
  trailSpan: 60,
  /** Fraction of the duration the leading edge takes to cross the span; the trail fades out after. */
  headTravel: 0.65,
  /** Slices used to draw the trail's fade. */
  trailSlices: 10,
  color: '#ff3b3b',
  eliteColor: '#ffb03b',
} as const;

export const TITLE = {
  text: 'NECROGRID',
  fontSize: 96,
  color: '#c9c2b0',
  /** Baseline of the title, in logical pixels from the top. */
  baselineY: 250,
  lineColor: '#5a4a3a',
  lineWidth: 2,
  /** How far the earth line extends past each side of the title. */
  lineOverhang: 40,
  /** Letter rise on opening: stagger between letters and rise time, in seconds. */
  introStagger: 0.12,
  introDuration: 0.6,
  /** Idle loop: deepest sink (fraction of letter height), period, and stagger between letters. */
  idleDepth: 0.4,
  idlePeriod: 3.0,
  idleStagger: 0.2,
  background: '#0d0b10',
  /** Overlay over the paused world. */
  pauseOverlay: 'rgba(0, 0, 0, 0.7)',
} as const;

export const MENU = {
  buttonWidth: 260,
  buttonHeight: 42,
  buttonGap: 12,
  /** Top of the first button, in logical pixels. */
  firstButtonY: 330,
  fill: 'rgba(30, 24, 38, 0.92)',
  border: '#5a4a6a',
  focusBorder: '#c9c2b0',
  text: '#bdb4a4',
  focusText: '#f2ead8',
  font: '600 20px system-ui, sans-serif',
  panelText: '#9c94a6',
  panelKey: '#d8d0c0',
} as const;
