import { randomUUID } from 'node:crypto';
import { canonical, ensure, fields, integer, signEvent, str, verifyRecord } from './protocol.ts';
import type { Event, IdentityKey, Payload } from './protocol.ts';
import { Client, termsCommitment } from './sdk.ts';

export type BuyerPolicy = { currency: string; maxTotalMinor: number; allowExtras: boolean;
  allowSubscription: boolean; maxRenewalMinor: number };
export type PurchaseTerms = {
  format: 'buyer-terms/0.1'; currency: string;
  items: { name: string; quantity: number; unitPriceMinor: number }[];
  fees: { taxMinor: number; shippingMinor: number; otherMinor: number };
  discount: { amountMinor: number; conditions: string };
  extras: { name: string; priceMinor: number }[]; totalMinor: number;
  subscription: null | { trialEndsAt: number | null; renewalPriceMinor: number; intervalDays: number; cancellation: string };
  returns: string; source: { url: string; checkedAt: number };
};
export type PurchasePreview = { id: string; quote: string; seller: string; buyer: string;
  listingVersion: string; disputePolicy: string; expiresAt: number; terms: PurchaseTerms; warnings: string[] };
type Commitment = ReturnType<typeof termsCommitment>;
type Pending = { preview: PurchasePreview; quoteEventId: string; commitment: Commitment;
  buyerPolicy: BuyerPolicy; approved: boolean; attempted?: Event };
const snapshot = <T>(value: T): T => JSON.parse(canonical(value)) as T;
const object = (value: unknown): Payload => {
  ensure(value && typeof value === 'object' && !Array.isArray(value),'INCOMPLETE_TERMS');
  return value as Payload;
};
const text = (value: Payload, key: string, max = 1000): string => {
  const result = str(value,key,max); ensure(result.trim().length > 0,'INCOMPLETE_TERMS',key); return result;
};
const sum = (a: number, b: number): number => {
  ensure(Number.isSafeInteger(a + b),'UNSAFE_TOTAL'); return a + b;
};

export function validatePurchaseTerms(input: unknown, policyInput: unknown, now = Date.now()): PurchaseTerms {
  const p = object(snapshot(input)), policy = object(snapshot(policyInput));
  fields(policy,['currency','maxTotalMinor','allowExtras','allowSubscription','maxRenewalMinor']);
  ensure(/^[A-Z]{3}$/.test(text(policy,'currency',3)),'BAD_CURRENCY');
  integer(policy,'maxTotalMinor'); integer(policy,'maxRenewalMinor');
  ensure(typeof policy.allowExtras === 'boolean' && typeof policy.allowSubscription === 'boolean','BAD_BUYER_POLICY');
  fields(p,['format','currency','items','fees','discount','extras','totalMinor','subscription','returns','source']);
  ensure(p.format === 'buyer-terms/0.1','UNSUPPORTED_TERMS');
  ensure(/^[A-Z]{3}$/.test(text(p,'currency',3)) && p.currency === policy.currency,'CURRENCY_MISMATCH');
  ensure(Array.isArray(p.items) && p.items.length > 0 && p.items.length <= 20,'BAD_ITEMS');
  let total = 0;
  for (const value of p.items) {
    const item = object(value); fields(item,['name','quantity','unitPriceMinor']); text(item,'name',200);
    const price = integer(item,'unitPriceMinor'), quantity = integer(item,'quantity',1,1000000);
    ensure(Number.isSafeInteger(price * quantity),'UNSAFE_TOTAL'); total = sum(total,price * quantity);
  }
  const fees = object(p.fees); fields(fees,['taxMinor','shippingMinor','otherMinor']);
  for (const name of ['taxMinor','shippingMinor','otherMinor']) total = sum(total,integer(fees,name));
  const discount = object(p.discount); fields(discount,['amountMinor','conditions']); text(discount,'conditions');
  ensure(Array.isArray(p.extras) && p.extras.length <= 20,'BAD_EXTRAS');
  ensure(!p.extras.length || policy.allowExtras,'EXTRAS_NOT_ALLOWED');
  for (const value of p.extras) {
    const extra = object(value); fields(extra,['name','priceMinor']); text(extra,'name',200); total = sum(total,integer(extra,'priceMinor'));
  }
  total -= integer(discount,'amountMinor');
  ensure(total >= 0 && total === integer(p,'totalMinor'),'TOTAL_MISMATCH');
  ensure(total <= Number(policy.maxTotalMinor),'BUDGET_EXCEEDED');
  if (p.subscription !== null) {
    ensure(policy.allowSubscription,'SUBSCRIPTION_NOT_ALLOWED');
    const recurring = object(p.subscription); fields(recurring,['trialEndsAt','renewalPriceMinor','intervalDays','cancellation']);
    ensure(recurring.trialEndsAt === null || integer(recurring,'trialEndsAt',1) > now,'TRIAL_EXPIRED');
    ensure(integer(recurring,'renewalPriceMinor') <= Number(policy.maxRenewalMinor),'RENEWAL_BUDGET_EXCEEDED');
    integer(recurring,'intervalDays',1,3660); text(recurring,'cancellation');
  }
  text(p,'returns'); const source = object(p.source); fields(source,['url','checkedAt']);
  const url = new URL(text(source,'url',1500));
  ensure(['http:','https:'].includes(url.protocol) && !url.username && !url.password,'BAD_SOURCE');
  integer(source,'checkedAt',1,now);
  ensure(Buffer.byteLength(canonical(p)) <= 24000,'TERMS_TOO_LARGE');
  return p as unknown as PurchaseTerms;
}

