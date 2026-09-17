// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AwardCommand, AwardReceipt } from '@/libs/awards/awards';
import { asOpaque } from '@/test-utils/type-assertions';
import { PostgresAwardLedger } from './postgres';

vi.mock('@/libs/error/error.factories', () => ({
  Err: { client: (_: string, message: string) => new Error(message) },
}));
let db: PGlite;
let ledger: PostgresAwardLedger;
let pool: Pool;
const now = Date.UTC(2026, 8, 14, 12);
function recognition(post: string = randomUUID()) {
  const id = randomUUID();
  const command: AwardCommand = {
    version: 1,
    id,
    action: 'recognize',
    createdAt: now,
    postId: post,
    recognition: { badge: 'made-it-click', reason: 'Helpful explanation.', artifact: '' },
  };
  const receipt: AwardReceipt = {
    version: 1,
    id,
    badge: 'made-it-click',
    source: 'user',
    method: 'user',
    issuer: 'alice',
    recipient: 'bob',
    reason: 'Helpful explanation.',
    postId: post,
    issuedAt: now,
    definitionVersion: 1,
  };
  return { command, receipt };
}
beforeEach(async () => {
  db = new PGlite();
  const query = async (sql: string, params?: unknown[]) => {
    // PGlite has one connection; real cross-instance lock behavior needs live Postgres QA.
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
    if (sql.includes('CREATE TABLE')) {
      await db.exec(sql);
      return { rows: [], rowCount: 0 };
    }
    const result = await db.query(sql, params);
    return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
  };
  pool = asOpaque<Pool>({ query, connect: async () => ({ query, release() {} }) });
  ledger = await PostgresAwardLedger.open(pool);
});
afterEach(async () => {
  await db.close();
});
it('persists the issuer and enforces quota, idempotency, duplicate prevention and weekly reset', async () => {
  expect((await PostgresAwardLedger.open(pool)).issuer).toBe(ledger.issuer);
  const first = recognition();
  await ledger.commit('alice', first.command, [first.receipt], now);
  await ledger.commit('alice', first.command, [first.receipt], now);
  for (let i = 0; i < 2; i++) {
    const r = recognition();
    await ledger.commit('alice', r.command, [r.receipt], now);
  }
  expect((await ledger.snapshot('alice', now)).remaining).toBe(0);
  const fourth = recognition();
  await expect(ledger.commit('alice', fourth.command, [fourth.receipt], now)).rejects.toThrow('three weekly');
  expect(await ledger.completed('alice', fourth.command.id)).toBe(false);
  expect((await ledger.snapshot('bob', now)).awards).toHaveLength(3);
  const nextWeek = now + 7 * 86400000;
  const duplicate = recognition(first.receipt.postId);
  await expect(ledger.commit('alice', duplicate.command, [duplicate.receipt], nextWeek)).rejects.toThrow(
    'already gave',
  );
  await ledger.commit('alice', fourth.command, [fourth.receipt], nextWeek);
  expect((await ledger.snapshot('alice', nextWeek)).remaining).toBe(2);
});
it('keeps recipient choices atomic and rejects stale revisions and foreign awards', async () => {
  const r = recognition();
  await ledger.commit('alice', r.command, [r.receipt], now);
  const command: AwardCommand = {
    version: 1,
    id: randomUUID(),
    action: 'choose',
    createdAt: now,
    awardId: r.receipt.id,
    status: 'accepted',
    worn: [r.receipt.id],
    revision: 0,
  };
  const state = await ledger.commit('bob', command, [], now);
  expect(state.worn).toEqual([r.receipt.id]);
  expect(state.revision).toBe(1);
  expect((await ledger.commit('bob', command, [], now)).revision).toBe(1);
  await expect(ledger.commit('bob', { ...command, id: randomUUID() }, [], now)).rejects.toThrow('collection changed');
  await expect(ledger.commit('eve', { ...command, id: randomUUID() }, [], now)).rejects.toThrow('does not belong');
  expect((await ledger.snapshot('bob', now)).worn).toEqual([r.receipt.id]);
});
it('rolls back an entire batch when a later receipt fails', async () => {
  const r = recognition();
  await expect(ledger.commit('alice', r.command, [r.receipt, { ...r.receipt, id: randomUUID() }], now)).rejects.toThrow(
    'already gave',
  );
  expect((await ledger.snapshot('bob', now)).awards).toEqual([]);
  expect(await ledger.completed('alice', r.command.id)).toBe(false);
});

