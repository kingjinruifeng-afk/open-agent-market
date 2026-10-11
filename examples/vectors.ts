// PUBLIC RFC8032 test seed. Never use this key for a real identity.
import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { actorId, canonical, hash, signedRecord, VERSION } from '../src/protocol.ts';
const seed = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const privateKey = createPrivateKey({ key: Buffer.from('302e020100300506032b657004220420' + seed,'hex'), format: 'der', type: 'pkcs8' });
const der = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
assert.equal(der.subarray(-32).toString('hex'),'d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
const publicKey = der.toString('base64'), actor = actorId(publicKey);
const body = { version: VERSION, kind: 'identity.create', subject: actor, principal: actor, actor, publicKey,
  issuedAt: 1700000000000, nonce: 'public-test-vector-only', payload: { name: '测试 😀', roles: ['buyer'] } };
const id = hash(VERSION + ':event:' + canonical(body));
const event = { ...body, id, signature: sign(null,Buffer.from(id,'hex'),privateKey).toString('base64') };
const record = signedRecord({ id: actor, publicKey, privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() },{ type: 'checkpoint', seq: 1, chain: 'a'.repeat(64) });
mkdirSync('tests/vectors',{ recursive: true });
writeFileSync('tests/vectors/oamp-v0.1.json',JSON.stringify({ warning: 'Public test identity. Never use for commerce.', canonicalBody: canonical(body), event, record },null,2) + '\n');
console.log('Public conformance vector written');
