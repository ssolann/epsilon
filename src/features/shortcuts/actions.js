/**
 * The single table of keyboard actions.
 *
 * Pure module (no Electron) so it can be unit tested. Global shortcut
 * registration, the command palette, and the shortcut editor all read from
 * this table so they can never drift apart.
 *
 * @typedef {object} Action
 * @property {string} id        stable key used in the keybinds store
 * @property {string} label     human label shown in the palette and editor
 * @property {string} mac       default accelerator on macOS
 * @property {string} win       default accelerator on Windows/Linux
 * @property {boolean} [inPalette=true]  false hides the row from the palette
 */

/** @type {Action[]} */
const ACTIONS = [
    { id: 'togglePalette',     label: 'Command palette',            mac: 'Cmd+K',          win: 'Ctrl+K', inPalette: false },
    { id: 'nextStep',          label: 'Ask anything',               mac: 'Cmd+Enter',      win: 'Ctrl+Enter' },
    { id: 'toggleListen',      label: 'Start / stop listening',     mac: 'Cmd+L',          win: 'Ctrl+L' },
    { id: 'toggleSettings',    label: 'Open / close settings',      mac: 'Cmd+,',          win: 'Ctrl+,' },
    { id: 'toggleVisibility',  label: 'Show / hide overlay',        mac: 'Cmd+\\',         win: 'Ctrl+\\' },
    { id: 'toggleAutoHide',    label: 'Auto-hide on screen share',  mac: 'Cmd+Shift+H',    win: 'Ctrl+Shift+H' },
    { id: 'toggleClickThrough',label: 'Toggle click-through',       mac: 'Cmd+M',          win: 'Ctrl+M' },
    { id: 'manualScreenshot',  label: 'Take screenshot',            mac: 'Cmd+Shift+S',    win: 'Ctrl+Shift+S' },
    { id: 'previousResponse',  label: 'Previous response',          mac: 'Cmd+[',          win: 'Ctrl+[' },
    { id: 'nextResponse',      label: 'Next response',              mac: 'Cmd+]',          win: 'Ctrl+]' },
    { id: 'scrollUp',          label: 'Scroll response up',         mac: 'Cmd+Shift+Up',   win: 'Ctrl+Shift+Up' },
    { id: 'scrollDown',        label: 'Scroll response down',       mac: 'Cmd+Shift+Down', win: 'Ctrl+Shift+Down' },
    { id: 'moveUp',            label: 'Move overlay up',            mac: 'Cmd+Up',         win: 'Ctrl+Up' },
    { id: 'moveDown',          label: 'Move overlay down',          mac: 'Cmd+Down',       win: 'Ctrl+Down' },
    { id: 'moveLeft',          label: 'Move overlay left',          mac: 'Cmd+Left',       win: 'Ctrl+Left' },
    { id: 'moveRight',         label: 'Move overlay right',         mac: 'Cmd+Right',      win: 'Ctrl+Right' },
];

/** Default accelerator per action id for a platform ('darwin' or anything else). */
function defaultKeybinds(platform) {
    const key = platform === 'darwin' ? 'mac' : 'win';
    const out = {};
    for (const action of ACTIONS) out[action.id] = action[key];
    return out;
}

function labelFor(id) {
    const action = ACTIONS.find(a => a.id === id);
    return action ? action.label : id;
}

/**
 * Rows for the palette: table order, palette-visible actions only, with the
 * accelerator the user currently has bound (falling back to nothing).
 * @param {Record<string,string>} keybinds  id -> accelerator
 */
function paletteItems(keybinds = {}) {
    return ACTIONS
        .filter(a => a.inPalette !== false)
        .map(a => ({ id: a.id, label: a.label, accelerator: keybinds[a.id] || '' }));
}

/**
 * Case-insensitive match on label. Every whitespace-separated word in the
 * query must appear somewhere in the label. Keeps the input order.
 */
function filterActions(items, query) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return items;
    return items.filter(item => {
        const label = item.label.toLowerCase();
        return words.every(w => label.includes(w));
    });
}

module.exports = { ACTIONS, defaultKeybinds, labelFor, paletteItems, filterActions };
