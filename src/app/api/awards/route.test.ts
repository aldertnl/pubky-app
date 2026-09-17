// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AwardLedger } from '@/server/awards/ledger';
import { GET, POST } from './route';

const proof = vi.hoisted(() => ({ read: vi.fn(), automatic: vi.fn(), recognition: vi.fn(), ledger: vi.fn() }));
vi.mock('@/server/awards/verification', () => ({
  readCommand: proof.read,
  verifyAutomatic: proof.automatic,
  verifyRecognition: proof.recognition,
}));
vi.mock('@/server/awards/get-ledger', async (original) => ({
  ...(await original<typeof import('@/server/awards/get-ledger')>()),
  getAwardLedger: proof.ledger,
}));
const user = 'a'.repeat(52),
  recipient = 'b'.repeat(52);
let ledger: AwardLedger;
beforeEach(() => {
  vi.resetAllMocks();
  ledger = new AwardLedger(':memory:');
  proof.ledger.mockReturnValue(ledger);
});
afterEach(() => ledger.db.close());
const post = (body: unknown) =>
  POST(new Request('http://localhost/api/awards', { method: 'POST', body: JSON.stringify(body) }));
describe('award API contract', () => {
  it('cannot issue from a caller-supplied body without the homeserver proof', async () => {
    proof.read.mockRejectedValue({ context: { statusCode: 409 } });
    const response = await post({ user, id: randomUUID(), source: 'arena', recipient, badge: 'contender' });
    expect(response.status).toBe(409);
    expect(proof.automatic).not.toHaveBeenCalled();
    expect(ledger.snapshot(recipient).awards).toEqual([]);
  });
  it('registers a verified recognition, exposes a pending notification, then accepts and wears atomically', async () => {
    const id = randomUUID();
    proof.read.mockResolvedValue({
      version: 1,
      id,
      createdAt: Date.now(),
      action: 'recognize',
      postId: `${recipient}:p1`,
      recognition: { badge: 'made-it-click', reason: 'A helpful example.', artifact: '' },
    });
    proof.recognition.mockResolvedValue([
      {
        version: 1,
        id,
        badge: 'made-it-click',
        source: 'user',
        method: 'user',
        issuer: user,
        recipient,
        postId: `${recipient}:p1`,
        reason: 'A helpful example.',
        issuedAt: Date.now(),
        definitionVersion: 1,
      },
    ]);
    expect((await post({ user, id })).status).toBe(200);
    expect(proof.read).toHaveBeenCalledWith(user, id);
    const incoming = await (await GET(new Request(`http://localhost/api/awards?user=${recipient}`))).json();
    expect(incoming.awards[0].id).toBe(id);
    expect(incoming.choices).toEqual({});
    const chooseId = randomUUID();
    proof.read.mockResolvedValue({
      version: 1,
      id: chooseId,
      createdAt: Date.now(),
      action: 'choose',
      revision: 0,
      awardId: id,
      status: 'accepted',
      worn: [id],
    });
    const accepted = await (await post({ user: recipient, id: chooseId })).json();
    expect(accepted.worn).toEqual([id]);
    expect(accepted.choices[id]).toBe('visible');
    proof.read.mockRejectedValue({ message: 'Homeserver unavailable on retry' });
    expect((await post({ user: recipient, id: chooseId })).status).toBe(200);
    expect(ledger.snapshot(recipient).revision).toBe(1);
  });
  it('rejects invalid owner keys, arbitrary paths and oversized requests before proof IO', async () => {
    expect((await post({ user: '../other', id: randomUUID() })).status).toBe(400);
    expect((await post({ user, id: '../command' })).status).toBe(400);
    expect((await post({ user, id: 'x'.repeat(2000) })).status).toBe(413);
    expect(proof.read).not.toHaveBeenCalled();
  });
});
