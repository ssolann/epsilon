/**
 * Pure helpers for detecting a screen share from system signals.
 *
 * macOS: Control Center logs every privacy-indicator change as
 *   `Active activity attributions changed to ["mic:node", "screen:us.zoom.xos"]`
 * (subsystem com.apple.controlcenter, category sensor-indicators). The kind
 * before the colon is the sensor; the rest is the bundle id. Screen capture
 * attributions use a kind containing "screen".
 *
 * A process-name fallback covers clients that bypass the indicator (Zoom's
 * share helper is `CptHost`).
 */

const DEFAULT_SCREEN_KINDS = ['screen', 'screencapture', 'screenshare', 'display'];
const DEFAULT_SHARE_PROCESSES = ['CptHost', 'caphost'];

/**
 * Pull the attribution list out of a Control Center log line.
 * @returns {string[]|null} entries like "mic:node", or null when the line is not an attribution change
 */
function parseAttributionLine(line) {
    if (typeof line !== 'string') return null;
    const m = line.match(/Active activity attributions changed to \[(.*)\]\s*$/);
    if (!m) return null;
    const inner = m[1].trim();
    if (!inner) return [];
    return inner.split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
}

/** @returns {{kind: string, bundle: string}} */
function splitAttribution(entry) {
    const idx = entry.indexOf(':');
    if (idx === -1) return { kind: entry.toLowerCase(), bundle: '' };
    return { kind: entry.slice(0, idx).toLowerCase(), bundle: entry.slice(idx + 1) };
}

/**
 * True when some other app is capturing the screen.
 * @param {string[]} attributions
 * @param {{ screenKinds?: string[], ignoreBundles?: string[] }} opts
 */
function isScreenShare(attributions, opts = {}) {
    const kinds = (opts.screenKinds || DEFAULT_SCREEN_KINDS).map(k => k.toLowerCase());
    const ignore = new Set((opts.ignoreBundles || []).map(b => b.toLowerCase()));
    return (attributions || []).some(entry => {
        const { kind, bundle } = splitAttribution(entry);
        if (!kinds.some(k => kind.includes(k))) return false;
        return !ignore.has(bundle.toLowerCase());
    });
}

/** True when any running process name matches a known share helper. */
function hasShareProcess(processNames, shareProcesses = DEFAULT_SHARE_PROCESSES) {
    const wanted = shareProcesses.map(p => p.toLowerCase());
    return (processNames || []).some(name => wanted.includes(String(name).trim().toLowerCase()));
}

module.exports = { parseAttributionLine, splitAttribution, isScreenShare, hasShareProcess, DEFAULT_SCREEN_KINDS, DEFAULT_SHARE_PROCESSES };
