import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { REACH_FILTER_META } from '@/molecules/Filters/FilterReach/FilterReach';
import { REACH } from '@/stores/home/home.types';
import { ArenaReachPicker } from './ArenaReachPicker';

const options = [REACH.ALL, REACH.NETWORK, REACH.FOLLOWING, REACH.FRIENDS].map((value) => ({
  value,
  ...REACH_FILTER_META[value],
}));

describe('ArenaReachPicker', () => {
  it('opens on the selected reach and previews another ring without changing the filter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ArenaReachPicker value={REACH.FOLLOWING} options={options} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Reach: Following' }));
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'Following' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Following' })).toHaveFocus();
    await user.hover(screen.getByRole('radio', { name: 'Everyone' }));
    expect(screen.getByTestId('reach-ring-label')).toHaveTextContent('Everyone');
    expect(onChange).not.toHaveBeenCalled();
    await user.unhover(screen.getByRole('radio', { name: 'Everyone' }));
    expect(screen.getByTestId('reach-ring-label')).toHaveTextContent('Following');
  });

  it.each([REACH.NETWORK, REACH.FOLLOWING, REACH.FRIENDS])(
    'selects %s and restores focus to the trigger',
    async (reach) => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<ArenaReachPicker value={REACH.ALL} options={options} onChange={onChange} />);
      const trigger = screen.getByRole('button', { name: 'Reach: All' });
      await user.click(trigger);
      await user.click(screen.getByRole('radio', { name: REACH_FILTER_META[reach].label }));
      expect(onChange).toHaveBeenCalledExactlyOnceWith(reach);
      expect(screen.queryByRole('radiogroup', { name: 'Reach' })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    },
  );

  it('supports keyboard previews, selection, and dismissal', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ArenaReachPicker value={REACH.ALL} options={options} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Reach: All' });
    await user.click(trigger);
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'My network' })).toHaveFocus();
    expect(screen.getByTestId('reach-ring-label')).toHaveTextContent('My network');
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledExactlyOnceWith(REACH.NETWORK);
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('radiogroup', { name: 'Reach' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
