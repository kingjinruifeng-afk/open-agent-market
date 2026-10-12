# Independent demo and launch-entry review · 2026-10-12

Latest verdict: **PASS** for the reviewed local demo and launch-entry patch, after the bounded corrections below. This does not certify publication of a new remote revision, exact-commit cloud CI or any external message. The launch kit's publication gate remains required.

Initial verdict: **CHANGES_REQUIRED**. The downloaded HTML omitted the unmerged branch prerequisite; LAUNCH_KIT was still being prepared. The initial findings are preserved below.

## Scope and baseline

- Baseline checked: `1e5a7076d14b6feeb5348e5c6430a1f3aac8c3c3`.
- Inspected `examples/buyer-approval.ts`, `examples/render-approval-demo.ts`, generated `docs/demos/buyer-approval.html` and `docs/assets/buyer-approval-walkthrough.svg`, both README changes, `docs/DEMO_FEEDBACK.md` and `.github/ISSUE_TEMPLATE/demo-feedback.yml`.
- `git diff 1e5a707 -- src package.json .github/workflows/check.yml` is empty: this patch does not alter approval/protocol runtime source, signing rules, command definitions or CI workflow.
- No commits, external messages, private vaults or `.data` reads were performed by this reviewer. Git remote branch lookup was read-only.

## Independent checks

- `npm run typecheck`: PASS, exit 0.
- `npm run demo:buyer-approval`: PASS, **17 local events / 11 assertions**, report `2026-10-12T13:59:03.309Z`, exit 0.
- Checked generated HTML in `docs` and `artifacts`, and the SVG, against the renderer using that freshly produced public synthetic report: exact byte equality.
- SVG parses as XML. Assets contain no synthetic private-condition marker, signing key, private commitment hash or approval identifier. The demo checks private fixture salts and approval IDs before writing public output.
- HTML has no fetch/XHR, forms, iframe or external script; its controls replay recorded steps rather than execute approval or contact sellers. A `</script>` string in a renderer title is escaped safely in the output.
- `git diff --check`: PASS.
- `git ls-remote` independently confirmed the PR branch still points to the baseline commit at initial review time. The new 17-event/11-assertion walkthrough is not yet publicly reproducible from that remote revision.

## Blocking finding

### B1 — Standalone HTML omits the unmerged checkout prerequisite

The renderer's HTML reproduction section lists only `npm ci` and `npm run demo:buyer-approval`; its source footer links the repository's default main branch. The README correctly requires `upgrade/evidence-buyer-approval-20261012`, but an offline reader following the HTML source/reproduction entry can reach a checkout without the unmerged demo command.

Minimal correction: name the required branch in the HTML reproduction copy and link its branch-specific README or source; regenerate the committed HTML and SVG from a checked run. Keep external sharing gated on publication of the reviewed new commit and matching public verification evidence. Do not claim the remote baseline already produces the new counts.

## Nonblocking notes

- Quote dropdown `Yes`/`No` strings in the issue template to avoid boolean interpretation by YAML readers. This is a portability correction, not a claim that GitHub currently rejected the form.
- LAUNCH_KIT must separate prepared drafts from posts actually sent, local checks from exact-commit cloud CI, and the external reproduction goal from achieved users. Its public links and commands need the reviewed branch revision before outreach.
- No browser screenshot or animation timing was independently measured in this initial pass. Assertions and artifact/source consistency are verified; a 40-second duration is specified by five 8-second replay intervals, not an observed video recording.

## Claims and scope assessment

The example actually rejects an unapproved subscription, excessive renewal price, missing approval, altered display, changed buyer policy and changed listing. It creates a new quote for the 15-dollar synthetic total, requires new approval, accepts one initial agreement and rejects reuse. The presentation's 11-dollar original total, 15-dollar revised total and 12-dollar/30-day seller-stated renewal match the code's synthetic amounts. No real people, merchant adoption, live payment or automatic renewal/cancellation capability is claimed.

Both READMEs and the feedback guide state experimental local simulation, memory-only approval, no authenticated human UI, no real host integration and non-atomic listing preflight. Feedback requests ask for reproducible runtime/error information and exclude secrets. Three external reproductions is explicitly a goal; maintainer runs and CI do not count. This patch does not relax the prior approval or protocol scope.

