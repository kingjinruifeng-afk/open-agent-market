# Independent upgrade-plan review · 2026-10-12

Latest verdict after revision: **PASS for the upgrade plan only**. B1 is resolved; no blocking plan finding remains. U1–U3 may execute within the reviewed scope. U4 remains a required independent implementation review, followed by U5 draft-PR delivery. No merge, real commerce or production readiness is approved.

Initial verdict: CHANGES_REQUIRED. The original findings and their disposition are retained below.

## Baseline and review method

- Independently checked checkout HEAD: `e1b3f4407a52ba25097fc6c9d5fb42284b2ee067`.
- Working-tree changes at review time: the three new planning documents only. No implementation changes were present.
- Reviewed `UPGRADE_PLAN_2026-10-12.md`, `BUYER_APPROVAL.md`, `PILOT.md`, `COMMUNITY.md`, `PLAN.md`, `ROADMAP.md`, `STATUS.md`, `PROTOCOL.en.md`, and the repository host skill.
- Inspected `src/domain.ts`, `src/protocol.ts`, `src/sdk.ts`, `src/node.ts`, the Python client, domain/node/interop tests and fixtures, Python interop process, `package.json`, `tsconfig.json`, and `.github/workflows/check.yml`.
- This is a static plan/source review. I did not execute tests, verify fresh cloud CI, modify implementation, or inspect private production material. A plan verdict does not establish runtime correctness or Gate B readiness.

## Confirmed source findings

1. `independentCounterparties` is a distinct `review.author` principal count. It does not establish independently controlled people. Identity rotation preserves a principal; counting actor keys instead would introduce a new error.
2. `acceptedTrades` counts accepted quote agreements. Participant `payment_claim`, `delivery_ack` and review events can all be generated without independent payment or delivery evidence. The output correctly retains `independentlyVerified: 0` and a null total score.
3. Delegation grants constrain event kinds and expiry, not financial amounts or informed human consent. A direct SDK caller holding the key can bypass the proposed helper. The plan accurately treats the helper as a trusted-host boundary, not node-wide enforcement.
4. The current quote schema binds a listing revision and immutable dispute policy. Core `trade.accept` intentionally permits an existing quote after a later listing update. A helper can recheck state before submitting, but cannot make its refresh and the node's acceptance atomic without changing the core contract.
5. The existing HTTP event lookup and listing APIs suffice for a local helper and reconciliation. No new human-approval endpoint, database migration, payment operation or signed event field is necessary for this reference.
6. Real Python is already an actual subprocess acceptance check with failure on missing interpreter; extending it to read the new reputation view is feasible. CI uses `.github/workflows/check.yml` and currently runs check/demo on Ubuntu and Windows.

## Blocking finding

### B1 — The reviewable PR is optional in the new plan but required by the repository's maintenance contract

Evidence: `docs/COMMUNITY.md` requires substantial implementation changes to go through a reviewable PR and prohibits automatic merging. U1 adds a new public read view and U2 adds a new approval helper; this is substantial implementation work. The plan's last rollback/review bullet instead says, “If a repository PR is later published,” which permits delivery without that required review surface.

Minimal correction:

- Make a draft PR against `oldjin-ai/open-agent-market` a required delivery step after local implementation review passes.
- Record the branch/commit, PR URL and exact cloud CI state separately; never equate local tests or plan approval with cloud CI success.
- Keep merging, release retagging, deployment and real trial enrollment outside this task.
- If authorized GitHub writing is unavailable, retain the locally reviewed patch and record the uncompleted PR step. Do not obtain tokens or alter account permissions, and do not call the entire delivery complete.

This does not require new user confirmation: the owner has already authorized this repository's publication and ordinary maintenance. It needs a consistent, reviewable plan.

## Nonblocking implementation-review notes

These fit the existing approved technical scope; they do not require another protocol feature. The final implementation review should check them explicitly.

### N1 — State refresh is a best-effort check, not an atomic quote/listing guarantee

Document that a listing may change after the helper's final read. Tests should distinguish a change detected between prepare and accept from a change occurring after the final read. Do not claim the helper prevents every concurrent listing change or reserves availability. Core quote semantics remain unchanged.

### N2 — Name the two different policies separately

