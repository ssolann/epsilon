# Epsilon

A local-first meeting co-pilot for macOS and Windows. Epsilon sits as an overlay on your desktop, transcribes the meeting (your mic and the other side's audio), keeps a running summary with action items, and answers questions on demand using the last few minutes of conversation plus what is on your screen.

Everything stays on your machine. There is no account, no cloud sync, and no telemetry. You bring your own AI provider key, or run fully offline with Ollama and Whisper.

## Features

- **Listen**: live transcript of both sides of the call, speaker-separated, with a summary that updates as the meeting goes on.
- **Ask**: one hotkey sends the recent transcript and a screenshot to your model and streams the answer into the overlay.
- **Local dashboard**: a Next.js app served from the main process for browsing past sessions, transcripts and summaries. Data lives in a local SQLite database.
- **Providers**: Anthropic (Claude), OpenAI, Gemini, Deepgram for speech-to-text, plus Ollama and Whisper for a fully offline setup. Model aliases and fallback chains live in `src/features/common/ai/models.json`.

## Quick start

Prerequisites: Node.js 20.x and Python 3. On Windows you also need the Visual Studio Build Tools.

```bash
npm run setup
```

That installs dependencies for the app and the dashboard, builds both, and launches Epsilon. On first launch it asks for microphone and screen-recording permission, then for a provider: enter an API key or pick Ollama/Whisper.

Day to day:

```bash
npm start
```

Run the unit tests:

```bash
npm test
```

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + \` | Show or hide the overlay |
| `Ctrl/Cmd + Enter` | Ask, using recent transcript and screen |
| `Ctrl/Cmd + Arrows` | Move the overlay |

Shortcuts are editable from Settings.

## Where your data lives

| What | Where |
|---|---|
| Transcripts, summaries, Ask history | SQLite in the app's user-data folder (`~/Library/Application Support/Epsilon` on macOS) |
| Provider API keys | Encrypted in that database; the encryption key is in the OS keychain under the service name `glass-local` |
| Nothing else | No cloud, no accounts, no analytics |

What does leave the machine: whatever you send to the AI provider you configured. With a cloud provider that is the audio stream for transcription, the recent transcript, and a screenshot on each Ask. If that is not acceptable for your environment, use Ollama and Whisper.

## Project layout

- `src/` Electron main process, services, repositories and the Lit overlay UI. See `docs/DESIGN_PATTERNS.md`.
- `web/` the Next.js dashboard and its small Express backend, which talks to the main process over IPC.
- `test/` Vitest unit tests.
- `docs/IMPROVEMENT_PLAN.md` the roadmap.

## Contributing

See `CONTRIBUTING.md`. Pull requests should keep the app local-only: no new network destinations beyond the user's chosen AI provider.

## Licence

GPL-3.0. See `LICENSE`.
