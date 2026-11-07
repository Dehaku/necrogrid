// Equipment screen (Tab). Pauses the game. Shows resources, the three gear slots with every
// unlocked item, and the resulting stats. Any unlocked item can be equipped at any time, free.
// GAME_DESIGN.md sections 8 and 10.3.

import { GEAR, SLOTS, type GearId, type GearSlot } from '../data/recipes';
import { RESOURCE_ORDER, RESOURCES, type ResourceId } from '../data/resources';
import { MENU, TITLE } from '../data/ui';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../data/tuning';
import type { Point } from '../core/input';
import type { Stats } from '../core/stats';
import { effectsText } from '../crafting/crafting';
import type { GearState } from '../crafting/unlocks';
import { drawBox, hitIndex, type MenuPress, type Rect } from './menuWidgets';

export type EquipAction = { equip: GearId } | { unequip: GearSlot } | 'close';

/** One selectable line: "None" or an unlocked item, in a slot column. */
interface Entry {
  slot: GearSlot;
  id: GearId | undefined;
  rect: Rect;
}

const BOX: Rect = { x: VIEW_WIDTH / 2 - 470, y: VIEW_HEIGHT / 2 - 280, w: 940, h: 560 };
const COLUMN_W = 210;
const ENTRY_H = 52;

export class EquipmentScreen {
  isOpen = false;
  focus = 0;
  private lastMouse: Point = { x: Number.NaN, y: Number.NaN };

  open(): void {
    this.isOpen = true;
    this.focus = 0;
  }

  close(): void {
    this.isOpen = false;
  }

  /** Selectable entries, column by column. */
  entries(gear: GearState): Entry[] {
    const out: Entry[] = [];
    SLOTS.forEach((slot, c) => {
      const x = BOX.x + 270 + c * (COLUMN_W + 14);
      const ids: (GearId | undefined)[] = [undefined, ...gear.unlockedFor(slot.id).map((g) => g.id)];
      ids.forEach((id, k) => out.push({ slot: slot.id, id, rect: { x, y: BOX.y + 96 + k * (ENTRY_H + 6), w: COLUMN_W, h: ENTRY_H } }));
    });
    return out;
  }

  handle(press: MenuPress, gear: GearState): EquipAction | undefined {
    const entries = this.entries(gear);
    const count = entries.length;
    const pick = (e: Entry): EquipAction => (e.id ? { equip: e.id } : { unequip: e.slot });
    switch (press.kind) {
      case 'prev':
        this.focus = (this.focus + count - 1) % count;
        return undefined;
      case 'next':
        this.focus = (this.focus + 1) % count;
        return undefined;
      case 'left':
      case 'right': {
        // Jump to the first entry of the neighboring slot column.
        const slots = SLOTS.map((s) => s.id);
        const current = slots.indexOf(entries[this.focus]?.slot ?? 'weapon');
        const target = slots[(current + (press.kind === 'left' ? slots.length - 1 : 1)) % slots.length];
        this.focus = Math.max(0, entries.findIndex((e) => e.slot === target));
        return undefined;
      }
      case 'confirm':
        return entries[this.focus] ? pick(entries[this.focus]!) : undefined;
      case 'back':
        return 'close';
      case 'click': {
        const i = hitIndex(entries.map((e) => e.rect), press.at);
        if (i < 0) return undefined;
        this.focus = i;
        return pick(entries[i]!);
      }
    }
  }

  hover(mouse: Point, gear: GearState): void {
    if (mouse.x === this.lastMouse.x && mouse.y === this.lastMouse.y) return;
    this.lastMouse = { ...mouse };
    const i = hitIndex(this.entries(gear).map((e) => e.rect), mouse);
    if (i >= 0) this.focus = i;
  }

