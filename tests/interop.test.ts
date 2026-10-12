import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { MarketNode } from '../src/node.ts';
import { newKey, signEvent, signedRecord, canonical } from '../src/protocol.ts';
import { Client } from '../src/sdk.ts';
import { fixture } from './fixtures.ts';

function python(): string {
  if (process.env.OAMP_PYTHON) return process.env.OAMP_PYTHON;
  const bundled = join(homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe');
  return existsSync(bundled) ? bundled : process.platform === 'win32' ? 'py' : 'python3';
}
test('real Python process verifies TS signatures and publishes a Unicode identity accepted by TS',async () => {
  const node = new MarketNode(); await node.start();
  const f = fixture();
  try {
    f.emit(f.buyer,'review.submit','trade:test',{ target: f.seller.id, dimension: 'service', score: 4, text: 'Simulated participant feedback' });
    for (const entry of f.store.page(0,100).entries) node.domain.ingest(entry.event);
    const key = newKey(), event = signEvent(key,'identity.create',key.id,{ name: 'TypeScript 商铺', roles: ['seller'] });
    const vector = { '\u{1f600}': '中', '\ue000': '排序', a: [0,true,null] };
    const output = await new Promise<string>((resolve,reject) => {
      const child = spawn(python(),['tests/python_interop.py'],{ cwd: process.cwd(), windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Python interop timed out')); },15000);
      let stdout = '', stderr = ''; child.stdout.on('data',d => { stdout += d; }); child.stderr.on('data',d => { stderr += d; });
      child.once('error',err => { clearTimeout(timer); reject(err); }); child.once('close',code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error('Python interop failed: ' + stderr)); });
      child.stdin.end(JSON.stringify({ event, record: signedRecord(key,{ type: 'test', n: 1 }), vector, url: node.url,
        reputationSubject: f.seller.id, fixture: JSON.parse(readFileSync('tests/vectors/oamp-v0.1.json','utf8')) }));
    });
    const result = JSON.parse(output); assert.equal(result.verified,true); assert.equal(result.canonical,canonical(vector));
    const retrieved = await new Client(node.url).request('/v1/events/' + result.eventId); assert.equal(retrieved.principal,result.identity);
  } finally { f.store.close(); await node.close(); }
});
