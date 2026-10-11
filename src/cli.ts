import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { newKey } from './protocol.ts';
import type { IdentityKey } from './protocol.ts';
import { MarketNode } from './node.ts';

const [command, ...args] = process.argv.slice(2);
if (command === 'keygen') {
  const path = resolve(args[0] ?? '.data/operator.key.json');
  if (existsSync(path)) throw new Error('Refusing to overwrite an existing identity key');
  mkdirSync(dirname(path),{ recursive: true }); const key = newKey();
  writeFileSync(path,JSON.stringify(key,null,2),{ mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ id: key.id, path, warning: 'Private key: keep offline backup and restrict file ACLs.' }));
} else if (command === 'serve') {
  const keyPath = resolve(process.env.OAMP_KEY_FILE ?? '.data/operator.key.json');
  if (!existsSync(keyPath)) throw new Error('Run node src/cli.ts keygen first');
  const key = JSON.parse(readFileSync(keyPath,'utf8')) as IdentityKey;
  const sellerKey = process.env.OAMP_SELLER_KEY_FILE ? JSON.parse(readFileSync(process.env.OAMP_SELLER_KEY_FILE,'utf8')) as IdentityKey : undefined;
  const node = new MarketNode({ key, sellerKey, sellerPrincipal: process.env.OAMP_SELLER_PRINCIPAL, name: process.env.OAMP_NAME, db: process.env.OAMP_DB ?? '.data/node.sqlite',
    host: process.env.OAMP_HOST ?? '127.0.0.1', port: Number(process.env.OAMP_PORT ?? 8787), adminToken: process.env.OAMP_ADMIN_TOKEN,
    maxEvents: Number(process.env.OAMP_MAX_EVENTS ?? 10000), publicOrigin: process.env.OAMP_PUBLIC_ORIGIN,
    proofTtlMs: Number(process.env.OAMP_PROOF_TTL_MS ?? 10000),
    allowedSellerOrigins: JSON.parse(process.env.OAMP_SELLER_ORIGINS ?? '[]'), peers: JSON.parse(process.env.OAMP_PEERS ?? '[]') });
  console.log(JSON.stringify({ listening: await node.start(), nodeId: key.id, experimental: true }));
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await node.close(); process.exit(0); };
  process.once('SIGINT',close); process.once('SIGTERM',close);
} else console.log('Usage: node src/cli.ts keygen [path] | serve');
