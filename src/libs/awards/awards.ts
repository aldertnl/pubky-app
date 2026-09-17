import { z } from 'zod';

export const AWARD_ROOT = '/pub/pubky.app/awards/arena/v1';
export const badges = [
  {
    id: 'contender',
    name: 'Contender',
    source: 'arena',
    description: 'You stepped into the Arena.',
    criteria: 'Create 3 original posts, write 3 replies, and apply 3 tags.',
    achievement: 'You created 3 original posts, wrote 3 replies, and applied 3 tags.',
  },
  {
    id: 'conversation-starter',
    name: 'Catalyst',
    source: 'arena',
    description: 'You gave people something to talk about.',
    criteria: 'Receive replies from 5 different people on one original post.',
    achievement: 'You received replies from 5 different people on one original post.',
  },
  {
    id: 'explorer',
    name: 'Explorer',
    source: 'arena',
    description: 'Curiosity takes you places.',
    criteria: 'Reply in 5 different conversations covering 5 distinct topic tags.',
    achievement: 'You replied in 5 different conversations covering 5 distinct topic tags.',
  },
  {
    id: 'made-it-click',
    name: 'Made It Click',
    source: 'user',
    description: 'An explanation that brought something into focus.',
    giverDescription: 'It made something clear to you.',
    criteria: 'Someone recognizes your contribution helped them understand.',
    achievement: 'Someone recognized a contribution that helped them understand.',
  },
  {
    id: 'changed-my-mind',
    name: 'New Lens',
    source: 'user',
    description: 'A new perspective that stayed with someone.',
    giverDescription: 'A perspective that stuck with you.',
    criteria: 'Someone explains how your contribution changed their thinking.',
    achievement: 'Someone explained how your contribution changed their thinking.',
  },
  {
    id: 'good-sport',
    name: 'Good Sport',
    source: 'user',
    description: 'Different views. Mutual respect.',
    giverDescription: 'You disagreed, but felt respected.',
    criteria: 'Someone recognizes your constructive disagreement.',
    achievement: 'Someone recognized your constructive disagreement.',
  },
  {
    id: 'built-on-this',
    name: 'Built on This',
    source: 'user',
    description: 'Your idea became part of something new.',
    giverDescription: 'An idea you built something on.',
    criteria: 'Someone was inspired to create something based on your contribution.',
    achievement: 'Someone linked something they made using your contribution.',
  },
] as const;
export type BadgeId = (typeof badges)[number]['id'];
export const badgeById = (id: BadgeId) => badges.find((badge) => badge.id === id)!;
export const pubkySchema = z.string().regex(/^[a-z0-9]{52}$/, 'Invalid public key.');
export const postIdSchema = z.string().regex(/^[a-z0-9]{52}:[A-Za-z0-9_-]{1,80}$/, 'Invalid post.');
export const recognitionSchema = z.object({
  badge: z.enum(['made-it-click', 'changed-my-mind', 'good-sport', 'built-on-this']),
  reason: z
    .string()
    .trim()
    .min(10, 'Please explain why in at least 10 characters.')
    .max(500, 'Use 500 characters or fewer.'),
  artifact: z
    .string()
    .trim()
    .max(2048)
    .refine(
      (s) => !s || (/^https?:\/\//.test(s) && z.url().safeParse(s).success),
      'Use a complete https:// or http:// link.',
    ),
});
export type Recognition = z.infer<typeof recognitionSchema>;
export const commandSchema = z.discriminatedUnion('action', [
  z.object({
    version: z.literal(1),
    id: z.uuid(),
    createdAt: z.number().int(),
    action: z.literal('recognize'),
    postId: postIdSchema,
    recognition: recognitionSchema,
  }),
  z.object({
    version: z.literal(1),
    id: z.uuid(),
    createdAt: z.number().int(),
    action: z.literal('choose'),
    revision: z.number().int().nonnegative(),
    awardId: z.string().max(100),
    status: z.enum(['visible', 'hidden', 'accepted', 'dismissed']),
    worn: z.array(z.string().max(100)).max(3),
  }),
  z.object({
    version: z.literal(1),
    id: z.uuid(),
    createdAt: z.number().int(),
    action: z.literal('seen'),
    awardIds: z.array(z.string().max(100)).min(1).max(5),
  }),
  z.object({
    version: z.literal(1),
    id: z.uuid(),
    createdAt: z.number().int(),
    action: z.literal('dismiss-notification'),
    awardId: z.string().max(100),
  }),
  z.object({ version: z.literal(1), id: z.uuid(), createdAt: z.number().int(), action: z.literal('check') }),
]);
export type AwardCommand = z.infer<typeof commandSchema>;
export interface AwardReceipt {
  version: 1;
  id: string;
  badge: BadgeId;
  source: 'arena' | 'user';
  method: 'automatic' | 'user';
  issuer: string;
  recipient: string;
  reason: string;
  postId?: string;
  artifact?: string;
  issuedAt: number;
  evidence?: string[];
  definitionVersion: 1;
}
export interface AwardSnapshot {
  awards: AwardReceipt[];
  issued: AwardReceipt[];
  choices: Record<string, 'visible' | 'hidden' | 'accepted' | 'dismissed'>;
  seen?: string[];
  dismissedNotifications?: string[];
  worn: string[];
  revision: number;
  remaining: number;
  resetsAt: number;
  checkedAt: number | null;
}
export function weekStart(time: number) {
  const date = new Date(time);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.getTime();
}
// One tag per distinct root conversation; maximum bipartite matching avoids
// awarding Explorer for one heavily tagged thread or undercounting overlapping tags.
export function explorerEvidence(conversations: Map<string, string[]>): string[] {
  const assigned = new Map<string, string>();
  function assign(root: string, visited: Set<string>): boolean {
    for (const tag of conversations.get(root) ?? []) {
      const normalized = tag.trim().toLowerCase();
      if (!normalized || visited.has(normalized)) continue;
      visited.add(normalized);
      const previous = assigned.get(normalized);
      if (!previous || assign(previous, visited)) {
        assigned.set(normalized, root);
        return true;
      }
    }
    return false;
  }
  for (const root of conversations.keys()) assign(root, new Set());
  return [...assigned].map(([tag, root]) => `${root} #${tag}`);
}
