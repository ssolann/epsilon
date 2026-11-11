# Command palette design

Date: 2026-11-10. Status: approved in conversation, not yet implemented.

## Goal

Let the user navigate the overlay from the keyboard without memorising shortcuts: one hotkey opens a palette listing every action with its key; arrows and Enter run one. Also add keyboard access to Listen and Settings, which today need a mouse click on the header.

## Scope

In: palette window, action table, two new actions (Listen, Settings), shortcut-editor labels for the new actions, unit tests for the pure parts.

Out: a native menu bar, customising palette contents, mouse-driven reordering, any change to how shortcuts are stored.

## Components

### `src/features/shortcuts/actions.js` (pure, tested)

Single table of actions:

```js
{ id: 'toggleListen', label: 'Start / stop listening', mac: 'Cmd+L', win: 'Ctrl+L', inPalette: true }
```

Exports `ACTIONS`, `defaultKeybinds(platform)` (id -> accelerator), `labelFor(id)`, and `filterActions(actions, query)` (case-insensitive substring match on label, keeps table order). `togglePalette` is in the table but `inPalette: false`.

### `src/features/shortcuts/shortcutsService.js`

- `getDefaultKeybinds()` delegates to `defaultKeybinds(process.platform)`.
- The `switch(action)` becomes `getActionHandler(id)` returning a closure, used by both `registerShortcuts()` and the new `runAction(id)`.
- New handlers: `togglePalette` (show/hide the `palette` window and send it the current list), `toggleListen` (calls `listenService.handleListenRequest(label)` with the label the header would send for the current session state), `toggleSettings` (windowManager show/hide).
- `getPaletteItems()` returns `[{ id, label, accelerator }]` from the saved keybinds, excluding `inPalette: false`.

### Window

`windowManager.createFeatureWindows` gains a `palette` case cloned from `settings`: frameless, transparent, content-protected, `focusable: true`, hidden on blur. Positioned by `windowLayoutManager` directly under the header, same width as the header. Visibility goes through the existing `window:requestVisibility` event.

### `src/ui/palette/PaletteView.js` (Lit)

Rendered by `EpsilonApp` when `?view=palette`. Receives items over `palette:load`. Keeps `query`, `selectedIndex`. Keys: printable characters filter, `ArrowUp`/`ArrowDown` move, `Enter` runs `window.api.palette.runAction(id)` then closes, `Escape` closes. Rows show label left, key glyphs right, using the same glyph map `MainHeader.renderShortcut` uses (extracted to `src/ui/common/shortcutGlyphs.js`).

### IPC

- `shortcut:runAction` (invoke) -> `shortcutsService.runAction(id)`.
- `palette:close` (send) -> hides the palette window.
- `palette:load` (main -> renderer) carries the items.

Preload exposes `window.api.palette = { runAction, close, onLoad, removeOnLoad }`.

### Shortcut editor

`ShortCutSettingsView` lists keybinds by id; it needs labels for the three new ids. Labels come from `labelFor(id)` passed with `shortcut:loadShortcuts`.

## Data flow

1. User presses Cmd+K. Global shortcut handler calls `togglePalette`.
2. Service builds items from saved keybinds, sends `palette:load`, requests the window visible. Window gets focus.
3. User types and arrows; renderer filters locally.
4. Enter -> `shortcut:runAction(id)` -> service runs the same closure the global shortcut would -> renderer sends `palette:close`.
5. Blur or Escape -> `palette:close`.

## Error handling

Unknown id in `runAction` logs and returns `{ success: false }`. Missing target window (for example Ask not yet created) is a no-op, matching current behaviour. If a new default accelerator is already taken by a user's saved custom binding, registration logs the conflict and skips that action, as it does today.

## Testing

Vitest on `actions.js`: every action has a label and both platform defaults; defaults are unique per platform; `filterActions` is case-insensitive, keeps order, and returns all items for an empty query. Manual check: launch, press Cmd+K, run Listen and Settings from the palette, confirm Esc and blur close it, confirm the window is hidden from a screen recording.
