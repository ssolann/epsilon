const { BrowserWindow } = require('electron');
const sessionRepository = require('../repositories/session');

const LOCAL_USER_ID = 'default_user';

/**
 * Local-only identity service.
 *
 * The app runs as a single local user. There is no cloud sign-in: every
 * repository stores data in SQLite under LOCAL_USER_ID, and the encryption
 * key for API keys lives in the OS keychain (via encryptionService).
 */
class AuthService {
    constructor() {
        this.currentUserId = LOCAL_USER_ID;
        this.isInitialized = false;
        this.initializationPromise = null;

        sessionRepository.setAuthService(this);
    }

    initialize() {
        if (this.isInitialized) return this.initializationPromise;

        this.initializationPromise = (async () => {
            // Clean up any zombie sessions from a previous run.
            await sessionRepository.endAllActiveSessions();

            // The encryption key is initialized lazily (first API key save, or at boot
            // when encrypted keys already exist) so the app never touches the keychain
            // before it has something to protect.

            this.isInitialized = true;
            this.broadcastUserState();
            console.log('[AuthService] Initialized local user.');
        })();

        return this.initializationPromise;
    }

    broadcastUserState() {
        const userState = this.getCurrentUser();
        BrowserWindow.getAllWindows().forEach(win => {
            if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
                win.webContents.send('user-state-changed', userState);
            }
        });
    }

    getCurrentUserId() {
        return this.currentUserId;
    }

    getCurrentUser() {
        return {
            uid: this.currentUserId,
            email: null,
            displayName: 'Local User',
            mode: 'local',
            isLoggedIn: false,
        };
    }
}

const authService = new AuthService();
module.exports = authService;
