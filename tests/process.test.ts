import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { newKey } from '../src/protocol.ts';
import type { IdentityKey, Payload } from '../src/protocol.ts';
import { Client } from '../src/sdk.ts';

async function port() {
  const server = createServer(); await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object'); const p = address.port;
  await new Promise<void>(resolve => server.close(() => resolve())); return p;
}
async function launch(root: string, name: string, key: IdentityKey, env: Record<string,string>) {
  const path = join(root,name + '.key.json'); writeFileSync(path,JSON.stringify(key));
  const child = spawn(process.execPath,['src/cli.ts','serve'],{ windowsHide: true, env: { ...process.env,
    OAMP_KEY_FILE: path, OAMP_DB: join(root,name + '.sqlite'), OAMP_ADMIN_TOKEN: 'process-test-only', ...env } });
  const url = await new Promise<string>((resolve,reject) => {
    let output = '', errors = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('Node startup timed out: ' + errors)); },10000);
    child.stderr.on('data',data => { errors += data; }); child.once('error',err => { clearTimeout(timer); reject(err); });
    child.once('exit',code => { clearTimeout(timer); reject(new Error('Node exited before startup: ' + code + ' ' + errors)); });
    child.stdout.on('data',data => { output += data; if (output.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(output.split('\n')[0]).listening); } });
  });
  return { child, url };
}
async function stop(child?: ChildProcessWithoutNullStreams) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>(resolve => { child.once('exit',() => resolve()); child.kill('SIGTERM'); });
}
test('three OS processes continue new publication after primary failure, then exclude offline seller',async () => {
  const root = mkdtempSync(join(tmpdir(),'oamp-process-')), aKey = newKey(), cKey = newKey(), bKey = newKey(), seller = newKey();
  const aPort = await port(), cPort = await port(), bPort = await port();
  const aUrl = 'http://127.0.0.1:' + aPort, cUrl = 'http://127.0.0.1:' + cPort;
  const sellerPath = join(root,'seller.key.json'); writeFileSync(sellerPath,JSON.stringify(seller));
  let a: Awaited<ReturnType<typeof launch>> | undefined, b: typeof a, c: typeof a;
  try {
    c = await launch(root,'seller-runtime',cKey,{ OAMP_PORT: String(cPort), OAMP_SELLER_KEY_FILE: sellerPath, OAMP_PROOF_TTL_MS: '100',
      OAMP_PEERS: JSON.stringify([{ url: aUrl, publicKey: aKey.publicKey }]) });
    a = await launch(root,'primary',aKey,{ OAMP_PORT: String(aPort), OAMP_SELLER_ORIGINS: JSON.stringify([cUrl]) });
    b = await launch(root,'backup',bKey,{ OAMP_PORT: String(bPort), OAMP_SELLER_ORIGINS: JSON.stringify([cUrl]),
      OAMP_PEERS: JSON.stringify([{ url: aUrl, publicKey: aKey.publicKey },{ url: cUrl, publicKey: cKey.publicKey }]) });
    const ac = new Client(a.url,aKey.publicKey), bc = new Client(b.url,bKey.publicKey), cc = new Client(c.url,cKey.publicKey);
    await ac.createIdentity(seller,'Process test shop',['seller']);
    const first = await ac.emit(seller,'listing.put','listing:process',{ revision: 1, previous: '', title: 'Camera', category: 'electronics',
      priceMinor: 100, currency: 'USD', serviceUrl: cUrl, facts: {}, faq: {}, resources: [], active: true });
    await bc.sync(a.url,'process-test-only'); await cc.sync(a.url,'process-test-only'); await stop(a.child);
    await cc.emit(seller,'listing.put',first.subject,{ ...first.payload, revision: 2, previous: first.id, priceMinor: 90 });
    await bc.sync(c.url,'process-test-only'); assert.equal(((await bc.search('Camera')).items as Payload[])[0].priceMinor,90);
    await stop(c.child); await sleep(150); assert.equal(((await bc.search('Camera')).items as Payload[]).length,0);
    assert.equal((await bc.listing(first.subject)).listing.priceMinor,90);
  } finally { await stop(a?.child); await stop(c?.child); await stop(b?.child); }
});
