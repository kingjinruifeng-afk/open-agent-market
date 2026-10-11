import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarketNode } from '../src/node.ts';
import { Client } from '../src/sdk.ts';
import { newKey, signEvent, verifyRecord } from '../src/protocol.ts';
import { verifyLog } from '../src/store.ts';
import type { Payload } from '../src/protocol.ts';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve,ms));
test('pinned sync, official-node failure, offline exclusion and durable restart',async () => {
  const root = mkdtempSync(join(tmpdir(),'oamp-nodes-')), seller = newKey(), backupKey = newKey();
  const source = new MarketNode({ name: 'source', db: join(root,'source.sqlite') });
  const service = new MarketNode({ name: 'seller', sellerKey: seller, proofTtlMs: 100 });
  let backup = new MarketNode({ key: backupKey, name: 'backup', db: join(root,'backup.sqlite'), adminToken: 'test-operator-token' });
  try {
    await source.start(); await service.start(); await backup.start();
    backup.options.allowedSellerOrigins = [service.url]; backup.options.peers = [{ url: source.url, publicKey: source.key.publicKey }];
    const a = new Client(source.url); const b = new Client(backup.url);
    await a.createIdentity(seller,'Camera shop',['seller']);
    await a.emit(seller,'listing.put','listing:camera',{ revision: 1, previous: '', title: 'Camera', category: 'electronics', priceMinor: 100,
      currency: 'USD', serviceUrl: service.url, facts: { weight: '100 g' }, faq: { warranty: 'One year' }, resources: [], active: true });
    await assert.rejects(b.sync(source.url,'wrong-token'),/OPERATOR_AUTH_REQUIRED/);
    await assert.rejects(b.sync('http://127.0.0.1:1','test-operator-token'),/PEER_NOT_ALLOWED/);
    await b.sync(source.url,'test-operator-token');
    const page = await a.request('/v1/events'); verifyLog(page.entries); assert.ok(verifyRecord(page.checkpoint));
    const corrupted = structuredClone(page.entries); corrupted[0].chain = '0'.repeat(64);
    assert.throws(() => verifyLog(corrupted),/BROKEN_LOG/);
    await source.close();
    assert.equal((await b.search('Camera')).items instanceof Array,true);
    assert.equal(((await b.search('Camera')).items as Payload[]).length,1);
    const knowledge = await b.request('/v1/knowledge/listing%3Acamera?q=warranty'); assert.equal(knowledge.modelCalls,0);
    await service.close(); await sleep(130);
    assert.equal(((await b.search('Camera')).items as Payload[]).length,0);
    assert.equal((await b.listing('listing:camera')).listing.title,'Camera');
    const count = backup.store.count(); await backup.close();
    backup = new MarketNode({ key: backupKey, db: join(root,'backup.sqlite') });
    await backup.start(); assert.equal(backup.store.count(),count);
    assert.equal((await new Client(backup.url).listing('listing:camera')).listing.title,'Camera');
  } finally { await source.close(); await service.close(); await backup.close(); }
});
test('unconfigured source cannot trigger a probe; bounded body and event storage',async () => {
  const n = new MarketNode({ maxEvents: 2 }); await n.start();
  try {
    const client = new Client(n.url), seller = newKey();
    await client.createIdentity(seller,'seller',['seller']);
    await assert.rejects(client.createIdentity(newKey(),'overflow',['buyer']),/STORAGE_QUOTA/);
    assert.equal(await n.presence(seller.id,'http://127.0.0.1:1'),null);
    const response = await fetch(n.url + '/v1/events',{ method: 'POST', body: 'x'.repeat(70000) }); assert.equal(response.status,413);
    const r = await fetch(n.url + '/v1/sync',{ method: 'POST', body: '{}' }); assert.equal(r.status,403);
  } finally { await n.close(); }
});
test('rate limit has a machine-readable error and retry hint',async () => {
  const n = new MarketNode({ maxRequestsPerMinute: 1 }); await n.start();
  try {
    await fetch(n.url + '/.well-known/oamp-node'); const r = await fetch(n.url + '/.well-known/oamp-node');
    assert.equal(r.status,429); assert.equal(r.headers.get('retry-after'),'60');
  } finally { await n.close(); }
});

test('default presence, field selection, batch integrity and filtered pagination have bounded results',async () => {
  const seller = newKey(), service = new MarketNode({ sellerKey: seller }); const n = new MarketNode();
  try {
    await service.start(); await n.start(); n.options.allowedSellerOrigins = [service.url]; const c = new Client(n.url,n.key.publicKey);
    await c.createIdentity(seller,'Shop',['seller']);
    const e = await c.emit(seller,'listing.put','listing:default',{ revision: 1, previous: '', title: 'Camera', category: 'electronics', priceMinor: 100,
      currency: 'USD', serviceUrl: service.url, facts: {}, faq: {}, resources: [], active: true });
    const result = await c.request('/v1/search?q=Camera&fields=priceMinor'); assert.equal(result.items.length,1); assert.equal(result.hasMore,false);
    assert.equal(result.items[0].title,undefined); assert.equal(result.items[0].priceMinor,100); assert.ok(result.items[0].presence);
    const empty = await c.request('/v1/search?q=NoMatch'); assert.equal(empty.items.length,0); assert.equal(empty.hasMore,false);
    const until = [...n.cache.values()][0].until; assert.ok(until <= Date.now() + 10000);
    assert.deepEqual((await c.batch([e.id,'absent'])).map(x => x?.id ?? null),[e.id,null]);
    await assert.rejects(c.request('/v1/search?fields=secret'),/BAD_FIELDS/);
    await assert.rejects(c.batch(Array.from({ length: 51 },() => e.id)),/BAD_BATCH/);
    await assert.rejects(new Client(n.url,newKey().publicKey).search(),/BAD_SEARCH_SIGNATURE/);
    const rotated = newKey(); await c.emit(seller,'identity.rotate',seller.id,{ newPublicKey: rotated.publicKey });
    service.options.sellerKey = rotated; service.options.sellerPrincipal = seller.id;
    const afterRotation = (await c.search('Camera')).items as Payload[];
    assert.equal((afterRotation[0].presence as Payload).actor,rotated.id);
  } finally { await service.close(); await n.close(); }
});

test('conflicting peer revision stops sync and cannot overwrite a local accepted revision',async () => {
  const a = new MarketNode(), b = new MarketNode({ adminToken: 'conflict-test' }); const seller = newKey();
  try {
    await a.start(); await b.start(); b.options.peers = [{ url: a.url, publicKey: a.key.publicKey }];
    const ac = new Client(a.url), bc = new Client(b.url); await ac.createIdentity(seller,'Shop',['seller']);
    const first = await ac.emit(seller,'listing.put','listing:fork',{ revision: 1, previous: '', title: 'Camera', category: 'electronics',
      priceMinor: 100, currency: 'USD', serviceUrl: 'http://127.0.0.1:1', facts: {}, faq: {}, resources: [], active: true });
    await bc.sync(a.url,'conflict-test');
    const local = await bc.emit(seller,'listing.put',first.subject,{ ...first.payload, revision: 2, previous: first.id, priceMinor: 90 });
    await ac.emit(seller,'listing.put',first.subject,{ ...first.payload, revision: 2, previous: first.id, priceMinor: 80 });
    await assert.rejects(bc.sync(a.url,'conflict-test'),/VERSION_CONFLICT/);
    assert.equal((await bc.listing(first.subject)).publication.id,local.id); assert.equal((await bc.listing(first.subject)).listing.priceMinor,90);
  } finally { await a.close(); await b.close(); }
});
