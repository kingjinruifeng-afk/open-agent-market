import { actorId, canonical, ensure, fields, hash, integer, str, strings, verifyEvent, ProtocolError, validatePublicKey } from './protocol.ts';
import type { Event, Json, Payload } from './protocol.ts';
import { Store } from './store.ts';

type Doc = Payload & { eventId: string };
const get = (s: Store, kind: string, id: string): Doc => { const d = s.get<Doc>(kind,id); ensure(d,'MISSING_DEPENDENCY',kind + ':' + id,409); return d; };
const votes = ['buyer','seller','shared','insufficient'];
const integrity = ['none','buyer','seller','both'];
export function drawReviewers(pool: string[], seed: string, caseId: string, excluded: string[], count: number): string[] {
  const eligible = [...new Set(pool)].filter(x => !excluded.includes(x));
  ensure(eligible.length >= count,'INSUFFICIENT_REVIEWERS','No eligible non-overlapping panel',409);
  return eligible.sort((a,b) => hash(seed + ':' + caseId + ':' + a).localeCompare(hash(seed + ':' + caseId + ':' + b))).slice(0,count);
}
export function ballotCommit(caseId: string, round: number, reviewer: string, ballot: Payload, salt: string): string {
  return hash(canonical({ caseId, round, reviewer, ballot, salt }));
}
export class Domain {
  store: Store; clock: () => number;
  constructor(store: Store, clock = () => Date.now()) { this.store = store; this.clock = clock; }
  authorized(e: Event): void {
    const identity = get(this.store,'identity',e.principal);
    if (identity.controller === e.actor) return;
    if (e.kind === 'identity.recover' && identity.recovery === e.actor) return;
    ensure(e.delegation,'NOT_AUTHORIZED','No controlling key or delegation',403);
    const grant = get(this.store,'delegation',e.delegation);
    ensure(grant.principal === e.principal && grant.delegate === e.actor && grant.revoked !== true &&
      Number(grant.expiresAt) >= this.clock() && (grant.scopes as Json[]).includes(e.kind),'NOT_AUTHORIZED','Invalid/revoked/expired scope',403);
    ensure(!e.kind.startsWith('identity.') && !e.kind.startsWith('delegation.'),'ROOT_REQUIRED','Root control required',403);
  }
  ingest(input: unknown, archive = false): Event {
    const now = this.clock(); const e = verifyEvent(input, now);
    if (this.store.event(e.id)) return e;
    const realClock = this.clock;
    // Historical replay is allowed only by the node's authenticated operator using a pinned archive.
    if (archive) this.clock = () => e.issuedAt;
    try { this.store.transaction(() => { this.apply(e); this.store.append(e); }); }
    finally { this.clock = realClock; }
    return e;
  }
  apply(e: Event): void {
    const s = this.store, p = e.payload, now = this.clock();
    const save = (kind: string, data: Payload, id = e.subject) => s.put(kind,id,{ ...data, eventId: e.id });
    if (e.kind === 'identity.create') {
      fields(p,['name','roles'],['recovery']); str(p,'name',120); strings(p,'roles',12);
      ensure(e.principal === e.actor && e.subject === e.actor && !s.get('identity',e.subject),'IDENTITY_CONFLICT');
      if (p.recovery) str(p,'recovery',100);
      save('identity',{ ...p, controller: e.actor, createdAt: e.issuedAt }); return;
    }
    this.authorized(e);
    if (e.kind === 'identity.rotate' || e.kind === 'identity.recover') {
      fields(p,['newPublicKey']); ensure(e.subject === e.principal,'SUBJECT_MISMATCH');
      const i = get(s,'identity',e.subject); const newController = actorId(str(p,'newPublicKey',120));
      validatePublicKey(String(p.newPublicKey));
      save('identity',{ ...i, controller: newController }); return;
    }
    if (e.kind === 'delegation.grant') {
      fields(p,['delegate','scopes','expiresAt']); str(p,'delegate',100); strings(p,'scopes');
      ensure(integer(p,'expiresAt') > now && !s.get('delegation',e.subject),'BAD_DELEGATION');
      save('delegation',{ ...p, principal: e.principal, revoked: false }); return;
    }
    if (e.kind === 'delegation.revoke') {
      fields(p,['grant']); const grantId = str(p,'grant'); const grant = get(s,'delegation',grantId);
      ensure(grant.principal === e.principal,'NOT_AUTHORIZED','Grant owner only',403);
      save('delegation',{ ...grant, revoked: true },grantId); return;
    }
    if (e.kind === 'listing.put') {
      fields(p,['revision','previous','title','category','priceMinor','currency','serviceUrl','facts','faq','resources','active']);
      str(p,'title',200); str(p,'category',100); str(p,'currency',3);
      ensure(/^[A-Z]{3}$/.test(String(p.currency)),'BAD_CURRENCY'); integer(p,'priceMinor');
      const revision = integer(p,'revision',1); ensure(typeof p.previous === 'string' && typeof p.active === 'boolean','BAD_LISTING');
      const existing = s.get<Doc>('listing',e.subject);
      ensure((!existing && revision === 1 && p.previous === '') || (existing && existing.seller === e.principal &&
        revision === Number(existing.revision) + 1 && p.previous === existing.eventId),'VERSION_CONFLICT','Expected current listing version',409);
      ensure(typeof p.facts === 'object' && p.facts !== null && !Array.isArray(p.facts),'BAD_FACTS');
      ensure(Object.values(p.facts).every(x => typeof x === 'string' && x.length <= 1000),'BAD_FACTS');
      ensure(typeof p.faq === 'object' && p.faq !== null && !Array.isArray(p.faq) &&
        Object.values(p.faq).every(x => typeof x === 'string' && x.length <= 1500),'BAD_FAQ');
      const url = new URL(str(p,'serviceUrl',1000)); ensure(['http:','https:'].includes(url.protocol) && !url.username && !url.password,'BAD_URL');
      ensure(url.pathname === '/' && !url.search && !url.hash,'BAD_URL','serviceUrl must be an origin');
      ensure(Array.isArray(p.resources) && p.resources.length <= 20,'BAD_RESOURCES');
      for (const resource of p.resources) {
        ensure(resource && typeof resource === 'object' && !Array.isArray(resource),'BAD_RESOURCE');
        fields(resource as Payload,['url','relation'],['digest']); const r = resource as Payload;
        ensure(['https:','http:','ipfs:'].includes(new URL(str(r,'url',1500)).protocol),'BAD_RESOURCE');
        ensure(['manufacturer','seller','reference'].includes(str(r,'relation')),'BAD_RESOURCE');
      }
      ensure(Buffer.byteLength(canonical({ facts: p.facts, faq: p.faq, resources: p.resources })) <= 24000,'KNOWLEDGE_TOO_LARGE');
      save('listing',{ ...p, seller: e.principal, id: e.subject }); return;
    }
    if (e.kind === 'policy.publish') {
      fields(p,['reviewers','commitMs','revealMs','appealMs','retentionDays']);
      const reviewers = strings(p,'reviewers',100); ensure(new Set(reviewers).size === reviewers.length && reviewers.length >= 8,'BAD_POOL');
      for (const id of reviewers) get(s,'identity',id);
      for (const k of ['commitMs','revealMs','appealMs']) integer(p,k,100,7 * 86_400_000);
      integer(p,'retentionDays',1,3650); ensure(!s.get('policy',e.subject),'IMMUTABLE_POLICY');
      save('policy',{ ...p, coordinator: e.principal, qualification: 'bootstrap-explicit-pool', selection: 'auditable-coordinator-seed' }); return;
    }
    if (e.kind === 'quote.offer') {
      fields(p,['listing','listingVersion','buyer','termsHash','expiresAt','policy','reservation']);
      const listing = get(s,'listing',str(p,'listing'));
      ensure(listing.seller === e.principal && listing.active === true && listing.eventId === p.listingVersion,'STALE_LISTING',undefined,409);
      get(s,'identity',str(p,'buyer')); get(s,'policy',str(p,'policy'));
      ensure(p.buyer !== e.principal,'SELF_TRADE'); ensure(/^[a-f0-9]{64}$/.test(str(p,'termsHash')),'BAD_COMMITMENT');
      ensure(integer(p,'expiresAt') > now,'QUOTE_EXPIRED');
      ensure(p.reservation === false,'BAD_QUOTE','Reference quotes do not reserve inventory');
      ensure(!s.get('quote',e.subject),'QUOTE_CONFLICT');
      save('quote',{ ...p, seller: e.principal, id: e.subject }); return;
    }
    if (e.kind === 'trade.accept') {
      fields(p,['quote','termsHash']); const quote = get(s,'quote',str(p,'quote'));
      ensure(quote.buyer === e.principal && quote.termsHash === p.termsHash,'NOT_AUTHORIZED',undefined,403);
      ensure(Number(quote.expiresAt) >= now,'QUOTE_EXPIRED',undefined,409);
      ensure(!s.get('trade',e.subject) && !s.get('quote-used',String(p.quote)),'QUOTE_ALREADY_USED',undefined,409);
      save('trade',{ id: e.subject, quote: p.quote, buyer: quote.buyer, seller: quote.seller,
        listing: quote.listing, listingVersion: quote.listingVersion, policy: quote.policy, acceptedAt: e.issuedAt });
      save('quote-used',{ trade: e.subject },String(p.quote)); return;
    }
    if (e.kind === 'trade.fact') {
      fields(p,['phase','evidence']); const trade = get(s,'trade',e.subject); const phase = str(p,'phase'); strings(p,'evidence',10);
      const buyerPhases = ['payment_claim','delivery_ack','return_requested','refund_received'];
      const sellerPhases = ['shipment_claim','return_received','refund_claim'];
      ensure((trade.buyer === e.principal && buyerPhases.includes(phase)) || (trade.seller === e.principal && sellerPhases.includes(phase)),'NOT_AUTHORIZED',undefined,403);
      save('fact',{ ...p, trade: e.subject, principal: e.principal, evidenceClass: 'participant-claim', issuedAt: e.issuedAt },e.id); return;
    }
    if (e.kind === 'review.submit' || e.kind === 'review.amend') {
      fields(p,['target','dimension','score','text'],e.kind === 'review.amend' ? ['previous'] : []); const trade = get(s,'trade',e.subject);
      ensure((trade.buyer === e.principal && p.target === trade.seller) || (trade.seller === e.principal && p.target === trade.buyer),'NOT_AUTHORIZED',undefined,403);
      const sellerDimensions = ['description','quality','shipping','service','resolution'];
      const buyerDimensions = ['payment','handover','return_cooperation','communication'];
      ensure((trade.buyer === e.principal ? sellerDimensions : buyerDimensions).includes(str(p,'dimension')),'BAD_DIMENSION');
      if (['quality','description'].includes(String(p.dimension))) ensure(s.all<Doc>('fact').some(f => f.trade === e.subject && f.phase === 'delivery_ack'),'NO_PRODUCT_EXPERIENCE');
      integer(p,'score',1,5); str(p,'text',1500);
      const id = e.subject + ':' + e.principal + ':' + p.dimension;
      const current = s.get<Doc>('review',id);
      ensure(e.kind === 'review.amend' ? current && current.eventId === p.previous : !current,
        'REVIEW_ALREADY_EXISTS','One review per transaction/author/dimension; amendments need current version',409);
      save('review',{ ...p, trade: e.subject, author: e.principal, issuedAt: e.issuedAt,
        role: trade.buyer === e.principal ? 'seller' : 'buyer', evidenceClass: 'participant-feedback' },id); return;
    }
    if (e.kind === 'case.open') {
      fields(p,['trade','claim','evidence']); const trade = get(s,'trade',str(p,'trade')); str(p,'claim',1500); strings(p,'evidence',20);
      ensure([trade.buyer,trade.seller].includes(e.principal),'NOT_AUTHORIZED',undefined,403);
      ensure(!s.get('case',e.subject),'CASE_CONFLICT');
      ensure(!s.all<Doc>('case').some(c => c.trade === p.trade && c.status !== 'corrected'),'CASE_ALREADY_EXISTS');
      for (const ref of p.evidence as string[]) ensure(s.event(ref),'MISSING_EVIDENCE');
      save('case',{ ...p, id: e.subject, buyer: trade.buyer, seller: trade.seller, policy: trade.policy,
        status: 'open', round: 0, panels: [], openedBy: e.principal }); return;
    }
    if (e.kind === 'case.response') {
      fields(p,['statement','evidence']); str(p,'statement',1500); const c = get(s,'case',e.subject);
      ensure([c.buyer,c.seller].includes(e.principal),'NOT_AUTHORIZED',undefined,403); strings(p,'evidence',20);
      for (const ref of p.evidence as string[]) ensure(s.event(ref),'MISSING_EVIDENCE');
      save('response',{ ...p, principal: e.principal, case: e.subject },e.id); return;
    }
    if (e.kind.startsWith('case.')) this.caseEvent(e,save);
    else throw new ProtocolError('UNSUPPORTED_KIND',e.kind);
  }
  caseEvent(e: Event, save: (kind: string, data: Payload, id?: string) => void): void {
    const s = this.store, p = e.payload, now = this.clock(), c = get(s,'case',e.subject), policy = get(s,'policy',String(c.policy));
    const isCoordinator = () => ensure(e.principal === policy.coordinator,'COORDINATOR_REQUIRED',undefined,403);
    ensure(Math.abs(now - e.issuedAt) <= 30_000,'STALE_PROCEDURAL_EVENT');
    if (e.kind === 'case.assign') {
      fields(p,['round','seed','reviewers']); isCoordinator(); const round = integer(p,'round',1,2); str(p,'seed',200);
      ensure((round === 1 && c.status === 'open') || (round === 2 && c.status === 'appealed'),'BAD_CASE_STATE',undefined,409);
      const prior = (c.panels as string[]);
      const related = s.all<Doc>('trade').filter(t => [t.buyer,t.seller].some(x => x === c.buyer || x === c.seller)).flatMap(t => [String(t.buyer),String(t.seller)]);
      const expected = drawReviewers(policy.reviewers as string[],String(p.seed),e.subject,[String(c.buyer),String(c.seller),...prior,...related],round === 1 ? 3 : 5);
      ensure(canonical(expected) === canonical(strings(p,'reviewers',5)),'BAD_DRAW');
      save('case',{ ...c, round, status: 'assigned', reviewers: expected, panels: [...prior,...expected], seed: p.seed,
        commitDeadline: e.issuedAt + Number(policy.commitMs), revealDeadline: e.issuedAt + Number(policy.commitMs) + Number(policy.revealMs),
        appealDeadline: e.issuedAt + Number(policy.commitMs) + Number(policy.revealMs) + Number(policy.appealMs) }); return;
    }
    if (e.kind === 'case.commit') {
      fields(p,['round','commitment']); ensure(c.status === 'assigned' && p.round === c.round && now < Number(c.commitDeadline),'COMMIT_CLOSED',undefined,409);
      ensure((c.reviewers as string[]).includes(e.principal),'REVIEWER_REQUIRED',undefined,403);
      ensure(/^[a-f0-9]{64}$/.test(str(p,'commitment')),'BAD_COMMITMENT');
      const id = e.subject + ':' + c.round + ':' + e.principal; ensure(!s.get('commit',id),'DUPLICATE_VOTE');
      save('commit',{ ...p, reviewer: e.principal, case: e.subject },id); return;
    }
    if (e.kind === 'case.reveal') {
      fields(p,['round','ballot','salt']); ensure(c.status === 'assigned' && p.round === c.round && now >= Number(c.commitDeadline) && now < Number(c.revealDeadline),'REVEAL_CLOSED',undefined,409);
      ensure((c.reviewers as string[]).includes(e.principal),'REVIEWER_REQUIRED',undefined,403);
      ensure(p.ballot && typeof p.ballot === 'object' && !Array.isArray(p.ballot),'BAD_BALLOT');
      const ballot = p.ballot as Payload; fields(ballot,['outcome','integrity','reason','evidence']);
      ensure(votes.includes(str(ballot,'outcome')) && integrity.includes(str(ballot,'integrity')),'BAD_BALLOT'); str(ballot,'reason',1500); strings(ballot,'evidence',20);
      for (const ref of ballot.evidence as string[]) ensure(s.event(ref),'MISSING_EVIDENCE');
      ensure(ballot.integrity === 'none' || (ballot.evidence as string[]).length > 0,'NO_INTEGRITY_EVIDENCE');
      const salt = str(p,'salt',200); ensure(salt.length >= 32,'SHORT_SALT');
      const id = e.subject + ':' + c.round + ':' + e.principal, commit = get(s,'commit',id);
      ensure(commit.commitment === ballotCommit(e.subject,Number(c.round),e.principal,ballot,salt),'COMMIT_MISMATCH');
      ensure(!s.get('ballot',id),'DUPLICATE_VOTE');
      save('ballot',{ ...ballot, reviewer: e.principal, case: e.subject, round: c.round },id); return;
    }
    if (e.kind === 'case.appeal') {
      fields(p,['reason']); str(p,'reason',1500);
      ensure([c.buyer,c.seller].includes(e.principal),'PARTY_REQUIRED',undefined,403);
      ensure(c.round === 1 && c.status === 'assigned' && now >= Number(c.revealDeadline) && now < Number(c.appealDeadline),'APPEAL_CLOSED',undefined,409);
      save('case',{ ...c, status: 'appealed', appealReason: p.reason }); return;
    }
    if (e.kind === 'case.finalize') {
      fields(p,[]); isCoordinator();
      ensure(c.status === 'assigned' && now >= Number(c.round === 1 ? c.appealDeadline : c.revealDeadline),'FINALIZE_EARLY',undefined,409);
      const ballots = s.all<Doc>('ballot').filter(b => b.case === e.subject && b.round === c.round);
      const majority = Math.floor((c.reviewers as string[]).length / 2) + 1;
      const outcome = votes.find(v => ballots.filter(b => b.outcome === v).length >= majority) ?? 'insufficient';
      const finding = integrity.filter(x => x !== 'none').find(v => ballots.filter(b => b.outcome === outcome && b.integrity === v).length >= majority) ?? 'none';
      save('case',{ ...c, status: 'final', outcome, integrity: outcome === 'insufficient' ? 'none' : finding, decisionEvent: e.id }); return;
    }
    if (e.kind === 'case.correction.vote') {
      fields(p,['decision','reason']); str(p,'reason',1500);
      ensure(c.status === 'final' && p.decision === c.decisionEvent,'BAD_CASE_STATE');
      ensure((policy.reviewers as string[]).includes(e.principal) && !(c.panels as string[]).includes(e.principal) && ![c.buyer,c.seller].includes(e.principal),'INDEPENDENT_REVIEWER_REQUIRED',undefined,403);
      ensure(!s.all<Doc>('trade').some(t => [t.buyer,t.seller].includes(e.principal) && [t.buyer,t.seller].some(x => x === c.buyer || x === c.seller)),
        'INDEPENDENT_REVIEWER_REQUIRED',undefined,403);
      const id = e.subject + ':' + e.principal; ensure(!s.get('correction',id),'DUPLICATE_VOTE');
      save('correction',{ ...p, reviewer: e.principal, case: e.subject },id); return;
    }
    if (e.kind === 'case.correct') {
      fields(p,['votes']); isCoordinator(); ensure(c.status === 'final','BAD_CASE_STATE');
      const refs = strings(p,'votes',5); ensure(refs.length === 5 && new Set(refs).size === 5,'CORRECTION_QUORUM');
      const records = refs.map(id => { const ev = s.event(id); ensure(ev && ev.kind === 'case.correction.vote' && ev.subject === e.subject,'BAD_CORRECTION'); return ev; });
      ensure(new Set(records.map(x => x.principal)).size === 5,'CORRECTION_QUORUM');
      save('case',{ ...c, status: 'corrected', correctionEvent: e.id }); return;
    }
    throw new ProtocolError('UNSUPPORTED_KIND',e.kind);
  }
}

