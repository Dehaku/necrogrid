// Boot: the browser side. Owns the canvas, input, loop, screens, and the current run (Game),
// and draws each frame. The page opens on the title screen with no run active.

import { CONTROLS } from './data/controls';
import { LIGHTING } from './data/time';
import { MAX_FRAME_TIME, TICK_RATE, TILE_SIZE } from './data/tuning';
import { EventBus, type GameEvents } from './core/events';
import { bindInput, boundKeys, buttonsForAction, Input, keysForAction } from './core/input';
import { FixedStepLoop, PauseState } from './core/loop';
import { newRunSeed } from './core/rng';
import { DebugPanel } from './debug/debugPanel';
import { drawFlowField, drawSpawnInset } from './debug/overlays';
import { Game } from './game';
import { Camera } from './render/camera';
import { GameCanvas } from './render/canvas';
import { Effects } from './render/effects';
import { Lighting } from './render/lighting';
import { drawBolt, drawBuilding, drawCorpse, drawEnemy, drawPhylactery, drawPlayer, drawTerrain } from './render/sprites';
import { LANTERN, TOTEM, type BuildChoice } from './data/buildings';
import { footprintAtCursor } from './entities/building';
import { repairCostToFull } from './economy/repair';
import { BuildMode, choiceInfo, costText, drawGhost, drawHotbar } from './ui/buildMenu';
import { drawEdgeArrow, drawPhylacteryPanel, drawRepairPrompt, edgeArrowPosition } from './ui/hud';
import { ENEMIES } from './data/enemies';
import type { ResourceId } from './data/resources';
import { corpseOpacity, corpsesToDraw } from './entities/corpse';
import { EndScreen } from './ui/endScreen';
import { EquipmentScreen } from './ui/equipmentScreen';
import { drawHealthBar } from './ui/healthBars';
import { drawCrescents, drawDayRing, drawHarvestPrompt, drawSpellBar, spellIcons } from './ui/hud';
import type { MenuPress } from './ui/menuWidgets';
import { drawAutoPauseOverlay } from './ui/pauseOverlay';
import { ResourceHud } from './ui/resourceHud';
import { loadSettings, saveSettings, SettingsPanel, type Settings } from './ui/settings';
import { TitleScreen, type MenuResult } from './ui/titleScreen';

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
if (!canvasElement) throw new Error('Missing #game canvas');

const debugEnabled = new URLSearchParams(location.search).has('debug');

const screen = new GameCanvas(canvasElement);
const lighting = new Lighting();
const effects = new Effects();
const input = new Input();
const loop = new FixedStepLoop({ tickRate: TICK_RATE, maxFrameTime: MAX_FRAME_TIME });
const pause = new PauseState();
const camera = new Camera();
const resourceHud = new ResourceHud();

/** Local storage, if the browser allows it (private windows and blocked storage may not). */
function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function applySettings(settings: Settings): void {
  effects.showDamageNumbers = settings.damageNumbers;
}

const settingsPanel = new SettingsPanel(loadSettings(storage()), (settings) => {
  saveSettings(storage(), settings);
  applySettings(settings);
});
applySettings(settingsPanel.settings);

const titleScreen = new TitleScreen(settingsPanel);
const endScreen = new EndScreen();
const equipmentScreen = new EquipmentScreen();
const buildMode = new BuildMode();
/** Run time of the last hit on the Phylactery, for the arrow's red flash. */
let lastPhylacteryHit = -Infinity;
/** The tile last painted while holding LMB in build mode, so each tile is tried once per drag. */
let lastPaintKey: string | undefined;

/** The current run. Undefined on the title screen when no run is active. */
let game: Game | undefined;

