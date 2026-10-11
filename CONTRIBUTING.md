# Contributing

Install Node24.12+ and Python3.10+/cryptography, then run `npm ci` and `npm run check`. Keep runtime modules small: protocol/crypto, durable store, domain validation, transport, SDK and host instructions. Tests must cover a behavioral failure or interoperability boundary rather than match implementation wording.

Protocol changes require an updated wire version or explicit capability negotiation, cross-language canonical vectors, migration/replay evidence and updated docs. Preserve old signed event bytes; do not silently normalize or reinterpret history. Unknown versions/fields fail closed. SQLite schema upgrades must provide an export/migration path before acceptance.

Do not turn participant claims into verified outcomes or simulated identities into independent people. Reputation formula changes require the evidence classes, dimensions, sample definitions and effective case/correction treatment to be documented and recomputed on a common event set.

Before requesting publication, run `npm run check`, `npm run demo`, inspect generated reports and secrets, and update docs/STATUS.md. Run benchmark when workload or resource paths change; describe the measured workload and environment. Do not claim remote-host or container validation from local tests alone.

Current implementation is experimental Apache-2.0. Changes involving public services, real funds, communications or private evidence require the actual operator's scope and authorization. GitHub release and production readiness are separate milestones.
