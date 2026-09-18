import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { ProfileAwardsPage } from '@/components/templates/Profile/Awards/ProfileAwardsPage';
import { type AwardSnapshot } from '@/libs/awards/awards';
import { AwardGivenDetails } from './AwardGivenDetails';
import { AwardNotifications } from './AwardNotifications';
import { AwardsContent, AwardsDialog } from './AwardsDialog';
import { AwardTrophy } from './AwardTrophy';
import { PostAwards } from './PostAwards';
import { ProfileAwards } from './ProfileAwards';
import { RecognizeDialog } from './RecognizeDialog';

const mocks = vi.hoisted(() => ({ awards: vi.fn(), choose: vi.fn(), user: 'a'.repeat(52) }));
vi.mock('@/hooks/useAwards/useAwards', () => ({ useAwards: mocks.awards }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: mocks.user }),
}));
vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({ useUserProfile: () => ({ profile: { name: 'Alex' } }) }));
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({ useRequireAuth: () => ({ requireAuth: vi.fn() }) }));
vi.mock('@/providers/ProfileProvider/ProfileProvider', () => ({ useProfileContext: () => ({ pubky: mocks.user }) }));
const state: AwardSnapshot = {
  awards: [
    {
      version: 1,
      id: 'award1',
      badge: 'made-it-click',
      source: 'user',
      method: 'user',
      issuer: 'b'.repeat(52),
      recipient: mocks.user,
      reason: 'Your example helped me understand.',
      issuedAt: 1700000000000,
      definitionVersion: 1,
    },
  ],
  issued: [],
  choices: {},
  worn: [],
  remaining: 1,
  resetsAt: 1,
  checkedAt: null,
  revision: 0,
};
beforeEach(() => {
  mocks.choose.mockReset();
  mocks.awards.mockReturnValue({
    state: structuredClone(state),
    error: '',
    pending: false,
    busy: false,
    isOwn: true,
    dismissNotification: vi.fn(),
    markSeen: vi.fn(),
    choose: mocks.choose,
    canCheck: true,
    check: vi.fn(),
  });
});
describe('awards UI', () => {
  it('renders the embedded profile view without a dialog provider', () => {
    render(<AwardsContent open embedded user={mocks.user} />);
    expect(screen.queryByRole('heading', { name: 'Awards' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discover (7)' })).not.toBeInTheDocument();
    expect(screen.queryByText('ACHIEVEMENTS')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Catalyst' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Built on This' })).not.toBeInTheDocument();
    expect(screen.getByText('RECOGNITION')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Made It Click' }));
    expect(screen.getByText('Your example helped me understand.')).toBeInTheDocument();
  });

  it('hides the recognition section when My awards is totally empty', () => {
    mocks.awards.mockReturnValue({ ...mocks.awards(), state: { ...structuredClone(state), awards: [] } });

    render(<AwardsContent open embedded user={mocks.user} />);

    expect(screen.getByText('Your story starts with a contribution.')).toBeInTheDocument();
    expect(screen.queryByText('RECOGNITION')).not.toBeInTheDocument();
  });

  it('lists given recognitions and remaining allowance without recipient controls', () => {
    const snapshot = structuredClone(state);
    snapshot.issued = [{ ...snapshot.awards[0], id: 'given', issuer: mocks.user, recipient: 'b'.repeat(52) }];
    snapshot.remaining = 2;
    mocks.awards.mockReturnValue({ ...mocks.awards(), state: snapshot });
    render(<AwardsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Given (1)' }));
    expect(screen.getByText('(2 remaining)').parentElement).toHaveTextContent(
      'You can hand out 3 recognition awards each week (2 remaining).',
    );
    expect(screen.getByText('To Alex')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Made It Click' }));
    expect(screen.getByText('Awarded to')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wear' })).not.toBeInTheDocument();
  });

  it('folds the remaining allowance into the empty Given description', () => {
    const snapshot = structuredClone(state);
    snapshot.remaining = 3;
    mocks.awards.mockReturnValue({ ...mocks.awards(), state: snapshot });

    render(<AwardsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Given (0)' }));

    expect(screen.getByText('No recognitions awarded yet.')).toBeInTheDocument();
    expect(screen.getByText('No recognitions awarded yet.').parentElement).toHaveTextContent('(3 remaining)');
  });

  it('distinguishes inline loading, failure, and empty awards', () => {
    mocks.awards.mockReturnValue({ ...mocks.awards(), state: undefined });
    const { rerender } = render(<PostAwards user={mocks.user} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading awards');
    expect(screen.queryByText('No awards yet.')).not.toBeInTheDocument();
    mocks.awards.mockReturnValue({ ...mocks.awards(), error: 'Could not load awards.' });
    rerender(<PostAwards user={mocks.user} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load awards.');
    expect(screen.queryByText('No awards yet.')).not.toBeInTheDocument();
    mocks.awards.mockReturnValue({ ...mocks.awards(), error: '', state: { ...state, awards: [] } });
    rerender(<PostAwards user={mocks.user} />);
    expect(screen.getByText('No awards yet.')).toBeInTheDocument();
  });

  it.each(['', 'Could not load award.'])('keeps Given details back navigation available: %s', (error) => {
    mocks.awards.mockReturnValue({ ...mocks.awards(), state: undefined, error });
    const back = vi.fn();
    render(<AwardGivenDetails award={state.awards[0]} back={back} />);
    expect(screen.getByRole(error ? 'alert' : 'status')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All awards' }));
    expect(back).toHaveBeenCalledOnce();
  });

  it('hides the inline section when the post has no visible awards', () => {
    render(<PostAwards postId={mocks.user + ':post'} />);
    expect(screen.queryByRole('region', { name: 'Awards for this post' })).not.toBeInTheDocument();
  });
  it('shows only this post awards and opens the selected award details', () => {
    const snapshot = structuredClone(state);
    snapshot.awards[0].postId = mocks.user + ':post';
    snapshot.awards.push({ ...snapshot.awards[0], id: 'other', postId: mocks.user + ':other' });
    mocks.awards.mockReturnValue({ ...mocks.awards(), state: snapshot });
    render(<PostAwards postId={mocks.user + ':post'} />);
    expect(screen.getByRole('heading', { name: 'POST AWARDS' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Made It Click' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Made It Click' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Your example helped me understand.')).toBeInTheDocument();
  });

  it('shows all seven designs with separate award-source labels', () => {
    render(<AwardsDialog open onOpenChange={vi.fn()} />);
    expect(screen.getAllByRole('img')).toHaveLength(7);
    expect(screen.getByText('ACHIEVEMENTS')).toBeInTheDocument();
    expect(screen.getByText('RECOGNITION')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Contender' }));
    expect(screen.getByText('Create 3 original posts, write 3 replies, and apply 3 tags.')).toBeInTheDocument();
  });
  it('notifications offer details first, wear and hide for the exact receipt', () => {
    render(<AwardNotifications />);
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getAllByRole('button').filter((button) => !button.getAttribute('aria-label'))[0]).toHaveTextContent(
      'Details',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Wear' }));
    expect(mocks.choose).toHaveBeenCalledWith(state.awards[0], 'wear');
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(mocks.choose).not.toHaveBeenCalledWith(state.awards[0], 'hide');
    expect(screen.getByText('Hide ‘Made It Click’?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.choose).not.toHaveBeenCalledWith(state.awards[0], 'hide');
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(mocks.choose).toHaveBeenCalledWith(state.awards[0], 'hide');
  });
  it('shows only chosen badges on the profile and opens details on tap', () => {
    mocks.awards.mockReturnValue({
      ...mocks.awards(),
      state: { ...state, choices: { award1: 'accepted' }, worn: ['award1'] },
    });
    render(
      <TooltipProvider>
        <ProfileAwards user={mocks.user} />
      </TooltipProvider>,
    );
    expect(screen.getAllByRole('img')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Made It Click, view award' }));
    expect(screen.getByText(state.awards[0].reason)).toBeInTheDocument();
    expect(screen.getByText('Unwear')).toBeInTheDocument();
  });
  it('visitors cannot accept, wear or dismiss someone else’s award', () => {
    mocks.awards.mockReturnValue({ ...mocks.awards(), isOwn: false });
    render(<AwardsDialog open user="other" initialAward={state.awards[0]} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Wear' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hide' })).not.toBeInTheDocument();
  });
});

describe('award trophies', () => {
  it('shows recognition on own posts and opens the linked receipt', () => {
    mocks.awards.mockReturnValue({
      ...mocks.awards(),
      state: { ...state, awards: [{ ...state.awards[0], postId: 'post1' }] },
    });
    render(<AwardTrophy user={mocks.user} postId="post1" />);
    fireEvent.click(screen.getByRole('button', { name: 'View recognition for this post' }));
    expect(screen.getByText(state.awards[0].reason)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wear' })).not.toBeInTheDocument();
  });
  it('hides the trophy on posts without recognition', () => {
    render(<AwardTrophy user={mocks.user} postId="other-post" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('shows pending user awards during the demo', () => {
    render(<AwardTrophy user={mocks.user} />);
    expect(screen.getByRole('button', { name: 'View user awards' })).toBeInTheDocument();
  });
  it('shows accepted unworn awards in the user showcase, including for oneself', () => {
    mocks.awards.mockReturnValue({
      ...mocks.awards(),
      state: {
        ...state,
        awards: [...state.awards, { ...state.awards[0], id: 'pending', badge: 'explorer' }],
        choices: { award1: 'accepted' },
        worn: [],
      },
    });
    render(<AwardTrophy user={mocks.user} />);
    fireEvent.click(screen.getByRole('button', { name: 'View user awards' }));
    expect(screen.getByRole('button', { name: 'Made It Click' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explorer' })).toBeInTheDocument();
    expect(screen.queryByText('Discover')).not.toBeInTheDocument();
  });
});

it('shows the optional link input when Built on This is selected', () => {
  render(<RecognizeDialog open postId={`${'b'.repeat(52)}:post1`} onOpenChange={vi.fn()} />, {
    wrapper: TooltipProvider,
  });
  expect(screen.queryByLabelText('Link (optional)')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'Built on This' }));
  expect(screen.getByLabelText('Link (optional)')).toBeVisible();
  fireEvent.click(screen.getByRole('radio', { name: 'Good Sport' }));
  expect(screen.queryByLabelText('Link (optional)')).not.toBeInTheDocument();
});

it('shows hidden awards only in the owner collection and restores without wearing', () => {
  mocks.awards.mockReturnValue({
    ...mocks.awards(),
    state: { ...state, choices: { award1: 'hidden' }, seen: ['award1'] },
  });
  render(<AwardsContent open embedded user={mocks.user} />);
  expect(screen.getByText('HIDDEN')).toBeInTheDocument();
  expect(screen.getByLabelText('Hidden')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Made It Click' }));
  expect(screen.queryByRole('button', { name: 'Wear' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show in awards' }));
  expect(mocks.choose).toHaveBeenCalledWith(state.awards[0], 'show');
});
it('excludes hidden awards from visitor collections and notifications', () => {
  mocks.awards.mockReturnValue({ ...mocks.awards(), isOwn: false, state: { ...state, choices: { award1: 'hidden' } } });
  render(<AwardsContent open embedded user="other" />);
  render(<AwardNotifications />);
  expect(screen.queryByText('HIDDEN')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Made It Click' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Award notifications' })).not.toBeInTheDocument();
});
it('keeps viewed notifications visible with no New label or acceptance action', () => {
  mocks.awards.mockReturnValue({ ...mocks.awards(), state: { ...state, seen: ['award1'] } });
  render(<AwardNotifications />);
  expect(screen.getByText(/You received/)).toBeInTheDocument();
  expect(screen.queryByText('New')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();
});

it('closes the notification independently of collection visibility and wearing', () => {
  render(<AwardNotifications />);
  fireEvent.click(screen.getByRole('button', { name: 'Close Made It Click notification' }));
  expect(mocks.awards().dismissNotification).toHaveBeenCalledWith(state.awards[0]);
  expect(mocks.choose).not.toHaveBeenCalled();
});
it('does not render notifications closed on another visit', () => {
  mocks.awards.mockReturnValue({ ...mocks.awards(), state: { ...state, dismissedNotifications: ['award1'] } });
  render(<AwardNotifications />);
  expect(screen.queryByRole('region', { name: 'Award notifications' })).not.toBeInTheDocument();
});

it.each([
  ['wear', 'Wear', []],
  ['remove', 'Unwear', ['award1']],
  ['hide', 'Hide', []],
] as const)('shows a trailing spinner only on the saving %s action', (action, label, worn) => {
  mocks.awards.mockReturnValue({
    ...mocks.awards(),
    state: { ...state, worn: [...worn] },
    busy: true,
    choiceLoading: { id: 'award1', action },
  });
  render(<AwardNotifications />);
  const button = screen.getByRole('button', { name: label });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(button.lastElementChild).toHaveClass('animate-spin');
  expect(document.querySelectorAll('svg.animate-spin')).toHaveLength(1);
});

it('resets profile award details when Awards navigation is selected again', () => {
  render(<ProfileAwardsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Made It Click' }));
  expect(screen.getByRole('button', { name: 'All awards' })).toBeInTheDocument();
  fireEvent(window, new Event('profile-awards-overview'));
  expect(screen.queryByRole('button', { name: 'All awards' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Made It Click' })).toBeInTheDocument();
});
it('shows a checkmark indicator for a visible, seen, unworn award', () => {
  mocks.awards.mockReturnValue({ ...mocks.awards(), state: { ...state, seen: ['award1'] } });
  render(<AwardsContent open embedded user={mocks.user} />);
  expect(screen.getByLabelText('Visible award')).toBeInTheDocument();
});

it('shows a signed-out Given empty state instead of loading indefinitely', () => {
  const user = mocks.user;
  mocks.user = '';
  mocks.awards.mockReturnValue({ ...mocks.awards(), state: undefined, isOwn: false });
  try {
    render(<AwardsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Given (0)' }));
    expect(screen.getByText('Recognize a contribution that mattered to you.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Give awards' })).toBeInTheDocument();
    expect(screen.queryByText('You can hand out 3 recognition awards each week.')).not.toBeInTheDocument();
  } finally {
    mocks.user = user;
  }
});
