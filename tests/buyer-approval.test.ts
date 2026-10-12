import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketNode } from '../src/node.ts';
import { Client, termsCommitment } from '../src/sdk.ts';
import { newKey, signEvent } from '../src/protocol.ts';
import { BuyerApprovalGate, validatePurchaseTerms } from '../src/buyer-approval.ts';
import type { BuyerPolicy, PurchaseTerms } from '../src/buyer-approval.ts';

const policy: BuyerPolicy = { currency: 'USD', maxTotalMinor: 2000, allowExtras: false, allowSubscription: false, maxRenewalMinor: 1500 };
function terms(): PurchaseTerms {
  return { format: 'buyer-terms/0.1', currency: 'USD', items: [{ name: 'Software license', quantity: 1, unitPriceMinor: 1000 }],
    fees: { taxMinor: 100, shippingMinor: 0, otherMinor: 0 }, discount: { amountMinor: 0, conditions: 'No discount' },
    extras: [], totalMinor: 1100, subscription: null, returns: 'Refund available within 7 days',
    source: { url: 'https://example.com/private-offer', checkedAt: Date.now() - 1000 } };
}
async function setup(input = terms(), buyerPolicy = policy) {
  let now = Date.now(); const node = new MarketNode({ clock: () => now, maxRequestsPerMinute: 1000 }); await node.start();
  const seller = newKey(), buyer = newKey(), reviewers = Array.from({ length: 8 },newKey);
  const client = new Client(node.url,node.key.publicKey);
  for (const key of [seller,buyer,...reviewers]) await client.createIdentity(key,'Simulated participant',['participant']);
  await client.emit(node.key,'policy.publish','policy:approval',{ reviewers: reviewers.map(k => k.id), commitMs: 1000, revealMs: 1000, appealMs: 1000, retentionDays: 30 });
  const listing = await client.emit(seller,'listing.put','listing:approval',{ revision: 1, previous: '', title: 'Software license', category: 'software',
    currency: 'USD', priceMinor: 1000, serviceUrl: node.url, facts: {}, faq: {}, resources: [], active: true });
  const commitment = termsCommitment(input), quote = await client.emit(seller,'quote.offer','quote:approval',{
    listing: listing.subject, listingVersion: listing.id, buyer: buyer.id, termsHash: commitment.termsHash,
    expiresAt: now + 600000, policy: 'policy:approval', reservation: false });
  const gate = new BuyerApprovalGate(client,buyer,() => now);
  return { node, client, seller, buyer, quote, listing, commitment, gate, buyerPolicy, now: () => now, advance: (ms: number) => { now += ms; } };
}

test('private terms fail closed on incomplete costs, unsupported terms and unsafe arithmetic',() => {
  assert.equal(validatePurchaseTerms(terms(),policy).totalMinor,1100);
  const bad: [string, (p: any) => void, RegExp][] = [
    ['unknown fees',p => { p.fees.taxMinor = null; },/INVALID_FIELD/],
    ['missing fee',p => { delete p.fees.otherMinor; },/MISSING_FIELD/],
    ['currency',p => { p.currency = 'EUR'; },/CURRENCY_MISMATCH/],
    ['total',p => { p.totalMinor = 1000; },/TOTAL_MISMATCH/],
    ['budget',p => { p.items[0].unitPriceMinor = 3000; p.totalMinor = 3100; },/BUDGET_EXCEEDED/],
    ['overflow multiplication',p => { p.items[0].unitPriceMinor = Number.MAX_SAFE_INTEGER; p.items[0].quantity = 2; },/UNSAFE_TOTAL/],
    ['overflow addition',p => { p.items[0].unitPriceMinor = Number.MAX_SAFE_INTEGER; },/UNSAFE_TOTAL/],
    ['unsafe integer',p => { p.totalMinor = Number.MAX_SAFE_INTEGER + 1; },/UNSAFE_NUMBER/],
    ['negative price',p => { p.items[0].unitPriceMinor = -1; },/INVALID_FIELD/],
    ['negative total',p => { p.discount.amountMinor = 1200; p.totalMinor = -100; },/TOTAL_MISMATCH/],
    ['extras',p => { p.extras = [{ name: 'Support', priceMinor: 0 }]; },/EXTRAS_NOT_ALLOWED/],
    ['conditions',p => { p.discount.conditions = ' '; },/INCOMPLETE_TERMS/],
    ['future source',p => { p.source.checkedAt = Date.now() + 10000; },/INVALID_FIELD/],
    ['unknown field',p => { p.hiddenSubscription = true; },/UNKNOWN_PAYLOAD_FIELD/],
    ['version',p => { p.format = 'buyer-terms/99'; },/UNSUPPORTED_TERMS/]
  ];
  for (const [label,mutate,error] of bad) { const p = terms(); mutate(p);
    assert.throws(() => validatePurchaseTerms(p,policy),failure => error.test((failure as { code: string }).code),label); }
});

