// Terrain edits: player-made marsh and filling marsh to dirt. GAME_DESIGN.md section 10.2.
// These rules decide whether an edit is allowed; paying for it (M6) and choosing the tile
// in build mode (M7) happen elsewhere.

import { TILE, type TileId } from '../data/terrain';

export type TerrainEdit = 'marsh' | 'fill';

export interface TerrainEditWorld {
  getTile(tileX: number, tileY: number): TileId | undefined;
  isBuilding(tileX: number, tileY: number): boolean;
  /** The 16 tiles around the Phylactery (section 10.4). */
  isNoBuildZone(tileX: number, tileY: number): boolean;
}

/** Why an edit is not allowed, or undefined if it is. Units on the tile do not block it. */
export function terrainEditProblem(edit: TerrainEdit, tileX: number, tileY: number, world: TerrainEditWorld): string | undefined {
  const tile = world.getTile(tileX, tileY);
  if (tile === undefined) return 'Not explored yet';
  if (edit === 'fill') return tile === TILE.marsh ? undefined : 'Only marsh can be filled';
  if (tile !== TILE.grass && tile !== TILE.dirt) return 'Marsh needs grass or dirt';
  if (world.isBuilding(tileX, tileY)) return 'A building is in the way';
  if (world.isNoBuildZone(tileX, tileY)) return 'Too close to the Phylactery';
  return undefined;
}

/** The tile an edit leaves behind. */
export function terrainEditResult(edit: TerrainEdit): TileId {
  return edit === 'marsh' ? TILE.marsh : TILE.dirt;
}
