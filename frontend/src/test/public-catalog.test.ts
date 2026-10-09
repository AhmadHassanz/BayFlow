import { afterEach, expect, it, vi } from 'vitest';
import { CatalogReadError, catalogMessage, getShops, getShopServices, getShopSlots, getShopBySlug } from '@/lib/api/shops';
import { fixtureShop, shopId } from './public-fixtures';

afterEach(() => vi.unstubAllGlobals());
const empty = { items: [], page: 1, pageSize: 50, total: 0 };
const response = (data: unknown) => new Response(JSON.stringify({ data, error: null }));

it('sends exact city and literal name filters to the real directory URL without caching', async () => {
  const fetcher = vi.fn().mockResolvedValue(response(empty));
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  expect(await getShops({ city: ' Lahore ', q: 'Care & Sons', page: 1 }, controller.signal)).toEqual(empty);
  expect(fetcher).toHaveBeenCalledWith('/api/v1/shops?page=1&city=Lahore&q=Care+%26+Sons', {
    signal: controller.signal, cache: 'no-store', credentials: 'same-origin',
  });
});

it('preserves server pagination and reads service summaries from the existing services route', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ ...empty, page: 2, total: 65 })).mockResolvedValueOnce(response(empty));
  vi.stubGlobal('fetch', fetcher);
  expect((await getShops({ city: '', q: '', page: 2 })).total).toBe(65);
  expect(fetcher.mock.calls[0][0]).toBe('/api/v1/shops?page=2');
  await getShopServices('b1100000-0000-4000-8000-000000001001');
  expect(fetcher.mock.calls[1][0]).toBe('/api/v1/shops/b1100000-0000-4000-8000-000000001001/services?page=1');
});

it.each([403, 404, 400, 500])('handles HTTP %s without displaying raw server errors', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive database diagnostic', { status })));
  const error = await getShops({ city: '', q: '', page: 1 }).catch(error => error);
  expect(error).toBeInstanceOf(CatalogReadError);
  expect(error.status).toBe(status);
  expect(catalogMessage(error)).not.toContain('sensitive');
});

it('rejects malformed response DTOs instead of rendering invented or unvalidated data', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...empty, items: [{ name: 'Incomplete' }] })));
  await expect(getShops({ city: '', q: '', page: 1 })).rejects.toThrow();
});

it('surfaces network/abort errors safely and rejects invalid filters before fetching', async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetcher);
  await expect(getShops({ city: '', q: '', page: 1 })).rejects.toThrow('Failed to fetch');
  expect(catalogMessage(new TypeError('private diagnostic'))).toBe('We could not connect to the catalog. Please try again.');
  fetcher.mockClear();
  expect(() => getShops({ city: '', q: '', page: 0 })).toThrow();
  expect(() => getShopServices('../private')).toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it('reads a public shop by slug and requests slots only for validated dates', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(fixtureShop)).mockResolvedValueOnce(response([]));
  vi.stubGlobal('fetch', fetcher);
  expect((await getShopBySlug(fixtureShop.slug)).name).toBe(fixtureShop.name);
  expect(fetcher.mock.calls[0][0]).toBe(`/api/v1/shops/by-slug/${fixtureShop.slug}`);
  await getShopSlots(shopId, '2026-10-10');
  expect(fetcher.mock.calls[1][0]).toBe(`/api/v1/shops/${shopId}/slots?date=2026-10-10`);
  expect(() => getShopSlots(shopId, '2026-02-29')).toThrow();
  expect(() => getShopServices(shopId, undefined, 0)).toThrow();
  expect(() => getShopBySlug('bad/slug')).toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
