import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createRegistry } = require('../src/features/common/ai/modelRegistry');

const providers = {
    anthropic: { llmModels: [{ id: 'claude-opus-5-5' }, { id: 'claude-sonnet-5-5' }, { id: 'claude-haiku-5-5' }], sttModels: [] },
    openai: { llmModels: [{ id: 'gpt-4.1' }], sttModels: [{ id: 'gpt-4o-mini-transcribe' }] },
    deepgram: { llmModels: [], sttModels: [{ id: 'nova-3' }] },
    whisper: { llmModels: [], sttModels: [{ id: 'whisper-base' }] },
};

const config = {
    aliases: {
        llm: { smart: ['claude-opus-5-5', 'gpt-4.1'], fast: ['claude-haiku-5-5', 'gpt-4.1'] },
        stt: { default: ['nova-3', 'gpt-4o-mini-transcribe', 'whisper-base'] },
    },
    fallbacks: {
        'claude-opus-5-5': ['claude-sonnet-5-5', 'claude-haiku-5-5'],
        'gpt-4.1': ['claude-sonnet-5-5'],
    },
    unavailablePatterns: ['model_not_found', 'does not exist', 'has been retired'],
};

const ready = (readyProviders) => (id) => readyProviders.includes(id);

describe('modelRegistry.resolve', () => {
    const reg = createRegistry(config, providers);

    it('resolves an alias to the first model whose provider is ready', () => {
        expect(reg.resolve('smart', 'llm', ready(['anthropic']))).toEqual({ model: 'claude-opus-5-5', provider: 'anthropic' });
        expect(reg.resolve('smart', 'llm', ready(['openai']))).toEqual({ model: 'gpt-4.1', provider: 'openai' });
    });

    it('returns null when no provider in the chain is ready', () => {
        expect(reg.resolve('smart', 'llm', ready([]))).toBeNull();
    });

    it('accepts a concrete model id and checks its provider', () => {
        expect(reg.resolve('nova-3', 'stt', ready(['deepgram']))).toEqual({ model: 'nova-3', provider: 'deepgram' });
        expect(reg.resolve('nova-3', 'stt', ready(['openai']))).toBeNull();
    });

    it('returns null for an unknown model id', () => {
        expect(reg.resolve('claude-3-5-sonnet-20241022', 'llm', ready(['anthropic']))).toBeNull();
    });
});

describe('modelRegistry.nextFallback', () => {
    const reg = createRegistry(config, providers);

    it('walks the chain and skips already-tried models', () => {
        const r = ready(['anthropic']);
        expect(reg.nextFallback('claude-opus-5-5', 'llm', r)).toEqual({ model: 'claude-sonnet-5-5', provider: 'anthropic' });
        expect(reg.nextFallback('claude-opus-5-5', 'llm', r, ['claude-sonnet-5-5'])).toEqual({ model: 'claude-haiku-5-5', provider: 'anthropic' });
    });

    it('skips fallbacks whose provider is not ready', () => {
        expect(reg.nextFallback('gpt-4.1', 'llm', ready(['openai']))).toBeNull();
        expect(reg.nextFallback('gpt-4.1', 'llm', ready(['openai', 'anthropic']))).toEqual({ model: 'claude-sonnet-5-5', provider: 'anthropic' });
    });

    it('returns null for a model with no chain', () => {
        expect(reg.nextFallback('claude-haiku-5-5', 'llm', ready(['anthropic']))).toBeNull();
    });
});

describe('modelRegistry.isModelUnavailableError', () => {
    const reg = createRegistry(config, providers);

    it('matches provider "model not found" style errors case-insensitively', () => {
        expect(reg.isModelUnavailableError(new Error('404 {"type":"not_found_error","message":"model: claude-3-5-sonnet-20241022"}'))).toBe(false);
        expect(reg.isModelUnavailableError(new Error('The model `gpt-4.1` does not exist'))).toBe(true);
        expect(reg.isModelUnavailableError('Model_Not_Found')).toBe(true);
        expect(reg.isModelUnavailableError(new Error('This model has been retired'))).toBe(true);
    });

    it('does not match unrelated errors', () => {
        expect(reg.isModelUnavailableError(new Error('rate limit exceeded'))).toBe(false);
        expect(reg.isModelUnavailableError(null)).toBe(false);
    });
});

describe('modelRegistry.preferenceOrder', () => {
    it('lists alias-chain models once, in alias order', () => {
        const reg = createRegistry(config, providers);
        expect(reg.preferenceOrder('llm')).toEqual(['claude-opus-5-5', 'gpt-4.1', 'claude-haiku-5-5']);
        expect(reg.preferenceOrder('stt')).toEqual(['nova-3', 'gpt-4o-mini-transcribe', 'whisper-base']);
    });
});

describe('default models.json', () => {
    it('only references models the factory knows about', () => {
        const { PROVIDERS } = require('../src/features/common/ai/factory');
        const reg = createRegistry(undefined, PROVIDERS);
        const known = new Set(Object.values(PROVIDERS).flatMap(p => [...p.llmModels, ...p.sttModels].map(m => m.id)));
        const referenced = [
            ...Object.values(reg.config.aliases.llm).flat(),
            ...Object.values(reg.config.aliases.stt).flat(),
            ...Object.keys(reg.config.fallbacks),
            ...Object.values(reg.config.fallbacks).flat(),
        ];
        const unknown = referenced.filter(id => !known.has(id));
        expect(unknown).toEqual([]);
    });

    it('does not reference retired Claude model ids', () => {
        const text = JSON.stringify(require('../src/features/common/ai/models.json'));
        expect(text).not.toMatch(/claude-3/);
    });
});