test('recurring terms require permission, bounded renewal price and explicit cancellation',() => {
  const p = terms(); p.subscription = { trialEndsAt: Date.now() + 60000, renewalPriceMinor: 1200, intervalDays: 30, cancellation: 'Cancel in account settings before renewal' };
  assert.throws(() => validatePurchaseTerms(p,policy),/SUBSCRIPTION_NOT_ALLOWED/);
  const allowed = { ...policy, allowSubscription: true };
  assert.equal(validatePurchaseTerms(p,allowed).subscription!.renewalPriceMinor,1200);
  assert.throws(() => validatePurchaseTerms(p,{ ...allowed, maxRenewalMinor: 1199 }),/RENEWAL_BUDGET_EXCEEDED/);
  p.subscription.cancellation = ''; assert.throws(() => validatePurchaseTerms(p,allowed),failure => (failure as { code: string }).code === 'INVALID_FIELD');
  p.subscription.cancellation = 'Cancel via settings'; p.subscription.trialEndsAt = Date.now() - 1;
  assert.throws(() => validatePurchaseTerms(p,allowed),/TRIAL_EXPIRED/);
  p.subscription.trialEndsAt = null; assert.equal(validatePurchaseTerms(p,allowed).subscription!.trialEndsAt,null);
});

test('trusted approval binds internal snapshots and concurrent submissions publish at most once',async () => {
  const f = await setup(); try {
    const currentPolicy = { ...policy }, preview = await f.gate.prepare(f.quote.id,f.commitment,currentPolicy);
    await assert.rejects(f.gate.accept(preview.id,'trade:missing',policy),/APPROVAL_REQUIRED/);
    f.commitment.terms.totalMinor = 1; currentPolicy.maxTotalMinor = 1;
    f.buyer.privateKey = 'caller-mutated-key';
    preview.terms.totalMinor = 1; preview.quote = 'quote:forged'; preview.seller = 'fake';
    assert.throws(() => f.gate.approve(preview.id,preview),/PREVIEW_CHANGED/);
    await assert.rejects(f.gate.accept(preview.id,'trade:altered-display',policy),/APPROVAL_REQUIRED/);
    const authoritative = f.gate.getPreview(preview.id); assert.equal(authoritative.terms.totalMinor,1100);
    f.gate.approve(preview.id,authoritative);
    authoritative.terms.totalMinor = 1; authoritative.terms.items[0].name = 'Mutated after approval';
    assert.equal(f.gate.getPreview(preview.id).terms.totalMinor,1100);
    assert.equal(f.gate.getPreview(preview.id).terms.items[0].name,'Software license');
    const replies = await Promise.allSettled([f.gate.accept(preview.id,'trade:one',policy),f.gate.accept(preview.id,'trade:two',policy)]);
    assert.equal(replies.filter(r => r.status === 'fulfilled').length,1);
    const trades = f.node.store.all('trade'); assert.equal(trades.length,1);
    assert.equal((trades[0] as any).quote,'quote:approval');
    const attempted = await f.gate.reconcile(preview.id); assert.equal(attempted.accepted,true);
    const accepted = await f.client.batch([attempted.eventId]); assert.equal(accepted[0]!.payload.termsHash,f.quote.payload.termsHash);
    assert.equal(accepted[0]!.principal,f.quote.payload.buyer);
    await assert.rejects(f.gate.accept(preview.id,'trade:again',policy),/APPROVAL_REQUIRED/);
    assert.throws(() => f.gate.approve(preview.id,authoritative),/APPROVAL_CONSUMED/);
    const otherHost = new BuyerApprovalGate(f.client,f.buyer); assert.throws(() => otherHost.approve(preview.id,authoritative),/APPROVAL_NOT_FOUND/);
  } finally { await f.node.close(); }
});

test('listing refresh is non-atomic preflight; core still permits the original bound quote',async () => {
  const f = await setup(); const originalListing = Client.prototype.listing;
  try {
    const preview = await f.gate.prepare(f.quote.id,f.commitment,policy); f.gate.approve(preview.id,preview);
    Client.prototype.listing = async function(id) {
      const read = await originalListing.call(this,id);
      // Change after the final read: demonstrates the documented window, not a reservation guarantee.
      await f.client.emit(f.seller,'listing.put',f.listing.subject,{ ...f.listing.payload, revision: 2, previous: f.listing.id, priceMinor: 1300 });
      return read;
    };
    const event = await f.gate.accept(preview.id,'trade:preflight-window',policy);
    assert.equal(f.node.store.get<any>('trade',event.subject)!.listingVersion,f.listing.id);
    assert.notEqual(f.node.store.get<any>('listing',f.listing.subject)!.eventId,f.listing.id);
  } finally { Client.prototype.listing = originalListing; await f.node.close(); }
});

