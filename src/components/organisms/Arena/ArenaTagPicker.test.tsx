import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ArenaTagPicker } from './ArenaTagPicker';

// Keep TagInput and the emoji dialog real; replace only the emoji catalogue.
vi.mock('@/molecules/EmojiPicker/EmojiPicker', () => ({
  EmojiPicker: ({ onEmojiSelect }: { onEmojiSelect: (emoji: { native: string }) => void }) => (
    <button onClick={() => onEmojiSelect({ native: '🔥' })}>Fire emoji</button>
  ),
}));

const topics = ['pubky', 'bitcoin', 'music', 'art', 'design', 'news', 'code', 'books', 'games', 'science', 'extra'].map(
  (label, index) => ({ label, tagged_count: 100 - index, taggers_count: 1, taggers_id: [] }),
);
const pickerProps = { topic: 'pubky', topics, timeframeLabel: 'This month' };

describe('Arena tag picker', () => {
  it('shows ranks 1–5 and 6–10, follows the timeframe, and selects a tag', () => {
    const onTopic = vi.fn();
    const { rerender } = render(<ArenaTagPicker {...pickerProps} onTopic={onTopic} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose tag' }));
    expect(screen.getByRole('heading')).toHaveTextContent('Top #10 tags this month');
    const columns = screen.getAllByRole('list');
    expect(
      within(columns[0])
        .getAllByRole('listitem')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(topics.slice(0, 5).map((tag, index) => `Rank ${index + 1}: ${tag.label}`));
    expect(
      within(columns[1])
        .getAllByRole('listitem')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(topics.slice(5, 10).map((tag, index) => `Rank ${index + 6}: ${tag.label}`));
    expect(columns[1]).toHaveAttribute('start', '6');
    expect(screen.queryByRole('button', { name: 'extra tag (90 posts)' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pubky tag (100 posts)' })).toHaveAttribute('aria-pressed', 'true');
    rerender(<ArenaTagPicker {...pickerProps} timeframeLabel="All time" onTopic={onTopic} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Top #10 tags all time');
    fireEvent.click(screen.getByRole('button', { name: 'bitcoin tag (99 posts)' }));
    expect(onTopic).toHaveBeenCalledWith('bitcoin');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('keeps a custom tag named all distinct from resetting to all tags', async () => {
    const onTopic = vi.fn();
    const user = userEvent.setup();
    render(<ArenaTagPicker {...pickerProps} onTopic={onTopic} />);
    await user.click(screen.getByRole('button', { name: 'Choose tag' }));
    await user.type(screen.getByRole('textbox', { name: 'Tag' }), 'all{Enter}');
    expect(onTopic).toHaveBeenLastCalledWith('all');
    await user.click(screen.getByRole('button', { name: 'Choose tag' }));
    expect(screen.getByRole('textbox', { name: 'Tag' })).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Reset tag filter to all' }));
    expect(onTopic).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('focuses the shared input and applies a normalized custom tag on Enter', async () => {
    const onTopic = vi.fn();
    const user = userEvent.setup();
    render(<ArenaTagPicker {...pickerProps} onTopic={onTopic} />);
    await user.click(screen.getByRole('button', { name: 'Choose tag' }));
    const input = screen.getByRole('textbox', { name: 'Tag' });
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('placeholder', 'enter tag');
    await user.keyboard('{Enter}');
    expect(onTopic).not.toHaveBeenCalled();
    await user.type(input, 'New-tag{Enter}');
    expect(onTopic).toHaveBeenCalledWith('new-tag');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('inserts an emoji without selecting the tag until Enter is pressed', async () => {
    const onTopic = vi.fn();
    const user = userEvent.setup();
    render(<ArenaTagPicker {...pickerProps} onTopic={onTopic} />);
    await user.click(screen.getByRole('button', { name: 'Choose tag' }));
    await user.click(screen.getByRole('button', { name: 'Open emoji picker' }));
    await user.click(screen.getByRole('button', { name: 'Fire emoji' }));
    const input = screen.getByRole('textbox', { name: 'Tag' });
    await waitFor(() => expect(input).toHaveValue('🔥'));
    expect(onTopic).not.toHaveBeenCalled();
    await waitFor(() => expect(input).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(onTopic).toHaveBeenCalledWith('🔥');
  });
});
