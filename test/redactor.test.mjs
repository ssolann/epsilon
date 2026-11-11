import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createRedactionState, redactText, redactMessages, createRehydrator, summarize } = require('../src/features/common/privacy/redactor');

describe('redactText detectors', () => {
    it('redacts a valid Canadian SIN and leaves a Luhn-invalid 9-digit number alone', () => {
        const state = createRedactionState();
        const r = redactText('SIN 046 454 286 and ref 123456789', { state });
        expect(r.text).toBe('SIN [SIN_1] and ref 123456789');
        expect(r.hits).toEqual([{ type: 'SIN', token: '[SIN_1]' }]);
    });

    it('redacts card numbers that pass Luhn', () => {
        const state = createRedactionState();
        const r = redactText('card 4111 1111 1111 1111, not 4111 1111 1111 1112', { state });
        expect(r.text).toBe('card [CARD_1], not 4111 1111 1111 1112');
    });

    it('redacts emails and phone numbers', () => {
        const state = createRedactionState();
        const r = redactText('mail jane.doe@example.com or call (416) 555-1234 / 1-604-555-9876', { state });
        expect(r.text).toBe('mail [EMAIL_1] or call [PHONE_1] / [PHONE_2]');
    });

    it('redacts blocked terms case-insensitively on word boundaries', () => {
        const state = createRedactionState();
        const r = redactText('Talk to Jane Doe about Project Falcon; falconry is fine', { state, blockedTerms: ['Jane Doe', 'Falcon'] });
        expect(r.text).toBe('Talk to [TERM_1] about Project [TERM_2]; falconry is fine');
    });

    it('reuses the same token for the same value across calls that share state', () => {
        const state = createRedactionState();
        const a = redactText('a@x.io', { state });
        const b = redactText('again a@x.io and b@x.io', { state });
        expect(a.text).toBe('[EMAIL_1]');
        expect(b.text).toBe('again [EMAIL_1] and [EMAIL_2]');
        expect(state.tokenToValue.get('[EMAIL_2]')).toBe('b@x.io');
    });

    it('passes non-strings through untouched', () => {
        const state = createRedactionState();
        expect(redactText(null, { state }).text).toBeNull();
        expect(redactText(42, { state }).text).toBe(42);
    });
});

describe('redactMessages', () => {
    it('redacts string content and text parts, keeps image parts, reports hits', () => {
        const state = createRedactionState();
        const messages = [
            { role: 'system', content: 'them: my email is a@b.co' },
            { role: 'user', content: [{ type: 'text', text: 'SIN 046 454 286?' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,xxx' } }] },
        ];
        const { messages: out, hits } = redactMessages(messages, { state });
        expect(out[0].content).toBe('them: my email is [EMAIL_1]');
        expect(out[1].content[0].text).toBe('SIN [SIN_1]?');
        expect(out[1].content[1]).toEqual(messages[1].content[1]);
        expect(hits.map(h => h.type).sort()).toEqual(['EMAIL', 'SIN']);
        expect(messages[0].content).toBe('them: my email is a@b.co'); // input not mutated
    });
});

describe('createRehydrator', () => {
    const state = createRedactionState();
    redactText('a@b.co and 046 454 286', { state });

    it('replaces whole tokens in a chunk', () => {
        const r = createRehydrator(state);
        expect(r.push('Send to [EMAIL_1] today') + r.flush()).toBe('Send to a@b.co today');
    });

    it('rehydrates a token split across chunks', () => {
        const r = createRehydrator(state);
        const out = r.push('Your SIN is [SI') + r.push('N_1] and mail [EMA') + r.push('IL_1].') + r.flush();
        expect(out).toBe('Your SIN is 046 454 286 and mail a@b.co.');
    });

    it('does not hold back a bracket that cannot start a token', () => {
        const r = createRehydrator(state);
        expect(r.push('list [1] and [x')).toBe('list [1] and [x');
        expect(r.flush()).toBe('');
    });

    it('leaves unknown tokens as they are', () => {
        const r = createRehydrator(state);
        expect(r.push('[CARD_9]') + r.flush()).toBe('[CARD_9]');
    });
});

describe('summarize', () => {
    it('counts hits by type in a readable sentence', () => {
        expect(summarize([{ type: 'SIN' }, { type: 'EMAIL' }, { type: 'EMAIL' }])).toBe('1 SIN, 2 emails');
        expect(summarize([])).toBe('');
    });
});
