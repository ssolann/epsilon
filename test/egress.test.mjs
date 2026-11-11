import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'src');
const PROVIDERS_DIR = path.join(SRC, 'features', 'common', 'ai', 'providers');

const SDK_PATTERNS = [
    /require\(['"]openai['"]\)/,
    /require\(['"]@anthropic-ai\/sdk['"]\)/,
    /require\(['"]@google\/genai['"]\)/,
    /require\(['"]@google\/generative-ai['"]\)/,
    /require\(['"]@deepgram\/sdk['"]\)/,
    /require\(['"]portkey-ai['"]\)/,
    /from ['"](openai|@anthropic-ai\/sdk|@google\/genai|@google\/generative-ai|@deepgram\/sdk)['"]/,
    /https?:\/\/api\.(openai|anthropic|deepgram)\.com/,
    /generativelanguage\.googleapis\.com/,
];

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'assets') continue;
            walk(p, out);
        } else if (/\.(js|mjs)$/.test(entry.name)) {
            out.push(p);
        }
    }
    return out;
}

describe('egress enforcement', () => {
    it('only the provider modules talk to AI vendors directly', () => {
        const offenders = [];
        for (const file of walk(SRC)) {
            if (file.startsWith(PROVIDERS_DIR)) continue;
            const text = fs.readFileSync(file, 'utf8');
            for (const re of SDK_PATTERNS) {
                if (re.test(text)) offenders.push(`${path.relative(SRC, file)} matches ${re}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('services never call provider modules directly, only the factory', () => {
        const offenders = [];
        for (const file of walk(path.join(SRC, 'features'))) {
            if (file.startsWith(PROVIDERS_DIR) || file.endsWith(path.join('ai', 'factory.js')) || file.endsWith(path.join('ai', 'gateway.js'))) continue;
            const text = fs.readFileSync(file, 'utf8');
            if (/require\(['"][^'"]*\/ai\/providers\//.test(text)) offenders.push(path.relative(SRC, file));
        }
        expect(offenders).toEqual([]);
    });
});
