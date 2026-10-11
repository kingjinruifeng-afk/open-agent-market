# Roadmap / 路线图

The reference is an experiment, not a claim that network effects, real transaction evidence or adversarial trust have been solved. Changes should be driven by reproducible workflows and actual pilot evidence.

## Available today / 当前可用

Signed offers and identities, scoped authority, quotes/receipts, bilateral feedback, appeal/correction procedures, pinned replication, TypeScript/Python interoperability, a local demo and cost examples. See [status](STATUS.md) for exact evidence and limits.

## Next milestones / 下一阶段

| Priority | Work | Acceptance evidence |
|---|---|---|
| 1 | Real personal-agent host adapter | A repeatable publish → discover → knowledge → quote/accept workflow; persistent scoped keys; measured tool/model budgets. |
| 2 | Bounded scalable discovery | Indexed queries, stable cursors and declared coverage; active-seller expiry preserved under load; measurements across distinct sellers. |
| 3 | Independent clients and migration | Another implementation validates fixed vectors and dependencies; fork/recovery scenarios preserve identity and do not silently rewrite history. |
| 4 | Trust and reviewer threat model | Concrete fabricated-receipt/collusion attacks, qualification and relationship policies, selection manipulation analysis, privacy boundaries. |
| 5 | Two independent pilot operators | Documented retention/export contracts, real cost, recovery drill and publication after an operator fails. |
| 6 | Real commerce pilot | Consenting buyers/sellers, evidence categories, useful discovery and honest outcomes; ordinary returns/refunds/negative feedback are not punished. |

These are contribution tracks rather than delivery promises. No release date is committed before owners and acceptance evidence exist.

## Small starting points / 适合开始的任务

- Extend language-neutral conformance fixtures for malformed inputs, expired scopes and Unicode boundaries.
- Add a documented host-tool mapping using the existing SDK; start with one actual runtime.
- Improve Linux/Windows setup examples using measured behavior, not wording-only tests.
- Translate or clarify operator and architecture documentation without changing normative fields.

Discuss scope in an issue before changing protocol versions, reputation semantics or database schemas. A small tested contribution is more useful than a large compatibility claim without a working host.

## Beyond the pilot / 试点后扩展

Optional verified payment/logistics attestations, stock reservations, private evidence access, selective subscriptions, source mirrors, category-specific schemas and booking/service extensions. Optional checkpoint anchoring and content-addressed storage are integrations, not mandatory token systems.

当前重点是把个人 Agent 的真实流程接起来，并验证检索、迁移、双向信誉和运营成本。先完成可复现证据，再扩大到住宿、服务或其他复杂交易。匿名身份不代表独立主体；模拟评审不能代替真实专业评审，运行多个进程不能代替独立运营者。

Use [Issues](https://github.com/oldjin-ai/open-agent-market/issues) for scoped work and [Discussions](https://github.com/oldjin-ai/open-agent-market/discussions) for use cases and protocol questions.
