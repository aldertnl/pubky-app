import { resolve } from 'node:path';
import { attachDatabasePool } from '@vercel/functions';
import { Pool } from 'pg';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { PostgresAwardLedger } from './postgres';
import type { AwardStore } from './store';

let ledger: Promise<AwardStore> | undefined;
let pool: Pool | undefined;
export function getAwardLedger(): Promise<AwardStore> {
  ledger ??= open().catch((error) => {
    ledger = undefined;
    throw error;
  });
  return ledger;
}
async function open(): Promise<AwardStore> {
  const connectionString = process.env.ARENA_AWARDS_DATABASE_URL ?? process.env.ARENA_AWARDS_URL;
  if (connectionString) {
    pool ??= new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
    });
    // Idle connection failures must not crash the function or expose connection details.
    if (!pool.listenerCount('error')) pool.on('error', () => {});
    attachDatabasePool(pool);
    return PostgresAwardLedger.open(pool);
  }
  if (process.env.VERCEL || (process.env.NODE_ENV === 'production' && !process.env.ARENA_AWARDS_DB)) {
    throw Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'Awards need durable storage configured.', {
      service: ErrorService.Local,
      operation: 'awards',
      context: { statusCode: 503 },
    });
  }
  const { AwardLedger } = await import('./ledger');
  return new AwardLedger(process.env.ARENA_AWARDS_DB ?? resolve('.arena/awards.sqlite'));
}
