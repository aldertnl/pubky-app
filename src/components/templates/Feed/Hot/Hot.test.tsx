import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { Hot } from './Hot';

vi.mock('next/navigation', () => ({ usePathname: () => '/arena' }));
vi.mock('@/organisms/Arena/Arena', () => ({
  Arena: ({ mobileFiltersOpen }: { mobileFiltersOpen?: boolean }) => (
    <div data-testid="arena" data-filters-open={mobileFiltersOpen}>
      Arena content
    </div>
  ),
}));
vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({
    children,
    showLeftSidebar,
    showRightSidebar,
  }: {
    children: React.ReactNode;
    showLeftSidebar: boolean;
    showRightSidebar: boolean;
  }) => (
    <main data-left-sidebar={showLeftSidebar} data-right-sidebar={showRightSidebar}>
      {children}
    </main>
  ),
}));

describe('Hot', () => {
  afterEach(resetViewport);
  it('places Arena in a full-width native shell without the old sidebars', () => {
    render(<Hot />);
    expect(screen.getByText('Arena content')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('data-left-sidebar', 'false');
    expect(screen.getByRole('main')).toHaveAttribute('data-right-sidebar', 'false');
  });

  it('opens ranking settings from the mobile header', () => {
    setMobileViewport();
    render(<Hot />);
    expect(screen.getByTestId('arena')).toHaveAttribute('data-filters-open', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Open filters' }));
    expect(screen.getByTestId('arena')).toHaveAttribute('data-filters-open', 'true');
  });
});
