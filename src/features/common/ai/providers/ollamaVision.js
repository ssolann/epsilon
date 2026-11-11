/**
 * Decides whether an Ollama model can take images, so the provider never
 * sends a screenshot to a text-only model (newer Ollama servers reject that
 * with HTTP 500 "image input is not supported").
 */

/** @returns {boolean|null} true/false from /api/show capabilities, null when the server doesn't report them */
function supportsVision(showResponse) {
    const caps = showResponse && Array.isArray(showResponse.capabilities) ? showResponse.capabilities : null;
    if (!caps) return null;
    return caps.includes('vision');
}

/**
 * @param {Array<{images?: string[]}>} messages  Ollama-format messages
 * @param {boolean|null} vision  result of supportsVision
 */
function dropImagesUnlessVision(messages, vision) {
    if (vision !== false) return { messages, dropped: 0 };
    let dropped = 0;
    const out = messages.map(m => {
        if (!m || !Array.isArray(m.images) || m.images.length === 0) return m;
        dropped += m.images.length;
        const { images, ...rest } = m;
        return rest;
    });
    return { messages: out, dropped };
}

module.exports = { supportsVision, dropImagesUnlessVision };
