'use client';

import { Fragment } from 'react';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { Identity } from '@/libs/identity/identity';
import { MENTION_IN_TEXT_REGEX } from '@/libs/identity/identity.constants';
import { formatPublicKey, withPubkyPrefix } from '@/libs/utils/utils';

function PreviewMention({ mention }: { mention: string }) {
  const user = Identity.extractPubkyPublicKey(mention) ?? '';
  const { profile } = useUserProfile(user);
  return (
    <span className="text-brand">
      {profile?.name ? `@${profile.name}` : formatPublicKey({ key: withPubkyPrefix(user) })}
    </span>
  );
}

/** Non-interactive mentions preserve the mini card's select-and-scroll action. */
export function ArenaPostPreview({ text }: { text: string }) {
  const parts = [];
  let cursor = 0;
  for (const match of text.matchAll(MENTION_IN_TEXT_REGEX)) {
    const start = match.index + match[1].length;
    parts.push(
      <Fragment key={start}>
        {text.slice(cursor, start)}
        <PreviewMention mention={match[2]} />
      </Fragment>,
    );
    cursor = start + match[2].length;
  }
  return (
    <>
      {parts}
      {text.slice(cursor)}
    </>
  );
}
