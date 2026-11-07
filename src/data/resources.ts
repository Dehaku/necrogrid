// Resource types and caps. Data only. GAME_DESIGN.md section 9.1.

export type ResourceId = 'bone' | 'flesh' | 'ichor' | 'soulShard';

/** Display order everywhere (HUD, equipment screen, popups). */
export const RESOURCE_ORDER: readonly ResourceId[] = ['bone', 'flesh', 'ichor', 'soulShard'];

export const RESOURCES: Readonly<Record<ResourceId, { name: string; tier: 'basic' | 'rare'; color: string }>> = {
  bone: { name: 'Bone', tier: 'basic', color: '#e8e0cc' },
  flesh: { name: 'Flesh', tier: 'basic', color: '#d27a7a' },
  ichor: { name: 'Ichor', tier: 'rare', color: '#7fd17a' },
  soulShard: { name: 'Soul Shard', tier: 'rare', color: '#9fc6ff' },
};

/** Anything over the cap is lost. */
export const RESOURCE_CAPS = { basic: 200, rare: 50 } as const;

/** An amount of each resource; missing entries mean 0. Used for costs and loot. */
export type ResourceAmounts = Partial<Record<ResourceId, number>>;
