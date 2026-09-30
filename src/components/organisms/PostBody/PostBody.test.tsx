import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostBody } from './PostBody';

vi.mock('@/molecules/PostText/PostText', () => ({
  PostText: ({ content, showFullContent }: { content: string; showFullContent?: boolean }) => (
    <p data-testid="post-text" data-show-full-content={String(showFullContent)}>
      {content}
    </p>
  ),
}));
vi.mock('@/molecules/PostLinkEmbeds/PostLinkEmbeds', () => ({
  PostLinkEmbeds: ({ content }: { content: string }) => <div data-testid="link-embeds" data-content={content} />,
}));
vi.mock('../PostAttachments/PostAttachments', () => ({
  PostAttachments: ({
    attachments,
    mediaVariant,
    children,
  }: {
    attachments: string[] | null;
    mediaVariant?: string;
    children?: React.ReactNode;
  }) => (
    <div data-testid="attachments" data-count={attachments?.length ?? 0} data-media-variant={mediaVariant}>
      {children}
    </div>
  ),
}));

describe('PostBody', () => {
  it('renders text + link embeds + attachments when content has a body', () => {
    render(
      <PostBody
        content="hello https://x.com/a"
        attachments={['pubky://author/files/a.png']}
        localAttachments={undefined}
      />,
    );

    expect(screen.getByTestId('post-text')).toHaveTextContent('hello');
    expect(screen.getByTestId('link-embeds')).toHaveAttribute('data-content', 'hello https://x.com/a');
    expect(screen.getByTestId('attachments')).toHaveAttribute('data-count', '1');
  });

  it('skips text + link embeds for empty content but still renders attachments', () => {
    render(<PostBody content="   " attachments={['pubky://author/files/a.png']} localAttachments={undefined} />);

    expect(screen.queryByTestId('post-text')).not.toBeInTheDocument();
    expect(screen.queryByTestId('link-embeds')).not.toBeInTheDocument();
    expect(screen.getByTestId('attachments')).toBeInTheDocument();
  });

  it.each(['default', 'list', 'cards'] as const)('keeps explicitly expanded text in %s', (mediaVariant) => {
    render(
      <PostBody
        content="Full body"
        showFullContent
        attachments={null}
        localAttachments={undefined}
        mediaVariant={mediaVariant}
      />,
    );
    expect(screen.getByTestId('post-text')).toHaveAttribute('data-show-full-content', 'true');
    if (mediaVariant === 'cards') {
      expect(screen.getByTestId('attachments')).toContainElement(screen.getByTestId('post-text'));
    }
  });
});