// Trusted host reference only. Never expose approve() or the signing key to a model.
// Memory-only consent, no payment/renewal execution and no atomic inventory guarantee.
export class BuyerApprovalGate {
  #client: Client; #buyer: IdentityKey; #clock: () => number;
  #pending = new Map<string,Pending>();
  constructor(client: Client, buyer: IdentityKey, clock = () => Date.now()) {
    ensure(client.expectedPublicKey,'PINNED_NODE_REQUIRED');
    // Snapshot configuration as well as caller terms; do not let caller mutation redirect signing.
    this.#client = new Client(client.url,client.expectedPublicKey); this.#buyer = snapshot(buyer); this.#clock = clock;
  }
  async #quote(eventId: string): Promise<Event> {
    const descriptor = await this.#client.request('/.well-known/oamp-node') as Payload;
    ensure(verifyRecord(descriptor) && descriptor.publicKey === this.#client.expectedPublicKey,'NODE_KEY_MISMATCH');
    const [event] = await this.#client.batch([eventId]);
    ensure(event?.kind === 'quote.offer','BAD_QUOTE');
    fields(event.payload,['listing','listingVersion','buyer','termsHash','expiresAt','policy','reservation']);
    ensure(event.payload.buyer === this.#buyer.id && event.payload.reservation === false,'QUOTE_BUYER_MISMATCH');
    str(event.payload,'listing'); str(event.payload,'listingVersion'); str(event.payload,'policy');
    ensure(integer(event.payload,'expiresAt') > this.#clock(),'QUOTE_EXPIRED');
    const listing = await this.#client.listing(String(event.payload.listing));
    ensure(listing.listing.active === true && listing.listing.seller === event.principal &&
      listing.publication.id === event.payload.listingVersion,'LISTING_CHANGED');
    return event;
  }
  #entry(id: string): Pending {
    const entry = this.#pending.get(id); ensure(entry,'APPROVAL_NOT_FOUND');
    ensure(entry.preview.expiresAt > this.#clock(),'APPROVAL_EXPIRED'); return entry;
  }
  async prepare(quoteEventId: string, commitmentInput: Commitment, buyerPolicyInput: BuyerPolicy): Promise<PurchasePreview> {
    const commitment = snapshot(commitmentInput), buyerPolicy = snapshot(buyerPolicyInput);
    const terms = validatePurchaseTerms(commitment.terms,buyerPolicy,this.#clock());
    ensure(termsCommitment(commitment.terms,commitment.salt).termsHash === commitment.termsHash,'TERMS_MISMATCH');
    const quote = await this.#quote(quoteEventId);
    ensure(quote.payload.termsHash === commitment.termsHash,'TERMS_MISMATCH');
    for (const [id,entry] of this.#pending) if (entry.preview.expiresAt <= this.#clock() && !entry.attempted) this.#pending.delete(id);
    ensure(this.#pending.size < 100,'APPROVAL_CAPACITY');
    const preview: PurchasePreview = { id: randomUUID(), quote: quote.subject, seller: quote.principal, buyer: this.#buyer.id,
      listingVersion: String(quote.payload.listingVersion), disputePolicy: String(quote.payload.policy),
      expiresAt: Math.min(Number(quote.payload.expiresAt),this.#clock() + 300000), terms,
      warnings: ['Seller-provided terms; sources and signatures do not verify truth or fulfillment.',
        'One initial agreement only. This approval does not authorize external payments or future renewals.'] };
    this.#pending.set(preview.id,{ preview, quoteEventId, commitment, buyerPolicy, approved: false });
    return snapshot(preview);
  }
  // Called only by an authenticated human-facing host action, never by model tool routing.
  getPreview(previewId: string): PurchasePreview { return snapshot(this.#entry(previewId).preview); }
  approve(previewId: string, displayedPreview: PurchasePreview): void {
    const entry = this.#entry(previewId); ensure(!entry.attempted,'APPROVAL_CONSUMED');
    ensure(displayedPreview && canonical(displayedPreview) === canonical(entry.preview),'PREVIEW_CHANGED');
    entry.approved = true;
  }
  async accept(previewId: string, tradeId: string, currentBuyerPolicy: BuyerPolicy): Promise<Event> {
    const entry = this.#entry(previewId);
    ensure(entry.approved && !entry.attempted,'APPROVAL_REQUIRED');
    ensure(canonical(currentBuyerPolicy) === canonical(entry.buyerPolicy),'BUYER_POLICY_CHANGED');
    validatePurchaseTerms(entry.commitment.terms,entry.buyerPolicy,this.#clock());
    await this.#quote(entry.quoteEventId);
    // Recheck after async preflight; another caller may have consumed the approval meanwhile.
    this.#entry(previewId); ensure(entry.approved && !entry.attempted,'APPROVAL_CONSUMED');
    ensure(canonical(currentBuyerPolicy) === canonical(entry.buyerPolicy),'BUYER_POLICY_CHANGED');
    validatePurchaseTerms(entry.commitment.terms,entry.buyerPolicy,this.#clock());
    const event = signEvent(this.#buyer,'trade.accept',tradeId,{ quote: entry.preview.quote, termsHash: entry.commitment.termsHash },
      { issuedAt: this.#clock() });
    entry.attempted = event; entry.approved = false;
    await this.#client.publish(event); return snapshot(event);
  }
  // Safe recovery aid: event ID and node acceptance only, not payment status or private consent.
  async reconcile(previewId: string): Promise<{ eventId: string; accepted: boolean }> {
    const entry = this.#pending.get(previewId); ensure(entry?.attempted,'NO_ACCEPTANCE_ATTEMPT');
    const [event] = await this.#client.batch([entry.attempted.id]);
    return { eventId: entry.attempted.id, accepted: event?.id === entry.attempted.id };
  }
}
