const { globalShortcut, screen } = require('electron');
const shortcutsRepository = require('./repositories');
const internalBridge = require('../../bridge/internalBridge');
const askService = require('../ask/askService');
const { defaultKeybinds, paletteItems, labelFor } = require('./actions');


class ShortcutsService {
    constructor() {
        this.lastVisibleWindows = new Set(['header']);
        this.mouseEventsIgnored = false;
        this.windowPool = null;
        this.allWindowVisibility = true;
    }

    initialize(windowPool) {
        this.windowPool = windowPool;
        internalBridge.on('reregister-shortcuts', () => {
            console.log('[ShortcutsService] Reregistering shortcuts due to header state change.');
            this.registerShortcuts();
        });
        console.log('[ShortcutsService] Initialized with dependencies and event listener.');
    }

    async openShortcutSettingsWindow () {
        const keybinds = await this.loadKeybinds();
        const shortcutWin = this.windowPool.get('shortcut-settings');
        const labels = Object.fromEntries(Object.keys(keybinds).map(id => [id, labelFor(id)]));
        shortcutWin.webContents.send('shortcut:loadShortcuts', keybinds, labels);

        globalShortcut.unregisterAll();
        internalBridge.emit('window:requestVisibility', { name: 'shortcut-settings', visible: true });
        console.log('[ShortcutsService] Shortcut settings window opened.');
        return { success: true };
    }

    async closeShortcutSettingsWindow () {
        await this.registerShortcuts();
        internalBridge.emit('window:requestVisibility', { name: 'shortcut-settings', visible: false });
        console.log('[ShortcutsService] Shortcut settings window closed.');
        return { success: true };
    }

    async handleSaveShortcuts(newKeybinds) {
        try {
            await this.saveKeybinds(newKeybinds);
            await this.closeShortcutSettingsWindow();
            return { success: true };
        } catch (error) {
            console.error("Failed to save shortcuts:", error);
            await this.closeShortcutSettingsWindow();
            return { success: false, error: error.message };
        }
    }

    async handleRestoreDefaults() {
        const defaults = this.getDefaultKeybinds();
        return defaults;
    }

    getDefaultKeybinds() {
        return defaultKeybinds(process.platform);
    }

