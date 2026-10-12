import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { MarketNode } from '../src/node.ts';
import { Client, termsCommitment } from '../src/sdk.ts';
import { newKey } from '../src/protocol.ts';
import { BuyerApprovalGate } from '../src/buyer-approval.ts';
import type { BuyerPolicy, PurchaseTerms } from '../src/buyer-approval.ts';
import { renderApprovalDemo } from './render-approval-demo.ts';

const node = new MarketNode({ name: 'local-approval-reference', maxRequestsPerMinute: 1000 });
const seller = newKey(), buyer = newKey(), reviewers = Array.from({ length: 8 },newKey);
const checks: string[] = [];
const walkthrough: { title: string; totalMinor: number; renewalMinor: number; outcome: string; detail: string }[] = [];
try {
  await node.start(); const client = new Client(node.url,node.key.publicKey), gate = new BuyerApprovalGate(client,buyer);
  for (const key of [seller,buyer,...reviewers]) await client.createIdentity(key,'Simulated approval participant',['participant']);
  await client.emit(node.key,'policy.publish','policy:approval-demo',{ reviewers: reviewers.map(k => k.id), commitMs: 500, revealMs: 500, appealMs: 500, retentionDays: 30 });
  const listing = await client.emit(seller,'listing.put','listing:approval-demo',{ revision: 1, previous: '', title: 'Example software service', category: 'software',
    priceMinor: 1000, currency: 'USD', serviceUrl: node.url, facts: {}, faq: {}, resources: [], active: true });
  const privateMarker = 'PRIVATE_APPROVAL_DEMO_CONDITIONS';
  const terms: PurchaseTerms = { format: 'buyer-terms/0.1', currency: 'USD', items: [{ name: 'Service', quantity: 1, unitPriceMinor: 1000 }],
    fees: { taxMinor: 100, shippingMinor: 0, otherMinor: 0 }, discount: { amountMinor: 0, conditions: 'No discount' },
    extras: [], totalMinor: 1100, subscription: { trialEndsAt: null, renewalPriceMinor: 1200, intervalDays: 30, cancellation: privateMarker },
    returns: 'Refund within 7 days', source: { url: 'https://example.com/terms', checkedAt: Date.now() } };
  const commitment = termsCommitment(terms);
  const quote = await client.emit(seller,'quote.offer','quote:approval-demo',{ listing: listing.subject, listingVersion: listing.id,
    buyer: buyer.id, termsHash: commitment.termsHash, expiresAt: Date.now() + 60000, policy: 'policy:approval-demo', reservation: false });
  const policy: BuyerPolicy = { currency: 'USD', maxTotalMinor: 1500, allowExtras: false, allowSubscription: false, maxRenewalMinor: 1200 };
  await assert.rejects(gate.prepare(quote.id,commitment,policy),/SUBSCRIPTION_NOT_ALLOWED/); checks.push('subscription-denied-by-buyer-policy');
  const allowed = { ...policy, allowSubscription: true };
  await assert.rejects(gate.prepare(quote.id,commitment,{ ...allowed, maxRenewalMinor: 1000 }),/RENEWAL_BUDGET_EXCEEDED/); checks.push('renewal-price-limit');
  const preview = await gate.prepare(quote.id,commitment,allowed);
  walkthrough.push({ title: 'Read the complete offer', totalMinor: preview.terms.totalMinor,
    renewalMinor: preview.terms.subscription!.renewalPriceMinor, outcome: 'APPROVAL_REQUIRED',
    detail: 'USD 10.00 service + USD 1.00 tax. Seller states renewal is USD 12.00 every 30 days. Subscription policy must explicitly allow it.' });
  await assert.rejects(gate.accept(preview.id,'trade:no-approval',allowed),/APPROVAL_REQUIRED/); checks.push('no-approval-no-acceptance');
  // SIMULATION of a trusted host action. No actual human UI/authentication is exercised.
  const alteredDisplay = structuredClone(preview); alteredDisplay.terms.totalMinor = 1;
  assert.throws(() => gate.approve(preview.id,alteredDisplay),/PREVIEW_CHANGED/); checks.push('altered-display-cannot-approve-original-terms');
  walkthrough.push({ title: 'Change the displayed total', totalMinor: alteredDisplay.terms.totalMinor,
    renewalMinor: 1200, outcome: 'PREVIEW_CHANGED', detail: 'A display copy showing USD 0.01 cannot approve the stored USD 11.00 offer.' });
  gate.approve(preview.id,preview);
  await assert.rejects(gate.accept(preview.id,'trade:changed-policy',{ ...allowed, maxTotalMinor: 1000 }),/BUYER_POLICY_CHANGED/);
  checks.push('approval-bound-to-buyer-policy');
  const revisedListing = await client.emit(seller,'listing.put',listing.subject,{ ...listing.payload,
    revision: 2, previous: listing.id, priceMinor: 1400 });
  await assert.rejects(gate.accept(preview.id,'trade:stale-listing',allowed),/LISTING_CHANGED/);
  checks.push('changed-listing-rejects-old-approval');
  walkthrough.push({ title: 'Seller changes the listing', totalMinor: 1500, renewalMinor: 1200,
    outcome: 'LISTING_CHANGED', detail: 'The seller publishes USD 14.00 + USD 1.00 tax. Acceptance using the old listing version is rejected during preflight.' });
  const revisedTerms = { ...terms, items: [{ name: 'Service', quantity: 1, unitPriceMinor: 1400 }], totalMinor: 1500 };
  const revisedCommitment = termsCommitment(revisedTerms);
  const revisedQuote = await client.emit(seller,'quote.offer','quote:approval-demo-revised',{ ...quote.payload,
    listingVersion: revisedListing.id, termsHash: revisedCommitment.termsHash, expiresAt: Date.now() + 60000 });
  const revisedPreview = await gate.prepare(revisedQuote.id,revisedCommitment,allowed);
  await assert.rejects(gate.accept(revisedPreview.id,'trade:new-without-approval',allowed),/APPROVAL_REQUIRED/);
  checks.push('revised-offer-needs-new-approval');
  walkthrough.push({ title: 'Review the new offer', totalMinor: revisedPreview.terms.totalMinor, renewalMinor: 1200,
    outcome: 'APPROVAL_REQUIRED', detail: 'A new quote creates a new preview. Previous approval does not approve the revised offer.' });
  gate.approve(revisedPreview.id,gate.getPreview(revisedPreview.id));
  const accepted = await gate.accept(revisedPreview.id,'trade:approval-demo',allowed);
  assert.equal((await client.batch([accepted.id]))[0]!.id,accepted.id); checks.push('approved-local-agreement-accepted');
  await assert.rejects(gate.accept(revisedPreview.id,'trade:reused',allowed),/APPROVAL_REQUIRED/); checks.push('approval-single-use');
  assert.equal((await gate.reconcile(revisedPreview.id)).accepted,true); checks.push('acceptance-reconciliation');
  walkthrough.push({ title: 'Approve exactly this offer', totalMinor: revisedPreview.terms.totalMinor, renewalMinor: 1200,
    outcome: 'LOCAL_AGREEMENT_ACCEPTED', detail: 'Simulated trusted-host approval accepts one initial agreement. Reusing the approval fails. No money moves; future charges are not authorized.' });
  const publicBytes = JSON.stringify(node.store.page(0,100));
  const secrets = [privateMarker,commitment.salt,revisedCommitment.salt,preview.id,revisedPreview.id,buyer.privateKey,seller.privateKey];
  for (const secret of secrets) assert.ok(!publicBytes.includes(secret));
  checks.push('private-terms-salt-approval-and-keys-not-published');
  const report = { date: new Date().toISOString(), result: 'PASS', checks, events: node.store.count(),
    simulatedParticipants: true, humanAuthenticationVerified: false, realHostIntegrated: false, livePaymentVerified: false,
    recurringChargesAuthorized: false, durableApprovals: false, productionReady: false,
    evidenceView: await client.reputation(seller.id,'evidence-v2'), walkthrough };
  const reportBytes = JSON.stringify(report,null,2);
  for (const secret of secrets) assert.ok(!reportBytes.includes(secret));
  mkdirSync('artifacts',{ recursive: true }); writeFileSync('artifacts/buyer-approval-report.json',reportBytes); console.log(reportBytes);
  const demo = renderApprovalDemo(report);
  for (const secret of secrets) assert.ok(!demo.html.includes(secret) && !demo.svg.includes(secret));
  writeFileSync('artifacts/buyer-approval-demo.html',demo.html);
  // Public generated files contain only checked synthetic amounts, descriptions and error labels.
  mkdirSync('docs/demos',{ recursive: true }); mkdirSync('docs/assets',{ recursive: true });
  writeFileSync('docs/demos/buyer-approval.html',demo.html); writeFileSync('docs/assets/buyer-approval-walkthrough.svg',demo.svg);
} finally { await node.close(); }
