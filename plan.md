# HISAAB PAKKA — Implementation Plan

## Product definition

HISAAB PAKKA is a correction-safe voice ledger for kirana shopkeepers. It handles Hindi–English code-mixed credit and repayment entries, asks short clarifying questions when customer identity or transaction direction is ambiguous, supports spoken correction before saving, and answers daily-credit and customer-balance queries from a deterministic local ledger.

The authoritative hackathon requirements are PS2 — Voice Khata. The supplied research report is the strategic starting point. The official Gnani documentation is the integration authority: Prisma v3.0 STT uses `wss://api.vachana.ai/stt/v3/stream` with `x-api-key-id`, `model=prisma-v3.0`, `language_code`, and PCM frames; Timbre v3.0 TTS uses `wss://api.vachana.ai/api/v1/tts` with `X-API-Key-ID` and JSON synthesis messages.

## Scope and constraints

The first implementation prioritizes a functioning real voice loop over breadth. It includes push-to-talk capture, backend-protected Gnani adapters, deterministic ledger arithmetic, synthetic customers, duplicate-safe commits, confirmation gating, correction state, same-name disambiguation, relative dates, compound transactions, query responses, local browser storage, and a visible audit trail. It excludes inventory, reminders, lending, payments, wake words, multi-user sync, and cloud transcript persistence.

No uncertain transaction changes the ledger. LLM extraction, if added later, can propose a candidate only; it cannot perform arithmetic or commit a transaction.

## Architecture

- `src/`: React/Vite counter interface and browser-side IndexedDB/localStorage ledger adapter.
- `server/`: Node HTTP server and browser WebSocket session bridge, with Prisma v3.0 STT and Timbre v3.0 TTS adapters.
- `src/lib/ledger.ts`: deterministic customers, transactions, balances, duplicate-safe commit, date normalization, and audit events.
- `src/lib/conversation.ts`: draft state machine and constrained text interpretation for the demo command set.
- `README.md`: setup, environment, Gnani endpoints, responsible-AI notes, demo script, and judging checklist.

The browser uses one application WebSocket for control and audio events. The server owns the Gnani key. Browser audio is PCM 16-bit mono; the initial bridge uses 16 kHz and sends a commit control frame at push-to-talk release. TTS chunks are decoded and played progressively in the browser.

## Design direction

Three compact directions considered: counter-ledger utility (<0.10), premium fintech dashboard (<0.10), and expressive conversational assistant (<0.10). Choose **counter-ledger utility**.

- **Design movement:** modern Indian counter tool: dense enough for work, warm enough for trust, with paper-ledger cues translated into a clean digital surface.
- **Core principles:** legibility first; every money mutation is explainable; voice is primary but text remains visible; ambiguity is surfaced rather than hidden.
- **Color philosophy:** deep ink/navy for confidence, turmeric yellow for active voice, mint/green for committed money, and warm paper neutrals for the ledger surface.
- **Layout paradigm:** a left rail for identity and status, a dominant central voice counter, and a right-side “proof” column for draft/audit/balances rather than a generic dashboard grid.
- **Signature elements:** large circular push-to-talk control, ruled ledger rows, and a four-step audit ribbon: understood → corrected → confirmed → committed.
- **Interaction philosophy:** every action gives immediate visual status; confirmation is deliberate; correction is celebrated as a safety feature.
- **Animation:** restrained 150–220 ms transitions; pulsing microphone ring only while listening; audit steps illuminate sequentially; no decorative motion during a live judge interaction.
- **Typography:** Inter for UI and a high-contrast serif display face for the HISAAB PAKKA wordmark; large tabular numerals for rupee amounts.
- **Brand essence:** “A voice khata that never guesses with your money.” Personality: dependable, direct, respectful.
- **Brand voice:** short bilingual prompts such as “Ramesh kaun sa?” and “Save karun?”; avoid banking jargon and pressure language.
- **Wordmark:** HISAAB in strong ink capitals with a small check-mark ledger stroke under PAKKA.
- **Signature brand color:** turmeric amber `#E8B84A`.

## Build workflow

1. Scaffold the smallest React/Vite + Node/TypeScript app and make the page listen on port 3000.
2. Add deterministic ledger fixtures and a text-only command path so the product is testable without voice.
3. Add the actual Prisma v3.0 and Timbre v3.0 WebSocket adapters behind the backend bridge.
4. Connect push-to-talk browser PCM capture and progressive TTS playback.
5. Add correction, ambiguity, query, interruption, reconnect, and duplicate guards.
6. Run typecheck/build and exercise the ledger with automated tests.
7. Record measured latency and known limitations in the README, then freeze the demo flow.

## Highest-risk integration points

1. Browser capture sample rate and PCM encoding matching the Prisma stream contract.
2. Browser WebSocket binary/control framing and backend fan-out.
3. Progressive playback of Timbre WAV/PCM chunks without overlapping audio.
4. Short-answer VAD behavior for “haan”, “nahi”, and correction interjections.
5. Live judge noise and endpoint latency. Keep the fallback visible: typed transcript/debug input is for development only and never presented as successful voice behavior.