test('tampered commitment, wrong buyer and unpublished signed quote cannot obtain a preview',async () => {
  const f = await setup(); try {
    await assert.rejects(f.gate.prepare(f.quote.id,{ ...f.commitment, termsHash: 'b'.repeat(64) },policy),/TERMS_MISMATCH/);
    const changed = termsCommitment({ ...terms(), returns: 'Different private conditions' });
    await assert.rejects(f.gate.prepare(f.quote.id,changed,policy),/TERMS_MISMATCH/);
    const stranger = new BuyerApprovalGate(f.client,newKey());
    await assert.rejects(stranger.prepare(f.quote.id,f.commitment,policy),/QUOTE_BUYER_MISMATCH/);
    const unpublished = signEvent(f.seller,'quote.offer','quote:unpublished',f.quote.payload);
    await assert.rejects(f.gate.prepare(unpublished.id,f.commitment,policy),/BAD_QUOTE/);
    assert.throws(() => new BuyerApprovalGate(new Client(f.node.url),f.buyer),/PINNED_NODE_REQUIRED/);
    await assert.rejects(new BuyerApprovalGate(new Client(f.node.url,newKey().publicKey),f.buyer).prepare(f.quote.id,f.commitment,policy),/NODE_KEY_MISMATCH/);
  } finally { await f.node.close(); }
});

test('policy changes, listing updates, quote expiry and short approval expiry stop acceptance',async () => {
  const f = await setup(); try {
    const preview = await f.gate.prepare(f.quote.id,f.commitment,policy); f.gate.approve(preview.id,preview);
    await assert.rejects(f.gate.accept(preview.id,'trade:changed',{ ...policy, allowExtras: true }),/BUYER_POLICY_CHANGED/);
    await f.client.emit(f.seller,'listing.put',f.listing.subject,{ ...f.listing.payload, revision: 2, previous: f.listing.id, priceMinor: 1200 });
    await assert.rejects(f.gate.accept(preview.id,'trade:stale',policy),/LISTING_CHANGED/);
    f.advance(300001); await assert.rejects(f.gate.accept(preview.id,'trade:late',policy),/APPROVAL_EXPIRED/);
    f.advance(300000); await assert.rejects(f.gate.prepare(f.quote.id,f.commitment,policy),/QUOTE_EXPIRED/);
    assert.equal(f.node.store.all('trade').length,0);
  } finally { await f.node.close(); }
});

test('failed and uncertain publication burn consent; reconciliation returns original accepted event',async () => {
  const f = await setup(); const originalPublish = Client.prototype.publish;
  try {
    const first = await f.gate.prepare(f.quote.id,f.commitment,policy); f.gate.approve(first.id,first);
    Client.prototype.publish = async () => { throw new Error('Network failed before sending'); };
    await assert.rejects(f.gate.accept(first.id,'trade:failed',policy),/Network failed/);
    Client.prototype.publish = originalPublish;
    assert.equal((await f.gate.reconcile(first.id)).accepted,false);
    await assert.rejects(f.gate.accept(first.id,'trade:retry',policy),/APPROVAL_REQUIRED/);
    const second = await f.gate.prepare(f.quote.id,f.commitment,policy); f.gate.approve(second.id,second);
    Client.prototype.publish = async function(event) { await originalPublish.call(this,event); throw new Error('Response lost after acceptance'); };
    await assert.rejects(f.gate.accept(second.id,'trade:uncertain',policy),/Response lost/);
    Client.prototype.publish = originalPublish;
    const recovered = await f.gate.reconcile(second.id); assert.equal(recovered.accepted,true);
    assert.equal((await f.client.batch([recovered.eventId]))[0]!.subject,'trade:uncertain');
    await assert.rejects(f.gate.accept(second.id,'trade:retry2',policy),/APPROVAL_REQUIRED/);
    f.advance(300001); await f.gate.prepare(f.quote.id,f.commitment,policy);
    assert.equal((await f.gate.reconcile(second.id)).eventId,recovered.eventId);
    assert.equal(f.node.store.all('trade').length,1);
  } finally { Client.prototype.publish = originalPublish; await f.node.close(); }
});
