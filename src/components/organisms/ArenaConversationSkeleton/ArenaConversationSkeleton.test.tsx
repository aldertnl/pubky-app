import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArenaConversationSkeleton } from './ArenaConversationSkeleton';

describe('ArenaConversationSkeleton', () => {
  it('announces loading without exposing placeholder actions', () => {
    render(<ArenaConversationSkeleton label="Finding most popular post" />);
    expect(screen.getByRole('status', { name: 'Finding most popular post' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('matches the post, reply button, and composer layout', () => {
    const { container } = render(<ArenaConversationSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
