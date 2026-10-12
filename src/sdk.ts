import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';
import { canonical, ensure, hash, signEvent, verifyRecord, verifyEvent } from './protocol.ts';
import type { Event, IdentityKey, Payload } from './protocol.ts';
import type { ReputationView } from './domain.ts';

export class Client {
  url: string;
  expectedPublicKey?: string;
  constructor(url: string, expectedPublicKey?: string) { this.url = url.replace(/\/$/,''); this.expectedPublicKey = expectedPublicKey; }
  async request(path: string, body?: unknown, token?: string): Promise<any> {
    const response = await fetch(this.url + path,{ method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
    const result = await response.json() as { error?: { code: string; message: string } };
    if (!response.ok) throw new Error(result.error?.code ?? 'HTTP_' + response.status); return result;
  }
  async publish(event: Event): Promise<Payload> { return this.request('/v1/events',event); }
  async emit(key: IdentityKey, kind: string, subject: string, payload: Payload, options: Parameters<typeof signEvent>[4] = {}): Promise<Event> {
    const e = signEvent(key,kind,subject,payload,options); await this.publish(e); return e;
  }
  async createIdentity(key: IdentityKey, name: string, roles: string[], recovery?: string): Promise<Event> {
    return this.emit(key,'identity.create',key.id,{ name, roles, ...(recovery ? { recovery } : {}) });
  }
  async search(q = '', limit = 20): Promise<Payload> {
    const result = await this.request('/v1/search?q=' + encodeURIComponent(q) + '&limit=' + limit) as Payload;
    ensure(verifyRecord(result) && (!this.expectedPublicKey || result.publicKey === this.expectedPublicKey),'BAD_SEARCH_SIGNATURE'); return result;
  }
  async listing(id: string): Promise<any> {
    const result = await this.request('/v1/listings/' + encodeURIComponent(id)); const e = verifyEvent(result.publication);
    const { seller, id: subject, eventId, ...payload } = result.listing;
    ensure(e.kind === 'listing.put' && e.subject === id && subject === id && seller === e.principal && eventId === e.id && canonical(payload) === canonical(e.payload),'BAD_LISTING_PROJECTION');
    return result;
  }
  async reputation(id: string, view: ReputationView = 'legacy'): Promise<Payload> {
    ensure(view === 'legacy' || view === 'evidence-v2','BAD_REPUTATION_VIEW');
    return this.request('/v1/reputation/' + encodeURIComponent(id) + (view === 'legacy' ? '' : '?view=' + view));
  }
  async batch(ids: string[]): Promise<(Event | null)[]> {
    const result = await this.request('/v1/batch',{ ids });
    ensure(Array.isArray(result.events) && result.events.length === ids.length,'BAD_BATCH_RESPONSE');
    return result.events.map((event: Event | null, i: number) => { if (event) { verifyEvent(event); ensure(event.id === ids[i],'BAD_BATCH_RESPONSE'); } return event; });
  }
  async sync(source: string, operatorToken: string): Promise<Payload> { return this.request('/v1/sync',{ source },operatorToken); }
}
export function termsCommitment(terms: Payload, salt = randomBytes(24).toString('hex')): { terms: Payload; salt: string; termsHash: string } {
  ensure(salt.length >= 32,'SHORT_SALT'); return { terms, salt, termsHash: hash(canonical({ terms, salt })) };
}
export function encryptPrivate(value: Payload, password: string): Payload {
  ensure(password.length >= 12,'WEAK_VAULT_PASSWORD'); const salt = randomBytes(16), iv = randomBytes(12);
  const key = scryptSync(password,salt,32); const cipher = createCipheriv('aes-256-gcm',key,iv);
  const data = Buffer.concat([cipher.update(canonical(value),'utf8'),cipher.final()]);
  return { format: 'oamp-vault/1', salt: salt.toString('base64'), iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}
export function decryptPrivate(vault: Payload, password: string): Payload {
  ensure(vault.format === 'oamp-vault/1','UNKNOWN_VAULT');
  const key = scryptSync(password,Buffer.from(String(vault.salt),'base64'),32);
  const decipher = createDecipheriv('aes-256-gcm',key,Buffer.from(String(vault.iv),'base64'));
  decipher.setAuthTag(Buffer.from(String(vault.tag),'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(String(vault.data),'base64')),decipher.final()]).toString('utf8')) as Payload;
}
export function listingDraft(input: Partial<Payload>): { missing: string[]; warnings: string[]; payload?: Payload } {
  const required = ['title','category','priceMinor','currency','serviceUrl'];
  const missing = required.filter(k => input[k] === undefined || input[k] === '');
  return { missing, warnings: ['Verify sources and variants; external pages do not prove seller authenticity.',
    'Keep public mandatory fields locally; do not rely exclusively on an external link.'],
    ...(!missing.length ? { payload: { revision: 1, previous: '', ...input, facts: input.facts ?? {}, faq: input.faq ?? {}, resources: input.resources ?? [], active: true } as Payload } : {}) };
}
