# Reproduce one approval workflow

Audience: agent-host, merchant-tool and protocol developers. This is a local reference exercise; no purchase, paid account, deployment or live host is required.

Run the commands at the top of [README](../README.md). Expect `PASS`, 17 events and 11 checks. Open `artifacts/buyer-approval-demo.html` to replay the results. The HTML is a presentation of a completed run; clicking its buttons does not run the gate, contact a seller or sign an event.

The main executable is [examples/buyer-approval.ts](../examples/buyer-approval.ts). Source approval rules are in [src/buyer-approval.ts](../src/buyer-approval.ts). Do not expose the human approval action or signing key as a model tool.

## Send a useful result

Use the [feedback form](https://github.com/oldjin-ai/open-agent-market/issues/new?template=demo-feedback.yml). While the form is only on PR #6's branch, use a plain issue with these fields:

- OS, Node version and tested commit/branch.
- Exact command; whether the run completed with 17 events / 11 checks.
- What failed or was confusing, expected versus actual behavior, and minimal redacted output.
- Which step, if any, would help your own workflow; actual host integration is a separate task.
- Whether you ran it again; distinguish observed repeat use from intended use.

Never post private keys, approval IDs, salts, private terms, billing IDs or a `.data` directory. The public demo report uses synthetic summaries; do not attach reports from a real private workflow without checking and redacting them.

## What success means

First target: three external developer reproductions and at least one actionable report. This target is not a forecast, deadline commitment, independent buyer count or proof of commerce. Maintainer runs and CI jobs do not qualify.

Maintain a ledger with source issue URL, reported commit, observed outcome and consent to quote the feedback. Keep private details local. Current external reproduction count: **not established**.

Real host approval, durable consent, payments, future renewals, seller truth and atomic listing acceptance remain unresolved. See [buyer approval boundaries](BUYER_APPROVAL.md) and [pilot prerequisites](PILOT.md).
