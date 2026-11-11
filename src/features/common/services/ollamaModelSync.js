/**
 * Records the models Ollama reports as installed into the ollama_models table.
 *
 * Pure function over a repository so it can be unit tested. It must INSERT
 * rows that do not exist yet: models pulled outside the app (or before it
 * was first run) have no row, and an UPDATE alone would silently match
 * nothing, leaving the model unselectable.
 *
 * @param {{ upsertModel: Function }} repo  ollamaModel repository
 * @param {Array<{ name?: string, size?: number|string }>} models  from Ollama's /api/tags
 * @returns {Promise<number>} how many models were recorded
 */
async function recordInstalledModels(repo, models) {
    let recorded = 0;
    for (const model of models || []) {
        if (!model || !model.name) continue;
        await repo.upsertModel({
            name: model.name,
            size: model.size ?? 'Unknown',
            installed: true,
            installing: false,
        });
        recorded += 1;
    }
    return recorded;
}

module.exports = { recordInstalledModels };
