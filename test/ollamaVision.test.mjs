import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { supportsVision, dropImagesUnlessVision } = require('../src/features/common/ai/providers/ollamaVision');

describe('supportsVision', () => {
    it('reads the capabilities list from /api/show', () => {
        expect(supportsVision({ capabilities: ['completion', 'vision'] })).toBe(true);
        expect(supportsVision({ capabilities: ['completion', 'tools'] })).toBe(false);
    });

    it('is unknown (null) when the server does not report capabilities', () => {
        expect(supportsVision({})).toBeNull();
        expect(supportsVision(null)).toBeNull();
    });
});

describe('dropImagesUnlessVision', () => {
    const msgs = [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'look', images: ['aGVsbG8='] },
    ];

    it('removes images for a model without vision and reports how many', () => {
        const { messages, dropped } = dropImagesUnlessVision(msgs, false);
        expect(dropped).toBe(1);
        expect(messages[1]).toEqual({ role: 'user', content: 'look' });
        expect(msgs[1].images).toHaveLength(1); // input untouched
    });

    it('keeps images when vision is supported or unknown', () => {
        expect(dropImagesUnlessVision(msgs, true).dropped).toBe(0);
        expect(dropImagesUnlessVision(msgs, null).dropped).toBe(0);
        expect(dropImagesUnlessVision(msgs, true).messages[1].images).toEqual(['aGVsbG8=']);
    });
});
