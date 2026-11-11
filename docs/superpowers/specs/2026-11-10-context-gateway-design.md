# Context gateway design (increment 1)

Date: 2026-11-10. Status: approved in conversation.

## Goal

Every AI call leaves the machine through one chokepoint that redacts personal identifiers on-device, classifies the payload, routes it by policy, and records a manifest. The user sees what was redacted. Nothing in the services can reach a provider without passing through it.

## Scope

In: text redaction with reversible tokens, classification, policy routing with provider fallback or refusal, screenshot gate, JSONL manifest, Ask notice line, egress test.

Out (increment 2): OCR redaction of screenshot pixels, accessibility-tree text mode, settings UI for the policy, Datadog export.

## Modules

### `src/features/common/privacy/redactor.js` (pure)

- Detectors, each `{ type, regex, validate? }`: `SIN` (9 digits, optional spaces/dashes, Luhn), `CARD` (13-19 digits with separators, Luhn), `EMAIL`, `PHONE` (North American formats), `TERM` (case-insensitive blocked terms from policy).
- `redactText(text, { blockedTerms, map })` returns `{ text, hits }`. Each distinct value gets a stable token `[TYPE_n]` recorded in `map` so the same value maps to the same token across all messages of one call.
- `redactMessages(messages, opts)` walks OpenAI-style messages; redacts every string `content` and every `{type:'text'}` part; leaves image parts untouched (the gateway decides whether to drop them).
- `createRehydrator(map)` returns `{ push(chunk) -> string, flush() -> string }`. It replaces tokens in streamed text and holds back a trailing partial token (`[`, `[EM`, `[EMAIL_`) until the next chunk resolves it, so a token split across chunks still rehydrates.
- `summarize(hits)` -> `"1 SIN, 2 emails"`.

### `src/features/common/privacy/policy.js`

- `DEFAULT_POLICY` (also saved as `policy.default.json` for reference):
  ```json
  { "classes": { "pii": { "allowedProviders": ["ollama", "whisper"] },
                 "internal": { "allowedProviders": ["*"] } },
    "screenshot": { "attachFor": ["internal"] },
    "blockedTerms": [] }
  ```
- `loadPolicy(userDataDir)` merges `<userData>/gateway-policy.json` over defaults; a missing or invalid file logs and uses defaults.
- `classify(hits)` -> `'pii'` when any hit, else `'internal'`.
- `isProviderAllowed(policy, cls, provider)` and `chooseProvider(policy, cls, selected, candidates)`: returns `selected` when allowed, else the first candidate allowed for the class, else `null`.

### `src/features/common/privacy/manifest.js`

`appendManifest(userDataDir, entry)` appends one JSON line to `<userData>/manifests/YYYY-MM-DD.jsonl`. Entry: `{ ts, purpose, provider, model, class, redactions: {SIN: n, ...}, screenshotAttached, screenshotSha256, promptSha256, messageCount, routed: 'direct'|'fallback'|'refused' }`. Never contains the payload.

### `src/features/common/ai/gateway.js`

- `wrapLLM(provider, llm, meta)` and `wrapStreamingLLM(provider, llm, meta)`: intercept `chat(messages)` / `streamChat(messages)`.
  1. `redactMessages` -> hits, map.
  2. `classify` -> cls. Drop image parts unless `policy.screenshot.attachFor` includes cls.
  3. `chooseProvider`. If different from `provider`, build the replacement LLM through the factory with that provider's key and model (via `modelStateService`, lazily required). If `null`, throw `GatewayRefusedError` with a user-facing message.
  4. Append manifest.
  5. Call through. For `chat`, rehydrate `result.content`. For `streamChat`, attach `response.epsilon = { rehydrator, summary, hits }` so the Ask stream parser can rehydrate chunks.
- `checkSTT(provider, meta)`: STT is audio, class `internal`; appends a manifest entry and throws if the provider is not allowed for `internal`.
- The factory calls these in `createLLM`, `createStreamingLLM`, `createSTT`.

### Ask wiring (`askService.js`)

- `_processStream` pulls `response.epsilon`. Each decoded text delta goes through `rehydrator.push`; at stream end `flush()`. The UI chunks, the DB record and `fullResponse` all see rehydrated text.
- When `hits` is non-empty, a first synthetic chunk `_Redacted before sending: <summary>_\n\n` is emitted and stored.
- `GatewayRefusedError` is shown via the existing `ask-response-stream-error` channel.

### Egress test (`test/egress.test.mjs`)

Scans `src/` for `require('openai')`, `@anthropic-ai/sdk`, `@google/genai`, `@google/generative-ai`, `@deepgram/sdk`, `portkey-ai` outside `src/features/common/ai/providers/`. Fails on any hit.

## Data flow (Ask with a SIN on screen transcript)

keypress -> askService builds messages -> factory.createStreamingLLM returns wrapped LLM -> streamChat: redact (`[SIN_1]`), class `pii`, provider `anthropic` not allowed -> fallback to `ollama` if it has a model, else refuse -> manifest line -> provider call -> chunks rehydrated -> overlay shows real value with the notice line on top.

## Error handling

- Redactor never throws on odd input; non-string content is passed through.
- Policy file errors fall back to defaults with a warning.
- Manifest write failures log and never block the call.
- Refusal surfaces as a normal Ask error message, not a crash.

## Testing

Unit: redactor detectors (true positives, Luhn false positives rejected), token stability across messages, rehydration across split chunks, classification, provider choice (allowed / fallback / refused), policy merge, manifest entry shape, egress scan. Manual: Ask with a fake SIN in the question while Anthropic is selected and Ollama available; confirm the notice line, the rehydrated answer, and a `pii` manifest line routed to `ollama`.