    async loadKeybinds() {
        let keybindsArray = await shortcutsRepository.getAllKeybinds();

        if (!keybindsArray || keybindsArray.length === 0) {
            console.log(`[Shortcuts] No keybinds found. Loading defaults.`);
            const defaults = this.getDefaultKeybinds();
            await this.saveKeybinds(defaults); 
            this.keybinds = defaults;
            return defaults;
        }

        const keybinds = {};
        keybindsArray.forEach(k => {
            keybinds[k.action] = k.accelerator;
        });

        const defaults = this.getDefaultKeybinds();
        let needsUpdate = false;
        for (const action in defaults) {
            if (!keybinds[action]) {
                keybinds[action] = defaults[action];
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            console.log('[Shortcuts] Updating missing keybinds with defaults.');
            await this.saveKeybinds(keybinds);
        }

        this.keybinds = keybinds;
        return keybinds;
    }

    async saveKeybinds(newKeybinds) {
        const keybindsToSave = [];
        for (const action in newKeybinds) {
            if (Object.prototype.hasOwnProperty.call(newKeybinds, action)) {
                keybindsToSave.push({
                    action: action,
                    accelerator: newKeybinds[action],
                });
            }
        }
        await shortcutsRepository.upsertKeybinds(keybindsToSave);
        console.log(`[Shortcuts] Saved keybinds.`);
    }

    /** Hide or show everything, no-op when already in that state. Used by the screen-share watcher. */
    async setAllWindowsVisibility(visible) {
        if (this.allWindowVisibility === visible) return;
        await this.toggleAllWindowsVisibility();
    }

    async toggleAllWindowsVisibility() {
        console.log(`[Shortcuts] toggleAllWindowsVisibility -> ${!this.allWindowVisibility ? 'show' : 'hide'}`);
        const targetVisibility = !this.allWindowVisibility;
        internalBridge.emit('window:requestToggleAllWindowsVisibility', {
            targetVisibility: targetVisibility
        });

        if (this.allWindowVisibility) {
            await this.registerShortcuts(true);
        } else {
            await this.registerShortcuts();
        }

        this.allWindowVisibility = !this.allWindowVisibility;
    }

    /**
     * Returns the closure that performs `action`, or null for an unknown id.
     * Used both for global shortcut registration and for the command palette.
     */
    getActionHandler(action) {
        const header = this.windowPool?.get('header');
        const mainWindow = header;
        const sendToRenderer = (channel, ...args) => {
            this.windowPool.forEach(win => {
                if (win && !win.isDestroyed()) {
                    try { win.webContents.send(channel, ...args); } catch (e) { /* destroyed */ }
                }
            });
        };

        let callback = null;
        switch (action) {
            case 'togglePalette':
                callback = () => this.togglePalette();
                break;
            case 'toggleListen':
                // The header owns the listen session state machine; let it decide Listen / Stop / Done.
                callback = () => {
                    if (header && !header.isDestroyed()) header.webContents.send('header:triggerListen');
                };
                break;
            case 'toggleAutoHide':
                callback = async () => {
                    const settingsService = require('../settings/settingsService');
                    const next = !(await settingsService.getAutoHideOnScreenShare());
                    await settingsService.setAutoHideOnScreenShare(next);
                    console.log(`[Shortcuts] Auto-hide on screen share: ${next ? 'on' : 'off'}`);
                };
                break;
            case 'toggleSettings':
                callback = () => {
                    const settings = this.windowPool.get('settings');
                    const visible = settings && !settings.isDestroyed() && settings.isVisible();
                    internalBridge.emit('window:requestVisibility', { name: 'settings', visible: !visible });
                };
                break;
            case 'toggleVisibility':
                callback = () => this.toggleAllWindowsVisibility();
                break;
            case 'nextStep':
                callback = () => askService.toggleAskButton(true);
                break;
            case 'scrollUp':
                callback = () => {
                    const askWindow = this.windowPool.get('ask');
                    if (askWindow && !askWindow.isDestroyed() && askWindow.isVisible()) {
                        askWindow.webContents.send('scroll-response-up');
                    }
                };
                break;
            case 'scrollDown':
                callback = () => {
                    const askWindow = this.windowPool.get('ask');
                    if (askWindow && !askWindow.isDestroyed() && askWindow.isVisible()) {
                        askWindow.webContents.send('scroll-response-down');
                    }
                };
                break;
            case 'moveUp':
                callback = () => { if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'up' }); };
                break;
            case 'moveDown':
                callback = () => { if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'down' }); };
                break;
            case 'moveLeft':
                callback = () => { if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'left' }); };
                break;
            case 'moveRight':
                callback = () => { if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'right' }); };
                break;
            case 'toggleClickThrough':
                 callback = () => {
                    this.mouseEventsIgnored = !this.mouseEventsIgnored;
                    if(mainWindow && !mainWindow.isDestroyed()){
                        mainWindow.setIgnoreMouseEvents(this.mouseEventsIgnored, { forward: true });
                        mainWindow.webContents.send('click-through-toggled', this.mouseEventsIgnored);
                    }
                 };
                 break;
            case 'manualScreenshot':
                callback = () => {
                    if(mainWindow && !mainWindow.isDestroyed()) {
                         mainWindow.webContents.executeJavaScript('window.captureManualScreenshot && window.captureManualScreenshot();');
                    }
                };
                break;
            case 'previousResponse':
                callback = () => sendToRenderer('navigate-previous-response');
                break;
            case 'nextResponse':
                callback = () => sendToRenderer('navigate-next-response');
                break;
        }
        return callback;
    }

    /** Run an action by id (used by the command palette). */
    async runAction(id) {
        const handler = this.getActionHandler(id);
        if (!handler) {
            console.warn(`[Shortcuts] runAction: unknown action "${id}"`);
            return { success: false, error: `Unknown action: ${id}` };
        }
        try {
            await handler();
            return { success: true };
        } catch (error) {
            console.error(`[Shortcuts] runAction "${id}" failed:`, error);
            return { success: false, error: error.message };
        }
    }

    /** Synchronous on purpose: the palette must open on the keypress, never wait on the database. */
    getPaletteItems() {
        return paletteItems(this.keybinds || this.getDefaultKeybinds());
    }

    togglePalette() {
        const palette = this.windowPool?.get('palette');
        if (!palette || palette.isDestroyed()) {
            console.warn('[Shortcuts] togglePalette: palette window does not exist yet.');
            return;
        }
        if (palette.isVisible()) {
            internalBridge.emit('window:requestVisibility', { name: 'palette', visible: false });
            return;
        }
        palette.webContents.send('palette:load', this.getPaletteItems());
        internalBridge.emit('window:requestVisibility', { name: 'palette', visible: true });
    }

    closePalette() {
        internalBridge.emit('window:requestVisibility', { name: 'palette', visible: false });
    }

    async registerShortcuts(registerOnlyToggleVisibility = false) {
        if (!this.windowPool) {
            console.error('[Shortcuts] Service not initialized. Cannot register shortcuts.');
            return;
        }
        const keybinds = await this.loadKeybinds();
        globalShortcut.unregisterAll();
        
        const header = this.windowPool.get('header');
        const mainWindow = header;

        const sendToRenderer = (channel, ...args) => {
            this.windowPool.forEach(win => {
                if (win && !win.isDestroyed()) {
                    try {
                        win.webContents.send(channel, ...args);
                    } catch (e) {
                        // Ignore errors for destroyed windows
                    }
                }
            });
        };
        
        sendToRenderer('shortcuts-updated', keybinds);

        if (registerOnlyToggleVisibility) {
            if (keybinds.toggleVisibility) {
                globalShortcut.register(keybinds.toggleVisibility, () => this.toggleAllWindowsVisibility());
            }
            console.log('[Shortcuts] registerOnlyToggleVisibility, only toggleVisibility shortcut is registered.');
            return;
        }

        // --- Hardcoded shortcuts ---
        const isMac = process.platform === 'darwin';
        const modifier = isMac ? 'Cmd' : 'Ctrl';
        
        // Monitor switching
        const displays = screen.getAllDisplays();
        if (displays.length > 1) {
            displays.forEach((display, index) => {
                const key = `${modifier}+Shift+${index + 1}`;
                globalShortcut.register(key, () => internalBridge.emit('window:moveToDisplay', { displayId: display.id }));
            });
        }

        // Edge snapping
        const edgeDirections = [
            { key: `${modifier}+Shift+Left`, direction: 'left' },
            { key: `${modifier}+Shift+Right`, direction: 'right' },
        ];
        edgeDirections.forEach(({ key, direction }) => {
            globalShortcut.register(key, () => {
                if (header && header.isVisible()) internalBridge.emit('window:moveToEdge', { direction });
            });
        });

        // --- User-configurable shortcuts ---
        if (header?.currentHeaderState === 'apikey') {
            if (keybinds.toggleVisibility) {
                globalShortcut.register(keybinds.toggleVisibility, () => this.toggleAllWindowsVisibility());
            }
            console.log('[Shortcuts] ApiKeyHeader is active, only toggleVisibility shortcut is registered.');
            return;
        }

        for (const action in keybinds) {
            const accelerator = keybinds[action];
            if (!accelerator) continue;

            const callback = this.getActionHandler(action);
            if (callback) {
                try {
                    const ok = globalShortcut.register(accelerator, callback);
                    if (!ok) console.warn(`[Shortcuts] OS refused to register "${action}" (${accelerator}); another app may own it.`);
                } catch(e) {
                    console.error(`[Shortcuts] Failed to register shortcut for "${action}" (${accelerator}):`, e.message);
                }
            }
        }
        const registered = Object.entries(keybinds).filter(([, acc]) => acc && globalShortcut.isRegistered(acc)).map(([a]) => a);
        console.log(`[Shortcuts] All shortcuts have been registered. Active: ${registered.join(', ')}`);
    }

    unregisterAll() {
        globalShortcut.unregisterAll();
        console.log('[Shortcuts] All shortcuts have been unregistered.');
    }
}


const shortcutsService = new ShortcutsService();

module.exports = shortcutsService;