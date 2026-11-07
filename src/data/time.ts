// Day/night cycle and lighting values. Data only.
// GAME_DESIGN.md section 5 (time) and section 8.4 (day ring colors).

export const DAY_CYCLE = {
  /** In cycle order. The run starts at the beginning of the first phase on day 1. */
  phases: [
    { id: 'day', length: 150, label: 'Day', ringColor: '#e8b94a' },
    { id: 'dusk', length: 10, label: 'Dusk', ringColor: '#d9673b' },
    { id: 'night', length: 80, label: 'Night', ringColor: '#2b2f6b' },
    { id: 'dawn', length: 10, label: 'Dawn', ringColor: '#d98aa6' },
  ],
  /** The Phylactery completes on this day (section 10.4). Shown as "Day N / 15". */
  winDay: 15,
} as const;

export type PhaseId = (typeof DAY_CYCLE.phases)[number]['id'];

export const LIGHTING = {
  /** Player light radius at night, in tiles. */
  playerLightRadius: 10,
  /** Fraction of a light's radius, at its outer edge, that fades from lit to dark. */
  lightSoftEdge: 0.35,
  /** Darkness overlay opacity at full night (0–1). Dusk and dawn blend toward this. */
  nightDarkness: 0.82,
  /** Extra darkening at the screen corners at full night (0–1). */
  nightVignette: 0.35,
  /** Darkness color as "r, g, b". */
  darknessRgb: '5, 6, 20',
} as const;

export const DAY_RING = {
  /** Diameter in pixels. */
  size: 64,
  /** Distance from the top-right corner of the view to the ring's edge, in pixels. */
  margin: 16,
  /** Radius of the dark disc in the middle that holds the day counter. */
  innerRadius: 21,
  innerColor: 'rgba(12, 10, 16, 0.88)',
  handColor: '#ffffff',
  textColor: '#f2ead8',
} as const;
