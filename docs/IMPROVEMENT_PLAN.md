# Epsilon Improvement Plan

Date: 2026-11-10. Repo: `epsilon` v0.2.4, fork of pickle-com/glass (last commit 2025-07-20).

## 1. State of the repo (what I found)

**Blockers**
- **Upstream is gone.** `github.com/pickle-com/glass` returns 404. No more patches coming. You own this fork now.
- **Model IDs are stale and hardcoded.** `gpt-4.1`, `claude-3-5-sonnet-20241022`, `claude-3-haiku-20240307` (key validation), `gemini-2.5-flash`, `nova-3`. When a provider retires one, Ask dies mid-meeting with no fallback.
- **Zero tests.** CI only runs `npm run build` on macOS.
- **Full-screen screenshot goes to the cloud LLM unredacted** (`askService.js:252`). At a fintech this is a privacy incident waiting to happen.
- **A Portkey API key is committed in source** (`providers/openai.js:58,188`). Pickle's proxy, not yours, but it should be stripped.
- **macOS sandbox is disabled** in `entitlements.plist`; JIT, unsigned memory, debugger, library validation all off.

**Architecture (sound, keep it)**
- Electron 30 main process, service/repository pattern, every repo has SQLite + Firebase twins.
- Lit web components for the overlay (`AskView` 1.4k lines, `ApiKeyHeader` 2k lines).
- AI providers behind a factory: openai, gemini, anthropic, deepgram, ollama, whisper. Each exposes `createLLM / createStreamingLLM / createSTT`.
- STT: two websocket sessions (mic + system audio), keep-alive every 60s, session renew every 20min, 2s turn-completion debounce.
- Summarizer: fires every 5 transcript turns, last 30 turns, regex-parses markdown into `{topic, summary[], actions[], followUps[]}`.
- Ask: one 300-line system prompt (`epsilon_analysis`) with a fixed decision hierarchy: answer question > define proper noun > solve screen problem > fallback.
- Next.js dashboard (`web`) talks to the main process over IPC; Firebase for cloud sync.

**Local uncommitted work**: `ask:captureScreenshot` IPC exposed to the renderer (3 files + lockfile churn).

---

## 2. Ideation (ADHD run: 5 frames x 6 ideas, scored and clustered)

Scores are `[N novelty, V viability, F fit]` 0-10.

### Cluster A: on-device context firewall (redact, classify, route)
- On-device blur of SINs/account numbers/names before the screenshot leaves, show the user the image actually sent `[N6 V8 F9]`
- Single local hub that redacts and routes; cloud providers become interchangeable carriers by sensitivity class `[N7 V7 F9]`
- No pixels at all: read the accessibility tree + window title/URL, send structured text `[N8 V6 F8]`
- Residency policy file: meeting class -> allowed endpoints, refuse to boot a provider outside it `[N7 V8 F8]`
- Reversible tokenization: `[ACCT_1]` sent, re-hydrated locally in the answer `[N8 V6 F8]`
- "Negative ledger" proving what was NOT sent `[N8 V5 F6]`

### Cluster B: write-back with provenance (the "promise jar")
- Every spoken "I'll send that by Friday" becomes a draft Jira/Slack item, one-tap confirm `[N6 V8 F9]`
- Meeting-end signed "proposed changes" diff with transcript-turn provenance and idempotency keys `[N7 V8 F9]`
- Cross-dock: action item never sits in SQLite, rolls straight to an outbound lane with a release gate `[N6 V7 F8]`
- Human attestation on write-back: speaker, turn IDs, model version attached to each ticket `[N6 V8 F9]`
- Meeting output as a diff against the org's systems of record `[N8 V6 F8]`

### Cluster C: pre-positioned context (briefing pack)
- At T-10min, pull attendee Slack threads, their Jira tickets, linked Confluence pages into a local pack `[N7 V8 F9]`
- "Who is this person" sticky card when a name is spoken `[N7 V7 F9]`
- Meeting tombstone: "you decided this on March 3rd, and why" `[N7 V7 F8]`
- Calendar invite + linked docs as the primary context; speech is just a pointer into it `[N8 V6 F8]`
- Local glossary trie of Jira components, epic names, acronyms: zero-token proper-noun lookup `[N7 V8 F8]`

