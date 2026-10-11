import { Store } from '../src/store.ts';
import { Domain, drawReviewers } from '../src/domain.ts';
import { newKey, signEvent } from '../src/protocol.ts';
import type { IdentityKey, Payload } from '../src/protocol.ts';

export function fixture(path = ':memory:') {
  let now = Date.now(); const store = new Store(path); const domain = new Domain(store,() => now);
  const seller = newKey(), buyer = newKey(), coordinator = newKey(), outsiders = Array.from({ length: 16 },newKey);
  for (const [i,key] of [seller,buyer,coordinator,...outsiders].entries())
    domain.ingest(signEvent(key,'identity.create',key.id,{ name: 'identity-' + i, roles: ['participant'] },{ issuedAt: now }));
  const emit = (key: IdentityKey, kind: string, subject: string, payload: Payload, options: { principal?: string; delegation?: string } = {}) =>
    domain.ingest(signEvent(key,kind,subject,payload,{ issuedAt: now, ...options }));
  emit(coordinator,'policy.publish','policy:test',{ reviewers: outsiders.map(x => x.id), commitMs: 1000, revealMs: 1000, appealMs: 1000, retentionDays: 30 });
  const listing = emit(seller,'listing.put','listing:test',{ revision: 1, previous: '', title: 'Test Camera', category: 'electronics',
    priceMinor: 10000, currency: 'USD', serviceUrl: 'http://127.0.0.1:9999', facts: { brand: 'Example' }, faq: {}, resources: [], active: true });
  const quote = emit(seller,'quote.offer','quote:test',{ listing: 'listing:test', listingVersion: listing.id, buyer: buyer.id,
    termsHash: 'a'.repeat(64), expiresAt: now + 60000, policy: 'policy:test', reservation: false });
  emit(buyer,'trade.accept','trade:test',{ quote: 'quote:test', termsHash: 'a'.repeat(64) });
  const openCase = () => emit(buyer,'case.open','case:test',{ trade: 'trade:test', claim: 'Missing item', evidence: [quote.id] });
  const assign = (round = 1) => {
    const c = store.get<Payload>('case','case:test')!;
    const ids = drawReviewers(outsiders.map(x => x.id),'test-seed-' + round,'case:test',[seller.id,buyer.id,...c.panels as string[]],round === 1 ? 3 : 5);
    emit(coordinator,'case.assign','case:test',{ round, seed: 'test-seed-' + round, reviewers: ids });
    return ids.map(id => outsiders.find(k => k.id === id)!);
  };
  return { store, domain, seller, buyer, coordinator, outsiders, listing, quote, emit, openCase, assign,
    advance: (ms: number) => { now += ms; }, now: () => now };
}
