import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fallbackAvatarSprite } from './SocialGraph.avatars';

describe('fallbackAvatarSprite', () => {
  let images: HTMLImageElement[];

  beforeEach(() => {
    images = [];
    vi.spyOn(globalThis, 'Image').mockImplementation(function () {
      const image = document.createElement('img');
      images.push(image);
      return image;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['emoji-name', '😀 Alice', '😀'],
    ['joined-emoji-name', '👩‍💻 Developer', '👩‍💻'],
    ['combined-name', 'e\u0301mile', 'E\u0301'],
    ['plain-name', 'Alice', 'A'],
    ['xml-name', '& Alice', '&'],
    ['malformed-name', '\uD800 Alice', '\uFFFD'],
    ['malformed-low-name', '\uDC00 Alice', '\uFFFD'],
    ['😀 emoji-seed', '', '😀'],
    ['deleted-user-seed', '[DELETED]', 'D'],
  ])('encodes a valid fallback SVG for %s', (seed, name, initial) => {
    expect(() => fallbackAvatarSprite(seed, name)).not.toThrow();
    expect(images).toHaveLength(1);
    const svg = decodeURIComponent(images[0].src.split(',')[1]);
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.querySelector('text')?.textContent).toBe(initial);
  });
});
