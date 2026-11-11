/**
 * Model registry: aliases, fallback chains, and "model unavailable" detection.
 *
 * Pure module (no Electron, no network) so it can be unit tested. Model IDs
 * live in models.json; nothing in the services should hardcode a model ID.
 */
const defaultConfig = require('./models.json');

function createRegistry(config = defaultConfig, providers = null) {
    const PROVIDERS = providers || require('./factory').PROVIDERS;

    const aliases = config.aliases || {};
    const fallbacks = config.fallbacks || {};
    const unavailablePatterns = (config.unavailablePatterns || []).map(p => p.toLowerCase());

    /** Returns the provider id that serves a model id, or null. */
    function providerForModel(modelId, type) {
        for (const [providerId, provider] of Object.entries(PROVIDERS)) {
            const list = type === 'stt' ? provider.sttModels : provider.llmModels;
            if (list.some(m => m.id === modelId)) return providerId;
        }
        return null;
    }

    function isAlias(name, type) {
        return Boolean(aliases[type] && aliases[type][name]);
    }

    /**
     * Resolve an alias (or a concrete model id) to a model the user can use.
     * @param {string} nameOrId   alias like "smart" or a concrete model id
     * @param {'llm'|'stt'} type
     * @param {(providerId: string) => boolean} isProviderReady  key configured / local service running
     * @returns {{ model: string, provider: string } | null}
     */
    function resolve(nameOrId, type, isProviderReady) {
        const candidates = isAlias(nameOrId, type) ? aliases[type][nameOrId] : [nameOrId];
        for (const modelId of candidates) {
            const provider = providerForModel(modelId, type);
            if (provider && isProviderReady(provider)) return { model: modelId, provider };
        }
        return null;
    }

    /**
     * Next model to try after `modelId` failed as unavailable.
     * Walks the fallback chain, skipping models already tried and models whose
     * provider is not ready.
     */
    function nextFallback(modelId, type, isProviderReady, tried = []) {
        const chain = fallbacks[modelId] || [];
        for (const candidate of chain) {
            if (tried.includes(candidate)) continue;
            const provider = providerForModel(candidate, type);
            if (provider && isProviderReady(provider)) return { model: candidate, provider };
        }
        return null;
    }

    /** True when an error from a provider means "this model id is not served". */
    function isModelUnavailableError(error) {
        const text = String(error && (error.message || error)).toLowerCase();
        return unavailablePatterns.some(p => text.includes(p));
    }

    /** Ordered preference list used by auto-selection: alias chains first, then everything else. */
    function preferenceOrder(type) {
        const seen = new Set();
        const ordered = [];
        const aliasLists = Object.values(aliases[type] || {});
        for (const list of aliasLists) {
            for (const id of list) if (!seen.has(id)) { seen.add(id); ordered.push(id); }
        }
        return ordered;
    }

    return {
        resolve,
        nextFallback,
        isModelUnavailableError,
        providerForModel,
        preferenceOrder,
        isAlias,
        config,
    };
}

const registry = createRegistry();

module.exports = {
    createRegistry,
    ...registry,
};
