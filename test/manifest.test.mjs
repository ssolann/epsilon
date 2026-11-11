import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { appendManifest, manifestPath, sha256 } = require('../src/features/common/privacy/manifest');

describe('manifest', () => {
    it('appends one JSON line per call to a daily file and never includes the payload', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epsilon-manifest-'));
        const entry = { purpose: 'ask', provider: 'ollama', model: 'llama3.2:3b', class: 'pii', redactions: { SIN: 1 }, screenshotAttached: false, promptSha256: sha256('secret text'), routed: 'fallback' };
        appendManifest(dir, entry);
        appendManifest(dir, { ...entry, purpose: 'summary' });
        const lines = fs.readFileSync(manifestPath(dir), 'utf8').trim().split('\n');
        expect(lines).toHaveLength(2);
        const first = JSON.parse(lines[0]);
        expect(first).toMatchObject(entry);
        expect(first.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(lines.join('')).not.toContain('secret text');
    });

    it('does not throw when the directory is unwritable or missing', () => {
        expect(() => appendManifest(null, { purpose: 'ask' })).not.toThrow();
        expect(() => appendManifest('/dev/null/nope', { purpose: 'ask' })).not.toThrow();
    });
});
