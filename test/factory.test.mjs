import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PROVIDERS, getAvailableProviders } = require('../src/features/common/ai/factory');

describe('ai factory', () => {
    it('has no Pickle proxy provider', () => {
        expect(Object.keys(PROVIDERS)).not.toContain('openai-glass');
        const ids = Object.values(PROVIDERS).flatMap(p => [...p.llmModels, ...p.sttModels].map(m => m.id));
        expect(ids.some(id => id.endsWith('-glass'))).toBe(false);
    });

    it('lists current Claude models for anthropic', () => {
        expect(PROVIDERS.anthropic.llmModels.map(m => m.id)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
    });

    it('reports providers by capability', () => {
        const { llm, stt } = getAvailableProviders();
        expect(llm).toContain('anthropic');
        expect(stt).not.toContain('anthropic');
        expect(stt).toContain('deepgram');
    });
});
