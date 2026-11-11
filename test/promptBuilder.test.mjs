import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getSystemPrompt } = require('../src/features/common/prompts/promptBuilder');
const { profilePrompts } = require('../src/features/common/prompts/promptTemplates');

describe('getSystemPrompt', () => {
    it('falls back to the interview profile for an unknown profile', () => {
        const prompt = getSystemPrompt('does-not-exist', '', false);
        expect(prompt).toContain(profilePrompts.interview.intro);
    });

    it('includes user-provided context between the markers', () => {
        const prompt = getSystemPrompt('epsilon_analysis', 'ACME = our billing system', false);
        expect(prompt).toContain('User-provided context\n-----\nACME = our billing system\n-----');
    });

    it('omits the search section when google search is disabled', () => {
        const withSearch = getSystemPrompt('sales', '', true);
        const withoutSearch = getSystemPrompt('sales', '', false);
        expect(withSearch).toContain(profilePrompts.sales.searchUsage);
        expect(withoutSearch).not.toContain(profilePrompts.sales.searchUsage);
    });

    it('keeps the conversation history placeholder for the analysis profile', () => {
        expect(getSystemPrompt('epsilon_analysis', '', false)).toContain('{{CONVERSATION_HISTORY}}');
    });
});
