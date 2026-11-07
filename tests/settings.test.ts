import { describe, expect, it } from 'vitest';
import { defaultSettings, loadSettings, sanitizeSettings, saveSettings, SettingsPanel, type Settings } from '../src/ui/settings';
import { TitleScreen } from '../src/ui/titleScreen';

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe('settings values', () => {
  it('defaults to 300 corpses, 70% volume, shake and damage numbers on', () => {
    expect(defaultSettings()).toEqual({ corpseRenderCount: 300, masterVolume: 70, screenShake: true, damageNumbers: true });
  });

  it('clamps and rounds bad values, keeping the good ones', () => {
    expect(sanitizeSettings({ corpseRenderCount: 5000, masterVolume: 33, screenShake: 'yes', damageNumbers: false })).toEqual({
      corpseRenderCount: 1000,
      masterVolume: 30,
      screenShake: true,
      damageNumbers: false,
    });
    expect(sanitizeSettings(null)).toEqual(defaultSettings());
  });

  it('saves and loads through storage, and falls back to defaults when storage fails', () => {
    const storage = memoryStorage();
    const custom: Settings = { corpseRenderCount: 100, masterVolume: 20, screenShake: false, damageNumbers: false };
    expect(saveSettings(storage, custom)).toBe(true);
    expect(loadSettings(storage)).toEqual(custom);
    expect(loadSettings(undefined)).toEqual(defaultSettings());
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadSettings(broken)).toEqual(defaultSettings());
    expect(saveSettings(broken, custom)).toBe(false);
    storage.setItem('necrogrid.settings', '{not json');
    expect(loadSettings(storage)).toEqual(defaultSettings());
  });
});

describe('SettingsPanel', () => {
  it('changes numbers in steps with Left/Right and toggles with Enter, reporting each change', () => {
    const changes: Settings[] = [];
    const panel = new SettingsPanel(defaultSettings(), (s) => changes.push(s));
    panel.handle({ kind: 'right' });
    expect(panel.settings.corpseRenderCount).toBe(350);
    panel.handle({ kind: 'next' });
    panel.handle({ kind: 'left' });
    expect(panel.settings.masterVolume).toBe(60);
    panel.handle({ kind: 'next' });
    panel.handle({ kind: 'next' });
    panel.handle({ kind: 'confirm' });
    expect(panel.settings.damageNumbers).toBe(false);
    expect(changes).toHaveLength(3);
  });

  it('stops at the range limits', () => {
    const panel = new SettingsPanel({ ...defaultSettings(), corpseRenderCount: 50 }, () => {});
    panel.handle({ kind: 'left' });
    expect(panel.settings.corpseRenderCount).toBe(50);
  });

  it('goes back on Esc or the Back button', () => {
    const panel = new SettingsPanel(defaultSettings(), () => {});
    expect(panel.handle({ kind: 'back' })).toBe('back');
    for (let i = 0; i < 4; i++) panel.handle({ kind: 'next' });
    expect(panel.handle({ kind: 'confirm' })).toBe('back');
  });

  it('opens from the title screen and returns to its menu', () => {
    const panel = new SettingsPanel(defaultSettings(), () => {});
    const screen = new TitleScreen(panel);
    screen.open('title', 0);
    screen.handle({ kind: 'next' });
    screen.handle({ kind: 'confirm' });
    expect(screen.view).toBe('settings');
    screen.handle({ kind: 'right' });
    expect(panel.settings.corpseRenderCount).toBe(350);
    screen.handle({ kind: 'back' });
    expect(screen.view).toBe('menu');
  });
});
