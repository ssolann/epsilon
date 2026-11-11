import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { providersConfigured } = require('../src/features/common/services/providerReadiness');

const providers = {
    anthropic: { llmModels: [{ id: 'claude-sonnet-5-5' }], sttModels: [] },
    deepgram: { llmModels: [], sttModels: [{ id: 'nova-3' }] },
    ollama: { llmModels: [], sttModels: [] },   // models are discovered at runtime
    whisper: { llmModels: [], sttModels: [] },  // models are downloaded at runtime
};

describe('providersConfigured', () => {
    it('is false with no keys', () => {
        expect(providersConfigured({}, providers, { installedOllamaModels: 0 })).toBe(false);
    });

    it('needs both an LLM and an STT provider', () => {
        expect(providersConfigured({ anthropic: 'sk' }, providers, { installedOllamaModels: 0 })).toBe(false);
        expect(providersConfigured({ deepgram: 'dg' }, providers, { installedOllamaModels: 0 })).toBe(false);
        expect(providersConfigured({ anthropic: 'sk', deepgram: 'dg' }, providers, { installedOllamaModels: 0 })).toBe(true);
    });

    it('counts Ollama as an LLM provider when it has at least one installed model', () => {
        expect(providersConfigured({ ollama: 'local', whisper: 'local' }, providers, { installedOllamaModels: 0 })).toBe(false);
        expect(providersConfigured({ ollama: 'local', whisper: 'local' }, providers, { installedOllamaModels: 2 })).toBe(true);
    });

    it('counts Whisper as an STT provider on its own', () => {
        expect(providersConfigured({ anthropic: 'sk', whisper: 'local' }, providers, { installedOllamaModels: 0 })).toBe(true);
    });

    it('ignores empty or null keys and unknown providers', () => {
        expect(providersConfigured({ anthropic: '', deepgram: null, mystery: 'x' }, providers, { installedOllamaModels: 0 })).toBe(false);
    });
});