const keys = {
  up: keysForAction(CONTROLS, 'moveUp'),
  down: keysForAction(CONTROLS, 'moveDown'),
  left: keysForAction(CONTROLS, 'moveLeft'),
  right: keysForAction(CONTROLS, 'moveRight'),
  pause: new Set(keysForAction(CONTROLS, 'pause')),
  menuPrev: new Set(keysForAction(CONTROLS, 'menuPrev')),
  menuNext: new Set(keysForAction(CONTROLS, 'menuNext')),
  menuLeft: new Set(keysForAction(CONTROLS, 'menuLeft')),
  menuRight: new Set(keysForAction(CONTROLS, 'menuRight')),
  menuConfirm: new Set(keysForAction(CONTROLS, 'menuConfirm')),
  equipment: new Set(keysForAction(CONTROLS, 'equipment')),
  harvest: keysForAction(CONTROLS, 'harvest'),
  mend: keysForAction(CONTROLS, 'mend'),
  repair: keysForAction(CONTROLS, 'repair'),
  build: new Set(keysForAction(CONTROLS, 'build')),
  /** Digit1..Digit8, in hotbar order. */
  buildSlots: keysForAction(CONTROLS, 'buildSlot'),
};
const boltButtons = buttonsForAction(CONTROLS, 'bolt');
const chainButtons = buttonsForAction(CONTROLS, 'chain');

const debugPanel = debugEnabled
  ? new DebugPanel({
      loop,
      cycle: () => game?.cycle,
      seed: () => game?.seed,
      restartWithSeed: (seed) => startRun(seed),
      grant: (id, amount) => game?.gain({ [id]: amount }),
      entityCounts: () =>
        game ? { chunks: game.map.chunkCount, enemies: game.enemies.length, bolts: game.projectiles.length, ...game.enemyCounts() } : {},
      extraReadout: () =>
        game
          ? [
              `Player HP ${game.player.hp.toFixed(0)} / ${game.player.maxHp}  mana ${game.player.mana.toFixed(0)}`,
              `Phylactery ${game.phylactery.hp.toFixed(0)} / ${game.phylactery.maxHp}`,
              `Kills ${game.kills}  score ${game.score}  harvested ${game.corpsesHarvested}`,
              `Corpses ${game.corpses.length}  harvesting ${game.harvest ? `${game.harvest.progress.toFixed(1)}/${game.harvest.duration}` : '-'}`,
              `Budget ${game.director.budget.toFixed(2)}  next pack ${game.director.pendingPackSize ?? '-'}`,
            ]
          : [],
    })
  : undefined;

function runActive(): boolean {
  return game !== undefined && game.outcome === undefined;
}

function menusOpen(): boolean {
  return titleScreen.isOpen || endScreen.isOpen || equipmentScreen.isOpen;
}

function startRun(seed: number = newRunSeed(location.search)): void {
  const events = new EventBus<GameEvents>();
  game = new Game(seed, events);
  effects.attach(events);
  resourceHud.attach(events);
  equipmentScreen.close();
  buildMode.active = false;
  lastPhylacteryHit = -Infinity;
  events.on('phylactery:damaged', () => (lastPhylacteryHit = game?.cycle.elapsed ?? 0));
  events.on('run:lost', (outcome) => {
    endScreen.open(outcome);
    pause.pause('menu');
    input.clearAll();
  });
  titleScreen.close();
  endScreen.close();
  pause.resume('menu');
  pause.resume('auto');
  loop.reset();
  input.clearAll();
  debugPanel?.setSeed(seed);
}

function openTitle(): void {
  game = undefined;
  effects.detach();
  endScreen.close();
  equipmentScreen.close();
  titleScreen.open('title', performance.now());
  pause.pause('menu');
}

function openPauseScreen(): void {
  titleScreen.open('pause', performance.now());
  pause.pause('menu');
  input.clearAll();
}

function applyMenuResult(result: MenuResult | undefined): void {
  if (result === 'resume') {
    titleScreen.close();
    pause.resume('menu');
  } else if (result === 'newGame' || result === 'abandon') {
    startRun();
  }
}

/** Turns a raw key or button press into a menu input, if it is one. */
function toMenuPress(press: { key?: string; button?: number }): MenuPress | undefined {
  if (press.button === 0) return { kind: 'click', at: { ...input.mouse } };
  if (press.key === undefined) return undefined;
  if (keys.menuPrev.has(press.key)) return { kind: 'prev' };
  if (keys.menuNext.has(press.key)) return { kind: 'next' };
  if (keys.menuLeft.has(press.key)) return { kind: 'left' };
  if (keys.menuRight.has(press.key)) return { kind: 'right' };
  if (keys.menuConfirm.has(press.key)) return { kind: 'confirm' };
  if (keys.pause.has(press.key)) return { kind: 'back' };
  return undefined;
}

