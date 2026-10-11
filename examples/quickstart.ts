import { MarketNode } from '../src/node.ts';
import { Client } from '../src/sdk.ts';
import { newKey } from '../src/protocol.ts';
import assert from 'node:assert/strict';
const seller = newKey(), node = new MarketNode({ sellerKey: seller });
try {
  await node.start(); node.options.allowedSellerOrigins = [node.url]; const client = new Client(node.url,node.key.publicKey);
  await client.createIdentity(seller,'Example shop',['seller']);
  await client.emit(seller,'listing.put','listing:camera',{ revision: 1, previous: '', title: 'Example Camera', category: 'electronics',
    priceMinor: 9500, currency: 'USD', serviceUrl: node.url, facts: { condition: 'new' }, faq: { warranty: 'Seller warranty: one year' }, resources: [], active: true });
  const result = await client.search('Camera',10); assert.equal((result.items as unknown[]).length,1);
  console.log(JSON.stringify({ result: 'PASS', workflow: 'first-seller-publication-and-live-discovery', modelCalls: 0 }));
} finally { await node.close(); }
