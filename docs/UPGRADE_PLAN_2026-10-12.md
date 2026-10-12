# Upgrade plan · 2026-10-12

Status: **Plan and final local implementation independently approved; U5 draft PR and cloud CI pending.**

U0 plan review passed before implementation. U1–U3 are implemented; U4 final implementation review [passed after bounded corrections](UPGRADE_IMPLEMENTATION_REVIEW_2026-10-12.md). Local validation: 29/29 tests with real Python, main demo 56 events / 7 assertions, buyer approval demo 15 events / 9 assertions. U5 delivery must record the exact branch commit, draft PR and its cloud CI separately. Gate B remains unchanged.

Baseline: `e1b3f4407a52ba25097fc6c9d5fb42284b2ee067`, clean working tree before this plan. This is the active upgrade plan after the original [PLAN](PLAN.md). The original T01–T09 history and Gate B criteria remain applicable.

## Goal / 本轮目标

Correct misleading evidence terminology; demonstrate explicit buyer approval for complete purchase terms; bring bounded buyer-demand discovery forward. Deliver local code and reviewable documentation. This round does not establish real host adoption, real commerce, independent operators or production readiness.

The owner authorized: document the upgrade, independently review it, and execute only after review passes. Keep the plan review and final implementation review separate. Approval of the plan does not prove implementation correctness.

## Discussion evidence

