# Contributing to Epsilon

Thanks for helping. Epsilon is a small codebase with a few firm rules; read this before opening a pull request.

## Ground rules

1. **Local-only.** The app must not gain any network destination other than the AI provider the user configured. No analytics, no accounts, no cloud sync.
2. **Follow the architecture.** Views are dumb, services hold logic, repositories are the only code that touches SQLite. Details in `docs/DESIGN_PATTERNS.md`.
3. **No hardcoded model IDs in services.** Add or change models in `src/features/common/ai/models.json` and the provider lists in `factory.js`.
4. **Tests for pure logic.** Anything that does not need Electron (prompt building, model resolution, parsers) gets a Vitest test in `test/`.
5. **Secrets never land in git.** API keys, tokens and signing material stay out of the repo.

## Workflow

```bash
npm run setup      # first time
npm start          # run the app
npm test           # unit tests
npm run lint       # eslint
```

Open a pull request against `main` with a short description of what changed and why. Keep commits focused; a rename and a behaviour change should not share a commit.

## Reporting issues

Use the issue templates in `.github/ISSUE_TEMPLATE/`. For bugs, include the OS, the provider in use, and the main-process log lines around the failure.
