// Boot: creates the systems, wires them together, and runs the loop.

import { CONTROLS } from './data/controls';
import { CHUNK_GENERATION_RADIUS } from './data/terrain';
import { MAX_FRAME_TIME, PLAYER, TICK_RATE } from './data/tuning';
import { EventBus, type GameEvents } from './core/events';
import { bindInput, boundKeys, Input, keysForAction } from './core/input';
import { FixedStepLoop, PauseState } from './core/loop';
import { newRunSeed } from './core/rng';
import { createPlayer, updatePlayer, type PlayerTerrain } from './entities/player';
import { Camera } from './render/camera';
import { GameCanvas } from './render/canvas';
import { drawPlayer, drawTerrain } from './render/sprites';
import { drawAutoPauseOverlay } from './ui/pauseOverlay';
import { ChunkMap } from './world/chunks';
import { isWalkableTile, playerSpeedMultiplier } from './world/grid';

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
if (!canvasElement) throw new Error('Missing #game canvas');

const screen = new GameCanvas(canvasElement);
const events = new EventBus<GameEvents>();
const input = new Input();
const loop = new FixedStepLoop({ tickRate: TICK_RATE, maxFrameTime: MAX_FRAME_TIME });
const pause = new PauseState();
const camera = new Camera();
const player = createPlayer(PLAYER.startTile.x, PLAYER.startTile.y);
const map = new ChunkMap(newRunSeed(location.search));

const playerTerrain: PlayerTerrain = {
  speedMultiplierAt: (x, y) => playerSpeedMultiplier(map.getTile(Math.floor(x), Math.floor(y))),
  isBlocked: (tx, ty) => !isWalkableTile(map.getTile(tx, ty)),
};

function generateChunksAroundPlayer(): void {
  for (const chunk of map.ensureAround(player.x, player.y, CHUNK_GENERATION_RADIUS)) {
    events.emit('chunk:generated', { chunkX: chunk.chunkX, chunkY: chunk.chunkY });
  }
}
generateChunksAroundPlayer();

const moveKeys = {
  up: keysForAction(CONTROLS, 'moveUp'),
  down: keysForAction(CONTROLS, 'moveDown'),
  left: keysForAction(CONTROLS, 'moveLeft'),
  right: keysForAction(CONTROLS, 'moveRight'),
};

// Auto-pause (section 8.3): pause when the tab is hidden or the window loses focus.
function autoPause(): void {
  input.clearAll();
  if (pause.pause('auto')) events.emit('game:paused', { reason: 'auto' });
}

// The press that resumes from auto-pause is consumed, so it does nothing else.
input.interceptPress = () => {
  if (!pause.resume('auto')) return false;
  events.emit('game:resumed', { reason: 'auto' });
  return true;
};

bindInput(input, canvasElement, (x, y) => screen.clientToLogical(x, y), boundKeys(CONTROLS));
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPause();
});

function tick(dt: number): void {
  camera.centerOn(player.x, player.y);
  const aim = camera.screenToWorld(input.mouse.x, input.mouse.y);
  updatePlayer(
    player,
    {
      up: input.anyKeyDown(moveKeys.up),
      down: input.anyKeyDown(moveKeys.down),
      left: input.anyKeyDown(moveKeys.left),
      right: input.anyKeyDown(moveKeys.right),
    },
    aim,
    dt,
    playerTerrain,
  );
  generateChunksAroundPlayer();
  input.endTick();
}

function render(): void {
  const alpha = loop.alpha;
  const x = player.prevX + (player.x - player.prevX) * alpha;
  const y = player.prevY + (player.y - player.prevY) * alpha;
  camera.centerOn(x, y);

  screen.beginFrame();
  drawTerrain(screen.ctx, camera, map);
  drawPlayer(screen.ctx, camera, x, y, player.facing);
  if (pause.has('auto')) drawAutoPauseOverlay(screen.ctx);
  screen.endFrame();
}

let lastTime = performance.now();
function frame(now: number): void {
  const elapsed = (now - lastTime) / 1000;
  lastTime = now;
  if (!pause.isPaused) loop.advance(elapsed, tick);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// With ?debug, expose internals for inspection from the browser console.
if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { necrogrid: { input, pause, player, loop, camera, events, map } });
}
