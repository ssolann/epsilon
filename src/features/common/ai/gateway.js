/**
 * Context gateway: the single chokepoint every AI call passes through.
 *
 * 1. Redacts personal identifiers in the outgoing messages (reversible tokens).
 * 2. Classifies the payload (pii / internal) and drops the screenshot when the
 *    policy says so.
 * 3. Routes by policy: keeps the selected provider, falls back to an allowed
 *    one that has a key, or refuses.
 * 4. Appends a manifest line describing what left the machine.
 * 5. Rehydrates tokens in the answer so the user sees real values.
 *
 * Electron and the model state service are required lazily so the pure
 * pieces (and the factory) stay importable from unit tests.
 */
const { createRedactionState, redactMessages, redactText, createRehydrator, summarize, countsByType } = require('../privacy/redactor');
const { loadPolicy, classify, chooseProvider, screenshotAllowed } = require('../privacy/policy');
const { appendManifest, sha256 } = require('../privacy/manifest');

class GatewayRefusedError extends Error {
    constructor(cls, provider) {
        super(`Blocked by privacy policy: this request contains personal data (${cls}) and no allowed provider is configured. Set up Ollama or Whisper for local processing, or adjust gateway-policy.json.`);
        this.name = 'GatewayRefusedError';
        this.dataClass = cls;
        this.provider = provider;
    }
}

function getUserDataDir() {
    try {
        const electron = require('electron');
        if (!electron || typeof electron !== 'object' || !electron.app) return null;
        return electron.app.getPath('userData');
    } catch (error) {
        console.warn('[Gateway] userData unavailable, manifest disabled:', error.message);
        return null;
    }
}

function getModelState() {
    return require('../services/modelStateService');
}

/** Providers that currently have a key, for fallback routing. */
async function providersWithKeys(type) {
    try {
        const { apiKeys } = await getModelState().getLiveState();
        return Object.entries(apiKeys)
            .filter(([provider, key]) => key && (type === 'stt' ? provider !== 'ollama' : provider !== 'whisper'))
            .map(([provider]) => provider);
    } catch {
        return [];
    }
}

async function pickModelForProvider(provider, type) {
    const mss = getModelState();
    const models = await mss.getAvailableModels(type);
    const match = models.find(m => mss.getProviderForModel(m.id, type) === provider);
    return match ? match.id : null;
}

function stripImages(messages) {
    let dropped = 0;
    const out = messages.map(msg => {
        if (!Array.isArray(msg.content)) return msg;
        const parts = msg.content.filter(p => {
            const isImage = p && (p.type === 'image_url' || p.type === 'image' || p.inlineData);
            if (isImage) dropped += 1;
            return !isImage;
        });
        return { ...msg, content: parts };
    });
    return { messages: out, dropped };
}

function findScreenshotSha(messages) {
    for (const msg of messages) {
        if (!Array.isArray(msg.content)) continue;
        for (const p of msg.content) {
            const url = p?.image_url?.url;
            if (typeof url === 'string') return sha256(url);
            if (p?.inlineData?.data) return sha256(p.inlineData.data);
        }
    }
    return null;
}

/**
 * Prepare an outgoing LLM request.
 * @returns {Promise<{messages, provider, routed, cls, hits, state, screenshotAttached, screenshotSha256}>}
 */
async function prepare(messages, { purpose, provider, model }) {
    const userDataDir = getUserDataDir();
    const policy = loadPolicy(userDataDir);
    const state = createRedactionState();

    const redacted = redactMessages(messages, { state, blockedTerms: policy.blockedTerms });
    const cls = classify(redacted.hits);

    const screenshotSha256 = findScreenshotSha(messages);
    let outMessages = redacted.messages;
    let screenshotAttached = Boolean(screenshotSha256);
    if (screenshotAttached && !screenshotAllowed(policy, cls)) {
        outMessages = stripImages(outMessages).messages;
        screenshotAttached = false;
    }

    const candidates = await providersWithKeys('llm');
    const route = chooseProvider(policy, cls, provider, candidates);

    appendManifest(userDataDir, {
        purpose,
        provider: route.provider,
        requestedProvider: provider,
        model: route.provider === provider ? model : null,
        class: cls,
        redactions: countsByType(redacted.hits),
        screenshotAttached,
        screenshotSha256,
        promptSha256: sha256(JSON.stringify(outMessages)),
        messageCount: outMessages.length,
        routed: route.routed,
    });

    if (route.routed === 'refused') throw new GatewayRefusedError(cls, provider);

    if (route.routed === 'fallback') {
        console.warn(`[Gateway] ${purpose}: ${cls} payload, ${provider} not allowed; routing to ${route.provider}`);
    } else if (redacted.hits.length) {
        console.log(`[Gateway] ${purpose}: redacted ${summarize(redacted.hits)} before sending to ${provider}`);
    }

    return { messages: outMessages, provider: route.provider, routed: route.routed, cls, hits: redacted.hits, state, screenshotAttached, screenshotSha256 };
}

