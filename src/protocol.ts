import { createHash, generateKeyPairSync, createPublicKey, sign, verify, randomUUID } from 'node:crypto';

export const VERSION = 'oamp/0.1';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Payload = Record<string, Json>;
export interface IdentityKey { publicKey: string; privateKey: string; id: string }
export interface Event {
  version: typeof VERSION; kind: string; subject: string; principal: string;
  actor: string; publicKey: string; issuedAt: number; nonce: string;
  payload: Payload; delegation?: string; id: string; signature: string;
}
export class ProtocolError extends Error {
  code: string; status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}
export function ensure(value: unknown, code: string, message = code, status = 400): asserts value {
  if (!value) throw new ProtocolError(code, message, status);
}
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function unicode(value: string): void {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { const n = value.charCodeAt(++i); ensure(n >= 0xdc00 && n <= 0xdfff, 'INVALID_UNICODE'); }
    else ensure(c < 0xdc00 || c > 0xdfff, 'INVALID_UNICODE');
  }
}
// Deliberately restricted JCS profile: safe integers only, no floats or lone surrogates.
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') { unicode(value); return JSON.stringify(value); }
  if (typeof value === 'number') { ensure(Number.isSafeInteger(value), 'UNSAFE_NUMBER'); return JSON.stringify(value); }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  ensure(typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype, 'INVALID_JSON');
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort().map(k => canonical(k) + ':' + canonical(record[k])).join(',') + '}';
}
export const actorId = (publicKey: string) => 'oamp:' + hash(publicKey);
export function validatePublicKey(publicKey: string): ReturnType<typeof createPublicKey> {
  try {
    const bytes = Buffer.from(publicKey,'base64');
    ensure(bytes.toString('base64') === publicKey,'BAD_PUBLIC_KEY');
    const key = createPublicKey({ key: bytes, format: 'der', type: 'spki' });
    ensure(key.asymmetricKeyType === 'ed25519' && key.export({ format: 'der', type: 'spki' }).equals(bytes),'BAD_PUBLIC_KEY');
    return key;
  } catch { throw new ProtocolError('BAD_PUBLIC_KEY','Expected canonical Ed25519 SPKI'); }
}
export function newKey(): IdentityKey {
  const keys = generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  return { publicKey, privateKey: keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(), id: actorId(publicKey) };
}
export function signEvent(key: IdentityKey, kind: string, subject: string, payload: Payload,
  options: { principal?: string; delegation?: string; issuedAt?: number } = {}): Event {
  const body = { version: VERSION as typeof VERSION, kind, subject, principal: options.principal ?? key.id,
    actor: key.id, publicKey: key.publicKey, issuedAt: options.issuedAt ?? Date.now(), nonce: randomUUID(), payload,
    ...(options.delegation ? { delegation: options.delegation } : {}) };
  const id = hash(VERSION + ':event:' + canonical(body));
  return { ...body, id, signature: sign(null, Buffer.from(id, 'hex'), key.privateKey).toString('base64') };
}
export function verifyEvent(input: unknown, now = Date.now()): Event {
  ensure(input && typeof input === 'object' && !Array.isArray(input), 'INVALID_EVENT');
  const e = input as Event;
  const keys = ['version','kind','subject','principal','actor','publicKey','issuedAt','nonce','payload','delegation','id','signature'];
  ensure(Object.keys(e).every(k => keys.includes(k)), 'UNKNOWN_FIELD');
  ensure(e.version === VERSION, 'UNSUPPORTED_VERSION');
  for (const k of ['kind','subject','principal','actor','publicKey','nonce','id','signature'] as const)
    ensure(typeof e[k] === 'string' && e[k].length > 0 && e[k].length <= 512, 'INVALID_FIELD', k);
  ensure(Number.isSafeInteger(e.issuedAt) && e.issuedAt > 0 && e.issuedAt <= now + 30_000, 'INVALID_TIME');
  ensure(e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload), 'INVALID_PAYLOAD');
  ensure(!e.delegation || typeof e.delegation === 'string', 'INVALID_DELEGATION');
  ensure(e.actor === actorId(e.publicKey), 'ACTOR_KEY_MISMATCH');
  const { id, signature, ...body } = e;
  ensure(/^[a-f0-9]{64}$/.test(id) && hash(VERSION + ':event:' + canonical(body)) === id, 'HASH_MISMATCH');
  try {
    const key = validatePublicKey(e.publicKey);
    ensure(key.asymmetricKeyType === 'ed25519' && verify(null, Buffer.from(id, 'hex'), key, Buffer.from(signature, 'base64')), 'BAD_SIGNATURE');
  } catch (err) { if (err instanceof ProtocolError) throw err; throw new ProtocolError('BAD_SIGNATURE', 'Invalid Ed25519 key or signature'); }
  return e;
}
export function fields(payload: Payload, required: string[], optional: string[] = []): void {
  ensure(required.every(k => Object.hasOwn(payload, k)), 'MISSING_FIELD');
  ensure(Object.keys(payload).every(k => required.includes(k) || optional.includes(k)), 'UNKNOWN_PAYLOAD_FIELD');
}
export function str(p: Payload, k: string, max = 1000): string {
  ensure(typeof p[k] === 'string' && p[k].length > 0 && p[k].length <= max, 'INVALID_FIELD', k); return p[k] as string;
}
export function integer(p: Payload, k: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  ensure(Number.isSafeInteger(p[k]) && Number(p[k]) >= min && Number(p[k]) <= max, 'INVALID_FIELD', k); return p[k] as number;
}
export function strings(p: Payload, k: string, max = 50): string[] {
  ensure(Array.isArray(p[k]) && p[k].length <= max && p[k].every(x => typeof x === 'string' && x.length <= 512), 'INVALID_FIELD', k);
  return p[k] as string[];
}
export function signedRecord(key: IdentityKey, body: Payload): Payload {
  return { ...body, publicKey: key.publicKey, actor: key.id,
    signature: sign(null, Buffer.from(VERSION + ':record:' + canonical(body)), key.privateKey).toString('base64') };
}
export function verifyRecord(record: Payload): boolean {
  try {
    const { publicKey, actor, signature, ...body } = record;
    if (actor !== actorId(String(publicKey))) return false;
    return verify(null, Buffer.from(VERSION + ':record:' + canonical(body)),
      validatePublicKey(String(publicKey)), Buffer.from(String(signature), 'base64'));
  } catch { return false; }
}
