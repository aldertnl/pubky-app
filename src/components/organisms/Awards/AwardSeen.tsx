'use client';
import { useEffect, useRef, useState } from 'react';
import type { useAwards } from '@/hooks/useAwards/useAwards';

// Mark only cards that were actually visible, not an entire off-screen collection.
export function AwardSeen({
  id,
  awards,
  children,
}: {
  id: string;
  awards: ReturnType<typeof useAwards>;
  children: React.ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [viewed, setViewed] = useState(false);
  useEffect(() => {
    if (!element.current || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer);
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5)
          timer = setTimeout(() => {
            if (!document.hidden) setViewed(true);
          }, 500);
      },
      { threshold: 0.5 },
    );
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (
      viewed &&
      awards.isOwn &&
      !awards.busy &&
      !awards.pending &&
      awards.state &&
      !(awards.state.seen ?? []).includes(id)
    )
      void awards.markSeen([id]);
  }, [viewed, awards, id]);
  return (
    <div ref={element} className="min-w-0 [&>button]:h-full [&>button]:w-full">
      {children}
    </div>
  );
}
