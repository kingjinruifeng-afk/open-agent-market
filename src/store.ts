import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonical, hash, ensure, signedRecord, verifyEvent } from './protocol.ts';
import type { Event, IdentityKey, Payload } from './protocol.ts';

export interface LogEntry { seq: number; event: Event; previous: string; chain: string }
export class Store {
  db: DatabaseSync;
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
      json TEXT NOT NULL, previous TEXT NOT NULL, chain TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents(kind TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    const version = this.db.prepare('SELECT value FROM meta WHERE key=?').get('schema');
    ensure(!version || version.value === '1', 'SCHEMA_VERSION', 'Export and migrate unsupported database schema');
    this.db.prepare('INSERT OR IGNORE INTO meta VALUES (?,?)').run('schema','1');
  }
  get<T = Payload>(kind: string, id: string): T | undefined {
    const row = this.db.prepare('SELECT json FROM documents WHERE kind=? AND id=?').get(kind,id);
    return row ? JSON.parse(String(row.json)) as T : undefined;
  }
  all<T = Payload>(kind: string): T[] {
    return this.db.prepare('SELECT json FROM documents WHERE kind=? ORDER BY id').all(kind).map(row => JSON.parse(String(row.json)) as T);
  }
  put(kind: string, id: string, value: unknown): void {
    this.db.prepare('INSERT INTO documents VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET json=excluded.json').run(kind,id,canonical(value));
  }
  event(id: string): Event | undefined {
    const row = this.db.prepare('SELECT json FROM events WHERE id=?').get(id); return row ? JSON.parse(String(row.json)) as Event : undefined;
  }
  count(): number { return Number(this.db.prepare('SELECT COUNT(*) AS n FROM events').get()!.n); }
  head(): { seq: number; chain: string } {
    const row = this.db.prepare('SELECT seq,chain FROM events ORDER BY seq DESC LIMIT 1').get();
    return row ? { seq: Number(row.seq), chain: String(row.chain) } : { seq: 0, chain: '0'.repeat(64) };
  }
  transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (err) { this.db.exec('ROLLBACK'); throw err; }
  }
  append(e: Event): LogEntry {
    const previous = this.head().chain;
    const chain = hash('oamp:log:' + previous + ':' + e.id);
    const result = this.db.prepare('INSERT INTO events(id,json,previous,chain) VALUES (?,?,?,?)').run(e.id,canonical(e),previous,chain);
    return { seq: Number(result.lastInsertRowid), event: e, previous, chain };
  }
  page(cursor = 0, limit = 100): { entries: LogEntry[]; cursor: number; head: { seq: number; chain: string } } {
    ensure(Number.isSafeInteger(cursor) && cursor >= 0 && Number.isSafeInteger(limit) && limit >= 1 && limit <= 200, 'BAD_CURSOR');
    const entries = this.db.prepare('SELECT * FROM events WHERE seq>? ORDER BY seq LIMIT ?').all(cursor,limit).map(row =>
      ({ seq: Number(row.seq), event: JSON.parse(String(row.json)) as Event, previous: String(row.previous), chain: String(row.chain) }));
    return { entries, cursor: entries.at(-1)?.seq ?? cursor, head: this.head() };
  }
  checkpoint(key: IdentityKey): Payload {
    const h = this.head(); return signedRecord(key, { type: 'checkpoint', version: 'oamp/0.1', seq: h.seq, chain: h.chain });
  }
  close(): void { this.db.close(); }
}
export function verifyLog(entries: LogEntry[], previous = '0'.repeat(64), cursor = 0): { chain: string; cursor: number } {
  for (const entry of entries) {
    verifyEvent(entry.event);
    ensure(entry.seq === cursor + 1 && entry.previous === previous && entry.chain === hash('oamp:log:' + previous + ':' + entry.event.id), 'BROKEN_LOG');
    previous = entry.chain; cursor = entry.seq;
  }
  return { chain: previous, cursor };
}
