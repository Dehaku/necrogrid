// Key bindings and their labels. Data only.
// Input handling, the build hotbar, and the controls panel all read from this list
// (GAME_DESIGN.md section 8). Keys are KeyboardEvent.code values; mouse buttons are
// MouseEvent.button values (0 = left, 2 = right).

export type ControlAction =
  | 'moveUp'
  | 'moveLeft'
  | 'moveDown'
  | 'moveRight'
  | 'aim'
  | 'bolt'
  | 'chain'
  | 'mend'
  | 'harvest'
  | 'repair'
  | 'build'
  | 'buildSlot'
  | 'craft'
  | 'equipment'
  | 'pause'
  | 'debug'
  | 'menuPrev'
  | 'menuNext'
  | 'menuLeft'
  | 'menuRight'
  | 'menuConfirm';

export interface ControlBinding {
  readonly action: ControlAction;
  readonly keys: readonly string[];
  readonly mouseButtons: readonly number[];
  /** Short key label for the controls panel, e.g. "W" or "LMB". */
  readonly label: string;
  readonly description: string;
  /** Menu navigation: not listed in the controls panel. */
  readonly menuOnly?: true;
}

export const CONTROLS: readonly ControlBinding[] = [
  { action: 'moveUp', keys: ['KeyW'], mouseButtons: [], label: 'W', description: 'Move' },
  { action: 'moveLeft', keys: ['KeyA'], mouseButtons: [], label: 'A', description: 'Move' },
  { action: 'moveDown', keys: ['KeyS'], mouseButtons: [], label: 'S', description: 'Move' },
  { action: 'moveRight', keys: ['KeyD'], mouseButtons: [], label: 'D', description: 'Move' },
  { action: 'aim', keys: [], mouseButtons: [], label: 'Mouse', description: 'Aim' },
  { action: 'bolt', keys: [], mouseButtons: [0], label: 'LMB', description: 'Cast Bolt (hold)' },
  { action: 'chain', keys: [], mouseButtons: [2], label: 'RMB', description: 'Cast Chain' },
  { action: 'mend', keys: ['KeyQ'], mouseButtons: [], label: 'Q', description: 'Mend' },
  { action: 'harvest', keys: ['KeyE'], mouseButtons: [], label: 'E', description: 'Harvest (hold to auto-harvest)' },
  { action: 'repair', keys: ['KeyR'], mouseButtons: [], label: 'R', description: 'Repair (hold)' },
  { action: 'build', keys: ['KeyB'], mouseButtons: [], label: 'B', description: 'Build mode' },
  {
    action: 'buildSlot',
    keys: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'],
    mouseButtons: [],
    label: '1–8',
    description: 'Select building / Marsh / Fill',
  },
  { action: 'craft', keys: ['KeyC'], mouseButtons: [], label: 'C', description: 'Crafting' },
  { action: 'equipment', keys: ['Tab'], mouseButtons: [], label: 'Tab', description: 'Equipment' },
  { action: 'pause', keys: ['Escape'], mouseButtons: [], label: 'Esc', description: 'Pause' },
  { action: 'debug', keys: ['Backquote'], mouseButtons: [], label: '`', description: 'Debug panel (?debug only)' },
  {
    action: 'menuPrev', keys: ['ArrowUp', 'KeyW'], mouseButtons: [], label: '↑',
    description: 'Previous menu item', menuOnly: true,
  },
  {
    action: 'menuNext', keys: ['ArrowDown', 'KeyS'], mouseButtons: [], label: '↓',
    description: 'Next menu item', menuOnly: true,
  },
  {
    action: 'menuLeft', keys: ['ArrowLeft', 'KeyA'], mouseButtons: [], label: '←',
    description: 'Decrease a setting / left choice', menuOnly: true,
  },
  {
    action: 'menuRight', keys: ['ArrowRight', 'KeyD'], mouseButtons: [], label: '→',
    description: 'Increase a setting / right choice', menuOnly: true,
  },
  {
    action: 'menuConfirm', keys: ['Enter', 'NumpadEnter', 'Space'], mouseButtons: [], label: 'Enter',
    description: 'Choose menu item', menuOnly: true,
  },
];
