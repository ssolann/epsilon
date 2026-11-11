import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';

const KEY_GLYPHS = {
    Cmd: '⌘', Command: '⌘', CommandOrControl: '⌘',
    Ctrl: '⌃', Control: '⌃',
    Alt: '⌥', Option: '⌥',
    Shift: '⇧',
    Enter: '↵', Return: '↵',
    Backspace: '⌫', Delete: '⌦', Tab: '⇥', Escape: '⎋', Esc: '⎋',
    Up: '↑', Down: '↓', Left: '←', Right: '→',
    Space: '␣',
};

/** Pure filter, duplicated from src/features/shortcuts/actions.js (renderer has no require). */
function filterItems(items, query) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return items;
    return items.filter(item => {
        const label = item.label.toLowerCase();
        return words.every(w => label.includes(w));
    });
}

export class PaletteView extends LitElement {
    static styles = css`
        * { font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            box-sizing: border-box; user-select: none; }
        :host { display: block; width: 100%; height: 100%; color: white; }

        .container {
            display: flex; flex-direction: column; height: 100%;
            background: rgba(20, 20, 20, 0.92); border-radius: 12px;
            outline: 0.5px rgba(255, 255, 255, 0.2) solid; outline-offset: -1px;
            overflow: hidden;
        }
        .search {
            display: flex; align-items: center; gap: 8px; padding: 10px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .search input {
            flex: 1; background: transparent; border: none; outline: none;
            color: white; font-size: 13px;
        }
        .search input::placeholder { color: rgba(255, 255, 255, 0.4); }
        .hint { font-size: 10px; color: rgba(255, 255, 255, 0.4); }

        .list { flex: 1; overflow-y: auto; padding: 6px; }
        .row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 7px 10px; border-radius: 7px; font-size: 12.5px; cursor: default;
            color: rgba(255, 255, 255, 0.9);
        }
        .row.selected { background: rgba(255, 255, 255, 0.14); }
        .row:hover { background: rgba(255, 255, 255, 0.08); }
        .keys { display: flex; gap: 3px; }
        .key {
            min-width: 18px; height: 18px; padding: 0 4px; border-radius: 4px;
            background: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.8);
            font-size: 11px; display: grid; place-items: center;
        }
        .empty { padding: 18px; text-align: center; font-size: 12px; color: rgba(255, 255, 255, 0.4); }

        :host-context(body.has-glass) .container { background: transparent; outline: none; }
    `;

    static properties = {
        items: { type: Array, state: true },
        query: { type: String, state: true },
        selectedIndex: { type: Number, state: true },
    };

    constructor() {
        super();
        this.items = [];
        this.query = '';
        this.selectedIndex = 0;
        this._onLoad = (_event, items) => {
            this.items = Array.isArray(items) ? items : [];
            this.query = '';
            this.selectedIndex = 0;
            this._focusInput();
        };
        this._onShortcutsUpdated = (_event, keybinds) => {
            if (!keybinds) return;
            this.items = this.items.map(item => ({ ...item, accelerator: keybinds[item.id] || item.accelerator }));
        };
        this._onWindowFocus = () => this._focusInput();
    }

    connectedCallback() {
        super.connectedCallback();
        if (window.api?.palette) {
            window.api.palette.onLoad(this._onLoad);
            window.api.palette.onShortcutsUpdated(this._onShortcutsUpdated);
        }
        window.addEventListener('focus', this._onWindowFocus);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.api?.palette) {
            window.api.palette.removeOnLoad(this._onLoad);
            window.api.palette.removeOnShortcutsUpdated(this._onShortcutsUpdated);
        }
        window.removeEventListener('focus', this._onWindowFocus);
    }

    get visibleItems() {
        return filterItems(this.items, this.query);
    }

    _focusInput() {
        requestAnimationFrame(() => this.shadowRoot?.querySelector('input')?.focus());
    }

    _close() {
        window.api?.palette?.close();
    }

    async _run(item) {
        if (!item) return;
        this._close();
        try {
            await window.api?.palette?.runAction(item.id);
        } catch (error) {
            console.error('[PaletteView] runAction failed:', error);
        }
    }

    _onInput(e) {
        this.query = e.target.value;
        this.selectedIndex = 0;
    }

    _onKeyDown(e) {
        const items = this.visibleItems;
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (items.length) this.selectedIndex = (this.selectedIndex + 1) % items.length;
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (items.length) this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
                break;
            case 'Enter':
                e.preventDefault();
                this._run(items[this.selectedIndex]);
                break;
            case 'Escape':
                e.preventDefault();
                this._close();
                break;
            default:
                return;
        }
    }

    updated(changed) {
        if (changed.has('selectedIndex') || changed.has('query')) {
            this.shadowRoot?.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest' });
        }
    }

    _renderKeys(accelerator) {
        if (!accelerator) return html``;
        return html`<div class="keys">${accelerator.split('+').map(k => html`<span class="key">${KEY_GLYPHS[k] || k}</span>`)}</div>`;
    }

    render() {
        const items = this.visibleItems;
        return html`
            <div class="container" @keydown=${this._onKeyDown}>
                <div class="search">
                    <input type="text" placeholder="Type an action…" .value=${this.query} @input=${this._onInput} autofocus />
                    <span class="hint">↑↓ Enter · Esc</span>
                </div>
                <div class="list">
                    ${items.length === 0
                        ? html`<div class="empty">No matching actions</div>`
                        : items.map((item, i) => html`
                            <div class="row ${i === this.selectedIndex ? 'selected' : ''}"
                                 @mouseenter=${() => { this.selectedIndex = i; }}
                                 @click=${() => this._run(item)}>
                                <span>${item.label}</span>
                                ${this._renderKeys(item.accelerator)}
                            </div>`)}
                </div>
            </div>
        `;
    }
}

customElements.define('palette-view', PaletteView);
