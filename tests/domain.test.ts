import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.ts';
import { newKey, signEvent } from '../src/protocol.ts';
import { reputation, ballotCommit } from '../src/domain.ts';
import type { Payload, IdentityKey } from '../src/protocol.ts';

test('listing CAS rejects stale writers and forgery; accepted replay is idempotent',() => {
  const f = fixture(); try {
    const count = f.store.count(); f.domain.ingest(f.listing); assert.equal(f.store.count(),count);
    assert.throws(() => f.emit(f.seller,'listing.put','listing:test',{ ...f.listing.payload, revision: 2, previous: 'wrong' }),/Expected current/);
    assert.throws(() => f.emit(f.buyer,'listing.put','listing:test',{ ...f.listing.payload, revision: 2, previous: f.listing.id }),/Expected current/);
    f.emit(f.seller,'listing.put','listing:test',{ ...f.listing.payload, revision: 2, previous: f.listing.id, active: false });
    assert.equal(f.store.get<Payload>('listing','listing:test')!.active,false);
  } finally { f.store.close(); }
});
test('delegation scopes and revocation are enforced, recovery and rotation preserve principal',() => {
  const f = fixture(); try {
    const agent = newKey(); const grant = f.emit(f.seller,'delegation.grant','grant:agent',{ delegate: agent.id, scopes: ['listing.put'], expiresAt: f.now() + 10000 });
    const updated = f.emit(agent,'listing.put','listing:test',{ ...f.listing.payload, revision: 2, previous: f.listing.id },{ principal: f.seller.id, delegation: grant.subject });
    f.emit(f.seller,'delegation.revoke','grant:agent',{ grant: grant.subject });
    assert.throws(() => f.emit(agent,'listing.put','listing:test',{ ...updated.payload, revision: 3, previous: updated.id },{ principal: f.seller.id, delegation: grant.subject }),/Invalid\/revoked/);
    const next = newKey(); f.emit(f.seller,'identity.rotate',f.seller.id,{ newPublicKey: next.publicKey });
    assert.throws(() => f.emit(f.seller,'listing.put','listing:test',{ ...updated.payload, revision: 3, previous: updated.id }),/No controlling/);
    f.emit(next,'listing.put','listing:test',{ ...updated.payload, revision: 3, previous: updated.id },{ principal: f.seller.id });
    const recovery = newKey(), recoverable = newKey();
    f.domain.ingest(signEvent(recoverable,'identity.create',recoverable.id,{ name: 'recovery-demo', roles: ['seller'], recovery: recovery.id },{ issuedAt: f.now() }));
    f.emit(recovery,'identity.recover',recoverable.id,{ newPublicKey: next.publicKey },{ principal: recoverable.id });
    assert.equal(f.store.get<Payload>('identity',recoverable.id)!.controller,next.id);
  } finally { f.store.close(); }
});
test('quote acceptance rejects wrong party, repeat use and stale commitments',() => {
  const f = fixture(); try {
    assert.throws(() => f.emit(f.buyer,'trade.accept','trade:again',{ quote: 'quote:test', termsHash: 'a'.repeat(64) }),/QUOTE_ALREADY_USED/);
    assert.throws(() => f.emit(f.outsiders[0],'trade.accept','trade:forged',{ quote: 'quote:test', termsHash: 'a'.repeat(64) }),/NOT_AUTHORIZED/);
    assert.throws(() => f.emit(f.seller,'quote.offer','quote:private-leak',{ ...f.quote.payload, address: 'secret' }),/UNKNOWN_PAYLOAD_FIELD/);
    f.advance(60001);
    assert.throws(() => f.emit(f.seller,'quote.offer','quote:expired',{ ...f.quote.payload }),/QUOTE_EXPIRED/);
  } finally { f.store.close(); }
});
test('normal return, refund and truthful negative feedback create no malicious label',() => {
  const f = fixture(); try {
    f.emit(f.buyer,'trade.fact','trade:test',{ phase: 'return_requested', evidence: [] });
    f.emit(f.seller,'trade.fact','trade:test',{ phase: 'refund_claim', evidence: [] });
    f.emit(f.buyer,'trade.fact','trade:test',{ phase: 'refund_received', evidence: [] });
    f.emit(f.buyer,'review.submit','trade:test',{ target: f.seller.id, dimension: 'service', score: 1, text: 'Service disappointed me.' });
    assert.deepEqual(reputation(f.store,f.buyer.id,f.now()).labels,[]);
    assert.deepEqual(reputation(f.store,f.seller.id,f.now()).labels,[]);
    assert.throws(() => f.emit(f.outsiders[0],'review.submit','trade:test',{ target: f.seller.id, dimension: 'service', score: 5, text: 'fake' }),/NOT_AUTHORIZED/);
    assert.throws(() => f.emit(f.buyer,'review.submit','trade:test',{ target: f.seller.id, dimension: 'service', score: 5, text: 'duplicate' }),/One review/);
    assert.throws(() => f.emit(f.buyer,'review.submit','trade:test',{ target: f.seller.id, dimension: 'quality', score: 1, text: 'never received' }),/NO_PRODUCT_EXPERIENCE/);
  } finally { f.store.close(); }
});
function round(f: ReturnType<typeof fixture>, keys: IdentityKey[], number: number, finding = 'buyer') {
  const ballot: Payload = { outcome: 'seller', integrity: finding, reason: 'Evidence referenced; community assessment only.', evidence: [f.quote.id] };
  for (const key of keys) f.emit(key,'case.commit','case:test',{ round: number, commitment: ballotCommit('case:test',number,key.id,ballot,'a'.repeat(48)) });
  f.advance(1000);
  for (const key of keys) f.emit(key,'case.reveal','case:test',{ round: number, ballot, salt: 'a'.repeat(48) });
  return ballot;
}
test('jury commit/reveal blocks early and mismatched votes; no penalty before appeal deadline',() => {
  const f = fixture(); try {
    f.openCase(); const panel = f.assign();
    assert.throws(() => f.emit(f.coordinator,'case.finalize','case:test',{}),/FINALIZE_EARLY/);
    const ballot = round(f,panel,1);
    assert.deepEqual(reputation(f.store,f.buyer.id,f.now()).labels,[]);
    assert.throws(() => f.emit(panel[0],'case.reveal','case:test',{ round: 1, ballot: { ...ballot, outcome: 'buyer' }, salt: 'a'.repeat(48) }),/COMMIT_MISMATCH/);
    f.advance(2000); f.emit(f.coordinator,'case.finalize','case:test',{});
    assert.equal((reputation(f.store,f.buyer.id,f.now()).labels as Payload[]).length,1);
    assert.equal(reputation(f.store,panel[0].id,f.now()).totalScore,null);
  } finally { f.store.close(); }
});
test('appeal replaces preliminary result using a disjoint panel',() => {
  const f = fixture(); try {
    f.openCase(); const first = f.assign(); round(f,first,1);
    f.advance(1000); f.emit(f.buyer,'case.appeal','case:test',{ reason: 'Request independent review' });
    const second = f.assign(2); assert.ok(second.every(k => !first.some(x => x.id === k.id)));
    round(f,second,2,'none'); f.advance(1000); f.emit(f.coordinator,'case.finalize','case:test',{});
    assert.deepEqual(reputation(f.store,f.buyer.id,f.now()).labels,[]);
    assert.equal((reputation(f.store,first[0].id,f.now()).reviewer as Payload).completedContributions,0);
  } finally { f.store.close(); }
});
test('five distinct eligible correction identities revoke a final label',() => {
  const f = fixture(); try {
    f.openCase(); const first = f.assign(); round(f,first,1); f.advance(2000);
    const decision = f.emit(f.coordinator,'case.finalize','case:test',{});
    assert.equal((reputation(f.store,f.buyer.id,f.now()).labels as Payload[]).length,1);
    const correction = f.outsiders.filter(k => !first.some(x => x.id === k.id)).slice(0,5).map(k =>
      f.emit(k,'case.correction.vote','case:test',{ decision: decision.id, reason: 'Independent review identified insufficient integrity evidence.' }));
    assert.throws(() => f.emit(f.coordinator,'case.correct','case:test',{ votes: correction.slice(0,3).map(x => x.id) }),/CORRECTION_QUORUM/);
    f.emit(f.coordinator,'case.correct','case:test',{ votes: correction.map(x => x.id) });
    assert.deepEqual(reputation(f.store,f.buyer.id,f.now()).labels,[]);
    assert.equal(f.store.get<Payload>('case','case:test')!.status,'corrected');
    assert.ok(f.store.event(decision.id));
  } finally { f.store.close(); }
});