input.interceptPress = (press) => {
  // While a screen is open, every press goes to it and never reaches the game.
  if (endScreen.isOpen) {
    const menuPress = toMenuPress(press);
    if (menuPress && endScreen.handle(menuPress) === 'title') openTitle();
    return true;
  }
  if (titleScreen.isOpen) {
    const menuPress = toMenuPress(press);
    if (menuPress) applyMenuResult(titleScreen.handle(menuPress));
    return true;
  }
  if (equipmentScreen.isOpen) {
    // Tab or Esc closes it; everything else is swallowed while it is open.
    if (press.key !== undefined && (keys.equipment.has(press.key) || keys.pause.has(press.key))) {
      equipmentScreen.close();
      pause.resume('menu');
    }
    return true;
  }
  // The press that resumes from auto-pause is consumed, so it does nothing else.
  if (pause.resume('auto')) return true;
  if (!game) return false;
  // Debug: a left click spawns the chosen enemy at the cursor instead of acting in the game.
  const settings = debugPanel?.settings;
  if (settings?.clickSpawn && press.button === 0) {
    camera.centerOn(game.player.x, game.player.y);
    const at = camera.screenToWorld(input.mouse.x, input.mouse.y);
    game.spawnEnemy(settings.spawnType, at.x, at.y, settings.spawnElite);
    return true;
  }
  // In build mode, Esc, Tab, and E (as well as B) just leave build mode.
  if (buildMode.active && press.key !== undefined && (keys.pause.has(press.key) || keys.equipment.has(press.key) || keys.harvest.includes(press.key))) {
    buildMode.active = false;
    lastPaintKey = undefined;
    return true;
  }
  if (press.key !== undefined && keys.pause.has(press.key) && runActive()) {
    openPauseScreen();
    return true;
  }
  if (press.key !== undefined && keys.equipment.has(press.key) && runActive()) {
    equipmentScreen.open();
    pause.pause('menu');
    input.clearAll();
    return true;
  }
  // Build mode (section 8.4 / 10.2): B toggles, 1–8 pick, RMB removes the building under the cursor.
  if (press.key !== undefined && keys.build.has(press.key) && runActive()) {
    buildMode.toggle();
    lastPaintKey = undefined;
    return true;
  }
  if (buildMode.active && press.key !== undefined && keys.buildSlots.includes(press.key)) {
    buildMode.select(keys.buildSlots.indexOf(press.key));
    return true;
  }
  if (buildMode.active && chainButtons.includes(press.button ?? -1)) {
    const at = cursorWorld();
    const building = game.buildingAtTile(Math.floor(at.x), Math.floor(at.y));
    if (building) game.removeBuilding(building.id);
    return true;
  }
  return false;
};

/** The cursor in world tiles (camera centered on the player, as during a tick). */
function cursorWorld(): { x: number; y: number } {
  if (game) camera.centerOn(game.player.x, game.player.y);
  return camera.screenToWorld(input.mouse.x, input.mouse.y);
}

/** Where the build ghost sits for the current choice. */
function ghostFootprint(choice: BuildChoice) {
  const info = choiceInfo(choice);
  return footprintAtCursor(cursorWorld(), info.w, info.h);
}

/** Why the current build choice cannot go at the ghost, or undefined. */
function ghostProblem(run: Game, choice: BuildChoice, fp: { x: number; y: number }): string | undefined {
  return choice === 'marsh' || choice === 'fill' ? run.editProblem(choice, fp.x, fp.y) : run.buildProblem(choice, fp.x, fp.y);
}

/** Holding LMB in build mode places at each new tile the cursor crosses (paint walls, marsh...). */
function paintBuild(run: Game): void {
  const choice = buildMode.choice;
  const fp = ghostFootprint(choice);
  const k = `${choice}:${fp.x},${fp.y}`;
  if (k === lastPaintKey) return;
  lastPaintKey = k;
  if (choice === 'marsh' || choice === 'fill') run.editTerrain(choice, fp.x, fp.y);
  else run.placeBuilding(choice, fp.x, fp.y);
}

