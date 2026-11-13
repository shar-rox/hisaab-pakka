# HISAAB PAKKA — Demo and Pitch

## Two-to-three-minute live demo

**0:00–0:15 — framing and disclosure**

Presenter: “This is Hisaab Pakka. The ledger does not change just because an AI guessed. It changes after the shopkeeper has corrected and confirmed it.”

Assistant: “Namaste, main Hisaab Pakka ka AI sahayak hoon. Aap udhaar aur jama bol sakte hain.”

**0:15–0:50 — compound entry and identity**

Shopkeeper: “Ramesh ka aaj teen sau chaalis udhaar, aur kal do sau jama kiye the.”

Assistant: “Doodhwale Ramesh, ya electrician Ramesh?”

Shopkeeper: “Doodhwale.”

Assistant: “Doodhwale Ramesh: aaj teen sau chaalis udhaar, kal do sau jama. Sahi hai?”

**0:50–1:20 — correction under interruption**

Press push-to-talk while the assistant is reading back.

Shopkeeper: “Nahi, udhaar chaar sau tees.”

Assistant: “Aaj chaar sau tees udhaar; kal do sau jama. Save karun?”

Shopkeeper: “Haan, save.”

Assistant, only after local commit: “Save ho gaya. Do sau tees rupaye baaki.”

**1:20–1:45 — required queries**

Shopkeeper: “Aaj kitna udhaar gaya?”

Assistant: “Aaj chaar sau tees rupaye udhaar gaya.”

Shopkeeper: “Doodhwale Ramesh ka total?”

Assistant: “Do sau tees rupaye baaki.”

**1:45–2:10 — controlled ambiguity**

Shopkeeper: “Suresh ko do sau diye.”

Assistant: “Udhaar gaya ya jama mila?”

Presenter: “It asks because direction changes the ledger. It does not guess.”

Cancel the draft by voice.

**2:10–2:40 — judge handoff**

Ask the judge to try another amount, a correction, or either Ramesh.

## Six-slide pitch outline

1. The counter problem: speech is fast; wrong amount and direction are costly.
2. Existing apps already digitize khata, and some already support voice.
3. HISAAB PAKKA’s contribution: clarify, repair, confirm, and show the commit trail.
4. Architecture: browser push-to-talk, Node backend, Prisma v3.0, Timbre v3.0, local ledger.
5. Evidence: six deterministic tests plus a live Gnani smoke test; include measured device latency after rehearsal.
6. Next validation: consenting shopkeeper tests, noisy-counter tests, broader code-mix coverage, and competitor comparison.
