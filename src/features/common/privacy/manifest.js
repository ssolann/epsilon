/**
 * Append-only ledger of what left the machine: one JSON line per AI call,
 * never the payload itself. Files roll daily under <userData>/manifests/.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

function manifestPath(userDataDir, date = new Date()) {
    const day = date.toISOString().slice(0, 10);
    return path.join(userDataDir, 'manifests', `${day}.jsonl`);
}

/**
 * @param {string} userDataDir
 * @param {object} entry  fields from the gateway; `ts` is added here
 * @returns {object} the entry written (for logging/tests)
 */
function appendManifest(userDataDir, entry) {
    const record = { ts: new Date().toISOString(), ...entry };
    if (!userDataDir) return record;
    try {
        const file = manifestPath(userDataDir);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.appendFileSync(file, JSON.stringify(record) + '\n');
        console.log(`[Manifest] ${record.purpose}: class=${record.class} provider=${record.provider} routed=${record.routed} screenshot=${record.screenshotAttached}`);
    } catch (error) {
        console.warn('[Manifest] Failed to append:', error.message);
    }
    return record;
}

module.exports = { appendManifest, manifestPath, sha256 };