export type ReputationView = 'legacy' | 'evidence-v2';
export function reputation(s: Store, principal: string, now = Date.now(), view: ReputationView = 'legacy'): Payload {
  ensure(view === 'legacy' || view === 'evidence-v2','BAD_REPUTATION_VIEW');
  get(s,'identity',principal);
  const trades = s.all<Doc>('trade').filter(t => t.buyer === principal || t.seller === principal);
  const reviews = s.all<Doc>('review').filter(r => r.target === principal);
  const dimensions: Payload = {};
  for (const r of reviews) {
    const key = r.role + ':' + r.dimension;
    const items = reviews.filter(x => x.role + ':' + x.dimension === key);
    const scores = items.map(x => Number(x.score)); const recent = items.filter(x => Number(x.issuedAt) >= now - 90 * 86_400_000);
    const counts = new Map<string,number>();
    for (const item of items) counts.set(String(item.author),(counts.get(String(item.author)) ?? 0) + 1);
    dimensions[key] = { samples: scores.length, meanMilli: Math.round(scores.reduce((a,b) => a + b,0) * 1000 / scores.length),
      distribution: [1,2,3,4,5].map(v => scores.filter(x => x === v).length), recentSamples: recent.length,
      ...(view === 'legacy' ? { independentCounterparties: counts.size } : {
        distinctCounterpartyIdentities: counts.size, maxSamplesFromOneIdentity: Math.max(...counts.values()),
        counterpartyIndependence: 'not-verified' }), evidenceClass: 'participant-feedback' };
  }
  const cases = s.all<Doc>('case');
  const findings = cases.filter(c => c.status === 'final' && c.integrity !== 'none' &&
    ((c.buyer === principal && ['buyer','both'].includes(String(c.integrity))) || (c.seller === principal && ['seller','both'].includes(String(c.integrity)))));
  const reviewed = s.all<Doc>('ballot').filter(b => b.reviewer === principal);
  const eligibleContributions = reviewed.filter(b => cases.some(c => c.id === b.case && c.status === 'final' && c.round === b.round));
  return { subject: principal, algorithm: 'reference/0.1', evidenceScope: 'this-node-visible-events',
    cutoff: now, checkpoint: s.head().chain, dimensions,
    ...(view === 'legacy' ? { acceptedTrades: trades.length, counterpartyIndependence: 'not-verified',
      legacyFieldWarnings: { independentCounterparties: 'Distinct principals only; not proof of independent people.',
        acceptedTrades: 'Accepted agreements only; not verified sales or completed orders.' } } : {
      viewVersion: 'evidence/0.2', acceptedAgreements: trades.length, counterpartyIndependence: 'not-verified' }),
    evidenceClasses: { participantClaims: s.all<Doc>('fact').filter(f => f.principal === principal).length, independentlyVerified: 0 },
    labels: findings.map(c => ({ type: 'community-integrity-finding', case: c.id, decision: c.decisionEvent,
      confidence: 'community-reviewed-not-legal-arbitration', source: get(s,'policy',String(c.policy)).coordinator })),
    reviewer: { completedContributions: eligibleContributions.length, badge: eligibleContributions.length ? 'trial-contributor' : 'none',
      qualification: 'bootstrap', commercialScoreBoost: false },
    uncertainty: trades.length < 5 ? 'insufficient-history' : 'participant-evidence-only', totalScore: null };
}