test('review amendments replace one effective sample while preserving the signed history',() => {
  const f = fixture(); try {
    const first = f.emit(f.buyer,'review.submit','trade:test',{ target: f.seller.id, dimension: 'service', score: 1, text: 'Waiting for support' });
    const second = f.emit(f.buyer,'review.amend','trade:test',{ ...first.payload, previous: first.id, score: 4, text: 'Issue resolved' });
    const dim = (reputation(f.store,f.seller.id,f.now()).dimensions as Payload)['seller:service'] as Payload;
    assert.equal(dim.samples,1); assert.equal(dim.meanMilli,4000); assert.ok(f.store.event(first.id)); assert.ok(f.store.event(second.id));
    assert.throws(() => f.emit(f.buyer,'review.amend','trade:test',{ ...first.payload, previous: first.id }),/One review/);
    assert.throws(() => f.emit(f.seller,'identity.rotate',f.seller.id,{ newPublicKey: 'not-a-key' }),/Expected canonical/);
  } finally { f.store.close(); }
});

test('colluding identities and repeated trades remain claims, not independent sales; views preserve history',() => {
  const f = fixture(); try {
    const historyBefore = () => JSON.stringify(f.store.page(0,200));
    // All fixture keys belong to this one test operator; the network cannot establish independence.
    const ring = [f.seller,f.buyer,f.outsiders[0]];
    for (let i = 0; i < ring.length; i++) {
      const seller = ring[i], buyer = ring[(i + 1) % ring.length];
      const listing = f.emit(seller,'listing.put','listing:ring:' + i,{ ...f.listing.payload });
      const quote = f.emit(seller,'quote.offer','quote:ring:' + i,{ ...f.quote.payload, listing: listing.subject, listingVersion: listing.id, buyer: buyer.id });
      f.emit(buyer,'trade.accept','trade:ring:' + i,{ quote: quote.subject, termsHash: quote.payload.termsHash });
      f.emit(buyer,'trade.fact','trade:ring:' + i,{ phase: 'payment_claim', evidence: [] });
      f.emit(buyer,'trade.fact','trade:ring:' + i,{ phase: 'delivery_ack', evidence: [] });
      f.emit(buyer,'review.submit','trade:ring:' + i,{ target: seller.id, dimension: 'quality', score: 5, text: 'Fabricated receipt and review' });
    }
    f.emit(f.buyer,'trade.fact','trade:test',{ phase: 'delivery_ack', evidence: [] });
    f.emit(f.buyer,'review.submit','trade:test',{ target: f.seller.id, dimension: 'quality', score: 5, text: 'Same operator, another agreement' });
    const before = historyBefore();
    const legacy = reputation(f.store,f.seller.id,f.now()), newer = reputation(f.store,f.seller.id,f.now(),'evidence-v2');
    assert.equal(legacy.acceptedTrades,newer.acceptedAgreements); assert.equal(newer.acceptedAgreements,3);
    const oldDim = (legacy.dimensions as Payload)['seller:quality'] as Payload;
    const dim = (newer.dimensions as Payload)['seller:quality'] as Payload;
    assert.equal(oldDim.independentCounterparties,dim.distinctCounterpartyIdentities);
    assert.equal(dim.distinctCounterpartyIdentities,1); assert.equal(dim.samples,2); assert.equal(dim.maxSamplesFromOneIdentity,2);
    assert.equal(dim.meanMilli,oldDim.meanMilli); assert.deepEqual(dim.distribution,oldDim.distribution);
    assert.equal(dim.counterpartyIndependence,'not-verified'); assert.equal(dim.evidenceClass,'participant-feedback');
    assert.equal((newer.evidenceClasses as Payload).independentlyVerified,0); assert.equal(newer.totalScore,null);
    assert.ok(!('independentCounterparties' in dim)); assert.ok(!('acceptedTrades' in newer));
    assert.equal(newer.algorithm,'reference/0.1'); assert.equal(historyBefore(),before);
    const rotated = newKey(); f.emit(f.buyer,'identity.rotate',f.buyer.id,{ newPublicKey: rotated.publicKey });
    f.emit(rotated,'review.amend','trade:test',{ target: f.seller.id, dimension: 'quality', score: 4, text: 'Same principal after rotation',
      previous: f.store.get<Payload>('review','trade:test:' + f.buyer.id + ':quality')!.eventId },{ principal: f.buyer.id });
    const after = (reputation(f.store,f.seller.id,f.now(),'evidence-v2').dimensions as Payload)['seller:quality'] as Payload;
    assert.equal(after.distinctCounterpartyIdentities,1); assert.equal(after.samples,2);
    assert.throws(() => reputation(f.store,f.seller.id,f.now(),'unknown' as any),/BAD_REPUTATION_VIEW/);
  } finally { f.store.close(); }
});