### Cluster D: evals, manifests, observability
- Manifest every LLM call: turn IDs, screenshot hash, model, prompt hash `[N7 V8 F7]`
- Returns desk: "wrong/stale/leaked" button on every answer, returns become the regression suite `[N8 V7 F7]`
- Frozen golden-corpus eval harness gating model/prompt changes `[N5 V8 F8]`
- Router of small typed skills (incident-status, define-from-glossary, draft-ticket), each with its own eval set `[N6 V7 F8]`
- Run cheap local + big cloud model, flag only when they disagree `[N8 V5 F6]`

### Cluster E: own the fork
- Model aliases (`fast` / `smart` / `stt`) resolved from a config file with ordered fallback chains `[N4 V9 F8]`
- Swap Firestore + Pickle sign-in for company SSO, keytar/safeStorage for tokens, re-enable sandbox, sign/notarize from CI `[N4 V7 F9]`
- Batch-truck summarizer: fire on token load or silence gap, not every 5 turns `[N5 V9 F8]`

### Cluster F: consent and visibility
- Per-meeting consent receipt, hash-chained, hard refusal to stream without one (Quebec Law 25, PIPEDA) `[N7 V6 F8]`
- Drop invisibility as a goal: visible recording indicator, disclosed participant `[N6 V7 F8]`
- Retention TTL per data class with crypto-erase receipt `[N6 V6 F7]`

### Traps (attractive, don't do)
- **Webcam/hesitation trigger for Ask**: webcam in a fintech plus false positives; creepy and unshippable.
- **Two models voting**: doubles cost and latency during a live call; disagreement is not a correctness signal.
- **Negative ledger**: proving absence is theater; the per-call manifest already gives the auditor what they need.
- **Rip out Firebase first**: large rewrite, zero user-visible value. Sequence it after the value features.
- **Standing agent that contradicts live Datadog facts mid-meeting**: great demo, but it interrupts the speaker and needs a confidence model that doesn't exist yet.

---

## 3. Converge: the shortlist

1. ★ **Context gateway** (Cluster A). The non-obvious pick. It is the feature that makes Epsilon *approvable* at a fintech, and it fixes the model-ID rot in the same module. Nothing else ships to coworkers without it.
2. **Proposed-changes queue** (Cluster B). The workspace integration you actually want: Jira/Confluence/Slack write-back, human-approved, with provenance. Replaces the regex-parsed `actions[]`.
3. **Briefing pack** (Cluster C). Pre-fetched meeting context. Turns "define proper noun from general knowledge" into "look it up in our Jira/Confluence". Also the read-side of the integration, so it shares connectors with 2.
4. **Eval harness from returns** (Cluster D). Cheapest route to the first tests this repo has ever had, and it grows from real use.

Cluster E is not a feature, it is the foundation sprint. Cluster F is a policy decision you need from legal/security before rollout, not something to build speculatively.

---

## 4. Focus: the three deepened branches

### 4.1 Context gateway (`src/features/common/ai/gateway.js`)

**Sketch.** One module that the factory wraps around every provider, so askService, summaryService and STT cannot reach a provider directly. A call enters as a typed envelope `{turns[], screenshot?, prompt, purpose}`. Stages: (1) capture the *active window* plus its title, bundle ID and URL via the accessibility API instead of `screencapture` full-screen; (2) OCR with Apple Vision (free, offline) to get text boxes, run Luhn/SIN-mod-10/email/phone detectors and a small on-device NER, paint opaque boxes with `sharp` before the 384px resize; (3) classify the payload (public / internal / PII / restricted) from app allowlist + redaction hits; (4) route by `policy.yaml`: restricted -> ollama/whisper only, internal -> approved endpoints, public -> anywhere; (5) resolve `fast` / `smart` / `stt` aliases from `models.json` with an ordered fallback chain walked on `model_not_found`; append a JSONL manifest per call; show the redacted image in a pre-send preview with "send / text only / cancel".

**Load-bearing risk.** OCR + regex redaction is probabilistic. One missed SIN to a cloud LLM is a reportable incident. Secondary: nothing enforces the chokepoint (sandbox off), so any file that imports a provider SDK directly bypasses it.

