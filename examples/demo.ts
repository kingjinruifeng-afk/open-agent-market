import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { MarketNode } from '../src/node.ts';
import { Client, termsCommitment, encryptPrivate } from '../src/sdk.ts';
import { newKey } from '../src/protocol.ts';
import type { IdentityKey, Payload } from '../src/protocol.ts';
import { ballotCommit, drawReviewers } from '../src/domain.ts';

const root = mkdtempSync(join(tmpdir(),'oamp-demo-'));
const seller = newKey(), buyer = newKey(), jurors = Array.from({ length: 16 },newKey);
const service = new MarketNode({ sellerKey: seller, proofTtlMs: 100, name: 'seller-runtime' });
const primary = new MarketNode({ name: 'primary', db: join(root,'primary.sqlite'), maxRequestsPerMinute: 1000 });
const backup = new MarketNode({ name: 'independent-storage', db: join(root,'backup.sqlite'), adminToken: 'local-demo-only', maxRequestsPerMinute: 1000 });
const checks: string[] = [];
try {
  await service.start(); await primary.start(); await backup.start();
  primary.options.allowedSellerOrigins = backup.options.allowedSellerOrigins = [service.url];
  backup.options.peers = [{ url: primary.url, publicKey: primary.key.publicKey },{ url: service.url, publicKey: service.key.publicKey }];
  service.options.peers = [{ url: primary.url, publicKey: primary.key.publicKey }];
  const a = new Client(primary.url,primary.key.publicKey), b = new Client(backup.url,backup.key.publicKey);
  for (const [i,key] of [seller,buyer,...jurors].entries()) await a.createIdentity(key,'Demo participant ' + i,['participant']);
  await a.emit(primary.key,'policy.publish','policy:demo',{ reviewers: jurors.map(k => k.id), commitMs: 500, revealMs: 1500, appealMs: 500, retentionDays: 30 });
  let listing = await a.emit(seller,'listing.put','listing:demo',{ revision: 1, previous: '', title: 'Example Camera', category: 'electronics',
    priceMinor: 10000, currency: 'USD', serviceUrl: service.url, facts: { brand: 'Example', weight: '100 g' },
    faq: { warranty: 'Seller warranty: one year' }, resources: [{ url: 'https://example.com/specifications', relation: 'manufacturer' }], active: true });
  listing = await a.emit(seller,'listing.put',listing.subject,{ ...listing.payload, revision: 2, previous: listing.id, priceMinor: 9500 });
  assert.equal(((await a.search('Camera')).items as Payload[])[0].priceMinor,9500); checks.push('publish-price-update-and-live-search');
  const knowledge = await a.request('/v1/knowledge/listing%3Ademo?q=warranty'); assert.equal(knowledge.modelCalls,0); checks.push('structured-customer-service-without-model');
  const privateTerms = termsCommitment({ deliveryAddress: 'LOCAL PRIVATE DEMO ADDRESS', agreedPriceMinor: 9500, quantity: 1 });
  const vault = encryptPrivate(privateTerms as unknown as Payload,'local-demo-password-change-me');
  const quote = await a.emit(seller,'quote.offer','quote:demo',{ listing: listing.subject, listingVersion: listing.id,
    buyer: buyer.id, termsHash: privateTerms.termsHash, expiresAt: Date.now() + 60000, policy: 'policy:demo', reservation: false });
  await a.emit(buyer,'trade.accept','trade:demo',{ quote: quote.subject, termsHash: privateTerms.termsHash });
  await a.emit(buyer,'trade.fact','trade:demo',{ phase: 'payment_claim', evidence: [] });
  await a.emit(seller,'trade.fact','trade:demo',{ phase: 'shipment_claim', evidence: [] });
  await a.emit(buyer,'trade.fact','trade:demo',{ phase: 'delivery_ack', evidence: [] });
  await a.emit(buyer,'trade.fact','trade:demo',{ phase: 'return_requested', evidence: [] });
  await a.emit(seller,'trade.fact','trade:demo',{ phase: 'refund_claim', evidence: [] });
  await a.emit(buyer,'trade.fact','trade:demo',{ phase: 'refund_received', evidence: [] });
  await a.emit(buyer,'review.submit','trade:demo',{ target: seller.id, dimension: 'quality', score: 2, text: 'Image quality did not meet my needs.' });
  await a.emit(seller,'review.submit','trade:demo',{ target: buyer.id, dimension: 'communication', score: 5, text: 'Clear communication throughout return.' });
  assert.deepEqual((await a.reputation(buyer.id)).labels,[]); checks.push('native-receipt-private-terms-and-bilateral-feedback');
  await a.emit(buyer,'case.open','case:demo',{ trade: 'trade:demo', claim: 'Disagreement over return responsibility.', evidence: [quote.id] });
  const panels: string[] = [];
  async function panel(round: number, finding: string) {
    const ids = drawReviewers(jurors.map(k => k.id),'demo-seed-' + round,'case:demo',[seller.id,buyer.id,...panels],round === 1 ? 3 : 5);
    panels.push(...ids); await a.emit(primary.key,'case.assign','case:demo',{ round, seed: 'demo-seed-' + round, reviewers: ids });
    const c = await a.request('/v1/cases/case%3Ademo');
    const ballot: Payload = { outcome: 'shared', integrity: finding, reason: 'SIMULATION: reviewer signs an evidence-based recommendation.', evidence: [quote.id] };
    for (const id of ids) await a.emit(jurors.find(k => k.id === id) as IdentityKey,'case.commit','case:demo',{ round, commitment: ballotCommit('case:demo',round,id,ballot,'b'.repeat(48)) });
    await sleep(Math.max(0,c.commitDeadline - Date.now() + 10));
    for (const id of ids) await a.emit(jurors.find(k => k.id === id) as IdentityKey,'case.reveal','case:demo',{ round, ballot, salt: 'b'.repeat(48) });
    await sleep(Math.max(0,c.revealDeadline - Date.now() + 10));
  }
  await panel(1,'buyer'); assert.deepEqual((await a.reputation(buyer.id)).labels,[]);
  await a.emit(buyer,'case.appeal','case:demo',{ reason: 'Normal return is not evidence of dishonesty.' });
  await panel(2,'none'); await a.emit(primary.key,'case.finalize','case:demo',{});
  assert.deepEqual((await a.reputation(buyer.id)).labels,[]); checks.push('three-person-review-five-person-appeal-no-premature-penalty');
  await backup.sync(primary.url); await service.sync(primary.url);
  const rep = await a.reputation(seller.id), copy = await b.reputation(seller.id);
  assert.deepEqual(rep.dimensions,copy.dimensions); checks.push('cross-node-reputation-recomputed');
  await primary.close();
  const s = new Client(service.url); listing = await s.emit(seller,'listing.put',listing.subject,{ ...listing.payload, revision: 3, previous: listing.id, priceMinor: 9000 });
  await backup.sync(service.url); assert.equal(((await b.search('Camera')).items as Payload[])[0].priceMinor,9000);
  checks.push('new-publication-and-search-after-primary-failure');
  await service.close(); await sleep(130); assert.equal(((await b.search('Camera')).items as Payload[]).length,0);
  assert.equal((await b.listing(listing.subject)).listing.priceMinor,9000); checks.push('offline-excluded-history-preserved');
  const publicEvents = backup.store.page(0,200); assert.ok(!JSON.stringify(publicEvents).includes('LOCAL PRIVATE DEMO ADDRESS'));
  mkdirSync('artifacts',{ recursive: true }); writeFileSync('artifacts/demo-private.vault.json',JSON.stringify(vault,null,2));
  const report = { date: new Date().toISOString(), result: 'PASS', checks, events: backup.store.count(),
    simulatedParticipants: true, independentOperatorsProven: false, livePaymentVerified: false,
    productionReady: false, storage: root, sellerReputation: { dimensions: copy.dimensions, labels: copy.labels },
    publicCheckpoint: backup.store.checkpoint(backup.key) };
  writeFileSync('artifacts/demo-report.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
} finally { await primary.close(); await service.close(); await backup.close(); }
