# OAMP/0.1 reference protocol

Experimental wire contract. [中文规范](../skills/open-agent-market/references/protocol.md) and implementation validators must be kept consistent. The public [vector](../tests/vectors/oamp-v0.1.json) is a test identity, never a production key.

## Canonicalization and signatures

UTF-8 JSON with null, booleans, safe integers, valid Unicode strings, arrays and objects. Sort object keys by UTF-16 code units. Reject floats, unsafe integers, lone surrogates and unknown envelope or payload fields. Money uses integer minor units; time uses Unix milliseconds. This is a restricted JCS profile, not support for all RFC8785 numbers.

An event contains version=`oamp/0.1`, kind, subject, principal, actor, publicKey, issuedAt, nonce, payload, id and signature; delegation is optional and signed. publicKey is canonical base64 Ed25519 DER/SPKI. actor is `oamp:` + SHA256(publicKey's base64 string). principal is the persistent identity, which can differ from the current actor after rotation or delegation.

Remove id/signature to form body. `id=SHA256('oamp/0.1:event:'+canonical(body))`; Ed25519 signs the 32 raw hash bytes. The event's issue time must not exceed the accepting clock by more than30 seconds. Procedural events additionally have a freshness requirement; trusted historical replay uses their signed timestamps.

A node record removes publicKey/actor/signature to form body and signs UTF-8 `oamp/0.1:record:` + canonical(body). Operator keys require a trusted pin; a record that supplies its own key does not establish trust in that operator.

## Event kinds

| kind | subject | Required payload |
|---|---|---|
| identity.create | root actor ID | name, roles; optional recovery actor ID |
| identity.rotate / identity.recover | persistent principal | newPublicKey; current controller or registered recovery key |
| delegation.grant | unique grant ID | delegate, scopes, expiresAt |
| delegation.revoke | operation subject | grant |
| listing.put | listing ID | revision, previous, title, category, priceMinor, currency, serviceUrl, facts, faq, resources, active |
| policy.publish | immutable policy ID | reviewers, commitMs, revealMs, appealMs, retentionDays |
| quote.offer | quote ID | listing, listingVersion, buyer, termsHash, expiresAt, policy, reservation=false |
| trade.accept | transaction ID | quote, termsHash |
| trade.fact | transaction ID | phase, evidence |
| review.submit | transaction ID | target, dimension, score, text |
| review.amend | transaction ID | same review fields and previous effective review event ID |
| case.open | case ID | trade, claim, evidence |
| case.response | case ID | statement, evidence |
| case.assign | case ID | round, seed, reviewers |
| case.commit | case ID | round, commitment |
| case.reveal | case ID | round, ballot, salt |
| case.appeal | case ID | reason |
| case.finalize | case ID | empty object |
| case.correction.vote | case ID | decision, reason |
| case.correct | case ID | votes: five distinct eligible correction event IDs |

Listings start revision1/previous empty. Updates bind the current event ID and increase revision by1; active=false delists. facts/faq are string maps. resources contain url/relation and optional digest; relation is manufacturer, seller or reference. Their canonical aggregate must fit24,000 bytes. serviceUrl is an HTTP(S) origin without credentials, path, query or fragment. Source links are references, not automatic fetch authorization.

A quote binds a live listing version, known buyer, immutable policy, salted termsHash and expiry. One bound buyer can consume it once; a later price update does not rewrite an existing quote. Private addresses/conversation/payment identifiers stay outside public event fields. A signature does not prove inventory reservation, payment or fulfillment. The host must recheck availability and terms before acceptance.

Buyer phases: payment_claim, delivery_ack, return_requested, refund_received. Seller phases: shipment_claim, return_received, refund_claim. All currently carry participant-claim status, not independent verification.

Seller review dimensions: description, quality, shipping, service, resolution. Buyer dimensions: payment, handover, return_cooperation, communication. Scores1..5; one effective review per transaction/author/dimension; amendments preserve old signed history. Product description/quality requires a receipt acknowledgment claim, which itself is not proof of real delivery.

## Review and correction

An immutable policy names at least8 bootstrap reviewer identities and a coordinator. Round1 chooses3 reviewers; round2 chooses5 without reusing round1. Parties and known direct transaction relationships are excluded. The selection result is reproducible from its seed, but the coordinator controls the seed; hidden ties and unbiased randomness are not solved.

Ballot fields: outcome=buyer|seller|shared|insufficient, integrity=none|buyer|seller|both, reason and evidence event IDs. `commitment=SHA256(canonical({caseId,round,reviewer,ballot,salt}))`; salt is at least32 characters. A selected reviewer commits within the first window and reveals the matching ballot within the next.

The initial decision cannot become effective before the appeal window ends. An appeal activates a disjoint second panel. A majority of the complete panel is required for an outcome; a serious integrity finding additionally needs a majority supporting that same outcome and finding. Evidence references are attribution, not proof of judgment quality. Five new eligible reviewers may sign a correction, removing its effective label while retaining history.

Community review changes scoped reputation information and recommendations; it does not move funds, terminate accounts or constitute legal arbitration. Reviewer human approval is a host/pilot responsibility, not established by key possession.

## Endpoints and budgets

| Endpoint | Contract |
|---|---|
| GET /.well-known/oamp-node | Signed capabilities, operator, fees, retention, limits and export entry. |
| POST /v1/events | One signed event; local acceptance/checkpoint, not replicated durability. |
| GET /v1/events?cursor=0&limit=100 | Local sequence/log pages; limit1..200. |
| GET /v1/events/:id | Public signed event. |
| POST /v1/batch | ids array, at most50; ordered events or null. |
| POST /v1/sync | Configured source, operator Bearer token and pinned source key; bounded pages. |
| GET /v1/search | q, category, cursor, limit1..50, optional comma-separated fields. |
| GET /v1/listings/:id | Current signed publication/projection and presence, including historical access. |
| GET /v1/knowledge/:id?q=... | Structured facts/FAQ/references; modelCalls=0. |
| GET /v1/reputation/:id | Dimensions, samples, evidence classes, source-scoped labels; totalScore=null. |
| GET /v1/cases/:id | Current procedural projection. |
| GET /health?seller=:id&challenge=:nonce | Seller-controller-signed short-lived presence proof. |
| GET /v1/metrics | Local storage/cache/process measurements. |

Search fields: id, seller, title, category, priceMinor, currency, version, presence; id/version/presence always remain. Search covers only the visible active catalog of this node. It examines at mostlimit candidates and probes at most4 sellers simultaneously. Offline candidates can yield a short page; cursor still advances. A failed seller expires from discovery within the stated maximum ten-second cache window, not instantaneously.

Default budgets:120 requests per source IP per minute,64KiB request body,10,000 stored events. Peer response, source bucket and presence caches are bounded. These are reference budgets, not production DDoS protection.

Local log chain starts with64 zeroes; `chain=SHA256('oamp:log:'+previous+':'+event.id)`. Checkpoints sign local sequence and chain, and replay checks consecutive entries. Nodes can have different local order/checkpoints. There is no global total order, completeness proof or Merkle inclusion proof. A conflicting revision stops replication without overwriting the accepted local version.

Errors: `{error:{code,message}}`; unauthorized403, missing404, conflict409, body413, request budget429 with retry-after60, storage quota507. Unknown versions and fields fail closed. Public deployments require separate TLS, egress/ingress controls, retention contracts and backup verification.