**First step.** Build a redaction red-team harness before any UI: ~200 synthetic screenshots (Jira, Slack, Datadog, a fake core-banking table) with injected fake SINs, account numbers, emails, names in varied fonts and themes, with ground-truth boxes. Implement `gateway.redactImage(buffer)` and measure recall per entity type. Fail closed: if OCR fails or confidence is low, send text only or nothing.

**Children.**
- Text-first mode: accessibility tree instead of pixels; fall back to redacted image only for canvas apps / remote desktops.
- Reversible tokenization: `[PERSON_2]` goes out, "Jane Doe" shows in the UI; mapping lives in memory per meeting.
- Egress enforcement: `session.webRequest` filter blocks LLM hosts not issued by the gateway, plus a CI lint that fails if any file outside `gateway.js` imports an AI SDK.
- Hash-chained manifest ledger shipped (images stripped) to Datadog LLM Observability: "what left the laptop, when, to which region".
- Signed central `models.json` pushed by IT so a retired model never breaks the fleet.

### 4.2 Proposed-changes queue (`src/features/proposals/`)

**Sketch.** New `proposalService.js` + sqlite/firebase repositories replaces the regex-parsed `actions[]`. The summarizer asks the LLM for strict JSON against a schema: `[{kind: jira_ticket|jira_comment|confluence_decision|slack_reminder, title, body, assignee_hint, evidence_turn_ids[], confidence}]`. Transcript rows gain stable turn IDs and ms offsets; the service rejects any proposal whose cited turns don't exist or don't contain the speaker/claim. Proposals land in a `proposals` table with status `draft|approved|edited|discarded|sent|failed`, an idempotency key `sha256(session_id + kind + normalized_title + sorted evidence ids)`, `model_id`, `prompt_hash`, `external_ref`, `approved_by`. A Lit `proposal-queue` component in the overlay: Enter approve, E edit, Backspace discard, J/K navigate, with the source sentence and timestamp shown. Approval enqueues an outbox job; one connector module per target executes it with the idempotency key stored as a Jira property / Slack metadata so retries and re-summarization dedupe. The dashboard renders the ticket link next to the highlighted transcript sentence; the Jira description carries a `epsilon://session/<id>?turn=<n>` deep link.

**Load-bearing risk.** Precision. If the LLM mis-attributes ("a hypothetical read as a commitment", wrong owner) the queue becomes noise and people rubber-stamp, which defeats the human-in-the-loop guarantee. Evidence grounding plus a visible source quote is what keeps approval honest. Secondary: Atlassian/Slack tokens must go in keytar/safeStorage with least-privilege scopes, never SQLite.

**First step.** Add stable turn IDs + ms offsets to the transcripts table and STT write path. Write a pure `extractProposals(turns) -> validated JSON` and a script that replays 5 saved sessions from SQLite and prints proposals with their cited quotes. Add the first unit tests (idempotency key derivation, evidence validation) before any UI or connector exists.

**Children.**
- Dry-run connectors: "preview as Jira payload" and a local-only outbox (export markdown/JSON) so security can review exact outbound payloads before OAuth is wired.
- Existing-state grounding: JQL/CQL search before drafting, so "create ticket" becomes "comment on PIPE-123".
- Approval telemetry as eval set: every approve/edit/discard plus the draft-vs-edited diff becomes labeled data and a per-prompt-hash precision dashboard.
- Follow-through pass: next meeting with the same attendees pulls statuses of previously approved tickets and proposes close / escalate / reassign.
- Voice or hotkey "capture this": force a proposal from the last N seconds with the speaker's own words as the anchor.

### 4.3 Briefing pack (`src/features/briefing/`)

**Sketch.** A scheduler polls Google Calendar (loopback OAuth, `calendar.readonly`, incremental sync) and fires at T-10min for events with 2+ attendees. Four fetchers run in parallel under a 20s budget: Slack (recent threads with each attendee), Jira (JQL on assignee/reporter plus keys parsed from the invite), Confluence (CQL on invite URLs and subject), and local Epsilon sessions (FTS5 over past transcripts and summaries filtered by attendee overlap). A cheap LLM pass compresses it into a structured pack: attendee cards, glossary `{term -> definition + source link}`, open action items, prior decisions, capped around 2-3k tokens, with a deeper on-disk store for lookups. At session start the compact pack is injected as a new prompt section above the transcript turns, and decision-hierarchy step 2 changes from "define the proper noun from general knowledge" to "resolve against the pack glossary first, cite the source, else say not in pack". The summarizer reads the same pack so action items match real Jira keys and people. A T-2min refresh only diffs Jira/Slack deltas.

