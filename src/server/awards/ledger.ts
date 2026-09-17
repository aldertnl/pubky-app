import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { type AwardCommand, type AwardReceipt, type AwardSnapshot, weekStart } from '@/libs/awards/awards';
import { normalizeChoices } from '@/libs/awards/visibility';
import { awardConflict, validateAwardChoice, validateSeen } from './store';

export { awardConflict } from './store';
export class AwardLedger {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, issuer TEXT NOT NULL, badge TEXT NOT NULL, week INTEGER, duplicate TEXT UNIQUE, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS recipients ON receipts(recipient);
      CREATE TABLE IF NOT EXISTS profiles (user TEXT PRIMARY KEY, choices TEXT NOT NULL DEFAULT '{}', worn TEXT NOT NULL DEFAULT '[]', revision INTEGER NOT NULL DEFAULT 0, checked INTEGER);
      CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, user TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO metadata VALUES ('issuer', '${randomUUID()}');`);
    if (
      !(this.db.prepare('PRAGMA table_info(profiles)').all() as { name: string }[]).some(
        (column) => column.name === 'seen',
      )
    )
      this.db.exec("ALTER TABLE profiles ADD COLUMN seen TEXT NOT NULL DEFAULT '[]'");
    if (!this.db.prepare("SELECT value FROM metadata WHERE key='visibility-v2'").get()) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of this.db.prepare('SELECT user,choices FROM profiles').all() as {
          user: string;
          choices: string;
        }[]) {
          const choices = JSON.parse(row.choices);
          this.db
            .prepare('UPDATE profiles SET choices=?,seen=? WHERE user=?')
            .run(JSON.stringify(normalizeChoices(choices)), JSON.stringify(Object.keys(choices)), row.user);
        }
        this.db.prepare('INSERT INTO metadata VALUES (?,?)').run('visibility-v2', '1');
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
    if (
      !(this.db.prepare('PRAGMA table_info(profiles)').all() as { name: string }[]).some(
        (column) => column.name === 'dismissed_notifications',
      )
    )
      this.db.exec("ALTER TABLE profiles ADD COLUMN dismissed_notifications TEXT NOT NULL DEFAULT '[]'");
    // Remove the former one-per-week constraint without losing issued awards.
    const schema = this.db.prepare("SELECT sql FROM sqlite_master WHERE name='receipts'").get() as { sql: string };
    if (/UNIQUE\s*\(issuer,\s*week\)/i.test(schema.sql)) {
      this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE receipts_v2 (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, issuer TEXT NOT NULL, badge TEXT NOT NULL, week INTEGER, duplicate TEXT UNIQUE, data TEXT NOT NULL);
        INSERT INTO receipts_v2 SELECT * FROM receipts ORDER BY rowid;
        DROP TABLE receipts;
        ALTER TABLE receipts_v2 RENAME TO receipts;
        CREATE INDEX recipients ON receipts(recipient);
        COMMIT;`);
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS receipts_issuer_week ON receipts(issuer, week)');
  }
  get issuer() {
    return `arena:${(this.db.prepare("SELECT value FROM metadata WHERE key='issuer'").get() as { value: string }).value}`;
  }
  snapshot(user: string, now = Date.now()): AwardSnapshot {
    const profile = this.db.prepare('SELECT * FROM profiles WHERE user=?').get(user) as
      | {
          choices: string;
          worn: string;
          revision: number;
          checked: number | null;
          seen: string;
          dismissed_notifications: string;
        }
      | undefined;
    return {
      awards: (
        this.db.prepare('SELECT data FROM receipts WHERE recipient=? ORDER BY rowid DESC LIMIT 1000').all(user) as {
          data: string;
        }[]
      ).map((r) => JSON.parse(r.data)),
      issued: (
        this.db.prepare('SELECT data FROM receipts WHERE issuer=? ORDER BY rowid DESC LIMIT 1000').all(user) as {
          data: string;
        }[]
      ).map((r) => JSON.parse(r.data)),
      choices: normalizeChoices(JSON.parse(profile?.choices ?? '{}')),
      seen: JSON.parse(profile?.seen ?? '[]'),
      dismissedNotifications: JSON.parse(profile?.dismissed_notifications ?? '[]'),
      worn: JSON.parse(profile?.worn ?? '[]'),
      revision: profile?.revision ?? 0,
      checkedAt: profile?.checked ?? null,
      remaining: Math.max(
        0,
        3 -
          (
            this.db
              .prepare('SELECT COUNT(*) AS count FROM receipts WHERE issuer=? AND week=?')
              .get(user, weekStart(now)) as { count: number }
          ).count,
      ),
      resetsAt: weekStart(now) + 7 * 86400000,
    };
  }
  completed(user: string, id: string) {
    return !!this.db.prepare('SELECT id FROM commands WHERE user=? AND id=?').get(user, id);
  }
  // All eligibility IO is finished before entering this synchronous transaction.
  commit(user: string, command: AwardCommand, receipts: AwardReceipt[], now = Date.now()) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!this.completed(user, command.id)) {
        this.db.prepare('INSERT OR IGNORE INTO profiles(user) VALUES (?)').run(user);
        if (command.action === 'dismiss-notification') {
          const state = this.snapshot(user, now);
          const seen = validateSeen(state, [command.awardId]);
          const dismissed = [...new Set([...(state.dismissedNotifications ?? []), command.awardId])];
          this.db
            .prepare('UPDATE profiles SET seen=?,dismissed_notifications=? WHERE user=?')
            .run(JSON.stringify(seen), JSON.stringify(dismissed), user);
        }
        if (command.action === 'seen') {
          const seen = validateSeen(this.snapshot(user, now), command.awardIds);
          this.db.prepare('UPDATE profiles SET seen=? WHERE user=?').run(JSON.stringify(seen), user);
        }
        if (command.action === 'choose') {
          const state = this.snapshot(user, now);
          state.choices = validateAwardChoice(state, command);
          this.db
            .prepare('UPDATE profiles SET choices=?, worn=?, revision=revision+1 WHERE user=?')
            .run(JSON.stringify(state.choices), JSON.stringify(command.worn), user);
        }
        for (const receipt of receipts) {
          const duplicate =
            receipt.source === 'arena' ? `${user}:${receipt.badge}` : `${user}:${receipt.badge}:${receipt.postId}`;
          if (receipt.source === 'arena' && this.db.prepare('SELECT id FROM receipts WHERE duplicate=?').get(duplicate))
            continue;
          if (this.db.prepare('SELECT id FROM receipts WHERE duplicate=?').get(duplicate))
            throw awardConflict('You already gave this badge to this contribution.');
          if (receipt.source === 'user' && !this.snapshot(user, now).remaining)
            throw awardConflict('Your three weekly recognition awards are used. It resets Monday at 00:00 UTC.');
          this.db
            .prepare('INSERT INTO receipts VALUES (?,?,?,?,?,?,?)')
            .run(
              receipt.id,
              receipt.recipient,
              receipt.issuer,
              receipt.badge,
              receipt.source === 'user' ? weekStart(now) : null,
              duplicate,
              JSON.stringify({ ...receipt, issuedAt: now }),
            );
        }
        if (command.action === 'check') this.db.prepare('UPDATE profiles SET checked=? WHERE user=?').run(now, user);
        this.db.prepare('INSERT INTO commands VALUES (?,?)').run(command.id, user);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.snapshot(user, now);
  }
}
