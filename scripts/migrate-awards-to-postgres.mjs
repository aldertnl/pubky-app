// Node 24. Pause award writes and migrate before starting the new backend.
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import pg from 'pg';
import { AWARDS_POSTGRES_SCHEMA } from '../src/server/awards/postgres-schema.ts';
const connectionString = process.env.ARENA_AWARDS_DATABASE_URL ?? process.env.ARENA_AWARDS_URL;
if (!connectionString) throw new Error('Set ARENA_AWARDS_DATABASE_URL securely before migration.');
const source = new DatabaseSync(resolve(process.argv[2] ?? '.arena/awards.sqlite'), { readOnly: true });
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(48192017)');
  await client.query(AWARDS_POSTGRES_SCHEMA);
  await client.query(
    'LOCK TABLE arena_award_receipts, arena_award_profiles, arena_award_commands, arena_award_metadata IN ACCESS EXCLUSIVE MODE',
  );
  const { rows } = await client.query(
    `SELECT (SELECT COUNT(*) FROM arena_award_receipts) + (SELECT COUNT(*) FROM arena_award_profiles) + (SELECT COUNT(*) FROM arena_award_commands) AS count`,
  );
  if (Number(rows[0].count)) throw new Error('Target contains data; migration refused.');
  const metadata = source.prepare('SELECT key,value FROM metadata').all();
  if (!metadata.some((r) => r.key === 'issuer')) throw new Error('Source issuer is missing.');
  for (const r of metadata)
    await client.query(
      'INSERT INTO arena_award_metadata VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value',
      [r.key, r.value],
    );
  const receipts = source.prepare('SELECT * FROM receipts ORDER BY rowid').all();
  for (const r of receipts)
    await client.query(
      'INSERT INTO arena_award_receipts(id,recipient,issuer,badge,week,duplicate,data) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [r.id, r.recipient, r.issuer, r.badge, r.week, r.duplicate, r.data],
    );
  const profiles = source.prepare('SELECT * FROM profiles').all();
  for (const r of profiles)
    await client.query(
      'INSERT INTO arena_award_profiles("user",choices,worn,revision,checked,seen,dismissed_notifications) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        r.user,
        JSON.stringify(
          Object.fromEntries(
            Object.entries(JSON.parse(r.choices)).map(([id, status]) => [
              id,
              ['dismissed', 'hidden'].includes(status) ? 'hidden' : 'visible',
            ]),
          ),
        ),
        r.worn,
        r.revision,
        r.checked,
        r.seen ?? JSON.stringify(Object.keys(JSON.parse(r.choices))),
        r.dismissed_notifications ?? '[]',
      ],
    );
  const commands = source.prepare('SELECT * FROM commands').all();
  for (const r of commands) await client.query('INSERT INTO arena_award_commands VALUES ($1,$2)', [r.id, r.user]);
  await client.query('COMMIT');
  console.log(
    `Migrated ${receipts.length} awards, ${profiles.length} profiles and ${commands.length} commands. SQLite unchanged.`,
  );
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(
    error instanceof Error && /^(Target contains|Source issuer)/.test(error.message)
      ? error.message
      : 'Migration failed and rolled back. Check connection and schema.',
  );
  process.exitCode = 1;
} finally {
  source.close();
  await client.end();
}
