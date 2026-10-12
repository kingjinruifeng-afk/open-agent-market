import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Store, verifyLog } from './store.ts';
import { Domain, reputation } from './domain.ts';
import { ensure, newKey, ProtocolError, signedRecord, signEvent, verifyRecord } from './protocol.ts';
import type { Event, IdentityKey, Payload } from './protocol.ts';

async function boundedJson(response: Response, maxBytes = 8 * 1024 * 1024): Promise<any> {
  ensure(!response.headers.get('content-length') || Number(response.headers.get('content-length')) <= maxBytes,'PEER_BODY_TOO_LARGE');
  const reader = response.body?.getReader(); ensure(reader,'EMPTY_RESPONSE'); const parts: Buffer[] = []; let size = 0;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length;
      ensure(size <= maxBytes,'PEER_BODY_TOO_LARGE'); parts.push(Buffer.from(chunk.value)); }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } finally { await reader.cancel(); }
}

export interface Peer { url: string; publicKey: string }
export interface NodeOptions {
  db?: string; key?: IdentityKey; sellerKey?: IdentityKey; sellerPrincipal?: string; name?: string;
  host?: string; port?: number; adminToken?: string; peers?: Peer[]; allowedSellerOrigins?: string[];
  maxEvents?: number; maxRequestsPerMinute?: number; proofTtlMs?: number; clock?: () => number;
  retentionDays?: number; publicOrigin?: string;
}
export class MarketNode {
  store: Store; domain: Domain; key: IdentityKey; options: NodeOptions; server: Server;
  url = ''; cache = new Map<string,{ until: number; proof: Payload | null }>();
  closed = false;
  pending = new Map<string,Promise<Payload | null>>(); requests = new Map<string,{ start: number; count: number }>();
  syncJobs = new Map<string,Promise<Payload>>();
  constructor(options: NodeOptions = {}) {
    this.options = options; this.key = options.key ?? newKey(); this.store = new Store(options.db);
    this.domain = new Domain(this.store,options.clock);
    if (!this.store.get('identity',this.key.id)) this.domain.ingest(signEvent(this.key,'identity.create',this.key.id,{ name: options.name ?? 'reference-node', roles: ['node'] }));
    this.server = createServer(async (req,res) => {
      try {
        const ip = req.socket.remoteAddress ?? 'unknown', now = Date.now();
        if (this.requests.size > 1000) for (const [key,bucket] of this.requests) if (now - bucket.start > 60_000) this.requests.delete(key);
        ensure(this.requests.has(ip) || this.requests.size < 1000,'RATE_LIMIT','Source bucket budget exceeded',429);
        let bucket = this.requests.get(ip); if (!bucket || now - bucket.start > 60_000) { bucket = { start: now, count: 0 }; this.requests.set(ip,bucket); }
        ensure(++bucket.count <= (options.maxRequestsPerMinute ?? 120),'RATE_LIMIT','Request budget exceeded',429);
        const url = new URL(req.url ?? '/',this.url || 'http://127.0.0.1');
        const method = req.method ?? 'GET'; let body: unknown = undefined;
        if (method === 'POST') {
          const chunks: Buffer[] = []; let size = 0;
          for await (const chunk of req) { size += chunk.length; ensure(size <= 65536,'BODY_TOO_LARGE',undefined,413); chunks.push(chunk); }
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ProtocolError('BAD_JSON','Invalid JSON'); }
        }
        const result = await this.route(method,url,body,req.headers.authorization);
        res.writeHead(200,{ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify(result));
      } catch (err) {
        const e = err instanceof ProtocolError ? err : new ProtocolError('INTERNAL_ERROR','Node failed to process the request',500);
        res.writeHead(e.status,{ 'content-type': 'application/json', 'cache-control': 'no-store', ...(e.status === 429 ? { 'retry-after': '60' } : {}) });
        res.end(JSON.stringify({ error: { code: e.code, message: e.message } }));
      }
    });
    this.server.requestTimeout = 10_000; this.server.headersTimeout = 10_000;
  }
  async start(): Promise<string> {
    await new Promise<void>((resolve,reject) => { this.server.once('error',reject); this.server.listen(this.options.port ?? 0,this.options.host ?? '127.0.0.1',resolve); });
    const address = this.server.address(); ensure(address && typeof address === 'object','LISTEN_FAILED');
    this.url = 'http://127.0.0.1:' + address.port; return this.url;
  }
  async close(): Promise<void> {
    if (this.closed) return; this.closed = true;
    this.server.closeAllConnections(); await new Promise<void>((resolve,reject) => this.server.close(err => err ? reject(err) : resolve())); this.store.close();
  }
  operator(auth?: string): void {
    const token = this.options.adminToken;
    const expected = Buffer.from('Bearer ' + (token ?? '')), supplied = Buffer.from(auth ?? '');
    ensure(token && expected.length === supplied.length && timingSafeEqual(expected,supplied),'OPERATOR_AUTH_REQUIRED',undefined,403);
  }
  descriptor(): Payload {
    return signedRecord(this.key,{ type: 'node', version: 'oamp/0.1', name: this.options.name ?? 'reference-node',
      capabilities: ['directory','relay','archive','index','reputation','community-disputes'],
      reputationViews: ['legacy','evidence-v2'], experimental: true, operator: this.key.id, retentionDays: this.options.retentionDays ?? 30,
      retentionGuarantee: 'none-in-local-reference', fees: { currency: 'USD', amountMinor: 0, model: 'trial' },
      limits: { maxEvents: this.options.maxEvents ?? 10000, maxBodyBytes: 65536, maxPage: 200 },
      reviewerQualification: 'explicit-bootstrap-pool', storage: 'sqlite', migration: '/v1/events' });
  }
  async route(method: string, url: URL, body: unknown, auth?: string): Promise<unknown> {
    const path = url.pathname, now = this.domain.clock();
    if (method === 'GET' && path === '/.well-known/oamp-node') return this.descriptor();
    if (method === 'GET' && path === '/health') {
      const seller = this.options.sellerPrincipal ?? this.options.sellerKey?.id;
      ensure(seller && seller === url.searchParams.get('seller'),'SELLER_UNAVAILABLE',undefined,503);
      const challenge = url.searchParams.get('challenge'); ensure(challenge && challenge.length <= 100,'CHALLENGE_REQUIRED');
      return signedRecord(this.options.sellerKey ?? this.key,{ type: 'presence', seller, origin: this.options.publicOrigin ?? this.url, challenge,
        issuedAt: now, expiresAt: now + Math.min(this.options.proofTtlMs ?? 10000,10000) });
    }
    if (method === 'POST' && path === '/v1/events') {
      const existing = typeof body === 'object' && body !== null ? this.store.event(String((body as Event).id)) : undefined;
      ensure(existing || this.store.count() < (this.options.maxEvents ?? 10000),'STORAGE_QUOTA',undefined,507);
      const e = this.domain.ingest(body);
      return { id: e.id, accepted: true, checkpoint: this.store.checkpoint(this.key), persistence: 'local-node-only' };
    }
    if (method === 'GET' && path === '/v1/events') {
      const page = this.store.page(Number(url.searchParams.get('cursor') ?? 0),Number(url.searchParams.get('limit') ?? 100));
      return { ...page, checkpoint: this.store.checkpoint(this.key) };
    }
    if (method === 'GET' && path.startsWith('/v1/events/')) {
      const e = this.store.event(decodeURIComponent(path.slice('/v1/events/'.length))); ensure(e,'NOT_FOUND',undefined,404); return e;
    }
    if (method === 'POST' && path === '/v1/sync') {
      this.operator(auth); ensure(body && typeof body === 'object','BAD_SYNC');
      return this.sync(String((body as { source?: string }).source));
    }
    if (method === 'POST' && path === '/v1/batch') {
      const ids = (body as { ids?: unknown })?.ids;
      ensure(Array.isArray(ids) && ids.length <= 50 && ids.every(id => typeof id === 'string' && id.length <= 512),'BAD_BATCH');
      return { events: ids.map(id => this.store.event(id) ?? null), scope: 'public-events-only' };
    }
    if (method === 'GET' && path === '/v1/search') {
      const limit = Number(url.searchParams.get('limit') ?? 20); ensure(Number.isInteger(limit) && limit >= 1 && limit <= 50,'BAD_LIMIT');
      const q = (url.searchParams.get('q') ?? '').toLowerCase(); ensure(q.length <= 200,'BAD_QUERY');
      const after = url.searchParams.get('cursor') ?? '';
      const matched = this.store.all<Payload>('listing').filter(l => l.active && String(l.id) > after &&
        String(l.title).toLowerCase().includes(q) && (!url.searchParams.get('category') || l.category === url.searchParams.get('category')));
      const candidates = matched.slice(0,limit);
      const items: Payload[] = [];
      const selected = url.searchParams.get('fields')?.split(',');
      const allowed = ['id','seller','title','category','priceMinor','currency','version','presence'];
      ensure(!selected || selected.every(f => allowed.includes(f)),'BAD_FIELDS');
      // Bounded fan-out: at most four probes at once, at most `limit` candidates per query.
      for (let i = 0; i < candidates.length; i += 4) {
        const group = await Promise.all(candidates.slice(i,i+4).map(async listing => {
          const proof = await this.presence(String(listing.seller),String(listing.serviceUrl));
          return proof ? { id: listing.id, seller: listing.seller, title: listing.title, category: listing.category,
            priceMinor: listing.priceMinor, currency: listing.currency, version: listing.eventId, presence: proof } : null;
        }));
        for (const item of group) if (item) items.push(selected ? Object.fromEntries(Object.entries(item).filter(([k]) => selected.includes(k) || ['id','version','presence'].includes(k))) as Payload : item);
      }
      return signedRecord(this.key,{ type: 'search', items, cursor: candidates.at(-1)?.id ?? after,
        hasMore: matched.length > candidates.length,
        coverage: 'this-node-visible-active-catalog', examined: candidates.length, issuedAt: now });
    }
    if (method === 'GET' && path.startsWith('/v1/listings/')) {
      const l = this.store.get<Payload>('listing',decodeURIComponent(path.slice(13))); ensure(l,'NOT_FOUND',undefined,404);
      return { listing: l, publication: this.store.event(String(l.eventId)), availability: await this.presence(String(l.seller),String(l.serviceUrl)) };
    }
    if (method === 'GET' && path.startsWith('/v1/knowledge/')) {
      const l = this.store.get<Payload>('listing',decodeURIComponent(path.slice(14))); ensure(l,'NOT_FOUND',undefined,404);
      const query = url.searchParams.get('q'); ensure(!query || query.length <= 200,'BAD_QUERY');
      const faq = l.faq as Payload;
      return { listing: l.id, version: l.eventId, layer: 'structured-no-model', facts: l.facts, resources: l.resources,
        faq: query ? Object.fromEntries(Object.entries(faq).filter(([key]) => key.toLowerCase().includes(query.toLowerCase())).slice(0,5)) : faq,
        maxResponseBytes: 32768, modelCalls: 0 };
    }
    if (method === 'GET' && path.startsWith('/v1/reputation/')) {
      const view = url.searchParams.get('view') ?? 'legacy';
      ensure(view === 'legacy' || view === 'evidence-v2','BAD_REPUTATION_VIEW');
      return reputation(this.store,decodeURIComponent(path.slice(15)),now,view);
    }
    if (method === 'GET' && path.startsWith('/v1/cases/')) {
      const c = this.store.get<Payload>('case',decodeURIComponent(path.slice(10))); ensure(c,'NOT_FOUND',undefined,404); return c;
    }
    if (method === 'GET' && path === '/v1/metrics') return { events: this.store.count(), sqlite: true,
      presenceCacheEntries: this.cache.size, proofRequestsInFlight: this.pending.size, memoryBytes: process.memoryUsage().rss };
    throw new ProtocolError('NOT_FOUND','Unknown API',404);
  }
  async presence(seller: string, origin: string): Promise<Payload | null> {
    const key = seller + '|' + origin, now = this.domain.clock();
    const cached = this.cache.get(key);
    if (cached && cached.until > now && (!cached.proof || cached.proof.actor === this.store.get<Payload>('identity',seller)?.controller)) return cached.proof;
    const inFlight = this.pending.get(key); if (inFlight) return inFlight;
    if (!(this.options.allowedSellerOrigins ?? []).includes(origin)) return null;
    const job = (async () => {
      let proof: Payload | null = null;
      try {
        const challenge = randomUUID();
        const r = await fetch(origin + '/health?seller=' + encodeURIComponent(seller) + '&challenge=' + challenge,
          { redirect: 'error', signal: AbortSignal.timeout(1500) });
        if (r.ok) {
          const p = await boundedJson(r,8192) as Payload; const identity = this.store.get<Payload>('identity',seller);
          if (verifyRecord(p) && p.type === 'presence' && p.seller === seller && p.origin === origin && p.challenge === challenge &&
            identity?.controller === p.actor && Number(p.issuedAt) <= now + 1000 && Number(p.expiresAt) > now && Number(p.expiresAt) <= now + 11000 &&
            Number(p.expiresAt) - Number(p.issuedAt) <= 10000) proof = p;
        }
      } catch { /* Unavailable supply is omitted; its archive remains searchable by ID. */ }
      this.cache.set(key,{ proof, until: proof ? Math.min(Number(proof.expiresAt),now + 10000) : this.domain.clock() + 500 });
      if (this.cache.size > 1000) for (const [k,c] of this.cache) if (c.until <= this.domain.clock()) this.cache.delete(k);
      while (this.cache.size > 1000) this.cache.delete(this.cache.keys().next().value!);
      return proof;
    })();
    this.pending.set(key,job); try { return await job; } finally { this.pending.delete(key); }
  }
  async sync(source: string): Promise<Payload> {
    const existing = this.syncJobs.get(source); if (existing) return existing;
    const job = this.syncPeer(source); this.syncJobs.set(source,job);
    try { return await job; } finally { this.syncJobs.delete(source); }
  }
  async syncPeer(source: string): Promise<Payload> {
    const peer = (this.options.peers ?? []).find(x => x.url === source); ensure(peer,'PEER_NOT_ALLOWED','Configure and pin the source operator first',403);
    const descriptorResponse = await fetch(source + '/.well-known/oamp-node',{ redirect: 'error', signal: AbortSignal.timeout(3000) });
    ensure(descriptorResponse.ok,'PEER_UNAVAILABLE',undefined,502);
    const descriptor = await boundedJson(descriptorResponse,16384) as Payload;
    ensure(verifyRecord(descriptor) && descriptor.publicKey === peer.publicKey,'PEER_KEY_MISMATCH',undefined,409);
    let state = this.store.get<Payload>('peer',source) ?? { cursor: 0, chain: '0'.repeat(64) };
    let imported = 0, complete = false;
    for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
      const r = await fetch(source + '/v1/events?cursor=' + state.cursor + '&limit=100',{ redirect: 'error', signal: AbortSignal.timeout(3000) });
      ensure(r.ok,'PEER_UNAVAILABLE',undefined,502);
      const page = await boundedJson(r) as ReturnType<Store['page']> & { checkpoint: Payload };
      ensure(Array.isArray(page.entries) && page.entries.length <= 100 && page.head && Number.isSafeInteger(page.head.seq),'BAD_PEER_PAGE');
      ensure(verifyRecord(page.checkpoint) && page.checkpoint.publicKey === peer.publicKey && page.checkpoint.seq === page.head.seq && page.checkpoint.chain === page.head.chain,'BAD_CHECKPOINT');
      const checked = verifyLog(page.entries,String(state.chain),Number(state.cursor));
      for (const entry of page.entries) {
        ensure(this.store.event(entry.event.id) || this.store.count() < (this.options.maxEvents ?? 10000),'STORAGE_QUOTA',undefined,507);
        if (!this.store.event(entry.event.id)) { this.domain.ingest(entry.event,true); imported++; }
      }
      state = { cursor: checked.cursor, chain: checked.chain }; this.store.put('peer',source,state);
      if (checked.cursor === page.head.seq) { ensure(checked.chain === page.head.chain,'BAD_CHECKPOINT'); complete = true; break; }
      ensure(page.entries.length > 0,'SYNC_STALLED');
    }
    return { imported, complete, sourceCursor: state.cursor, scope: 'configured-peer-public-events',
      warning: 'Historical timing relies on the pinned source operator; this is not global consensus.' };
  }
}
