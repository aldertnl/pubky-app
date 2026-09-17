import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pubkySchema } from '@/libs/awards/awards';
import { getAwardLedger } from '@/server/awards/get-ledger';
import { readCommand, verifyAutomatic, verifyRecognition } from '@/server/awards/verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const requestSchema = z.object({ user: pubkySchema, id: z.uuid() });
const inflight = new Set<string>();
function failure(error: unknown) {
  const status =
    error instanceof z.ZodError ? 400 : ((error as { context?: { statusCode?: number } })?.context?.statusCode ?? 503);
  return NextResponse.json(
    {
      error:
        status === 503
          ? 'Awards are temporarily unavailable. Your collection will stay here; please try again later.'
          : error instanceof Error
            ? error.message
            : 'Could not process this award.',
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
export async function GET(request: Request) {
  try {
    const user = pubkySchema.parse(new URL(request.url).searchParams.get('user'));
    return NextResponse.json(await (await getAwardLedger()).snapshot(user), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  let key: string | undefined;
  try {
    if (Number(request.headers.get('content-length')) > 1024)
      return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    const body = await request.text();
    if (body.length > 1024) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    const { user, id } = requestSchema.parse(JSON.parse(body));
    const ledger = await getAwardLedger();
    if (await ledger.completed(user, id)) return NextResponse.json(await ledger.snapshot(user));
    if (inflight.has(user) || inflight.size >= 16)
      return NextResponse.json(
        { error: 'Another award request is being checked. Please retry shortly.' },
        { status: 429 },
      );
    key = user;
    inflight.add(user);
    // The public homeserver command is the authorization, bound to this exact
    // owner, ID, action and payload. Posting arbitrary API JSON cannot issue an award.
    const command = await readCommand(user, id);
    const receipts =
      command.action === 'recognize'
        ? await verifyRecognition(user, command)
        : command.action === 'check'
          ? await verifyAutomatic(user, ledger)
          : [];
    return NextResponse.json(await ledger.commit(user, command, receipts));
  } catch (error) {
    return failure(error);
  } finally {
    if (key) inflight.delete(key);
  }
}
