# HISAAB PAKKA — Delivery TODO

## Voice loop

- [ ] The browser uses a large push-to-talk control and captures real microphone audio. Browser capture code is present; final acceptance remains the judge-device microphone rehearsal.
- [x] The backend connects to Gnani Prisma v3.0 over WebSocket with the API key protected server-side. Live smoke test received Prisma `connected`.
- [ ] The browser receives streamed transcript events and displays the current transcript/status. The bridge and UI handlers are implemented; end-to-end browser acceptance remains the judge-device rehearsal.
- [ ] The backend connects to Gnani Timbre v3.0 over WebSocket and the browser schedules returned raw PCM audio chunks. Provider smoke test received 31 chunks / 92,160 bytes; audible browser acceptance remains the judge-device rehearsal.
- [x] The first assistant turn discloses that it is an AI in Hindi.

## Ledger behavior

- [x] The ledger records customer credit and repayment transactions with deterministic integer arithmetic.
- [x] Synthetic fixtures include two customers named Ramesh with descriptors and one Suresh.
- [x] Amounts support Hindi-English code-mix, numeric forms, and the demo amounts ₹340, ₹430, and ₹200.
- [x] Credit versus payment direction is represented explicitly and is never silently guessed when ambiguous.
- [x] Relative dates including aaj, kal, and parso normalize to explicit transaction dates.
- [x] Compound spoken entries create separate draft events and commit each exactly once after confirmation.
- [x] Same-name customers trigger a short clarification question before confirmation.
- [x] A spoken correction changes only the targeted draft field and preserves other draft events.
- [x] No uncertain or unconfirmed transaction mutates the local ledger.
- [x] Daily-credit and customer-outstanding queries return deterministic spoken answers.

## Interface

- [x] The screen shows live interaction status, current draft, correction/confirmation state, balances, transaction history, and the audit trail.
- [x] The layout is responsive for Android and desktop browser widths.
- [x] The UI makes the sequence understood → corrected → confirmed → committed visible.
- [x] The app provides a local reset for synthetic demo data.

## Validation and submission

- [x] Typecheck, six deterministic tests, and production build pass.
- [x] README contains setup, architecture diagram, Gnani endpoints/models, responsible-AI notes, and known limitations.
- [x] README and `docs/demo-and-pitch.md` contain the two-to-three-minute demo script.
- [x] README and `docs/demo-and-pitch.md` contain a pitch outline of no more than six slides.
- [x] README contains a checklist against the hackathon judging criteria.
- [x] No API key is committed, exposed in browser code, or written into documentation.
- [ ] Rehearse the complete live microphone round trip on the actual judge device, measure substantive-answer latency, and record the screen demo.