Use `buyerPolicy` for local spending/extras/subscription rules and `disputePolicy` or `quote.policy` for the immutable protocol review policy. Bind both relevant values, but do not imply the local budget is a new `policy.publish` field or that the node enforces it.

### N3 — Bind private snapshots, not mutable caller objects

Ensure terms, buyer policy and approval preview are copied/canonicalized into internal state. Mutating caller-owned nested data, replacing a preview ID, replaying an approval in another host instance, or concurrently submitting must not change what gets signed or consume an approval twice. Include meaningful tampering tests and the failure-after-publication/reconciliation case, not only failure-before-publication.

### N4 — Preserve the distinction between a signed event and accepted authorized history

Prepare should verify quote kind, subject/event ID, seller/listing owner, buyer, commitment and dispute policy. The selected node and stored history remain a declared trust dependency; a valid signature alone is not proof of current authority or actual commerce. The helper must not describe unverified arbitrary quote JSON as a stored accepted quote.

### N5 — Keep normative documentation and host instructions in sync

The English protocol points to `skills/open-agent-market/references/protocol.md` as the Chinese normative reference. Include that reference when documenting endpoint view selection, and update the host skill so a model does not receive the private signing key and trusted approval action as ordinary unrestricted tools. Legacy metadata is a deprecation aid; it cannot force an old consumer to interpret a misleading name correctly.

## Assessment of the planned acceptance gates

- U1 is appropriate if both views are calculated from the same event set, legacy numerical values stay stable, principal counts survive key rotation, circular/repeated trades remain participant evidence, and reads do not alter signed history. The new view is explanatory, not a new anti-collusion formula.
- U2's one-use approval, checked integer arithmetic, strict missing/unknown-term rejection and failed-publish consumption are meaningful local correctness checks. A demo calling a trusted approval method is not a human-authentication test, real budget enforcement across purchases, or recurring-charge control.
- U3 correctly moves bounded comparison discovery forward without declaring a validated subscription pivot, recruiting participants, or relaxing Gate B. Business sample sizes and thresholds remain prerequisites before real recruitment.
- U4 must be a fresh final-diff review with recorded command results, real Python execution and no unresolved blocker. The plan itself cannot substitute for U4.

## Re-review trigger

The initial review required correction of B1 and independent re-review before implementation. That re-review has now been completed as recorded below.

## Revision re-review and disposition

Re-read the revised plan and buyer-approval document, and checked the working tree again. Changes were still confined to the four planning/review documents; implementation had not started.

- **B1 resolved:** U5 is now a mandatory draft-PR delivery step after U4 PASS. The plan explicitly requires task attachment, exact branch/commit/PR/cloud-CI evidence, forbids merging and deployment, and records U5 incomplete when writing permission is unavailable without obtaining tokens or modifying account permission.
- **N1 clarified:** Both documents explicitly state that listing refresh is a preflight check with a concurrent-update window, not atomic reservation.
- **N2 clarified:** The local buyer policy and immutable quote dispute policy are expressly distinct.
- **N3 clarified:** Internal snapshots and separately returned preview copies are required. Tampering, cross-instance use, concurrent submission and uncertain-publication behavior remain final implementation review checks; documentation alone does not prove them.
- **N4 clarified:** The quote must be obtained from the configured trusted node's accepted history; its signature alone does not establish delegation authority.
- **N5 retained:** Keep the Chinese normative reference and host instructions aligned during U3. This is within the planned documentation scope and does not block the plan.

Reviewed document SHA-256 values before the author's subsequent execution-status updates:

| Document | SHA-256 |
|---|---|
| UPGRADE_PLAN_2026-10-12.md | `13F77B1E6E18D6CFF792CCB2D83BC109A8B36A8340DD65B2030F79BC881F172A` |
| BUYER_APPROVAL.md | `1413ED47DD9F9549660906F0AB2327B9B727949AA67E47BACBBFA94D96A45E61` |
| PILOT.md | `CAB2726008BEB353A306DEC19729B74411AD47145BA3B800C03BB8721A650D6F` |

**Final plan verdict: PASS.** Implementation may begin under U1–U3. Scope changes to signed events, database schema, reputation formula, mandatory trust policy, money flows or public deployment require separate review. Runtime correctness, final privacy/compatibility checks and cloud-CI results remain unverified until their respective later gates.
