/**
 * Gateway policy: which data classes may go to which providers, whether a
 * screenshot may ride along, and which terms are always redacted.
 *
 * Defaults live here; `<userData>/gateway-policy.json` overrides any key.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_POLICY = Object.freeze({
    classes: {
        pii: { allowedProviders: ['ollama', 'whisper'] },
        internal: { allowedProviders: ['*'] },
    },
    screenshot: { attachFor: ['internal'] },
    blockedTerms: [],
});

const POLICY_FILENAME = 'gateway-policy.json';

function mergePolicy(base, override) {
    const out = JSON.parse(JSON.stringify(base));
    if (!override || typeof override !== 'object') return out;
    if (override.classes && typeof override.classes === 'object') {
        for (const [cls, cfg] of Object.entries(override.classes)) {
            out.classes[cls] = { ...(out.classes[cls] || {}), ...(cfg || {}) };
        }
    }
    if (override.screenshot && typeof override.screenshot === 'object') {
        out.screenshot = { ...out.screenshot, ...override.screenshot };
    }
    if (Array.isArray(override.blockedTerms)) out.blockedTerms = [...override.blockedTerms];
    return out;
}

function loadPolicy(userDataDir) {
    if (!userDataDir) return mergePolicy(DEFAULT_POLICY, null);
    const file = path.join(userDataDir, POLICY_FILENAME);
    try {
        if (!fs.existsSync(file)) return mergePolicy(DEFAULT_POLICY, null);
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        return mergePolicy(DEFAULT_POLICY, raw);
    } catch (error) {
        console.warn(`[Policy] Ignoring invalid ${POLICY_FILENAME}: ${error.message}`);
        return mergePolicy(DEFAULT_POLICY, null);
    }
}

/** Any redaction hit means personal data was present. */
function classify(hits) {
    return hits && hits.length > 0 ? 'pii' : 'internal';
}

function isProviderAllowed(policy, cls, provider) {
    const allowed = policy?.classes?.[cls]?.allowedProviders;
    if (!Array.isArray(allowed)) return false;
    return allowed.includes('*') || allowed.includes(provider);
}

/**
 * @returns {{ provider: string|null, routed: 'direct'|'fallback'|'refused' }}
 */
function chooseProvider(policy, cls, selected, candidates = []) {
    if (selected && isProviderAllowed(policy, cls, selected)) return { provider: selected, routed: 'direct' };
    const fallback = candidates.find(p => p !== selected && isProviderAllowed(policy, cls, p));
    if (fallback) return { provider: fallback, routed: 'fallback' };
    return { provider: null, routed: 'refused' };
}

function screenshotAllowed(policy, cls) {
    return Array.isArray(policy?.screenshot?.attachFor) && policy.screenshot.attachFor.includes(cls);
}

module.exports = { DEFAULT_POLICY, POLICY_FILENAME, mergePolicy, loadPolicy, classify, isProviderAllowed, chooseProvider, screenshotAllowed };