it('issues automatic achievements once without consuming recognition allowance', async () => {
  const r = recognition();
  const receipt: AwardReceipt = {
    ...r.receipt,
    id: 'auto-1',
    source: 'arena',
    method: 'automatic',
    badge: 'contender',
    issuer: ledger.issuer,
    postId: undefined,
  };
  const command: AwardCommand = { version: 1, id: randomUUID(), action: 'check', createdAt: now };
  await ledger.commit('bob', command, [receipt], now);
  const state = await ledger.commit(
    'bob',
    { ...command, id: randomUUID() },
    [{ ...receipt, id: 'auto-2' }],
    now + 1000,
  );
  expect(state.awards).toHaveLength(1);
  expect(state.remaining).toBe(3);
  expect(state.checkedAt).toBe(now + 1000);
});

it('wears received awards without acceptance, hides and restores without auto-wearing, and tracks seen independently', async () => {
  const r = recognition();
  await ledger.commit('alice', r.command, [r.receipt], now);
  const choose = (status: 'visible' | 'hidden', worn: string[], revision: number): AwardCommand => ({
    version: 1,
    id: randomUUID(),
    action: 'choose',
    createdAt: now,
    awardId: r.receipt.id,
    status,
    worn,
    revision,
  });
  const worn = await ledger.commit('bob', choose('visible', [r.receipt.id], 0), [], now);
  expect(worn.worn).toEqual([r.receipt.id]);
  expect(worn.seen).toEqual([]);
  const seen: AwardCommand = { version: 1, id: randomUUID(), action: 'seen', createdAt: now, awardIds: [r.receipt.id] };
  const viewed = await ledger.commit('bob', seen, [], now);
  expect(viewed.seen).toEqual([r.receipt.id]);
  expect(viewed.revision).toBe(1);
  expect(viewed.worn).toEqual(worn.worn);
  await ledger.commit('bob', seen, [], now);
  await expect(ledger.commit('alice', { ...seen, id: randomUUID() }, [], now)).rejects.toThrow('does not belong');
  await expect(ledger.commit('bob', choose('hidden', [r.receipt.id], 1), [], now)).rejects.toThrow('visible awards');
  const hidden = await ledger.commit('bob', choose('hidden', [], 1), [], now);
  expect(hidden.choices[r.receipt.id]).toBe('hidden');
  expect(hidden.worn).toEqual([]);
  const shown = await ledger.commit('bob', choose('visible', [], 2), [], now);
  expect(shown.worn).toEqual([]);
  expect(shown.seen).toEqual([r.receipt.id]);
});

it('migrates legacy choices once, preserves wearing and does not reset subsequent read state', async () => {
  await db.query("DELETE FROM arena_award_metadata WHERE key='visibility-v2'");
  await db.query(
    `INSERT INTO arena_award_profiles("user",choices,worn,revision) VALUES ('bob', '{"old":"accepted","other":"dismissed"}', '["old"]', 7)`,
  );
  ledger = await PostgresAwardLedger.open(pool);
  const state = await ledger.snapshot('bob');
  expect(state.choices).toEqual({ old: 'visible', other: 'hidden' });
  expect(state.worn).toEqual(['old']);
  expect(state.revision).toBe(7);
  expect(new Set(state.seen)).toEqual(new Set(['old', 'other']));
  await db.query(`UPDATE arena_award_profiles SET seen='["old","other","new"]' WHERE "user"='bob'`);
  ledger = await PostgresAwardLedger.open(pool);
  expect((await ledger.snapshot('bob')).seen).toContain('new');
});

it('closing a notification persists without hiding or unwearing its award', async () => {
  const r = recognition();
  await ledger.commit('alice', r.command, [r.receipt], now);
  await ledger.commit(
    'bob',
    {
      version: 1,
      id: randomUUID(),
      createdAt: now,
      action: 'choose',
      awardId: r.receipt.id,
      status: 'visible',
      worn: [r.receipt.id],
      revision: 0,
    },
    [],
    now,
  );
  const close: AwardCommand = {
    version: 1,
    id: randomUUID(),
    createdAt: now,
    action: 'dismiss-notification',
    awardId: r.receipt.id,
  };
  const state = await ledger.commit('bob', close, [], now);
  expect(state.dismissedNotifications).toEqual([r.receipt.id]);
  expect(state.seen).toEqual([r.receipt.id]);
  expect(state.worn).toEqual([r.receipt.id]);
  expect(state.choices[r.receipt.id]).toBe('visible');
  expect(state.revision).toBe(1);
  expect((await ledger.commit('bob', close, [], now)).dismissedNotifications).toHaveLength(1);
  await expect(ledger.commit('alice', { ...close, id: randomUUID() }, [], now)).rejects.toThrow('does not belong');
});
