import { createHash } from 'node:crypto';
import { Client, Pubky } from '@synonymdev/pubky';
import { getPkarrRelays, getTestnet } from '@/config/network';
import { getNexusUrl } from '@/config/nexus';
import {
  AWARD_ROOT,
  type AwardCommand,
  type AwardReceipt,
  badgeById,
  commandSchema,
  explorerEvidence,
} from '@/libs/awards/awards';
import { type NexusPost, type NexusUserCounts } from '@/services/nexus/nexus.types';
import { awardConflict, type AwardStore } from './store';

let pubky: Pubky | undefined;
export async function readCommand(user: string, id: string): Promise<AwardCommand> {
  pubky ??= getTestnet()
    ? await Pubky.testnet()
    : Pubky.withClient(new Client({ pkarr: { relays: getPkarrRelays() } }));
  // Only a validated key + UUID enter this URL; never follow a caller-supplied URL.
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const response = await Promise.race([
    pubky.publicStorage.get(`pubky://${user}${AWARD_ROOT}/commands/${id}.json`),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(awardConflict('Your homeserver is taking too long. Please retry.')), 15000);
    }),
  ]).finally(() => clearTimeout(timeout));
  if (!response.ok) throw awardConflict('Your homeserver record is not available yet. Retry in a moment.');
  const text = await response.text();
  if (text.length > 8192) throw awardConflict('The award record is too large.');
  const command = commandSchema.parse(JSON.parse(text));
  if (command.id !== id) throw awardConflict('The award record does not match.');
  if (Math.abs(Date.now() - command.createdAt) > 10 * 60_000)
    throw awardConflict('This request expired. Please try again.');
  return command;
}
async function nexus<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getNexusUrl().replace(/\/$/, '')}/${path}`, {
    ...init,
    cache: 'no-store',
    signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
  });
  if (!response.ok) throw awardConflict('Activity could not be verified. Try again when Nexus is available.');
  return response.json();
}
const validId = /^[a-z0-9]{52}:[A-Za-z0-9_-]{1,80}$/;
function fromUri(uri: string): string | null {
  const match = /^pubky:\/\/([a-z0-9]{52})\/pub\/pubky\.app\/posts\/([A-Za-z0-9_-]+)$/.exec(uri);
  return match ? `${match[1]}:${match[2]}` : null;
}
async function keys(source: string, user: string, postId?: string, signal?: AbortSignal): Promise<string[]> {
  const query = new URLSearchParams({ source, author_id: user, limit: '50' });
  if (postId) query.set('post_id', postId);
  const result = await nexus<{ post_keys: string[] }>(`v0/stream/posts/keys?${query}`, { signal });
  return result.post_keys.filter((id) => validId.test(id)).slice(0, 50);
}
async function views(ids: string[], signal?: AbortSignal): Promise<NexusPost[]> {
  if (!ids.length) return [];
  return nexus<NexusPost[]>('v0/stream/posts/by_ids', {
    signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post_ids: ids, include_attachment_metadata: false }),
  });
}
export async function verifyRecognition(
  user: string,
  command: Extract<AwardCommand, { action: 'recognize' }>,
): Promise<AwardReceipt[]> {
  const [recipient, postId] = command.postId.split(':');
  if (recipient === user) throw awardConflict('You cannot recognize your own contribution.');
  const post = await nexus<NexusPost>(`v0/post/${recipient}/${postId}`);
  if (post.details.author !== recipient || post.details.uri !== `pubky://${recipient}/pub/pubky.app/posts/${postId}`)
    throw awardConflict('The contribution is no longer available.');
  return [
    {
      version: 1,
      id: command.id,
      badge: command.recognition.badge,
      source: 'user',
      method: 'user',
      issuer: user,
      recipient,
      postId: command.postId,
      reason: command.recognition.reason,
      artifact: command.recognition.artifact || undefined,
      issuedAt: Date.now(),
      definitionVersion: 1,
    },
  ];
}
export async function verifyAutomatic(user: string, ledger: AwardStore): Promise<AwardReceipt[]> {
  const signal = AbortSignal.timeout(60000);
  const state = await ledger.snapshot(user);
  if (state.checkedAt && Date.now() - state.checkedAt < 15 * 60_000)
    throw awardConflict('Activity was checked recently. You can check again in 15 minutes.');
  const earned = new Set(state.awards.filter((a) => a.source === 'arena').map((a) => a.badge));
  if (earned.size === 3) return [];
  const [counts, ownIds, replyIds] = await Promise.all([
    nexus<NexusUserCounts>(`v0/user/${user}/counts`, { signal }),
    keys('author', user, undefined, signal),
    keys('author_replies', user, undefined, signal),
  ]);
  const allViews = await views([...new Set([...ownIds.slice(0, 25), ...replyIds.slice(0, 25)])], signal);
  const originals = allViews.filter(
    (post) =>
      post.details.author === user &&
      post.details.kind !== 'collection' &&
      !post.relationships.replied &&
      !post.relationships.reposted,
  );
  const replies = allViews.filter((post) => post.details.author === user && !!post.relationships.replied);
  const receipts: AwardReceipt[] = [];
  function add(badge: 'contender' | 'conversation-starter' | 'explorer', evidence: string[]) {
    if (earned.has(badge)) return;
    receipts.push({
      version: 1,
      id: `auto-${createHash('sha256').update(`${ledger.issuer}:${user}:${badge}`).digest('hex').slice(0, 40)}`,
      badge,
      source: 'arena',
      method: 'automatic',
      issuer: ledger.issuer,
      recipient: user,
      reason: badgeById(badge).achievement,
      issuedAt: Date.now(),
      evidence,
      definitionVersion: 1,
    });
  }
  if (originals.length >= 3 && replies.length >= 3 && counts.tagged >= 3)
    add('contender', [
      ...originals.slice(0, 3).map((p) => p.details.uri),
      ...replies.slice(0, 3).map((p) => p.details.uri),
      `tags-applied:${counts.tagged}`,
    ]);
  if (!earned.has('conversation-starter')) {
    for (const post of originals.filter((p) => p.counts.replies >= 5).slice(0, 10)) {
      const id = fromUri(post.details.uri);
      if (!id) continue;
      const responders = new Set(
        (await keys('post_replies', user, id.split(':')[1], signal))
          .map((key) => key.split(':')[0])
          .filter((key) => key !== user),
      );
      if (responders.size >= 5) {
        add('conversation-starter', [id, ...[...responders].slice(0, 5)]);
        break;
      }
    }
  }
  if (!earned.has('explorer')) {
    const conversations = new Map<string, string[]>();
    const cache = new Map(allViews.map((post) => [fromUri(post.details.uri), post]));
    for (const reply of replies.slice(0, 15)) {
      let parent = reply.relationships.replied;
      const visited = new Set<string>();
      for (let depth = 0; parent && depth < 8; depth++) {
        const id = fromUri(parent);
        if (!id || visited.has(id)) break;
        visited.add(id);
        let root = cache.get(id);
        if (!root) {
          const [author, post] = id.split(':');
          root = await nexus<NexusPost>(`v0/post/${author}/${post}`, { signal });
          cache.set(id, root);
        }
        if (!root.relationships.replied) {
          conversations.set(
            id,
            root.tags.map((tag) => tag.label),
          );
          break;
        }
        parent = root.relationships.replied;
      }
      const evidence = explorerEvidence(conversations);
      if (evidence.length >= 5) {
        add('explorer', evidence.slice(0, 5));
        break;
      }
    }
  }
  return receipts;
}