**Load-bearing risk.** Governance and relevance, not plumbing. Slack DMs and Jira content flowing into a third-party LLM and cached on a laptop is a PIPEDA / third-party-risk issue, and a wrong pack (wrong "Sam", stale ticket) makes Ask hallucinate *with citations*, which is worse than a cold miss. Needs scoped OAuth, per-source opt-in, channel allowlist, encrypted-at-rest pack, TTL purge after the meeting, and a residency-compliant endpoint (that is, it depends on 4.1).

**First step.** Skip the integrations. Hand-build a pack for 3 real past meetings, paste it into the existing `customPrompt` slot, add the "resolve against pack first, cite source" rule to step 2 of `epsilon_analysis`, and replay 10 saved transcripts with and without the pack. Measure proper-noun accuracy and latency. Only if that wins, build the Calendar poller with a stubbed fetcher interface and add Jira as the first fetcher (most structured, least privacy-sensitive).

**Children.**
- Glossary-only mode: local trie of Jira components, epics, Confluence titles, acronyms; zero-token pre-annotation of the transcript.
- Pre-meeting prep card at T-2min: "last time you agreed X; Priya owes you Y; 2 tickets blocked", with Ask prefilled.
- Pack-as-delta: unknown ticket key or name spoken mid-call triggers a background fetch of just that item, with a "learned mid-call" badge.
- Regulated-meeting mode: allowlist-only sources, PII redaction, per-Ask source audit trail, Canadian-region or on-device model.

---

## 5. Sequenced plan

### Phase 0: own the fork (1 week)
Goal: it builds, it won't break overnight, nothing secret is in git.
- Strip the committed Portkey key and the `openai-glass` / Pickle-proxy provider.
- `models.json` with aliases (`fast`, `smart`, `stt`) and ordered fallback chains; providers read aliases, not literals. Update to current model IDs.
- Add Vitest. First tests: prompt builder, summary regex parser, alias resolution. Make CI run them on PRs, not just pushes to main.
- Commit or drop the local `ask:captureScreenshot` change.
- Decide on cloud: keep Firebase for now (it works) but make the Pickle sign-in path optional. SSO swap is Phase 4.
- Batch-truck summarizer: trigger on token count or 8s silence instead of `% 5 === 0`. Small, high value.

### Phase 1: context gateway (2-3 weeks)
Gate for everything that follows. Redaction red-team harness first, then `gateway.js`, then active-window + accessibility-tree capture, then pre-send preview, then per-call manifest. Fail closed.

### Phase 2: proposed-changes queue (2-3 weeks)
Turn IDs -> `extractProposals` + replay script -> `proposals` table -> overlay queue component -> dry-run outbox -> Jira connector (comment first, ticket second) -> Slack reminder -> Confluence decision log.

### Phase 3: briefing pack (2 weeks after a positive hand-built experiment)
Hand-built pack experiment -> glossary-only local index -> Calendar poller -> Jira fetcher -> Confluence -> Slack (last, most sensitive).

### Phase 4: hardening and rollout prerequisites
- Re-enable the macOS sandbox with only mic, screen-recording, network entitlements; sign and notarize from CI.
- Company SSO (Google Workspace OIDC) replacing Pickle/Firebase sign-in; tokens in keytar.
- Consent and retention: visible recording indicator option, per-session consent record, TTL per data class. **Needs a decision from legal/security before anyone else at the company runs this.**
- Returns desk button on every answer; returns feed the eval set.

---

## 6. Provocation

What if Epsilon is not a meeting tool but a *reconciliation daemon*? Every conversation (meeting, Slack huddle, hallway call recorded on your phone) is a stream of claims about the org's state, and Epsilon's only job is to diff those claims against Jira, Confluence and Datadog and queue the corrections. The overlay becomes a side effect. If that framing lands, the "Ask" hotkey is the least important feature in the app, and the proposals queue is the product.
