# Independent implementation review · 2026-10-12

Latest verdict after bounded correction and independent re-review: **PASS for the local implementation**. B1 and N1 are resolved; no blocking implementation finding remains. U5 draft-PR publication may proceed. Cloud CI, merging, deployment, human authentication and Gate B readiness are not established by this local verdict.

Initial verdict: CHANGES_REQUIRED. The original findings and their disposition are preserved below.

## Baseline, inspected material and independent execution

- Reviewed the task patch against `e1b3f4407a52ba25097fc6c9d5fb42284b2ee067` on `upgrade/evidence-buyer-approval-20261012` before commit/PR publication. Existing source remained frozen during this review.
- Inspected changed domain/node/SDK/Python-client code, the complete new buyer-approval helper/tests/example, updated domain/node/Python-interoperability tests, the main demo delta, package scripts, CI command, READMEs, PLAN/ROADMAP/STATUS, BUYER_APPROVAL/PILOT, English protocol, Chinese normative reference and host skill. No database, event-envelope or scoring-formula changes were introduced.
- Independently executed `npm run check`: typecheck passed; **29 tests / 29 pass / 0 fail / 0 skipped**, including a real Python subprocess and three-OS-process failure test. Exit code 0.
- Independently executed `npm run demo`: **PASS**, 56 public events and 7 assertions. Exit code 0; report dated `2026-10-12T06:07:21.211Z`.
- Independently executed `npm run demo:buyer-approval`: **PASS**, 15 public events and 8 assertions. Exit code 0; report dated `2026-10-12T06:07:16.419Z`.
- The generated reports explicitly preserve simulated-participant, no-real-payment and no-production-readiness boundaries. New public-event/report assertions exclude synthetic private conditions, salt, approval ID and private keys. I did not inspect production vaults, `.data` databases, private evidence or authentication information. Cloud CI for this unpublished patch remains unverified.

## Blocking finding

### B1 — Approving an ID does not bind the host's displayed snapshot

Location: `src/buyer-approval.ts`, `BuyerApprovalGate.approve`, and the mutable-preview test in `tests/buyer-approval.test.ts`.

`prepare()` returns a separate mutable preview copy while retaining the original terms internally. `approve(previewId)` only marks the internal entry approved; it does not receive or compare the snapshot presented by the host. The current test changes the returned preview's total from 1,100 to 1 minor unit, alters quote/seller fields, approves the same ID, and successfully signs the original 1,100-minor-unit commitment.

This demonstrates that caller mutation cannot alter signing, but also demonstrates that a host using that returned copy for its approval display can approve visibly different terms without detection. The documented trusted-human interface remains a necessary assumption, yet the helper's claim to bind approval to the exact preview needs an enforceable snapshot handoff. This is distinct from proving who clicked the button or whether a UI rendered honestly, which remain outside this local reference.

Minimal bounded correction:

1. Require the trusted approval call to supply the displayed preview snapshot and compare its canonical contents against the authoritative internal preview before recording approval; reject a mismatch. An equivalent authoritative-snapshot handoff is acceptable if its invariants are explicit and tested.
2. Keep that approval entry point excluded from model tools and keep the signing key private. Do not present the new comparison as human authentication.
3. Replace the existing mutation-before-approval success path with mutation rejection, followed by successful approval using an unchanged authoritative snapshot. Still test mutation after approval cannot change signing.
4. Update the example and documented API call. Re-run affected checks and request independent re-review.

No OAMP signed field, event schema, budget formula or node trust rule needs to change.

## Nonblocking finding

### N1 — Chinese endpoint table is interrupted by inserted prose

`skills/open-agent-market/references/protocol.md:80` places the existing `/v1/metrics` table row after the newly inserted explanation paragraphs. Move it back into the endpoint table before the blank line. The substantive new English/Chinese view descriptions agree; this is a rendering defect.

## Confirmed properties and practical limits

