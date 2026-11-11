import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// No Electron in tests: the gateway falls back to defaults, writes no manifest, and has no fallback candidates.
const { wrapLLM, wrapStreamingLLM, prepare, GatewayRefusedError } = require('../src/features/common/ai/gateway');

const fakeLLM = (reply) => {
    const calls = [];
    return {
        calls,
        chat: async (messages) => { calls.push(messages); return { content: reply, raw: {} }; },
    };
};

describe('prepare', () => {
    it('redacts text, classifies pii, drops the screenshot, keeps an allowed provider', async () => {
        const messages = [
            { role: 'system', content: 'them: card 4111 1111 1111 1111' },
            { role: 'user', content: [{ type: 'text', text: 'what is it' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } }] },
        ];
        const prep = await prepare(messages, { purpose: 'ask', provider: 'ollama', model: 'llama3.2:3b' });
        expect(prep.cls).toBe('pii');
        expect(prep.routed).toBe('direct');
        expect(prep.messages[0].content).toBe('them: card [CARD_1]');
        expect(prep.messages[1].content).toEqual([{ type: 'text', text: 'what is it' }]);
        expect(prep.screenshotAttached).toBe(false);
        expect(prep.screenshotSha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('keeps the screenshot for internal payloads', async () => {
        const messages = [{ role: 'user', content: [{ type: 'text', text: 'summarize' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } }] }];
        const prep = await prepare(messages, { purpose: 'ask', provider: 'anthropic', model: 'claude-sonnet-5-5' });
        expect(prep.cls).toBe('internal');
        expect(prep.messages[0].content).toHaveLength(2);
        expect(prep.screenshotAttached).toBe(true);
    });

    it('refuses pii to a cloud provider when no local provider is available', async () => {
        const messages = [{ role: 'user', content: 'email me at a@b.co' }];
        await expect(prepare(messages, { purpose: 'ask', provider: 'anthropic', model: 'x' })).rejects.toBeInstanceOf(GatewayRefusedError);
    });
});

describe('wrapLLM', () => {
    it('sends redacted messages and rehydrates the answer', async () => {
        const llm = fakeLLM('Sure, I will write to [EMAIL_1] about [SIN_1].');
        const wrapped = wrapLLM('ollama', llm, { model: 'llama3.2:3b', purpose: 'summary' });
        const result = await wrapped.chat([{ role: 'user', content: 'mail a@b.co, SIN 046 454 286' }]);
        expect(llm.calls[0][0].content).toBe('mail [EMAIL_1], SIN [SIN_1]');
        expect(result.content).toBe('Sure, I will write to a@b.co about 046 454 286.');
    });

    it('passes clean messages through unchanged', async () => {
        const llm = fakeLLM('ok');
        const wrapped = wrapLLM('anthropic', llm, { model: 'claude-sonnet-5-5' });
        await wrapped.chat([{ role: 'user', content: 'plain question' }]);
        expect(llm.calls[0][0].content).toBe('plain question');
    });
});

describe('wrapStreamingLLM', () => {
    it('attaches a rehydrator and a summary to the response', async () => {
        const llm = { streamChat: async () => ({ body: null }) };
        const wrapped = wrapStreamingLLM('ollama', llm, { model: 'llama3.2:3b' });
        const res = await wrapped.streamChat([{ role: 'user', content: 'call 416-555-1234' }]);
        expect(res.epsilon.summary).toBe('1 phone number');
        expect(res.epsilon.cls).toBe('pii');
        expect(res.epsilon.rehydrator.push('Dial [PHONE_1] now') + res.epsilon.rehydrator.flush()).toBe('Dial 416-555-1234 now');
    });
});
