# Approval demo launch kit — 2026-10-12

The first audience is developers building personal-agent hosts or merchant tools. The immediate invitation is to reproduce a local approval example and report one useful or confusing behavior. This is not a claim of external adoption or live commerce.

## Deliverables and publication gate

- English and Chinese README first screens: a concrete $11 offer changed to $15, explicit commands, expected output and limits.
- `npm run demo:buyer-approval`: 17 local events, 11 assertions, checked report and a standalone 40-second interactive replay.
- [Replay HTML](demos/buyer-approval.html), [walkthrough image](assets/buyer-approval-walkthrough.svg), [feedback guide](DEMO_FEEDBACK.md), and a GitHub issue form.
- Independent review: [launch kit review](LAUNCH_KIT_REVIEW_2026-10-12.md).

Before sharing externally, publish these exact reviewed files to the branch `upgrade/evidence-buyer-approval-20261012`, verify their Git tree against the local reviewed tree, and verify Ubuntu and Windows CI for the new branch HEAD. Keep PR #6 unmerged. Confirm the public branch README and replay source links are reachable. The issue form is available automatically only after it reaches the default branch; until then, a plain issue with the feedback guide's fields is the fallback.

## English X copy

Primary post (attach an actual replay screenshot):

> I approved $11. The seller changed the offer to $15. Should my agent carry on?
>
> In this local Open Agent Market demo, the old approval is rejected. A fresh offer needs fresh approval.
>
> Simulated host. No payment. Code + replay: https://github.com/oldjin-ai/open-agent-market/pull/6

Reproduction invitation (reply to the primary post):

> Looking for 3 agent/tool developers to try this locally.
>
> Node 24.12+, PR #6 branch, then: npm ci && npm run demo:buyer-approval
>
> Tell me what failed or felt unclear. This tests local approval logic, not real checkout.
>
> Guide: https://github.com/oldjin-ai/open-agent-market/blob/upgrade/evidence-buyer-approval-20261012/docs/DEMO_FEEDBACK.md

Optional later follow-up, only if a real reproduction report supports it:

> A developer reproduced [specific result] on [environment and tested commit]. The useful feedback was [concrete finding]. Here is the issue and the fix/reproduction evidence: [actual public links].

Do not publish the optional follow-up with placeholders or imply an independent result from maintainer runs or CI.

## Bounded trial and measurement

The first target is three external reproduction reports and at least one actionable report. Count a report only when another developer provides a tested commit, environment and observed result. Track actual repeat use separately; a star, clone, view or friendly reply does not establish use.

Current external reproduction count: not established. Public invitations and maintainer-run checks are not external reproductions.

Record the posted X URL, the repository branch HEAD and CI URLs in a local publication record. For actual feedback, use the public issue URL and redacted evidence. Do not publish private traffic analytics, credentials, purchase details, keys, approval IDs, salts or `.data` contents.

After seven days, review visits from the invitation, complete reproduction reports, the most common setup failure, and whether anyone actually used the example again. If visits remain sparse, improve a specific demonstration and participate in a relevant existing discussion with useful technical context. Broader launch venues are a later step, after there is an easy trial and meaningful feedback; no paid promotion or mass unsolicited messages are part of this kit.

## Capability limits

This is a deterministic presentation generated from passing synthetic local assertions. Replay controls do not approve a purchase. The reference gate keeps consent in memory and uses simulated host approval. There is no authenticated human approval UI, real agent-host integration, payment or renewal execution, durable consent, atomic listing acceptance, stock reservation, verified seller truth or validated protection against all collusion. Evidence labels and signatures describe their source and limits; they do not prove a real sale.