async function replacementFor(kind, provider, opts) {
    const factory = require('./factory');
    const { apiKeys } = await getModelState().getLiveState();
    const model = await pickModelForProvider(provider, 'llm');
    if (!model) throw new GatewayRefusedError('pii', provider);
    const next = { ...opts, apiKey: apiKeys[provider], model };
    return kind === 'stream' ? factory.createStreamingLLMRaw(provider, next) : factory.createLLMRaw(provider, next);
}

function wrapLLM(provider, llm, opts = {}) {
    const purpose = opts.purpose || 'summary';
    return {
        ...llm,
        chat: async (messages) => {
            const prep = await prepare(messages, { purpose, provider, model: opts.model });
            const target = prep.routed === 'fallback' ? await replacementFor('chat', prep.provider, opts) : llm;
            const result = await target.chat(prep.messages);
            if (result && typeof result.content === 'string' && prep.hits.length) {
                const r = createRehydrator(prep.state);
                result.content = r.push(result.content) + r.flush();
            }
            return result;
        },
        generateContent: async (parts) => {
            const userDataDir = getUserDataDir();
            const policy = loadPolicy(userDataDir);
            const state = createRedactionState();
            const hits = [];
            const redactedParts = (parts || []).map(p => {
                if (typeof p !== 'string') return p;
                const r = redactText(p, { state, blockedTerms: policy.blockedTerms });
                hits.push(...r.hits);
                return r.text;
            });
            const cls = classify(hits);
            const finalParts = screenshotAllowed(policy, cls) ? redactedParts : redactedParts.filter(p => typeof p === 'string');
            const candidates = await providersWithKeys('llm');
            const route = chooseProvider(policy, cls, provider, candidates);
            appendManifest(userDataDir, { purpose, provider: route.provider, requestedProvider: provider, model: opts.model, class: cls, redactions: countsByType(hits), screenshotAttached: finalParts.length !== redactedParts.length ? false : finalParts.some(p => typeof p !== 'string'), promptSha256: sha256(JSON.stringify(finalParts.filter(p => typeof p === 'string'))), messageCount: finalParts.length, routed: route.routed });
            if (route.routed === 'refused') throw new GatewayRefusedError(cls, provider);
            const target = route.routed === 'fallback' ? await replacementFor('chat', route.provider, opts) : llm;
            const result = await target.generateContent(finalParts);
            const text = result?.response?.text?.();
            if (typeof text === 'string' && hits.length) {
                const r = createRehydrator(state);
                const rehydrated = r.push(text) + r.flush();
                result.response = { ...result.response, text: () => rehydrated };
            }
            return result;
        },
    };
}

function wrapStreamingLLM(provider, llm, opts = {}) {
    const purpose = opts.purpose || 'ask';
    return {
        ...llm,
        streamChat: async (messages) => {
            const prep = await prepare(messages, { purpose, provider, model: opts.model });
            const target = prep.routed === 'fallback' ? await replacementFor('stream', prep.provider, opts) : llm;
            const response = await target.streamChat(prep.messages);
            response.epsilon = {
                rehydrator: createRehydrator(prep.state),
                hits: prep.hits,
                summary: summarize(prep.hits),
                cls: prep.cls,
                provider: prep.provider,
                routed: prep.routed,
                screenshotAttached: prep.screenshotAttached,
            };
            return response;
        },
    };
}

/** Audio cannot be redacted; STT is class `internal` and only needs the policy check and a manifest line. */
async function checkSTT(provider, opts = {}) {
    const userDataDir = getUserDataDir();
    const policy = loadPolicy(userDataDir);
    const route = chooseProvider(policy, 'internal', provider, []);
    appendManifest(userDataDir, { purpose: 'stt', provider: route.provider, requestedProvider: provider, model: opts.model || null, class: 'internal', redactions: {}, screenshotAttached: false, promptSha256: null, messageCount: 0, routed: route.routed });
    if (route.routed === 'refused') throw new GatewayRefusedError('internal', provider);
}

module.exports = { wrapLLM, wrapStreamingLLM, checkSTT, prepare, GatewayRefusedError };