  draw(ctx: CanvasRenderingContext2D, amount: (id: ResourceId) => number, cap: (id: ResourceId) => number, gear: GearState, stats: Stats): void {
    ctx.fillStyle = TITLE.pauseOverlay;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    drawBox(ctx, BOX);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = MENU.focusText;
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText('Equipment', BOX.x + 24, BOX.y + 32);
    ctx.textAlign = 'right';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = MENU.panelText;
    ctx.fillText('Enter or click to equip · Tab or Esc to close', BOX.x + BOX.w - 24, BOX.y + 32);

    // Resources.
    ctx.textAlign = 'left';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('RESOURCES', BOX.x + 24, BOX.y + 74);
    ctx.font = '15px system-ui, sans-serif';
    RESOURCE_ORDER.forEach((id, i) => {
      const y = BOX.y + 104 + i * 30;
      ctx.fillStyle = RESOURCES[id].color;
      ctx.fillRect(BOX.x + 24, y - 6, 12, 12);
      ctx.textAlign = 'left';
      ctx.fillStyle = MENU.focusText;
      ctx.fillText(RESOURCES[id].name, BOX.x + 44, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = amount(id) >= cap(id) ? '#ffcf5a' : MENU.focusText;
      ctx.fillText(`${amount(id)} / ${cap(id)}`, BOX.x + 230, y);
    });

    // Slot columns.
    const entries = this.entries(gear);
    SLOTS.forEach((slot, c) => {
      const x = BOX.x + 270 + c * (COLUMN_W + 14);
      ctx.textAlign = 'left';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = MENU.panelText;
      ctx.fillText(slot.name.toUpperCase(), x, BOX.y + 74);
    });
    entries.forEach((e, i) => {
      const equipped = gear.equipped[e.slot] === e.id;
      const focused = i === this.focus;
      ctx.fillStyle = equipped ? 'rgba(80, 140, 90, 0.35)' : focused ? 'rgba(90, 74, 106, 0.5)' : 'rgba(30, 24, 38, 0.6)';
      ctx.fillRect(e.rect.x, e.rect.y, e.rect.w, e.rect.h);
      if (focused) {
        ctx.strokeStyle = MENU.focusBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(e.rect.x + 0.5, e.rect.y + 0.5, e.rect.w - 1, e.rect.h - 1);
      }
      ctx.textAlign = 'left';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.fillStyle = MENU.focusText;
      const name = e.id ? GEAR_NAMES.get(e.id) ?? e.id : '(none)';
      ctx.fillText(`${equipped ? '✓ ' : ''}${name}`, e.rect.x + 10, e.rect.y + 17);
      if (e.id) {
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = '#c9c1b4';
        wrapText(ctx, effectsText(e.id), e.rect.x + 10, e.rect.y + 36, e.rect.w - 16);
      }
    });
    if (gear.unlocked.size === 0) {
      ctx.textAlign = 'left';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = MENU.panelText;
      ctx.fillText('Craft gear with C (some recipes need an Altar).', BOX.x + 270, BOX.y + 170);
    }

    // Stats.
    const s = stats;
    const lines = [
      `Max HP ${s.maxHp}   ·   Max Mana ${s.maxMana}   ·   Mana regen ${s.manaRegen}/s`,
      `Bolt ${round(s.boltDamage)} damage, ${round(s.boltCooldown)} s, ${round(s.boltManaCost)} mana   ·   Chain ${round(s.chainDamage)} damage, ${s.chainMaxJumps} jumps, ${round(s.chainCooldown)} s`,
    ];
    ctx.textAlign = 'left';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = MENU.panelText;
    ctx.fillText('STATS', BOX.x + 24, BOX.y + BOX.h - 74);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = MENU.focusText;
    lines.forEach((l, i) => ctx.fillText(l, BOX.x + 24, BOX.y + BOX.h - 48 + i * 22));
  }
}

const round = (n: number) => Number(n.toFixed(2));

const GEAR_NAMES = new Map(GEAR.map((g) => [g.id, g.name] as const));

/** Draws text on up to two lines within `width`. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number): void {
  if (ctx.measureText(text).width <= width) {
    ctx.fillText(text, x, y);
    return;
  }
  const words = text.split(' ');
  let line = '';
  let row = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      ctx.fillText(line, x, y - 6 + row * 12);
      row++;
      line = word;
      if (row > 1) return;
    } else {
      line = next;
    }
  }
  if (line && row <= 1) ctx.fillText(line, x, y - 6 + row * 12);
}
