// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AwardCommand,
  type AwardReceipt,
  commandSchema,
  explorerEvidence,
  recognitionSchema,
  weekStart,
} from '@/libs/awards/awards';
import { AwardLedger } from './ledger';

vi.mock('@/libs/error/error.factories', () => ({
  Err: { client: (_: string, message: string) => ({ message }), server: (_: string, message: string) => ({ message }) },
}));
const alice = 'a'.repeat(52),
  bob = 'b'.repeat(52);
const now = Date.UTC(2026, 8, 14, 12);
function recognition(issuer = alice, recipient = bob, badge: AwardReceipt['badge'] = 'made-it-click', post = 'post1') {
  const id = randomUUID();
  const command: AwardCommand = {
    version: 1,
    id,
    action: 'recognize',
    createdAt: now,
    postId: `${recipient}:${post}`,
    recognition: { badge: 'made-it-click', reason: 'A helpful explanation.', artifact: '' },
  };
  const receipt: AwardReceipt = {
    version: 1,
    id,
    badge,
    source: 'user',
    method: 'user',
    issuer,
    recipient,
    reason: command.recognition.reason,
    postId: command.postId,
    issuedAt: now,
    definitionVersion: 1,
  };
  return { command, receipt };
}
let ledger: AwardLedger;
beforeEach(() => {
  ledger = new AwardLedger(':memory:');
});
afterEach(() => ledger.db.close());
describe('award ledger', () => {
  it('enforces three recognitions across badge types per UTC week; retry is idempotent', () => {
    const first = recognition();
    ledger.commit(alice, first.command, [first.receipt], now);
    ledger.commit(alice, first.command, [first.receipt], now);
    expect(ledger.snapshot(bob, now).awards).toHaveLength(1);
    expect(ledger.snapshot(alice, now).issued).toHaveLength(1);
    const second = recognition(alice, bob, 'good-sport', 'post2');
    ledger.commit(alice, second.command, [second.receipt], now);
    const third = recognition(alice, bob, 'changed-my-mind', 'post3');
    ledger.commit(alice, third.command, [third.receipt], now);
    const fourth = recognition(alice, bob, 'good-sport', 'post4');
    expect(() => ledger.commit(alice, fourth.command, [fourth.receipt], now)).toThrow();
    expect(ledger.completed(alice, fourth.command.id)).toBe(false);
    expect(ledger.snapshot(alice, now).remaining).toBe(0);
    expect(ledger.snapshot(alice, now + 7 * 86400000).remaining).toBe(3);
    ledger.commit(alice, fourth.command, [fourth.receipt], now + 7 * 86400000);
    expect(ledger.snapshot(bob).awards).toHaveLength(4);
  });
  it('prevents duplicate recognition even after the week resets', () => {
    const first = recognition();
    ledger.commit(alice, first.command, [first.receipt], now);
    const duplicate = recognition();
    expect(() => ledger.commit(alice, duplicate.command, [duplicate.receipt], now + 7 * 86400000)).toThrow();
  });
  it('awards automatic badges once without spending a personal award', () => {
    const auto = {
      ...recognition().receipt,
      issuer: ledger.issuer,
      source: 'arena' as const,
      method: 'automatic' as const,
      recipient: alice,
      badge: 'contender' as const,
    };
    for (let i = 0; i < 2; i++)
      ledger.commit(
        alice,
        { version: 1, id: randomUUID(), createdAt: now, action: 'check' },
        [{ ...auto, id: randomUUID() }],
        now,
      );
    expect(ledger.snapshot(alice, now).awards).toHaveLength(1);
    expect(ledger.snapshot(alice, now).remaining).toBe(3);
  });
  it('accepts and wears atomically, prevents replay from overriding newer choices, and never refunds dismissal', () => {
    const first = recognition();
    ledger.commit(alice, first.command, [first.receipt], now);
    const choose: AwardCommand = {
      version: 1,
      id: randomUUID(),
      action: 'choose',
      createdAt: now,
      revision: 0,
      awardId: first.receipt.id,
      status: 'accepted',
      worn: [first.receipt.id],
    };
    ledger.commit(bob, choose, [], now);
    const dismiss = { ...choose, id: randomUUID(), revision: 1, status: 'dismissed' as const, worn: [] };
    ledger.commit(bob, dismiss, [], now);
    ledger.commit(bob, choose, [], now);
    expect(ledger.snapshot(bob).worn).toEqual([]);
    expect(ledger.snapshot(bob).choices[first.receipt.id]).toBe('hidden');
    expect(ledger.snapshot(alice, now).remaining).toBe(2);
    expect(() => ledger.commit(bob, { ...choose, id: randomUUID() }, [], now)).toThrow();
    expect(() => ledger.commit(alice, { ...choose, id: randomUUID() }, [], now)).toThrow();
  });
  it('rejects forged, duplicate, dismissed and more than three worn entries', () => {
    const first = recognition();
    ledger.commit(alice, first.command, [first.receipt], now);
    for (const worn of [['forged'], [first.receipt.id, first.receipt.id]]) {
      expect(() =>
        ledger.commit(
          bob,
          {
            version: 1,
            id: randomUUID(),
            createdAt: now,
            action: 'choose',
            revision: 0,
            awardId: first.receipt.id,
            status: 'accepted',
            worn,
          },
          [],
          now,
        ),
      ).toThrow();
    }
    expect(
      commandSchema.safeParse({
        version: 1,
        id: randomUUID(),
        createdAt: now,
        action: 'choose',
        revision: 0,
        awardId: first.receipt.id,
        status: 'accepted',
        worn: ['a', 'b', 'c', 'd'],
      }).success,
    ).toBe(false);
  });
});
describe('award rules', () => {
  it('resets Monday UTC across a year boundary', () => {
    expect(new Date(weekStart(Date.UTC(2027, 0, 3, 23, 59))).toISOString()).toBe('2026-12-28T00:00:00.000Z');
    expect(new Date(weekStart(Date.UTC(2027, 0, 4))).toISOString()).toBe('2027-01-04T00:00:00.000Z');
  });
  it('allows no artifact for Built on This, rejects unsafe URL schemes', () => {
    expect(
      recognitionSchema.safeParse({ badge: 'built-on-this', reason: 'I made a new tool.', artifact: '' }).success,
    ).toBe(true);
    expect(
      recognitionSchema.safeParse({
        badge: 'built-on-this',
        reason: 'I made a new tool.',
        artifact: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
    expect(
      recognitionSchema.safeParse({
        badge: 'built-on-this',
        reason: 'I made a new tool.',
        artifact: 'https://example.com/tool',
      }).success,
    ).toBe(true);
  });
  it('Explorer needs different conversations and different topics; overlapping tags are matched fairly', () => {
    expect(explorerEvidence(new Map([['thread1', ['a', 'b', 'c', 'd', 'e']]]))).toHaveLength(1);
    expect(
      explorerEvidence(
        new Map([
          ['1', ['a', 'b']],
          ['2', ['a']],
          ['3', ['c']],
          ['4', ['d']],
          ['5', ['e']],
        ]),
      ),
    ).toHaveLength(5);
    expect(
      explorerEvidence(
        new Map([
          ['1', [' Pubky ']],
          ['2', ['pubky']],
        ]),
      ),
    ).toHaveLength(1);
  });
});

it('migrates the old weekly uniqueness constraint and preserves receipts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'award-migration-'));
  const path = join(dir, 'awards.db');
  const old = new DatabaseSync(path);
  const first = recognition();
  old.exec(
    'CREATE TABLE receipts (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, issuer TEXT NOT NULL, badge TEXT NOT NULL, week INTEGER, duplicate TEXT UNIQUE, data TEXT NOT NULL, UNIQUE(issuer, week))',
  );
  old
    .prepare('INSERT INTO receipts VALUES (?,?,?,?,?,?,?)')
    .run(first.receipt.id, bob, alice, first.receipt.badge, weekStart(now), 'legacy', JSON.stringify(first.receipt));
  old.close();
  const migrated = new AwardLedger(path);
  try {
    expect(migrated.snapshot(bob, now).awards).toHaveLength(1);
    expect(migrated.snapshot(alice, now).remaining).toBe(2);
    const second = recognition(alice, bob, 'good-sport', 'post2');
    migrated.commit(alice, second.command, [second.receipt], now);
    expect(migrated.snapshot(alice, now).remaining).toBe(1);
  } finally {
    migrated.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('allows different recognition types for the same post within the weekly allowance', () => {
  for (const badge of ['made-it-click', 'changed-my-mind', 'good-sport'] as const) {
    const award = recognition(alice, bob, badge, 'same-post');
    ledger.commit(alice, award.command, [award.receipt], now);
  }
  expect(ledger.snapshot(bob, now).awards).toHaveLength(3);
  expect(ledger.snapshot(alice, now).remaining).toBe(0);
});
