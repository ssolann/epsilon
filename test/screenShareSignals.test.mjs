import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseAttributionLine, isScreenShare, hasShareProcess } = require('../src/features/common/services/screenShareSignals');

const LINE = (list) => `2026-11-11 01:40:00.000 Df ControlCenter[592:8bbd2] [com.apple.controlcenter:sensor-indicators] Active activity attributions changed to [${list}]`;

describe('parseAttributionLine', () => {
    it('parses a list of quoted attributions', () => {
        expect(parseAttributionLine(LINE('"mic:node", "screen:us.zoom.xos"'))).toEqual(['mic:node', 'screen:us.zoom.xos']);
    });

    it('returns an empty list for an empty change and null for unrelated lines', () => {
        expect(parseAttributionLine(LINE(''))).toEqual([]);
        expect(parseAttributionLine('Sorted active attributions from SystemStatus update: []')).toBeNull();
        expect(parseAttributionLine(null)).toBeNull();
    });
});

describe('isScreenShare', () => {
    it('is true for a screen attribution from another app', () => {
        expect(isScreenShare(['mic:node', 'screen:us.zoom.xos'])).toBe(true);
        expect(isScreenShare(['screencapture:com.google.Chrome'])).toBe(true);
    });

    it('ignores mic, camera and location', () => {
        expect(isScreenShare(['mic:node', 'cam:us.zoom.xos', 'loc:com.apple.Maps'])).toBe(false);
        expect(isScreenShare([])).toBe(false);
    });

    it('ignores our own app', () => {
        expect(isScreenShare(['screen:com.epsilon.app'], { ignoreBundles: ['com.epsilon.app'] })).toBe(false);
        expect(isScreenShare(['screen:com.epsilon.app', 'screen:us.zoom.xos'], { ignoreBundles: ['com.epsilon.app'] })).toBe(true);
    });
});

describe('hasShareProcess', () => {
    it('matches Zoom share helpers case-insensitively', () => {
        expect(hasShareProcess(['zoom.us', 'CptHost'])).toBe(true);
        expect(hasShareProcess(['zoom.us', 'Finder'])).toBe(false);
    });
});
