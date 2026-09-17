import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { type AwardCommand, type AwardReceipt, type AwardSnapshot, weekStart } from '@/libs/awards/awards';
import { normalizeChoices } from '@/libs/awards/visibility';
import { AWARDS_POSTGRES_SCHEMA } from './postgres-schema';
import { awardConflict, type AwardStore, validateAwardChoice, validateSeen } from './store';

type Queryable = Pick<PoolClient, 'query'>;

export class PostgresAwardLedger implements AwardStore {
  private constructor(
    readonly pool: Pool,
    readonly issuer: string,
  ) {}

  static async open(pool: Pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize first-use schema creation across Vercel instances and migration.
      await client.query('SELECT pg_advisory_xact_lock(48192017)');
      await client.query(AWARDS_POSTGRES_SCHEMA);
      await client.query("INSERT INTO arena_award_metadata VALUES ('issuer', $1) ON CONFLICT (key) DO NOTHING", [
        randomUUID(),
      ]);
      const { rows } = await client.query("SELECT value FROM arena_award_metadata WHERE key='issuer'");
      await client.query('COMMIT');
      return new PostgresAwardLedger(pool, `arena:${rows[0].value}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async readSnapshot(db: Queryable, user: string, now: number): Promise<AwardSnapshot> {
    // One SQL statement gives the client a coherent snapshot of receipts and choices.
    const { rows } = await db.query(
      `SELECT
      (SELECT dismissed_notifications FROM arena_award_profiles WHERE "user"=$1) AS dismissed_notifications,
      (SELECT seen FROM arena_award_profiles WHERE "user"=$1) AS seen,
      (SELECT choices FROM arena_award_profiles WHERE "user"=$1) AS choices,
      (SELECT worn FROM arena_award_profiles WHERE "user"=$1) AS worn,
      (SELECT revision FROM arena_award_profiles WHERE "user"=$1) AS revision,
      (SELECT checked FROM arena_award_profiles WHERE "user"=$1) AS checked,
      (SELECT jsonb_agg(data ORDER BY sequence DESC) FROM
        (SELECT data, sequence FROM arena_award_receipts WHERE recipient=$1 ORDER BY sequence DESC LIMIT 1000) a) AS awards,
      (SELECT jsonb_agg(data ORDER BY sequence DESC) FROM
        (SELECT data, sequence FROM arena_award_receipts WHERE issuer=$1 ORDER BY sequence DESC LIMIT 1000) a) AS issued,
      (SELECT COUNT(*) FROM arena_award_receipts WHERE issuer=$1 AND week=$2) AS used`,
      [user, weekStart(now)],
    );
    const row = rows[0];
    return {
      awards: row.awards ?? [],
      issued: row.issued ?? [],
      choices: normalizeChoices(row.choices ?? {}),
      seen: row.seen ?? [],
      dismissedNotifications: row.dismissed_notifications ?? [],
      worn: row.worn ?? [],
      revision: row.revision ?? 0,
      checkedAt: row.checked == null ? null : Number(row.checked),
      remaining: Math.max(0, 3 - Number(row.used)),
      resetsAt: weekStart(now) + 7 * 86400000,
    };
  }

  snapshot(user: string, now = Date.now()) {
    return this.readSnapshot(this.pool, user, now);
  }

  async completed(user: string, id: string) {
    const { rowCount } = await this.pool.query('SELECT id FROM arena_award_commands WHERE "user"=$1 AND id=$2', [
      user,
      id,
    ]);
    return !!rowCount;
  }

  async commit(user: string, command: AwardCommand, receipts: AwardReceipt[], now = Date.now()) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query('INSERT INTO arena_award_profiles("user") VALUES ($1) ON CONFLICT DO NOTHING', [user]);
      // Locks the issuer/recipient making this command, including across serverless instances.
      // Recognition quotas and recipient revisions are checked after acquiring this lock.
      await client.query('SELECT "user" FROM arena_award_profiles WHERE "user"=$1 FOR UPDATE', [user]);
      const completed = await client.query('SELECT id FROM arena_award_commands WHERE "user"=$1 AND id=$2', [
        user,
        command.id,
      ]);
      if (!completed.rowCount) {
        if (command.action === 'dismiss-notification') {
          const state = await this.readSnapshot(client, user, now);
          const seen = validateSeen(state, [command.awardId]);
          const dismissed = [...new Set([...(state.dismissedNotifications ?? []), command.awardId])];
          await client.query('UPDATE arena_award_profiles SET seen=$1,dismissed_notifications=$2 WHERE "user"=$3', [
            JSON.stringify(seen),
            JSON.stringify(dismissed),
            user,
          ]);
        }
        if (command.action === 'seen') {
          const seen = validateSeen(await this.readSnapshot(client, user, now), command.awardIds);
          await client.query('UPDATE arena_award_profiles SET seen=$1 WHERE "user"=$2', [JSON.stringify(seen), user]);
        }
        if (command.action === 'choose') {
          const state = await this.readSnapshot(client, user, now);
          const choices = validateAwardChoice(state, command);
          await client.query(
            'UPDATE arena_award_profiles SET choices=$1, worn=$2, revision=revision+1 WHERE "user"=$3',
            [JSON.stringify(choices), JSON.stringify(command.worn), user],
          );
        }
        for (const receipt of receipts) {
          const duplicate =
            receipt.source === 'arena' ? `${user}:${receipt.badge}` : `${user}:${receipt.badge}:${receipt.postId}`;
          const existing = await client.query('SELECT id FROM arena_award_receipts WHERE duplicate=$1', [duplicate]);
          if (existing.rowCount) {
            if (receipt.source === 'arena') continue;
            throw awardConflict('You already gave this badge to this contribution.');
          }
          if (receipt.source === 'user') {
            const { rows } = await client.query(
              'SELECT COUNT(*) AS used FROM arena_award_receipts WHERE issuer=$1 AND week=$2',
              [user, weekStart(now)],
            );
            if (Number(rows[0].used) >= 3)
              throw awardConflict('Your three weekly recognition awards are used. It resets Monday at 00:00 UTC.');
          }
          await client.query(
            'INSERT INTO arena_award_receipts(id,recipient,issuer,badge,week,duplicate,data) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [
              receipt.id,
              receipt.recipient,
              receipt.issuer,
              receipt.badge,
              receipt.source === 'user' ? weekStart(now) : null,
              duplicate,
              JSON.stringify({ ...receipt, issuedAt: now }),
            ],
          );
        }
        if (command.action === 'check')
          await client.query('UPDATE arena_award_profiles SET checked=$1 WHERE "user"=$2', [now, user]);
        await client.query('INSERT INTO arena_award_commands VALUES ($1,$2)', [command.id, user]);
      }
      const snapshot = await this.readSnapshot(client, user, now);
      await client.query('COMMIT');
      return snapshot;
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505')
        throw awardConflict('This award request conflicts with an existing record. Refresh and try again.');
      throw error;
    } finally {
      client.release();
    }
  }
}
