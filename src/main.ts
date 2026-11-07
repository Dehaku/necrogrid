// Boot: the browser side. Creates the canvas, input, loop, and a Game, and draws each frame.

import { CONTROLS } from './data/controls';
import { LIGHTING } from './data/time';
import { MAX_FRAME_TIME, TICK_RATE, TILE_SIZE } from './data/tuning';
import { EventBus, type GameEvents } from './core/events';
import { bindInput, boundKeys, Input, keysForAction } from './core/input';
import { FixedStepLoop, PauseState } from './core/loop';
import { newRunSeed } from './core/rng';
import { DebugPanel } from './debug/debugPanel';
import { drawFlowField, drawSpawnInset } from './debug/overlays';
import { Game } from './game';
import { Camera } from './render/camera';
import { GameCanvas } from './render/canvas';
import { Lighting } from './render/lighting';
import { drawEnemy, drawPhylactery, drawPlayer, drawTerrain } from './render/sprites';
import { drawDayRing } from './ui/hud';
import { drawAutoPauseOverlay } from './ui/pauseOverlay';

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
if (!canvasElement) throw new Error('Missing #game canvas');

const debugEnabled = new URLSearchParams(location.search).has('debug');

const screen = new GameCanvas(canvasElement);
const lighting = new Lighting();
const events = new EventBus<GameEvents>();
const input = new Input();
const loop = new FixedStepLoop({ tickRate: TICK_RATE, maxFrameTime: MAX_FRAME_TIME });
const pause = new PauseState();
const camera = new Camera();
const game = new Game(newRunSeed(location.search), events);

const moveKeys = {
  up: keysForAction(CONTROLS, 'moveUp'),
  down: keysForAction(CONTROLS, 'moveDown'),
  left: keysForAction(CONTROLS, 'moveLeft'),
  right: keysForAction(CONTROLS, 'moveRight'),
};

const debugPanel = debugEnabled
  ? new DebugPanel({
      loop,
      cycle: game.cycle,
      seed: game.seed,
      restartWithSeed: (seed) => {
        const params = new URLSearchParams(location.search);
        params.set('seed', String(seed));
        location.search = params.toString();
      },
      entityCounts: () => ({ chunks: game.map.chunkCount, enemies: game.enemies.length, ...game.enemyCounts() }),
      extraReadout: () => [
        `Player HP ${game.player.hp.toFixed(0)} / ${game.player.maxHp}`,
        `Phylactery ${game.phylactery.hp.toFixed(0)} / ${game.phylactery.maxHp}`,
        `Budget ${game.director.budget.toFixed(2)}  next pack ${game.director.pendingPackSize ?? '-'}`,
      ],
    })
  : undefined;

// Auto-pause (section 8.3): pause when the tab is hidden or the window loses focus.
function autoPause(): void {
  input.clearAll();
  if (pause.pause('auto')) events.emit('game:paused', { reason: 'auto' });
}

input.interceptPress = (press) => {
  // The press that resumes from auto-pause is consumed, so it does nothing else.
  if (pause.resume('auto')) {
    events.emit('game:resumed', { reason: 'auto' });
    return true;
  }
  // Debug: a left click spawns the chosen enemy at the cursor instead of acting in the game.
  const settings = debugPanel?.settings;
  if (settings?.clickSpawn && press.button === 0) {
    camera.centerOn(game.player.x, game.player.y);
    const at = camera.screenToWorld(input.mouse.x, input.mouse.y);
    game.spawnEnemy(settings.spawnType, at.x, at.y, settings.spawnElite);
    return true;
  }
  return false;
};

bindInput(input, canvasElement, (x, y) => screen.clientToLogical(x, y), boundKeys(CONTROLS));
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPause();
});

function tick(dt: number): void {
  const start = debugPanel ? performance.now() : 0;
  if (debugPanel) game.director.paused = debugPanel.settings.spawnPaused;

  camera.centerOn(game.player.x, game.player.y);
  game.tick(dt, {
    move: {
      up: input.anyKeyDown(moveKeys.up),
      down: input.anyKeyDown(moveKeys.down),
      left: input.anyKeyDown(moveKeys.left),
      right: input.anyKeyDown(moveKeys.right),
    },
    aim: camera.screenToWorld(input.mouse.x, input.mouse.y),
  });
  input.endTick();

  debugPanel?.recordTick(performance.now() - start);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function render(): void {
  const alpha = loop.alpha;
  const { player } = game;
  const x = lerp(player.prevX, player.x, alpha);
  const y = lerp(player.prevY, player.y, alpha);
  camera.centerOn(x, y);
  const ctx = screen.ctx;

  screen.beginFrame();
  drawTerrain(ctx, camera, game.map);
  drawPhylactery(ctx, camera, game.phylactery.footprint);
  const time = game.cycle.elapsed;
  for (const e of game.enemies) {
    drawEnemy(ctx, camera, e.def, e.elite, lerp(e.prevX, e.x, alpha), lerp(e.prevY, e.y, alpha), e.heading, time);
  }
  drawPlayer(ctx, camera, x, y, player.facing);

  const playerScreen = camera.worldToScreen(x, y);
  lighting.draw(ctx, game.cycle.nightBlend, [
    { x: playerScreen.x, y: playerScreen.y, radius: LIGHTING.playerLightRadius * TILE_SIZE },
  ]);

  const settings = debugPanel?.settings;
  if (settings && settings.flowOverlay !== 'off') drawFlowField(ctx, camera, game.fields.field(settings.flowOverlay));

  drawDayRing(ctx, game.cycle.state);
  if (settings?.spawnOverlay) drawSpawnInset(ctx, game);
  if (pause.has('auto')) drawAutoPauseOverlay(ctx);
  screen.endFrame();
}

let lastTime = performance.now();
function frame(now: number): void {
  const elapsed = (now - lastTime) / 1000;
  lastTime = now;
  if (!pause.isPaused) loop.advance(elapsed, tick);
  render();
  debugPanel?.recordFrame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// With ?debug, expose internals for inspection from the browser console.
if (debugEnabled) {
  Object.assign(window, { necrogrid: { input, pause, loop, camera, events, game, debug: debugPanel } });
}
