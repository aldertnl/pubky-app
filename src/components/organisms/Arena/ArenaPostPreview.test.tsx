import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ArenaPostPreview } from './ArenaPostPreview';

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: () => ({ profile: { name: 'Jeb' } }),
}));

it('renders both Pubky mention formats as names without nested links', () => {
  const key = '9o6xrx8wgqu48dmb47uep6w3dgbwdnf5jgw83gbeuxg9yi7x444y';
  const { container } = render(<ArenaPostPreview text={`pubky${key} hello pk:${key}!`} />);
  expect(screen.getAllByText('@Jeb')).toHaveLength(2);
  expect(container.textContent).toBe('@Jeb hello @Jeb!');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
