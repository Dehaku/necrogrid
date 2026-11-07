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
import { drawBolt, drawEnemy, drawPhylactery, drawPlayer, drawTerrain } from './render/sprites';
import { EndScreen } from './ui/endScreen';
import { drawHealthBar } from './ui/healthBars';
import { drawCrescents, drawDayRing, drawSpellBar, spellIcons } from './ui/hud';
import type { MenuPress } from './ui/menuWidgets';
import { drawAutoPauseOverlay } from './ui/pauseOverlay';
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
const titleScreen = new TitleScreen();
const endScreen = new EndScreen();

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
  menuConfirm: new Set(keysForAction(CONTROLS, 'menuConfirm')),
};
const boltButtons = buttonsForAction(CONTROLS, 'bolt');
const chainButtons = buttonsForAction(CONTROLS, 'chain');

const debugPanel = debugEnabled
  ? new DebugPanel({
      loop,
      cycle: () => game?.cycle,
      seed: () => game?.seed,
      restartWithSeed: (seed) => startRun(seed),
      entityCounts: () =>
        game ? { chunks: game.map.chunkCount, enemies: game.enemies.length, bolts: game.projectiles.length, ...game.enemyCounts() } : {},
      extraReadout: () =>
        game
          ? [
              `Player HP ${game.player.hp.toFixed(0)} / ${game.player.maxHp}  mana ${game.player.mana.toFixed(0)}`,
              `Phylactery ${game.phylactery.hp.toFixed(0)} / ${game.phylactery.maxHp}`,
              `Kills ${game.kills}  score ${game.score}`,
              `Budget ${game.director.budget.toFixed(2)}  next pack ${game.director.pendingPackSize ?? '-'}`,
            ]
          : [],
    })
  : undefined;

function runActive(): boolean {
  return game !== undefined && game.outcome === undefined;
}

function menusOpen(): boolean {
  return titleScreen.isOpen || endScreen.isOpen;
}

function startRun(seed: number = newRunSeed(location.search)): void {
  const events = new EventBus<GameEvents>();
  game = new Game(seed, events);
  effects.attach(events);
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
  if (press.key !== undefined && keys.pause.has(press.key) && runActive()) {
    openPauseScreen();
    return true;
  }
  return false;
};

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

  camera.centerOn(game.player.x, game.player.y);
  game.tick(dt, {
    move: {
      up: input.anyKeyDown(keys.up),
      down: input.anyKeyDown(keys.down),
      left: input.anyKeyDown(keys.left),
      right: input.anyKeyDown(keys.right),
    },
    aim: camera.screenToWorld(input.mouse.x, input.mouse.y),
    bolt: boltButtons.some((b) => input.isButtonDown(b)),
    chain: chainButtons.some((b) => input.wasButtonPressed(b)),
  });
  effects.advance(dt);
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
  for (const e of run.enemies) {
    drawEnemy(ctx, camera, e.def, e.elite, lerp(e.prevX, e.x, alpha), lerp(e.prevY, e.y, alpha), e.heading, time);
  }
  effects.drawWorld(ctx, camera);
  for (const b of run.projectiles) drawBolt(ctx, camera, lerp(b.prevX, b.x, alpha), lerp(b.prevY, b.y, alpha), b.prevX, b.prevY);
  const blink = player.invulnerable > 0 && Math.floor(player.invulnerable / 0.08) % 2 === 0;
  drawPlayer(ctx, camera, x, y, player.facing, blink);

  const me = camera.worldToScreen(x, y);
  lighting.draw(ctx, run.cycle.nightBlend, [{ x: me.x, y: me.y, radius: LIGHTING.playerLightRadius * TILE_SIZE }]);

  const settings = debugPanel?.settings;
  if (settings && settings.flowOverlay !== 'off') drawFlowField(ctx, camera, run.fields.field(settings.flowOverlay));

  // HUD over the world.
  for (const e of run.enemies) {
    const p = camera.worldToScreen(lerp(e.prevX, e.x, alpha), lerp(e.prevY, e.y, alpha));
    drawHealthBar(ctx, p.x, p.y - e.def.drawSize * TILE_SIZE, 1, e.hp, e.maxHp);
  }
  effects.drawOverlay(ctx, camera);
  drawCrescents(ctx, me.x, me.y, player);
  drawSpellBar(ctx, me.x, me.y, spellIcons(player));
  drawDayRing(ctx, run.cycle.state);
  if (settings?.spawnOverlay) drawSpawnInset(ctx, run);
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
