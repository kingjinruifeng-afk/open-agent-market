import { performance } from 'node:perf_hooks';
import { mkdirSync, mkdtempSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join } from 'node:path';
import { MarketNode } from '../src/node.ts';
import { Client } from '../src/sdk.ts';
import assert from 'node:assert/strict';
import { newKey } from '../src/protocol.ts';

const count = Number(process.env.OAMP_BENCH_ITEMS ?? 500);
if (!Number.isInteger(count) || count < 1 || count > 5000) throw new Error('OAMP_BENCH_ITEMS must be 1..5000');
const root = mkdtempSync(join(tmpdir(),'oamp-bench-')), seller = newKey();
const service = new MarketNode({ sellerKey: seller, maxRequestsPerMinute: 10000 });
const index = new MarketNode({ db: join(root,'index.sqlite'), maxEvents: count + 20, maxRequestsPerMinute: 10000 });
try {
  await service.start(); await index.start(); index.options.allowedSellerOrigins = [service.url];
  const client = new Client(index.url,index.key.publicKey); await client.createIdentity(seller,'Benchmark shop',['seller']);
  const cpu = process.cpuUsage(), start = performance.now();
  for (let i = 0; i < count; i++) await client.emit(seller,'listing.put','listing:' + String(i).padStart(6,'0'),{
    revision: 1, previous: '', title: 'Benchmark Camera ' + i, category: 'electronics', priceMinor: 10000 + i,
    currency: 'USD', serviceUrl: service.url, facts: { brand: 'Benchmark' }, faq: { warranty: 'One year' }, resources: [], active: true });
  const publishMs = performance.now() - start, samples: number[] = []; let bytes = 0;
  for (let i = 0; i < 40; i++) {
    const t = performance.now(); const result = await client.search('Camera',20); samples.push(performance.now() - t);
    assert.equal((result.items as unknown[]).length,Math.min(20,count),'Benchmark must measure live search results');
    bytes = Buffer.byteLength(JSON.stringify(result));
  }
  samples.sort((a,b) => a-b); const usage = process.cpuUsage(cpu);
  const report = { date: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
    logicalCpuCount: cpus().length, cpuModel: cpus()[0]?.model, workload: { listings: count, sellers: 1, queries: 40,
      queryLimit: 20, concurrentBuyers: 1, models: 0, presence: 'real-local-seller-cached', payment: 'none' },
    publishMs: Math.round(publishMs), signedWritesPerSecond: Math.round(count * 1000 / publishMs),
    searchP50Ms: Math.round(samples[20] * 100) / 100, searchP95Ms: Math.round(samples[38] * 100) / 100,
    cpuMs: Math.round((usage.user + usage.system)/1000), processRssBytes: process.memoryUsage().rss,
    responseBytes: bytes, sqliteBytes: statSync(join(root,'index.sqlite')).size,
    sqliteWalBytes: statSync(join(root,'index.sqlite-wal')).size,
    limitations: ['Two services share one OS process; not a production sizing recommendation.',
      'Search scans JSON projections; no full-text or geographic index yet.',
      'No adversarial traffic, WAN, many distinct sellers or model inference measured.'] };
  mkdirSync('artifacts',{ recursive: true }); writeFileSync('artifacts/benchmark-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { await service.close(); await index.close(); }
