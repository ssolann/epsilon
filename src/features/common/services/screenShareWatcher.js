/**
 * Watches for another app sharing or recording the screen and emits
 * `change` with `{ sharing, source, detail }`.
 *
 * Sources (macOS):
 *  - Control Center's privacy-indicator log (`log stream`), which names the
 *    capturing app's bundle id. This is the primary signal.
 *  - A process poll for known share helpers (Zoom's CptHost) as a fallback.
 *
 * Other platforms: process poll only. Every attribution change is logged so
 * the exact screen token can be confirmed on a real share.
 */
const { EventEmitter } = require('events');
const { spawn, execFile } = require('child_process');
const { parseAttributionLine, isScreenShare, hasShareProcess, DEFAULT_SHARE_PROCESSES } = require('./screenShareSignals');

const LOG_PREDICATE = 'subsystem == "com.apple.controlcenter" AND category == "sensor-indicators" AND eventMessage CONTAINS "Active activity attributions changed to"';
const PROCESS_POLL_MS = 3000;

class ScreenShareWatcher extends EventEmitter {
    constructor() {
        super();
        this.sharing = false;
        this.indicatorSharing = false;
        this.processSharing = false;
        this.logProcess = null;
        this.pollTimer = null;
        this.ignoreBundles = [];
    }

    start({ ignoreBundles = [] } = {}) {
        this.ignoreBundles = ignoreBundles;
        if (process.platform === 'darwin') this._startLogStream();
        this._startProcessPoll();
        console.log('[ScreenShare] Watcher started');
    }

    stop() {
        if (this.logProcess) {
            try { this.logProcess.kill(); } catch { /* ignore */ }
            this.logProcess = null;
        }
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    _startLogStream() {
        try {
            this.logProcess = spawn('/usr/bin/log', ['stream', '--style', 'compact', '--predicate', LOG_PREDICATE], { stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (error) {
            console.warn('[ScreenShare] Could not start log stream:', error.message);
            return;
        }
        let buffer = '';
        this.logProcess.stdout.on('data', chunk => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) this._handleLogLine(line);
        });
        this.logProcess.on('exit', (code) => {
            console.warn(`[ScreenShare] log stream exited (${code}); indicator detection off until restart`);
            this.logProcess = null;
        });
    }

    _handleLogLine(line) {
        const attributions = parseAttributionLine(line);
        if (attributions === null) return;
        console.log(`[ScreenShare] Indicator attributions: ${JSON.stringify(attributions)}`);
        this.indicatorSharing = isScreenShare(attributions, { ignoreBundles: this.ignoreBundles });
        this._update('indicator', attributions.join(', '));
    }

    _startProcessPoll() {
        const cmd = process.platform === 'win32' ? 'tasklist' : 'ps';
        const args = process.platform === 'win32' ? ['/FO', 'CSV', '/NH'] : ['-axco', 'comm'];
        const poll = () => {
            execFile(cmd, args, { maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
                if (error) return;
                const names = stdout.split('\n').map(l => l.replace(/^"/, '').split(/["\s]/)[0]);
                this.processSharing = hasShareProcess(names, DEFAULT_SHARE_PROCESSES);
                this._update('process', this.processSharing ? 'share helper running' : '');
            });
        };
        poll();
        this.pollTimer = setInterval(poll, PROCESS_POLL_MS);
    }

    _update(source, detail) {
        const next = this.indicatorSharing || this.processSharing;
        if (next === this.sharing) return;
        this.sharing = next;
        console.log(`[ScreenShare] ${next ? 'Screen share detected' : 'Screen share ended'} (${source}${detail ? `: ${detail}` : ''})`);
        this.emit('change', { sharing: next, source, detail });
    }
}

module.exports = new ScreenShareWatcher();
