/**
 * On-device text redaction with reversible tokens.
 *
 * Pure module: no Electron, no I/O. Values are replaced by stable tokens such
 * as `[EMAIL_1]`; the token -> value map stays in the per-call state so the
 * answer can be rehydrated locally and the provider never sees the value.
 */

function luhnValid(digits) {
    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let d = digits.charCodeAt(i) - 48;
        if (double) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        sum += d;
        double = !double;
    }
    return sum % 10 === 0;
}

const onlyDigits = (s) => s.replace(/\D/g, '');

/** Detector order matters: longer numeric patterns first so a card is never partly read as a SIN. */
const DETECTORS = [
    {
        type: 'EMAIL',
        regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    },
    {
        type: 'CARD',
        regex: /\b(?:\d[ -]?){12,18}\d\b/g,
        validate: (m) => { const d = onlyDigits(m); return d.length >= 13 && d.length <= 19 && luhnValid(d); },
    },
    {
        type: 'PHONE',
        regex: /(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g,
        validate: (m) => { const d = onlyDigits(m); return d.length === 10 || (d.length === 11 && d.startsWith('1')); },
    },
    {
        type: 'SIN',
        regex: /\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/g,
        validate: (m) => luhnValid(onlyDigits(m)),
    },
];

const TYPE_LABELS = { SIN: ['SIN', 'SINs'], CARD: ['card number', 'card numbers'], EMAIL: ['email', 'emails'], PHONE: ['phone number', 'phone numbers'], TERM: ['blocked term', 'blocked terms'] };

function createRedactionState() {
    return {
        valueToToken: new Map(),
        tokenToValue: new Map(),
        counters: {},
    };
}

function tokenFor(state, type, value) {
    const key = `${type}:${value}`;
    const existing = state.valueToToken.get(key);
    if (existing) return existing;
    state.counters[type] = (state.counters[type] || 0) + 1;
    const token = `[${type}_${state.counters[type]}]`;
    state.valueToToken.set(key, token);
    state.tokenToValue.set(token, value);
    return token;
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} text
 * @param {{ state: object, blockedTerms?: string[] }} opts
 * @returns {{ text: any, hits: Array<{type: string, token: string}> }}
 */
function redactText(text, opts) {
    if (typeof text !== 'string') return { text, hits: [] };
    const state = opts.state;
    const hits = [];
    let out = text;

    const apply = (type, regex, validate) => {
        out = out.replace(regex, (match) => {
            if (validate && !validate(match)) return match;
            const token = tokenFor(state, type, match);
            hits.push({ type, token });
            return token;
        });
    };

    for (const d of DETECTORS) apply(d.type, d.regex, d.validate);

    for (const term of opts.blockedTerms || []) {
        if (!term || typeof term !== 'string') continue;
        apply('TERM', new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi'), null);
    }

    return { text: out, hits };
}

/**
 * Redacts OpenAI-style messages without mutating the input.
 * String content and `{type:'text'}` parts are redacted; other parts pass through.
 */
function redactMessages(messages, opts) {
    const hits = [];
    const out = (messages || []).map(msg => {
        if (typeof msg.content === 'string') {
            const r = redactText(msg.content, opts);
            hits.push(...r.hits);
            return { ...msg, content: r.text };
        }
        if (Array.isArray(msg.content)) {
            const parts = msg.content.map(part => {
                if (part && part.type === 'text' && typeof part.text === 'string') {
                    const r = redactText(part.text, opts);
                    hits.push(...r.hits);
                    return { ...part, text: r.text };
                }
                return part;
            });
            return { ...msg, content: parts };
        }
        return msg;
    });
    return { messages: out, hits };
}

const TOKEN_RE = /\[[A-Z]+_\d+\]/g;
const PARTIAL_TOKEN_RE = /\[[A-Z]*(?:_\d*)?$/;

/**
 * Streams text back with tokens replaced by their original values, holding
 * back a trailing partial token until the next chunk completes it.
 */
function createRehydrator(state) {
    let pending = '';
    const replaceAll = (s) => s.replace(TOKEN_RE, (tok) => (state.tokenToValue.has(tok) ? state.tokenToValue.get(tok) : tok));
    return {
        push(chunk) {
            const buffer = pending + (chunk || '');
            const m = buffer.match(PARTIAL_TOKEN_RE);
            if (m) {
                pending = m[0];
                return replaceAll(buffer.slice(0, buffer.length - m[0].length));
            }
            pending = '';
            return replaceAll(buffer);
        },
        flush() {
            const rest = replaceAll(pending);
            pending = '';
            return rest;
        },
    };
}

function summarize(hits) {
    const counts = {};
    for (const h of hits || []) counts[h.type] = (counts[h.type] || 0) + 1;
    return Object.entries(counts)
        .map(([type, n]) => `${n} ${(TYPE_LABELS[type] || [type, type])[n === 1 ? 0 : 1]}`)
        .join(', ');
}

function countsByType(hits) {
    const counts = {};
    for (const h of hits || []) counts[h.type] = (counts[h.type] || 0) + 1;
    return counts;
}

module.exports = { createRedactionState, redactText, redactMessages, createRehydrator, summarize, countsByType, luhnValid };