// Auto-pause (section 8.3): pause when the tab is hidden or the window loses focus.
// It does nothing while a screen is already open (the game is paused anyway).
function autoPause(): void {
  input.clearAll();
  if (!menusOpen() && runActive()) pause.pause('auto');
}

bindInput(input, canvasElement, (x, y) => screen.clientToLogical(x, y), boundKeys(CONTROLS));
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPause();
});

function tick(dt: number): void {
  if (!game) return;
  const start = debugPanel ? performance.now() : 0;
  if (debugPanel) {
    game.director.paused = debugPanel.settings.spawnPaused;
    game.godMode = debugPanel.settings.godMode;
  }

  // In build mode the mouse builds instead of casting.
  const leftHeld = boltButtons.some((b) => input.isButtonDown(b));
  if (buildMode.active && leftHeld) paintBuild(game);
  else lastPaintKey = undefined;

  camera.centerOn(game.player.x, game.player.y);
  game.tick(dt, {
    move: {
      up: input.anyKeyDown(keys.up),
      down: input.anyKeyDown(keys.down),
      left: input.anyKeyDown(keys.left),
      right: input.anyKeyDown(keys.right),
    },
    aim: camera.screenToWorld(input.mouse.x, input.mouse.y),
    bolt: !buildMode.active && leftHeld,
    chain: !buildMode.active && chainButtons.some((b) => input.wasButtonPressed(b)),
    harvest: input.anyKeyDown(keys.harvest) || keys.harvest.some((k) => input.wasKeyPressed(k)),
    mend: keys.mend.some((k) => input.wasKeyPressed(k)),
    repair: input.anyKeyDown(keys.repair),
  });
  effects.advance(dt);
  resourceHud.advance(dt);
  input.endTick();

  debugPanel?.recordTick(performance.now() - start);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function drawRun(run: Game): void {
  const alpha = loop.alpha;
  const { player } = run;
  const x = lerp(player.prevX, player.x, alpha);
  const y = lerp(player.prevY, player.y, alpha);
  camera.centerOn(x, y);
  const ctx = screen.ctx;
  const time = run.cycle.elapsed;

  drawTerrain(ctx, camera, run.map);
  drawPhylactery(ctx, camera, run.phylactery.footprint);
  // Only the newest N corpses are drawn (Settings → Corpse render count). Older ones still exist.
  for (const c of corpsesToDraw(run.corpses, settingsPanel.settings.corpseRenderCount)) {
    drawCorpse(ctx, camera, ENEMIES[c.enemyType], c.elite, c.x, c.y, c.heading, corpseOpacity(c, time));
  }
  for (const b of run.buildingsById.values()) drawBuilding(ctx, camera, b.kind, b.footprint, b.def.color, b.def.label);
  for (const e of run.enemies) {
    drawEnemy(ctx, camera, e.def, e.elite, lerp(e.prevX, e.x, alpha), lerp(e.prevY, e.y, alpha), e.heading, time);
  }
  effects.drawWorld(ctx, camera);
  for (const b of run.projectiles) {
    drawBolt(ctx, camera, lerp(b.prevX, b.x, alpha), lerp(b.prevY, b.y, alpha), b.prevX, b.prevY, b.source === 'totem' ? TOTEM.boltColor : undefined);
  }
  const blink = player.invulnerable > 0 && Math.floor(player.invulnerable / 0.08) % 2 === 0;
  drawPlayer(ctx, camera, x, y, player.facing, blink);

  const me = camera.worldToScreen(x, y);
  const lights = [{ x: me.x, y: me.y, radius: LIGHTING.playerLightRadius * TILE_SIZE }];
  for (const l of run.lanterns()) {
    const p = camera.worldToScreen(l.x, l.y);
    lights.push({ x: p.x, y: p.y, radius: LANTERN.lightRadius * TILE_SIZE });
  }
  lighting.draw(ctx, run.cycle.nightBlend, lights);

  const settings = debugPanel?.settings;
  if (settings && settings.flowOverlay !== 'off') drawFlowField(ctx, camera, run.fields.field(settings.flowOverlay));

  // HUD over the world.
  for (const e of run.enemies) {
    const p = camera.worldToScreen(lerp(e.prevX, e.x, alpha), lerp(e.prevY, e.y, alpha));
    drawHealthBar(ctx, p.x, p.y - e.def.drawSize * TILE_SIZE, 1, e.hp, e.maxHp);
  }
  for (const b of run.buildingsById.values()) {
    const top = camera.worldToScreen(b.footprint.x + b.footprint.w / 2, b.footprint.y);
    drawHealthBar(ctx, top.x, top.y, b.footprint.w, b.hp, b.maxHp);
  }
  const repair = run.repairCandidate();
  if (repair && !run.harvest) {
    const top = camera.worldToScreen(repair.footprint.x + repair.footprint.w / 2, repair.footprint.y);
    const keyLabel = CONTROLS.find((c) => c.action === 'repair')?.label ?? 'R';
    drawRepairPrompt(ctx, top.x, top.y, keyLabel, costText(repairCostToFull(repair.target, repair.cost)));
  }
  if (buildMode.active) {
    const choice = buildMode.choice;
    const fp = ghostFootprint(choice);
    camera.centerOn(x, y);
    drawGhost(ctx, camera.worldToScreen(fp.x, fp.y), fp, choiceInfo(choice), ghostProblem(run, choice, fp));
  }
  const target = run.harvest?.corpse ?? run.harvestCandidate();
  if (target) {
    const p = camera.worldToScreen(target.x, target.y);
    const keyLabel = CONTROLS.find((c) => c.action === 'harvest')?.label ?? 'E';
    drawHarvestPrompt(ctx, p.x, p.y, keyLabel, run.harvest ? run.harvest.progress / run.harvest.duration : undefined);
  }
  effects.drawOverlay(ctx, camera);
  drawCrescents(ctx, me.x, me.y, player);
  drawSpellBar(ctx, me.x, me.y, spellIcons(player, run.resources.get('flesh')));
  drawDayRing(ctx, run.cycle.state);
  drawPhylacteryPanel(ctx, run.phylactery.hp, run.phylactery.maxHp);
  const arrow = edgeArrowPosition(camera.worldToScreen(run.phylactery.center.x, run.phylactery.center.y));
  if (arrow) drawEdgeArrow(ctx, arrow, time - lastPhylacteryHit < 2, performance.now());
  if (buildMode.active) drawHotbar(ctx, buildMode, (cost) => run.resources.canAfford(cost));
  const amount = (id: ResourceId) => run.resources.get(id);
  resourceHud.draw(ctx, amount, equipmentScreen.isOpen || run.nearAltar());
  if (settings?.spawnOverlay) drawSpawnInset(ctx, run);
  if (equipmentScreen.isOpen) {
    equipmentScreen.draw(ctx, amount);
    resourceHud.draw(ctx, amount, true);
  }
}

function render(now: number): void {
  const ctx = screen.ctx;
  screen.beginFrame();
  // The world shows behind the pause screen and the end screen, not behind the title screen.
  if (game && !(titleScreen.isOpen && titleScreen.mode === 'title')) drawRun(game);
  if (endScreen.isOpen) endScreen.draw(ctx);
  if (titleScreen.isOpen) {
    titleScreen.hover(input.mouse);
    titleScreen.draw(ctx, now, game?.seed);
  }
  if (pause.has('auto') && !menusOpen()) drawAutoPauseOverlay(ctx);
  screen.endFrame();
}

let lastTime = performance.now();
function frame(now: number): void {
  const elapsed = (now - lastTime) / 1000;
  lastTime = now;
  if (!pause.isPaused) loop.advance(elapsed, tick);
  render(now);
  debugPanel?.recordFrame(now);
  requestAnimationFrame(frame);
}

openTitle();
requestAnimationFrame(frame);

// With ?debug, expose internals for inspection from the browser console.
if (debugEnabled) {
  Object.assign(window, {
    necrogrid: {
      input,
      pause,
      loop,
      camera,
      titleScreen,
      endScreen,
      debug: debugPanel,
      startRun,
      get game() {
        return game;
      },
    },
  });
}
