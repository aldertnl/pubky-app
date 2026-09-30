'use client';

import { type RefObject, useLayoutEffect, useState } from 'react';

/** Keep loading and rendered graph frames at the same viewport height. */
export function useArenaGraphHeight(container: RefObject<HTMLElement | null>, isFullscreen = false) {
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    if (isFullscreen) return;
    const element = container.current;
    if (!element) return;
    const resize = () => setHeight(Math.max(0, window.innerHeight - element.getBoundingClientRect().top - 24));
    resize();
    const observer = new ResizeObserver(resize);
    if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [container, isFullscreen]);
  return height;
}
