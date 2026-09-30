import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasAnchoredPopover } from './CanvasAnchoredPopover';

const rect = (width: number, height: number) => ({
  width,
  height,
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: width,
  bottom: height,
  toJSON: () => ({}),
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('repositions after child content loads and when the container shrinks', () => {
  let popupHeight = 80;
  let containerWidth = 500;
  let resized: ResizeObserverCallback | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resized = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
    return this.parentElement;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.textContent === 'Loaded profile' &&
      this.parentElement?.textContent === 'Loaded profile' &&
      this.classList.contains('absolute')
      ? (rect(200, popupHeight) as DOMRect)
      : (rect(containerWidth, 300) as DOMRect);
  });
  const { unmount } = render(
    <div>
      <CanvasAnchoredPopover x={250} y={230} offset={40}>
        Loaded profile
      </CanvasAnchoredPopover>
    </div>,
  );
  const popup = screen.getByText('Loaded profile');
  expect(popup).toHaveStyle({ left: '290px', top: '190px' });
  popupHeight = 200;
  containerWidth = 400;
  act(() => resized?.([], {} as ResizeObserver));
  expect(popup).toHaveStyle({ left: '10px', top: '92px' });
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
