import { afterEach, expect, it, vi } from 'vitest';
import type { AwardCommand } from '@/libs/awards/awards';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { AwardService } from './award';

vi.mock('@/services/homeserver/homeserver', () => ({HomeserverService:{request:vi.fn()}}));
afterEach(() => {vi.unstubAllGlobals(); vi.restoreAllMocks();});
it('renews publication time without changing the saved command identity or intent', async () => {
  const now = Date.now(); vi.spyOn(Date,'now').mockReturnValue(now);
  const command: AwardCommand = {version:1, id:crypto.randomUUID(), action:'check', createdAt:now - 3600000};
  const fetch = vi.fn().mockResolvedValue({ok:true,json:async () => ({awards:[]})});
  vi.stubGlobal('fetch',fetch);
  await AwardService.publish('a'.repeat(52),command);
  expect(HomeserverService.request).toHaveBeenCalledWith(expect.objectContaining({bodyJson:{...command,createdAt:now}}));
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({user:'a'.repeat(52),id:command.id});
  expect(command.createdAt).toBe(now-3600000);
});
