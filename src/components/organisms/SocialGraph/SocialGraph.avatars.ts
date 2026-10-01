import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FACES, stringHash } from 'facehash';
import { COLORS } from '@/config/theme';
import { FACEHASH_AVATAR_COLORS } from '@/molecules/FacehashAvatar/FacehashAvatar.constants';
import {
  resolveAvatarFallbackInitial,
  resolveAvatarFallbackSeed,
} from '@/organisms/AvatarWithFallback/AvatarWithFallback.utils';
import { notifyGraphAssetReady } from './SocialGraph.sprites';

const sprites = new Map<string, HTMLImageElement>();
const CACHE_CAP = 200;
const SIZE = 128;
const FACE_ASPECTS = [63 / 15, 71 / 23, 82 / 8, 63 / 9];

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Static canvas counterpart of FacehashAvatar, using the same seed, palette and eye components. */
export function fallbackAvatarSprite(pubky: string, name: string): HTMLImageElement | null {
  if (typeof window === 'undefined') return null;
  const seed = resolveAvatarFallbackSeed({ fallbackSeed: pubky, name });
  const initial = resolveAvatarFallbackInitial({ name, seed });
  const key = `${seed}:${initial}`;
  const cached = sprites.get(key);
  if (cached) {
    sprites.delete(key);
    sprites.set(key, cached);
    return cached.complete && cached.naturalWidth > 0 ? cached : null;
  }

  const hash = stringHash(seed);
  const faceIndex = hash % FACES.length;
  const Face = FACES[faceIndex];
  const color = FACEHASH_AVATAR_COLORS[hash % FACEHASH_AVATAR_COLORS.length];
  const eyeWidth = SIZE * 0.6;
  const eyeHeight = eyeWidth / FACE_ASPECTS[faceIndex];
  const mouthSize = SIZE * 0.26;
  const gap = SIZE * 0.08;
  const top = (SIZE - eyeHeight - gap - mouthSize) / 2;
  const eyes = renderToStaticMarkup(createElement(Face, { enableBlink: false }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" style="color:${COLORS.background}">
    <defs><radialGradient id="glow"><stop stop-color="white" stop-opacity="0.15"/><stop offset="60%" stop-color="white" stop-opacity="0"/></radialGradient></defs>
    <rect width="${SIZE}" height="${SIZE}" fill="${color}"/>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#glow)"/>
    <svg x="${(SIZE - eyeWidth) / 2}" y="${top}" width="${eyeWidth}" height="${eyeHeight}">${eyes}</svg>
    <text x="${SIZE / 2}" y="${top + eyeHeight + gap + mouthSize * 0.8}" text-anchor="middle" fill="${COLORS.background}" font-family="Inter Tight, sans-serif" font-weight="500" font-size="${mouthSize}">${escapeXml(initial)}</text>
  </svg>`;
  const image = new Image();
  image.onload = notifyGraphAssetReady;
  // URI encoding rejects lone UTF-16 surrogates. The Unicode regex leaves valid emoji pairs intact.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/[\uD800-\uDFFF]/gu, '\uFFFD'))}`;
  sprites.set(key, image);
  if (sprites.size > CACHE_CAP) sprites.delete(sprites.keys().next().value!);
  return null;
}
