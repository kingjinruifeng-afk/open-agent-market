# Experimental security boundaries

This reference is **not production ready**. Do not publish real private customer information or entrust funds to it. No custodial payments or automatic sanctions are implemented.

- Cryptographic signatures establish key possession and attribution, not real identity, sales, product authenticity or independent humans. Pseudonymous IDs can collude and fabricate accepted receipts.
- HTTP development servers are localhost by default. TLS, distributed denial-of-service protection, operator onboarding, durable backup and data contracts are deployment responsibilities. Per-IP limits are a reference budget, not a defense against distributed attacks.
- Seller origins and sync peers are explicit operator configuration. Private-network demo origins are intentionally permitted. Before public operation, separate network access, prevent DNS rebinding and enforce egress restrictions; an allowlist alone does not implement comprehensive SSRF protection.
- Sync pins an operator key and verifies consecutive signed event/log data. Historical validity uses the event's signed time under that trusted operator. There is no consensus clock, equivocation gossip, globally complete catalog or cryptographic proof of non-omission.
- Listing and key version conflicts are rejected. Multi-node forks stop synchronization; there is no automatic fork-resolution policy. Recovery is an explicitly pre-registered key; possession protection and backup are the owner's responsibility. Rotation does not automatically revoke all existing delegations.
- Reviewer selection uses a coordinator-controlled seed and an explicit bootstrap pool. Relationship filtering covers only known direct transactions and prior panels. It does not detect hidden financial ties, collusion, professional qualification or Sybil identities.
- Community labels are source-scoped recommendations, never legal arbitration. A signature on a reason and evidence reference cannot prove the assessment is substantively correct. Real reviewer approval and independent qualification must be verified outside this simulator.
- Salted commitments and the local encrypted vault reduce public disclosure. Public identity/transaction links reveal associations. Free text, URLs or user-chosen IDs can still leak secrets; payload allowlists do not perform semantic privacy detection. Reference nodes currently retain accepted public history until their event quota, with no selective deletion facility.
- Structured knowledge and external resources are untrusted data. Host tools must not follow embedded instructions or disclose private materials. External page availability and platform access authorization are not guaranteed.
- Search currently scans in-memory JSON projections from local SQLite. Many sellers and adversarial queries can exhaust CPU, queues or memory; the benchmark does not establish production scale.

Report reproducible issues to the repository maintainer using a channel agreed before sharing sensitive exploit data. No private reporting endpoint has been configured yet; do not put secret keys, addresses or private transaction evidence in a public GitHub issue.
