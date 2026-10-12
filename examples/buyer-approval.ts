import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { MarketNode } from '../src/node.ts';
import { Client, termsCommitment } from '../src/sdk.ts';
import { newKey } from '../src/protocol.ts';
import { BuyerApprovalGate } from '../src/buyer-approval.ts';
import type { BuyerPolicy, PurchaseTerms } from '../src/buyer-approval.ts';

const node = new MarketNode({ name: 'local-approval-reference', maxRequestsPerMinute: 1000 });
const seller = newKey(), buyer = newKey(), reviewers = Array.from({ length: 8 },newKey);
const checks: string[] = [];
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
  await assert.rejects(gate.accept(preview.id,'trade:no-approval',allowed),/APPROVAL_REQUIRED/); checks.push('no-approval-no-acceptance');
  // SIMULATION of a trusted host action. No actual human UI/authentication is exercised.
  const alteredDisplay = structuredClone(preview); alteredDisplay.terms.totalMinor = 1;
  assert.throws(() => gate.approve(preview.id,alteredDisplay),/PREVIEW_CHANGED/); checks.push('altered-display-cannot-approve-original-terms');
  gate.approve(preview.id,preview);
  await assert.rejects(gate.accept(preview.id,'trade:changed-policy',{ ...allowed, maxTotalMinor: 1000 }),/BUYER_POLICY_CHANGED/);
  checks.push('approval-bound-to-buyer-policy');
  const accepted = await gate.accept(preview.id,'trade:approval-demo',allowed);
  assert.equal((await client.batch([accepted.id]))[0]!.id,accepted.id); checks.push('approved-local-agreement-accepted');
  await assert.rejects(gate.accept(preview.id,'trade:reused',allowed),/APPROVAL_REQUIRED/); checks.push('approval-single-use');
  assert.equal((await gate.reconcile(preview.id)).accepted,true); checks.push('acceptance-reconciliation');
  const publicBytes = JSON.stringify(node.store.page(0,100));
  for (const secret of [privateMarker,commitment.salt,preview.id,buyer.privateKey,seller.privateKey]) assert.ok(!publicBytes.includes(secret));
  checks.push('private-terms-salt-approval-and-keys-not-published');
  const report = { date: new Date().toISOString(), result: 'PASS', checks, events: node.store.count(),
    simulatedParticipants: true, humanAuthenticationVerified: false, realHostIntegrated: false, livePaymentVerified: false,
    recurringChargesAuthorized: false, durableApprovals: false, productionReady: false,
    evidenceView: await client.reputation(seller.id,'evidence-v2') };
  const reportBytes = JSON.stringify(report,null,2);
  for (const secret of [privateMarker,commitment.salt,preview.id,buyer.privateKey,seller.privateKey]) assert.ok(!reportBytes.includes(secret));
  mkdirSync('artifacts',{ recursive: true }); writeFileSync('artifacts/buyer-approval-report.json',reportBytes); console.log(reportBytes);
} finally { await node.close(); }
