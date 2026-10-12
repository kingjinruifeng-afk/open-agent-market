# Buyer approval reference / 买方授权参考

Status: implemented local TypeScript reference in `src/buyer-approval.ts`; final acceptance evidence is recorded in [STATUS](STATUS.md). This is not a verified commercial-host integration or payment firewall.

## Boundary

OAMP signatures authorize protocol events. They do not establish that a human understood purchase costs. The host must retain the signing key outside model-accessible tools and expose human approval through an authenticated trusted interface. Giving the model both raw signing access and an approval tool defeats this boundary.

The proposed helper stores pending previews and one-use approvals in memory. A restart discards them. It cannot prove who clicked a button, persist consent, cancel an external subscription or prevent a seller charging outside the recorded agreement. Real integration must supply these controls separately.

## Local terms profile `buyer-terms/0.1`

These terms stay private. The existing `termsCommitment` hashes canonical terms and a salt; only the hash enters the quote and acceptance. This profile does not change OAMP/0.1 event payloads.

| Field | Meaning |
|---|---|
| format | `buyer-terms/0.1` |
| currency | Three uppercase letters; must match the buyer's budget currency. |
| items | Nonempty item list: name, positive quantity, nonnegative integer unitPriceMinor. |
| fees | Explicit taxMinor, shippingMinor and otherMinor. Unknown or omitted fees block acceptance; zero must be explicit. |
| discount | amountMinor and readable conditions; a discount is not proof of a truthful original price. |
| extras | Explicit list of name/priceMinor. Empty means none. Any extra requires an allowExtras policy plus human approval. |
| totalMinor | Must equal items + fees + extras − discount, using checked integer arithmetic. |
| subscription | Explicit null, or trialEndsAt (null for no trial), renewalPriceMinor, intervalDays and cancellation text. |
| returns | Readable return/refund conditions, including any restrictions. |
| source | url and checkedAt. Source is a seller-provided reference, not verification and not automatic fetch permission. |

Strings are bounded (item names 200 characters, conditions 1,000, source URL 1,500); at most 20 items and 20 extras; terms at most 24KB. Preview lifetime is at most five minutes and never beyond quote expiry. The store holds at most 100 previews; expired unattempted entries are pruned, attempted entries remain for reconciliation until host restart. Reject unknown profile fields, unsupported versions, unsafe numbers, negative totals, missing conditions and unknown fees. Provide plain preview data; a real host renders it safely without executing seller text or using it as tool instructions.

Buyer policy: currency, maxTotalMinor, allowExtras, allowSubscription, maxRenewalMinor. This local policy differs from the immutable dispute policy referenced by the OAMP quote. This version approves one initial acceptance only. `allowSubscription` does not authorize later charges; each external renewal remains subject to the real host's separate authorization.

## Host lifecycle

1. Prepare: retrieve and verify a stored signed quote from the configured trusted node's accepted history (which validates signing authority), confirm bound buyer, terms commitment and expiry, inspect current signed listing, validate all private terms and buyer policy. Snapshot caller inputs; return a separate copy of cost/renewal/extras preview data with seller-claim limitations.
2. Approve: a trusted human-facing host action passes the exact displayed snapshot to `approve(id, displayedPreview)`. Canonical equality with the internal preview is required; an altered display is rejected. `getPreview(id)` returns a fresh authoritative copy to render before a new approval. Bind quote event/subject, seller, buyer, listing version, terms hash, policy and deadline. The host is responsible for actually rendering the supplied snapshot and authenticating the human action; equality alone does not prove a person saw it. An approval method must never be exposed as a model tool.
3. Accept: refresh quote/listing; require the original approval, current matching policy and unchanged private commitment. Reject expiry, changed listing or policy. Consume approval synchronously before awaiting event publication; concurrent requests cannot reuse it.
4. Reconcile: an uncertain publication burns approval. Keep the attempted signed event ID so the host can query the node; no automatic new acceptance or payment retry. Require a fresh review if the original attempt was not accepted.

Checking the current listing is deliberately stricter than the core quote rule: a current listing change prompts a new preview even if the old quote remains protocol-valid. This refresh is a preflight check with a concurrent-update window, not atomic stock reservation. Actual stock and external checkout conditions must still be checked by a real host.

## Evidence levels

- Automated tests: input validation, binding, one-use behavior and node acceptance.
- Local demo: simulated seller/buyer and trusted approval call; no actual human UI, real payment or named host integration.
- Real-host gate: persistent scoped signing, human authentication, durable consent, availability/checkout checks, cancellation/renewal adapter and measured budgets.
- Commerce gate: consenting actual users, independent transaction evidence and honest outcomes. Local tests cannot establish this gate.

## Run the reference

`npm run demo:buyer-approval` uses an actual local HTTP node, simulated seller/buyer identities and a simulated trusted-host approval call. It demonstrates refusal of an unapproved subscription, renewal-price checks, exact policy binding, one-use acceptance, reconciliation and private-field exclusion. The report is `artifacts/buyer-approval-report.json`; it contains no private terms or salt.

Host API: instantiate `BuyerApprovalGate` with an operator-pinned `Client` and a host-owned key; `prepare(quoteEventId, commitment, buyerPolicy)` returns private preview data; trusted `approve(preview.id, preview)` checks the displayed snapshot and records local consent; `accept(preview.id, tradeId, currentBuyerPolicy)` signs and publishes an agreement. `reconcile(preview.id)` returns the attempted event ID and whether the configured node has it. It does not report payment success.

Budget checks apply to one initial agreement and its stated renewal price; they are not a cumulative wallet ledger. Caller-controlled terms and preview changes cannot mutate the internal approved snapshot. A malicious host/signer can bypass this helper through the existing SDK. Real integrations must isolate keys and approval authority, persist consent, control external billing, and treat the final listing read as non-atomic preflight.
