import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonical, newKey, signEvent, verifyEvent, signedRecord, verifyRecord } from '../src/protocol.ts';
import { decryptPrivate, encryptPrivate, listingDraft, termsCommitment } from '../src/sdk.ts';

test('canonical profile sorts UTF-16 keys and rejects unsafe numbers and invalid Unicode',() => {
  assert.equal(canonical({ z: '中', a: [0,true,null], '\u{1f600}': 'x' }),'{"a":[0,true,null],"z":"中","😀":"x"}');
  for (const x of [NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER + 1,'\ud800']) assert.throws(() => canonical(x));
});
test('event signature rejects payload tampering, key substitution and unknown wire fields',() => {
  const key = newKey(), e = signEvent(key,'identity.create',key.id,{ name: 'tester', roles: ['buyer'] });
  assert.equal(verifyEvent(e).id,e.id);
  assert.throws(() => verifyEvent({ ...e, payload: { ...e.payload, name: 'attacker' } }),/HASH_MISMATCH/);
  assert.throws(() => verifyEvent({ ...e, publicKey: newKey().publicKey }),/ACTOR_KEY_MISMATCH/);
  assert.throws(() => verifyEvent({ ...e, undocumented: true }),/UNKNOWN_FIELD/);
  assert.throws(() => verifyEvent({ ...e, signature: 'AAAA' }),/BAD_SIGNATURE/);
});
test('node record proof is signed and cannot be edited',() => {
  const record = signedRecord(newKey(),{ type: 'checkpoint', seq: 1, chain: 'a' });
  assert.ok(verifyRecord(record)); assert.equal(verifyRecord({ ...record, seq: 2 }),false);
});
test('private terms use random salt and authenticated encryption',() => {
  const terms = { priceMinor: 9999, address: 'private address', dialogue: 'private bargain' };
  assert.notEqual(termsCommitment(terms).termsHash,termsCommitment(terms).termsHash);
  const vault = encryptPrivate(terms,'long-demo-password');
  assert.ok(!JSON.stringify(vault).includes('private address'));
  assert.deepEqual(decryptPrivate(vault,'long-demo-password'),terms);
  assert.throws(() => decryptPrivate(vault,'wrong-password'));
});
test('seller draft requests necessary fields without promising GEO rankings',() => {
  assert.deepEqual(listingDraft({ title: 'camera' }).missing,['category','priceMinor','currency','serviceUrl']);
});

test('versioned public Ed25519 vector preserves wire canonicalization and signatures',() => {
  const vector = JSON.parse(readFileSync('tests/vectors/oamp-v0.1.json','utf8'));
  const { id, signature, ...body } = vector.event;
  assert.equal(canonical(body),vector.canonicalBody); assert.equal(verifyEvent(vector.event).id,id); assert.ok(signature);
  assert.equal(verifyRecord(vector.record),true);
});
