// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AwardCommand } from '@/libs/awards/awards';
import { AwardLedger } from './ledger';
import { readCommand, verifyAutomatic, verifyRecognition } from './verification';

const sdk = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@synonymdev/pubky', () => ({
  Client: class {},
  Pubky: { testnet: async () => ({ publicStorage: sdk }), withClient: () => ({ publicStorage: sdk }) },
}));
vi.mock('@/libs/error/error.factories', () => ({
  Err: { client: (_: string, message: string) => ({ message }), server: (_: string, message: string) => ({ message }) },
}));
const user = 'a'.repeat(52),
  recipient = 'b'.repeat(52);
const uri = (owner: string, id: string) => `pubky://${owner}/pub/pubky.app/posts/${id}`;
let ledger: AwardLedger;
beforeEach(() => {
  ledger = new AwardLedger(':memory:');
});
afterEach(() => {
  ledger.db.close();
  vi.unstubAllGlobals();
});
describe('homeserver proof', () => {
  it('only reads the exact owner/command path; rejects mismatch and expired proof', async () => {
    const id = randomUUID();
    const command = { version: 1, id, createdAt: Date.now(), action: 'check' };
    sdk.get.mockResolvedValue(new Response(JSON.stringify(command)));
    expect(await readCommand(user, id)).toEqual(command);
    expect(sdk.get).toHaveBeenCalledWith(`pubky://${user}/pub/pubky.app/awards/arena/v1/commands/${id}.json`);
    sdk.get.mockResolvedValue(new Response(JSON.stringify({ ...command, id: randomUUID() })));
    await expect(readCommand(user, id)).rejects.toBeDefined();
    sdk.get.mockResolvedValue(new Response(JSON.stringify({ ...command, createdAt: Date.now() - 11 * 60000 })));
    await expect(readCommand(user, id)).rejects.toBeDefined();
  });
  it('rejects unsupported versions and attempts to manually issue an automatic badge', async () => {
    const id = randomUUID();
    sdk.get.mockResolvedValue(new Response(JSON.stringify({ version: 2, id, createdAt: Date.now(), action: 'check' })));
    await expect(readCommand(user, id)).rejects.toBeDefined();
    sdk.get.mockResolvedValue(
      new Response(
        JSON.stringify({
          version: 1,
          id,
          createdAt: Date.now(),
          action: 'recognize',
          postId: `${recipient}:p1`,
          recognition: { badge: 'contender', reason: 'Give me the platform badge.', artifact: '' },
        }),
      ),
    );
    await expect(readCommand(user, id)).rejects.toBeDefined();
  });
});
describe('eligibility verification', () => {
  it('rejects self awards before IO and a source with a mismatched author', async () => {
    const command: Extract<AwardCommand, { action: 'recognize' }> = {
      version: 1,
      id: randomUUID(),
      createdAt: Date.now(),
      action: 'recognize',
      postId: `${user}:p1`,
      recognition: { badge: 'good-sport', reason: 'Constructive disagreement.', artifact: '' },
    };
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(verifyRecognition(user, command)).rejects.toBeDefined();
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(new Response(JSON.stringify({ details: { author: user, content: 'hi' } })));
    await expect(verifyRecognition(user, { ...command, postId: `${recipient}:p1` })).rejects.toBeDefined();
  });
  it('recognizes an existing image contribution without requiring a text caption', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            details: { author: recipient, uri: uri(recipient, 'photo1'), content: '', kind: 'image' },
          }),
        ),
      ),
    );
    const result = await verifyRecognition(user, {
      version: 1,
      id: randomUUID(),
      createdAt: Date.now(),
      action: 'recognize',
      postId: `${recipient}:photo1`,
      recognition: { badge: 'made-it-click', reason: 'This diagram made it clear.', artifact: '' },
    });
    expect(result[0].postId).toBe(`${recipient}:photo1`);
  });
  it('counts original posts, replies and tags APPLIED, and issues all three only on qualifying evidence', async () => {
    const originals = [0, 1, 2].map((i) => ({
      details: { author: user, uri: uri(user, `p${i}`), content: 'post' },
      relationships: { replied: null, reposted: null },
      counts: { replies: i === 0 ? 5 : 0 },
      tags: [],
    }));
    const replies = [0, 1, 2, 3, 4].map((i) => ({
      details: { author: user, uri: uri(user, `r${i}`), content: 'reply' },
      relationships: { replied: uri(recipient, `root${i}`), reposted: null },
      counts: { replies: 0 },
      tags: [],
    }));
    const responders = ['c', 'd', 'e', 'f', 'g'].map((c) => `${c.repeat(52)}:reply`);
    let tagsApplied = 3;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const address = new URL(url);
        let result: unknown;
        if (address.pathname.endsWith('/counts')) result = { tagged: tagsApplied, tags: 100 };
        else if (address.pathname.endsWith('/by_ids')) result = [...originals, ...replies];
        else if (address.pathname.endsWith('/keys'))
          result = {
            post_keys:
              address.searchParams.get('source') === 'post_replies'
                ? responders
                : address.searchParams.get('source') === 'author'
                  ? originals.map((_, i) => `${user}:p${i}`)
                  : replies.map((_, i) => `${user}:r${i}`),
          };
        else result = { relationships: { replied: null }, tags: [{ label: address.pathname.split('/').pop() }] };
        return new Response(JSON.stringify(result));
      }),
    );
    const earned = await verifyAutomatic(user, ledger);
    expect(earned.map((a) => a.badge)).toEqual(['contender', 'conversation-starter', 'explorer']);
    expect(earned.every((a) => a.issuer === ledger.issuer && a.source === 'arena')).toBe(true);
    tagsApplied = 2;
    expect((await verifyAutomatic(user, ledger)).map((a) => a.badge)).not.toContain('contender');
    responders.splice(1); // repeated replies from one person never meet the threshold
    expect((await verifyAutomatic(user, ledger)).map((a) => a.badge)).not.toContain('conversation-starter');
  });
});