| Source | Feedback | Consequence |
|---|---|---|
| [Abozar: identities](https://x.com/abo0zar/status/2109494417019002885), [evidence labels](https://x.com/abo0zar/status/2109494417270653270) | Multiple identities can belong to one operator; signatures do not prove a sale. | U1 terminology and explicit collusion counterexamples. |
| [Sparker](https://x.com/PeerReview/status/2109249935182897374), [Andrew Haigh](https://x.com/a_haigh_/status/2109257387085324336) | Supply alone does not establish buyer demand; marketplace cold start matters. | U3 bounded demand validation in parallel with host work. |
| [Maurice on purchase approval](https://x.com/KI_Vater/status/2109264186307940425) | Understand how a person approves agent spending. | U2 trusted-host approval boundary. This was a question to another builder, not endorsement or a tested integration. |
| [Sai on subscription consent](https://x.com/SaiKris13819727/status/2109327342451802583) | Silence and opt-out trials are poor consent mechanisms. | U2 explicit recurring terms and renewal-price limits; no automatic renewal execution. |
| [Andrew on humanizing](https://x.com/andymewborn/status/2109345767861489867) | Keep the human element. | Plain approval previews with costs and tradeoffs. |
| Owner's consumer-protection direction | Discount mazes, bundled extras, surprise subscriptions. | A product hypothesis to test, not evidence that users have adopted OAMP. |

## Verified baseline findings

- `src/domain.ts:240`: `independentCounterparties` counts distinct author principals only.
- `acceptedTrades` counts accepted agreements; facts are participant claims; independently verified evidence is zero. Preserve the formula and historical event interpretation.
- `delegation.grant` limits event kinds and expiry; it does not enforce purchase amount, extras or recurring terms.
- `trade.accept` checks party, commitment, expiry and single quote use. It does not establish informed human approval, payment, inventory or fulfillment.
- The current SDK can publish events directly. A local helper cannot constrain a malicious signer or a host that exposes the raw signing key.
- Existing tests cover authorization, amendments and dispute procedures, but lack an explicit one-operator/multiple-identity circular-trade counterexample.

## Scope and execution sequence

| Package | Depends on | Allowed files | Deliverable and acceptance |
|---|---|---|---|
| U0 Plan review | None | This plan; BUYER_APPROVAL.md; PILOT.md; independent review report | A fresh reviewer checks code, compatibility, security boundary and feasibility. No unresolved blocking finding. |
| U1 Evidence views | U0 PASS | domain.ts, node.ts, sdk.ts, Python client; tests; protocol docs; demo | Explicit `evidence-v2` view with accurate identity/agreement names; legacy numerical fields remain opt-in/default-compatible; no formula or signed event change. Cross-language read and multi-key attacks tested. |
| U2 Buyer approval reference | U0 PASS | new src/buyer-approval.ts, tests, examples/buyer-approval.ts, package.json, existing CI command list, BUYER_APPROVAL.md | Strict local terms profile; trusted-host one-use approval; amount/extras/recurrence limits; binding and expiry; live local-node publish path. No external payment or named host integration. |
| U3 Docs and pilot preparation | U1, U2 | ROADMAP, PLAN entry, STATUS, both READMEs, repository host skill, PILOT, this plan | Clear boundaries, runnable instructions, feedback/metric template and narrowed candidate scenario. Actual recruitment and pilot results stay pending. |
| U4 Implementation review | U1–U3 | Independent review report; targeted fixes inside approved scope | Reviewer examines final diff and evidence; no unresolved blocker, full check/demo/approval-demo pass with real Python. |
| U5 Draft PR delivery | U4 PASS | Reviewed task files only; repository branch/PR metadata; execution record | Publish a draft PR as required by COMMUNITY.md, attach it to the task, and record exact branch/commit/PR/cloud CI separately; never merge. |

### U1 compatibility decision

The signed wire version remains `oamp/0.1`; SQLite schema and historical event bytes remain untouched. The scoring algorithm remains `reference/0.1`.

- Existing `GET /v1/reputation/:id` and `Client.reputation(id)` keep legacy fields and values. Add explicit legacy deprecation/independence metadata so their names cannot reasonably be presented as verification.
- Opt in with `?view=evidence-v2` or SDK `reputation(id, 'evidence-v2')`. Unknown views fail closed. Advertise supported views in the signed node descriptor.
- New view: `viewVersion='evidence/0.2'`, `acceptedAgreements`, `distinctCounterpartyIdentities`, `counterpartyIndependence='not-verified'`, and repeat-counterparty sample concentration. Remove misleading legacy names from this view. Preserve means, dimensions, evidence classes, case treatment, uncertainty and null total score.
- Concentration is descriptive (maximum samples from one identity and distinct identity count), not a new anti-collusion score or penalty.
- Demonstrations and new documentation use evidence-v2. Existing clients can continue reading legacy output; its eventual removal requires a separate compatibility decision.
- Recompute both views from the same event set and compare values; no migration writes. Test signed history remains byte-equivalent across view reads and synchronization.

### U2 security and compatibility decision

See [BUYER_APPROVAL](BUYER_APPROVAL.md) for the local terms profile and trusted-host boundary. This is an opt-in reference helper above the existing SDK, not node-wide spending enforcement.

The helper uses private terms with the existing salted commitment. No new OAMP event fields, endpoints for human approval, payment permissions or recurring-charge engine. The host retains the signing key and invokes approval through a trusted human interface. A model may request a preview or submit an already-approved preview, but cannot invoke the approval method or obtain the key.

Strict checks include safe-integer all-in price arithmetic; currency and budget; complete fee/discount/extras/recurring/return/cancellation terms; exact quote/terms/policy binding; short approval lifetime; refreshed quote and listing before acceptance; one-use approval consumed before the async publication attempt. An uncertain publish outcome is reconciled by event lookup, not automatic re-signing or approval reuse.

U4 bounded correction: approval must compare the exact displayed snapshot against the internal preview, rejecting a caller-mutated display. A fresh authoritative preview is available for the trusted host to render again. Actual rendering/human authentication remains a host responsibility. This strengthens the planned exact-preview boundary without changing scope or signed events.

The reference approval store is memory-only. Restart discards approvals. Snapshot all caller inputs and never trust returned mutable preview data on acceptance. Buyer policy means the local budget/extras/recurrence policy; the quote's immutable dispute policy remains a separate existing OAMP reference. A signed quote must be retrieved from the configured trusted node's accepted history; signature verification alone does not establish delegation authority. Listing refresh is a preflight check, not atomic reservation or protection against a concurrent seller update. It does not claim durable human consent, authentication of a UI click, truthful seller terms, inventory reservation or control of external billing. Those are real-host prerequisites. No automatic cross-language compatibility claim for the new TS host helper; Python reads the evidence view only.

## Acceptance evidence

1. U1: legacy compatibility and unknown-view rejection; repeated and circular colluding-identity trades still yield participant evidence and zero independent verification; delivery acknowledgments do not become independent delivery proof; rotation does not fabricate an extra principal; history unchanged.
2. U2: successful approved local acceptance; rejection without approval, on tampering/quote mismatch, unknown/missing fees, currency mismatch, unsafe/overflow arithmetic, excess budget, disallowed extras or subscriptions, excessive renewal price, expired quote/approval and changed policy/listing; concurrent/repeated submission publishes at most once. A failed publish burns the approval.
3. Privacy: the new example's public events and report contain no private terms/salt/approval token/signing key. No private production files are read.
4. Commands: `npm run check`, `npm run demo`, `npm run demo:buyer-approval`. Real Python must execute, zero skipped checks. Update CI to run the new example. Benchmark is not required: search/resource algorithms are unchanged.
5. U3: distinguish local simulated checks, unverified host integration and actual buyer use. No new production or payment-safety claims. Historical STATUS evidence stays dated rather than overwritten.
6. U4: independent final report cites concrete findings, disposition and commands. A plan PASS cannot substitute for U4.

## Deferred work

Real host selection, human authentication/durable approvals, external checkout/cancellation adapters, independent payments/fulfillment attestations, seller incentives, advertising/commission disclosure enforcement, scalable indexes, reviewer incentives and independent operators. Document pilot entry gates, but do not imply these dependencies are completed.

## Review, stop and rollback

- Plan review checks this baseline itself; author cannot self-approve. Reviewer may request bounded corrections. Revise and re-review before touching implementation.
- Stop dependent work on unexplained history changes, leaked private material, formula drift, bypassable approval presented as enforcement, broken legacy compatibility or missing real Python. Record the failure; retain independent documentation work where safe.
- Changes to the event schema, database schema, reputation formula, mandatory trust policy, external money flows or public deployment exceed this plan and require separate scope review.
- Backups of existing maintained documentation/skill are in ignored `artifacts/upgrade-20261012-before/`; implementation starts from the recorded clean baseline. Roll back only this task's patch after checking live dirty state; do not hard-reset unrelated changes or rewrite signed history.
- After U4 local PASS, deliver the reviewed changes through a mandatory draft PR, following COMMUNITY.md. Record branch, commit, PR URL and actual cloud CI result; attach the PR to this task. Do not equate local checks with cloud CI. No merge, production deployment, release retag, social messages or real trial enrollment belongs to this execution. If write permission is unavailable, keep the verified local patch and explicitly record U5 incomplete without requesting/extracting tokens or changing account permissions.

## Execution record

- U0: independent review initially CHANGES_REQUIRED (mandatory PR missing); B1 corrected and independently re-reviewed PASS. See [review report](UPGRADE_REVIEW_2026-10-12.md).
- U1–U3: local implementation and documentation completed; acceptance runs and U4 remain in progress.
- U5: draft PR pending U4 PASS, branch `upgrade/evidence-buyer-approval-20261012`.
