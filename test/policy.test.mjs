import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { DEFAULT_POLICY, loadPolicy, mergePolicy, classify, isProviderAllowed, chooseProvider, screenshotAllowed } = require('../src/features/common/privacy/policy');

describe('classify', () => {
    it('is pii with any hit, internal otherwise', () => {
        expect(classify([{ type: 'EMAIL' }])).toBe('pii');
        expect(classify([])).toBe('internal');
    });
});

describe('isProviderAllowed / chooseProvider', () => {
    it('pii only goes to local providers by default', () => {
        expect(isProviderAllowed(DEFAULT_POLICY, 'pii', 'anthropic')).toBe(false);
        expect(isProviderAllowed(DEFAULT_POLICY, 'pii', 'ollama')).toBe(true);
        expect(isProviderAllowed(DEFAULT_POLICY, 'internal', 'anthropic')).toBe(true);
    });

    it('keeps the selected provider when allowed, falls back, or refuses', () => {
        expect(chooseProvider(DEFAULT_POLICY, 'internal', 'anthropic', ['ollama'])).toEqual({ provider: 'anthropic', routed: 'direct' });
        expect(chooseProvider(DEFAULT_POLICY, 'pii', 'anthropic', ['openai', 'ollama'])).toEqual({ provider: 'ollama', routed: 'fallback' });
        expect(chooseProvider(DEFAULT_POLICY, 'pii', 'anthropic', ['openai'])).toEqual({ provider: null, routed: 'refused' });
    });

    it('unknown classes are never allowed anywhere', () => {
        expect(isProviderAllowed(DEFAULT_POLICY, 'restricted', 'ollama')).toBe(false);
    });
});

describe('screenshotAllowed', () => {
    it('follows attachFor', () => {
        expect(screenshotAllowed(DEFAULT_POLICY, 'internal')).toBe(true);
        expect(screenshotAllowed(DEFAULT_POLICY, 'pii')).toBe(false);
    });
});

describe('mergePolicy / loadPolicy', () => {
    it('overrides only the keys given and keeps the rest', () => {
        const p = mergePolicy(DEFAULT_POLICY, { blockedTerms: ['Acme'], classes: { pii: { allowedProviders: [] } } });
        expect(p.blockedTerms).toEqual(['Acme']);
        expect(p.classes.pii.allowedProviders).toEqual([]);
        expect(p.classes.internal).toEqual(DEFAULT_POLICY.classes.internal);
        expect(DEFAULT_POLICY.blockedTerms).toEqual([]); // defaults untouched
    });

    it('loads an override file from the data dir and tolerates a missing or broken one', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epsilon-policy-'));
        expect(loadPolicy(dir)).toEqual(DEFAULT_POLICY);
        fs.writeFileSync(path.join(dir, 'gateway-policy.json'), '{ not json');
        expect(loadPolicy(dir)).toEqual(DEFAULT_POLICY);
        fs.writeFileSync(path.join(dir, 'gateway-policy.json'), JSON.stringify({ blockedTerms: ['Falcon'] }));
        expect(loadPolicy(dir).blockedTerms).toEqual(['Falcon']);
    });
});
