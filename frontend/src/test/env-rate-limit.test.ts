import { expect, it, vi } from 'vitest';
import { publicEnvironment } from '@/lib/supabase/env';
import { limitStaffCreation } from '@/server/permissions/rate-limit';

it('rejects a secret/service-role key in the public environment', () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
  for (const key of ['sb_secret_test', `x.${btoa(JSON.stringify({ role: 'service_role' }))}.x`]) {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', key);
    expect(() => publicEnvironment()).toThrow();
  }
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  expect(publicEnvironment().key).toBe('sb_publishable_test');
});
it('limits staff creation per verified actor and expires the bucket', () => {
  for (let i = 0; i < 10; i++) limitStaffCreation('rate-test-owner', 100);
  expect(() => limitStaffCreation('rate-test-owner', 100)).toThrow(expect.objectContaining({ status: 429 }));
  expect(() => limitStaffCreation('another-owner', 100)).not.toThrow();
  expect(() => limitStaffCreation('rate-test-owner', 60100)).not.toThrow();
});
