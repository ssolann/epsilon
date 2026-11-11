/**
 * Decides whether the app has enough providers configured to leave the
 * setup screen: at least one LLM provider and one speech-to-text provider.
 *
 * Pure function so it can be unit tested. Ollama and Whisper have empty
 * static model lists (their models are discovered or downloaded at runtime),
 * so they are judged by runtime state instead of the static table.
 *
 * @param {Record<string, string|null>} apiKeyMap   provider id -> saved key ('local' for local providers)
 * @param {Record<string, {llmModels: any[], sttModels: any[]}>} providers  the factory's PROVIDERS table
 * @param {{ installedOllamaModels: number }} runtime
 */
function providersConfigured(apiKeyMap, providers, runtime = { installedOllamaModels: 0 }) {
    const withKey = Object.entries(apiKeyMap || {}).filter(([, key]) => typeof key === 'string' && key.trim().length > 0);

    const hasLlm = withKey.some(([provider]) => {
        if (provider === 'ollama') return (runtime.installedOllamaModels || 0) > 0;
        return (providers[provider]?.llmModels?.length || 0) > 0;
    });

    const hasStt = withKey.some(([provider]) => {
        if (provider === 'whisper') return true;
        return (providers[provider]?.sttModels?.length || 0) > 0;
    });

    return hasLlm && hasStt;
}

module.exports = { providersConfigured };
