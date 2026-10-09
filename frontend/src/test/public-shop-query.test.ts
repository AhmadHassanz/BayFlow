import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/response';
import { fixtureShop } from './public-fixtures';
const mocks = vi.hoisted(() => ({ detail: vi.fn(), notFound: vi.fn(() => { throw new Error('NEXT_HTTP_ERROR_FALLBACK;404'); }) }));
vi.mock('@/server/services/shops', () => ({ shopDetail: mocks.detail }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
import { loadPublicShop } from '@/server/queries/public-shop';
beforeEach(() => vi.clearAllMocks());

it('uses the same anonymous projection as the public API and validates its DTO', async () => {
  mocks.detail.mockResolvedValue(fixtureShop);
  expect(await loadPublicShop(fixtureShop.slug, true)).toEqual(fixtureShop);
  expect(mocks.detail).toHaveBeenCalledWith(fixtureShop.slug, true);
  mocks.detail.mockResolvedValue({ id: fixtureShop.id });
  await expect(loadPublicShop(fixtureShop.slug, true)).rejects.toThrow();
});

it('maps malformed identifiers and unpublished shops into Next not-found handling', async () => {
  await expect(loadPublicShop('bad/slug', true)).rejects.toThrow('404');
  expect(mocks.detail).not.toHaveBeenCalled();
  mocks.detail.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Shop was not found.'));
  await expect(loadPublicShop('missing-shop', true)).rejects.toThrow('404');
});

it('does not disguise database/network errors as missing shops', async () => {
  mocks.detail.mockRejectedValue(new ApiError(500, 'DATABASE_ERROR', 'The catalog could not be loaded.'));
  await expect(loadPublicShop(fixtureShop.slug, true)).rejects.toMatchObject({ status: 500 });
  expect(mocks.notFound).not.toHaveBeenCalled();
});