## Re-review trigger

Provide the bounded B1 correction, generated artifacts, completed LAUNCH_KIT and any screenshot evidence. Final PASS applies to the reviewed local patch; actual push, exact-commit CI and sending authorized messages remain separately recorded actions.

## Final independent re-review

### Finding disposition

- **B1 resolved.** The HTML now names the clone and `git checkout upgrade/evidence-buyer-approval-20261012` prerequisite before the npm commands, says PR #6 is unmerged, and links the branch-specific source. The regenerated HTML is byte-identical to the renderer output from the independently checked public report.
- The issue form now quotes `"Yes"` and `"No"`. No issue-form availability on the default branch is claimed before merge; the plain-issue fallback is documented.
- Reviewed the completed `docs/LAUNCH_KIT_2026-10-12.md`. It separates drafts from actual publication, requires the exact reviewed remote tree and Ubuntu/Windows CI for the new branch HEAD, retains PR #6 unmerged, and requires reachable public links before external sharing. Its three-developer reproduction target is a goal; actual external reproduction count is explicitly not established. Optional follow-up placeholders must not be published as observed results.
- No remaining blocking findings in this local patch. No core runtime/protocol changes appeared during re-review.

### Fresh verification and visual evidence

- Independently reran `npm run typecheck`: PASS, exit 0.
- Independently reran `npm run demo:buyer-approval`: PASS, exit 0, **17 events / 11 assertions**, public report timestamp `2026-10-12T14:04:44.757Z`.
- Confirmed five recorded steps use totals `[1100, 1, 1500, 1500, 1500]` in minor units; all show the synthetic seller-stated renewal of 1200 minor units. Step 2's altered display is rejected, step 3's listing change rejects the old approval, step 4 requires fresh approval, and step 5 accepts only the freshly approved local agreement.
- Checked both HTML copies and the SVG against freshly rendered output: exact equality. A targeted fixture changing step 3's total to 1600 is rejected by the renderer's fixed-amount assertions, preventing hard-coded copy from silently drifting from the checked report.
- The public report retains `simulatedParticipants: true`; human authentication, real host integration, live payment, recurring-charge authorization, durable approvals and production readiness remain false. Evidence remains one local accepted agreement, zero independently verified agreements and a null score.
- `git diff --check`: PASS. No broader runtime suite was repeated for this presentation-only patch.
- Independently viewed `artifacts/launch-kit-20261012/demo-changed-offer.png`. The visible step 3 has `LISTING_CHANGED`, the $15 revised offer, branch checkout instructions, 17-event/11-assertion count and explicit simulation/no-payment/non-atomic limits. Amounts, rejection reason and capabilities match the checked report and renderer. Text is readable with no apparent clipping; no private keys, approval IDs or credentials are visible.
- The maintainer reports checking all five browser steps and replay completion. This reviewer independently inspected the supplied step 3 screenshot, not the entire browser interaction. Forty seconds is the configured five-by-eight-second replay duration; no measured recording duration is claimed.

### Reviewed artifact hashes (SHA-256)

| File | Hash |
| --- | --- |
| `examples/buyer-approval.ts` | `757FF64FFD5104C85090AD947FECA797E9A03BE5699CB1271B3A94844E767357` |
| `examples/render-approval-demo.ts` | `28E830C9E562967EB6211B27F9D5A880D92B7881CD75A80F312F17DDD1633DEF` |
| `docs/demos/buyer-approval.html` | `E8E1AF2F0DF45EB27BE9789C5806B010B2771432A3C5DD1BF3247BF11E8498AD` |
| `docs/assets/buyer-approval-walkthrough.svg` | `B3DE2ADE68C0D22B3F293389C49A13035DE5DFFB82B9AAF2AE8D948F721A5FBD` |
| `docs/LAUNCH_KIT_2026-10-12.md` | `485D6E845F463AF17539EA2FDB747168EA73F7B20FE84B1781561A518BCD9DFE` |

**Final verdict: PASS for this local patch.** Publication and new-HEAD cloud verification are the next separately evidenced gate; this review authorizes neither merge nor unsolicited external messages.