- **U1 compatibility:** Legacy default reads retain accepted-trade and distinct-principal numerical values, with unverified-independence warnings. The new opt-in view removes misleading names, preserves dimensions/distributions/case handling/algorithm and null total score, and adds descriptive concentration only. Unknown views fail closed at HTTP/client/domain boundaries. Principal rotation does not create a new counterparty; the circular/repeated-trade counterexample stays participant evidence with zero independent verification. History reads remain unchanged and the demo recomputes new-view dimensions after synchronization.
- **Strict private terms:** Canonical snapshots, bounded strings/counts, explicit fees, safe integer multiplication/addition, total agreement, currency/budget/extras/subscription limits and cancellation information are checked. Seller claims and URLs are not treated as truth verification or fetch permission.
- **One-use publication:** The helper checks approval/policy before and after asynchronous preflight, then synchronously records the attempted event before awaiting publication. Concurrent/repeated submissions cannot publish twice with the same approval. Failures before sending and lost responses after acceptance burn that approval; reconciliation returns the original event ID and node acceptance only.
- **Configured-node dependency:** An operator-pinned descriptor is verified and the signed quote is fetched from that configured node's accepted history. Listing owner/version and quote buyer/commitment are checked. This trusts the configured node's authorization projection; it is not an independent authority-history proof.
- **Non-atomic refresh:** The explicit regression test changes the listing after the helper's final read and confirms core acceptance of the original quote. Both documents acknowledge this window. Stock reservation, live checkout correctness and hidden seller changes are not established.
- **Operational limits:** Consent is memory-only; attempted entries remain for reconciliation and the documented 100-entry cap can require host restart. Budgets are per agreement, not cumulative wallet budgets. Key rotation/delegation, durable approvals, real human authentication, outside billing/renewal control and a named host integration remain separate work.
- **Delivery:** U5 draft PR remains required after local final review PASS; merging, deployment, release retagging and real trial enrollment remain outside scope. Gate B is unchanged.

## Re-review trigger

The initial review required correction of B1 and N1, affected checks and independent re-review before draft-PR delivery. That re-review has now been completed below.

## Bounded correction and independent re-review

- **B1 resolved:** `approve(id, displayedPreview)` synchronously compares canonical snapshot contents with the internal authoritative preview before setting approval. A mutated displayed snapshot is rejected with `PREVIEW_CHANGED`, and acceptance remains refused. `getPreview(id)` returns an independent authoritative copy that the trusted host can render afresh. Updated documentation expressly assigns actual rendering and human authentication to the host; equality itself is not represented as proof of a human action.
- **Regression evidence:** The revised test first alters nested price/quote/seller data and confirms approval rejection and lack of acceptance. It then approves an unchanged authoritative copy, mutates that copy's nested total and item name after approval, confirms internal preview values remain original, and exercises concurrent submissions. Exactly one acceptance is stored with the original terms commitment; re-approval and approval reuse fail. Cross-instance approval and uncertain-publication reconciliation checks still pass.
- **N1 resolved:** `/v1/metrics` is restored to the Chinese endpoint table before explanatory paragraphs. English/Chinese semantics remain aligned.
- All code, test, example and documentation call sites use the revised approval signature. The correction stays within the reviewed trusted-host reference scope and does not change OAMP events, store schema or scoring.

Independent verification after the final correction:

| Check | Result |
|---|---|
| `npm run check` | Typecheck PASS; 29/29 tests, 0 failed, 0 skipped, real Python executed; exit 0 |
| `npm run demo:buyer-approval` | PASS; 15 public events, 9 assertions including altered-display refusal; report `2026-10-12T06:11:15.135Z`; exit 0 |
| `git diff --check` | PASS; exit 0 |
| Main demo | Its source did not change during this correction; the independent 56-event/7-assertion PASS above remains applicable |

Reviewed final correction SHA-256 values:

| File | SHA-256 |
|---|---|
| `src/buyer-approval.ts` | `7A9A37CD9E4588496D662EA2B5CDCBB3475D7E3057D714C5F423C1E5684BB8C2` |
| `tests/buyer-approval.test.ts` | `529CE223A2E903E032187AB8459465207EC94513D3255D4D4C6BBDF77F3C1729` |
| `examples/buyer-approval.ts` | `932A3E8FCB114A09869171BC2B49507EFB3A77080F7561AE07233B17F6C73792` |

**Final local implementation verdict: PASS.** The author may deliver U5 as the mandatory draft PR and record its exact commit and cloud-CI results separately. No protocol/trust-policy change, real purchase, deployment or merge is approved. The trusted host still must supply an honest authenticated display and isolate signing/approval access; this correction only establishes snapshot equality and signing immutability inside the local helper.
