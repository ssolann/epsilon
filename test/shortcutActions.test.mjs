import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { ACTIONS, defaultKeybinds, labelFor, paletteItems, filterActions } = require('../src/features/shortcuts/actions');

describe('ACTIONS table', () => {
    it('every action has an id, label and both platform defaults', () => {
        for (const a of ACTIONS) {
            expect(a.id).toMatch(/^[a-zA-Z]+$/);
            expect(a.label.length).toBeGreaterThan(0);
            expect(a.mac).toMatch(/^Cmd\+/);
            expect(a.win).toMatch(/^Ctrl\+/);
        }
    });

    it('ids are unique', () => {
        const ids = ACTIONS.map(a => a.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('default accelerators are unique per platform', () => {
        for (const platform of ['darwin', 'win32']) {
            const values = Object.values(defaultKeybinds(platform));
            expect(new Set(values).size).toBe(values.length);
        }
    });

    it('keeps the pre-existing action ids so saved keybinds still apply', () => {
        const ids = ACTIONS.map(a => a.id);
        for (const legacy of ['moveUp', 'moveDown', 'moveLeft', 'moveRight', 'toggleVisibility', 'toggleClickThrough',
            'nextStep', 'manualScreenshot', 'previousResponse', 'nextResponse', 'scrollUp', 'scrollDown']) {
            expect(ids).toContain(legacy);
        }
    });
});

describe('defaultKeybinds', () => {
    it('uses Cmd on darwin and Ctrl elsewhere', () => {
        expect(defaultKeybinds('darwin').togglePalette).toBe('Cmd+K');
        expect(defaultKeybinds('win32').togglePalette).toBe('Ctrl+K');
        expect(defaultKeybinds('linux').toggleListen).toBe('Ctrl+L');
    });
});

describe('labelFor', () => {
    it('returns the label, or the id for unknown ids', () => {
        expect(labelFor('toggleListen')).toBe('Start / stop listening');
        expect(labelFor('nope')).toBe('nope');
    });
});

describe('paletteItems', () => {
    it('excludes the palette toggle itself and carries the bound accelerator', () => {
        const items = paletteItems({ nextStep: 'Cmd+Enter', toggleListen: 'Cmd+Shift+L' });
        expect(items.find(i => i.id === 'togglePalette')).toBeUndefined();
        expect(items.find(i => i.id === 'toggleListen').accelerator).toBe('Cmd+Shift+L');
        expect(items.find(i => i.id === 'moveUp').accelerator).toBe('');
    });

    it('keeps table order', () => {
        const ids = paletteItems().map(i => i.id);
        expect(ids.slice(0, 3)).toEqual(['nextStep', 'toggleListen', 'toggleSettings']);
    });
});

describe('filterActions', () => {
    const items = paletteItems();

    it('returns everything for an empty query', () => {
        expect(filterActions(items, '')).toEqual(items);
        expect(filterActions(items, undefined)).toEqual(items);
    });

    it('matches case-insensitively and keeps order', () => {
        const ids = filterActions(items, 'MOVE').map(i => i.id);
        expect(ids).toEqual(['moveUp', 'moveDown', 'moveLeft', 'moveRight']);
    });

    it('requires every word to match', () => {
        expect(filterActions(items, 'move left').map(i => i.id)).toEqual(['moveLeft']);
        expect(filterActions(items, 'move banana')).toEqual([]);
    });
});
