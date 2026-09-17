import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { useAwards } from '@/hooks/useAwards/useAwards';
import { asOpaque } from '@/test-utils/type-assertions';
import { AwardSeen } from './AwardSeen';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('marks only a card visible for 500 ms and waits until other award work completes', () => {
  vi.useFakeTimers();
  let notify!: (entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: typeof notify) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const markSeen = vi.fn();
  const awards = asOpaque<ReturnType<typeof useAwards>>({
    isOwn: true,
    busy: true,
    pending: false,
    state: { seen: [] },
    markSeen,
  });
  const view = render(
    <AwardSeen id="award1" awards={awards}>
      Card
    </AwardSeen>,
  );
  act(() => {
    notify([{ isIntersecting: false, intersectionRatio: 0 }]);
    vi.advanceTimersByTime(1000);
  });
  expect(markSeen).not.toHaveBeenCalled();
  act(() => {
    notify([{ isIntersecting: true, intersectionRatio: 0.6 }]);
    vi.advanceTimersByTime(499);
  });
  expect(markSeen).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(markSeen).not.toHaveBeenCalled();
  view.rerender(
    <AwardSeen id="award1" awards={{ ...awards, busy: false }}>
      Card
    </AwardSeen>,
  );
  expect(markSeen).toHaveBeenCalledWith(['award1']);
  view.rerender(
    <AwardSeen id="award1" awards={{ ...awards, busy: false, state: { ...awards.state!, seen: ['award1'] } }}>
      Card
    </AwardSeen>,
  );
  expect(markSeen).toHaveBeenCalledTimes(1);
});
