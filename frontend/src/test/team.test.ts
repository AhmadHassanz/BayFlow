import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStaffInput, editStaffInput } from '@/lib/contracts/auth';
import { ApiError } from '@/lib/api/response';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), identity: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/auth/session', () => ({ requireIdentity: mocks.identity }));
import { createStaff } from '@/server/services/team';
import { requireOwner } from '@/server/permissions/owner';

const shopId = 'b0300000-0000-4000-8000-000000000001';
const userId = 'b0300000-0000-4000-8000-000000000002';
const ownerId = 'b0300000-0000-4000-8000-000000000003';
const member = { id: 'b0300000-0000-4000-8000-000000000004', shopId, userId, role: 'SA', active: true };
const input = createStaffInput.parse({ fullName: 'Staff', email: 'new@example.test', role: 'SA', initialPassword: 'Test-Only-Password-123!' });

function query(result: unknown) {
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
  return chain;
}
function setup() {
  const createUser = vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null });
  const updateUserById = vi.fn().mockResolvedValue({ data: {}, error: null });
  const deleteUser = vi.fn().mockResolvedValue({ error: null });
  const profile = query({ data: null, error: null });
  const admin = { auth: { admin: { createUser, updateUserById, deleteUser } }, from: vi.fn().mockReturnValue(profile) };
  const rpc = vi.fn().mockResolvedValue({ data: member, error: null });
  const context = { client: { rpc }, user: { id: ownerId } };
  mocks.admin.mockReturnValue(admin);
  return { createUser, updateUserById, deleteUser, profile, rpc, context };
}

beforeEach(() => vi.clearAllMocks());
describe('B03 validation', () => {
  it.each(['OWNER', 'CUSTOMER', 'ADMIN'])('rejects %s as a staff role', role => {
    expect(createStaffInput.safeParse({ ...input, role }).success).toBe(false);
  });
  it('rejects spoofed identities, weak passwords, empty patches and ownership changes', () => {
    expect(createStaffInput.safeParse({ ...input, userId: ownerId }).success).toBe(false);
    expect(createStaffInput.safeParse({ ...input, initialPassword: 'short' }).success).toBe(false);
    expect(editStaffInput.safeParse({}).success).toBe(false);
    expect(editStaffInput.safeParse({ role: 'OWNER' }).success).toBe(false);
    expect(editStaffInput.safeParse({ active: false, userId }).success).toBe(false);
    expect(editStaffInput.parse({ active: false })).toEqual({ active: false });
  });
});
describe('B03 ownership guard', () => {
  it.each([
    [{ data: null, error: null }, { data: { id: member.id }, error: null }],
    [{ data: { owner_user_id: userId }, error: null }, { data: { id: member.id }, error: null }],
    [{ data: { owner_user_id: ownerId }, error: null }, { data: null, error: null }],
  ])('denies nonowner, foreign or inactive membership', async (shop, membership) => {
    const from = vi.fn().mockReturnValueOnce(query(shop)).mockReturnValueOnce(query(membership));
    mocks.identity.mockResolvedValue({ client: { from }, user: { id: ownerId } });
    await expect(requireOwner(shopId)).rejects.toMatchObject({ status: 403 });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('allows only authoritative owner plus active OWNER membership', async () => {
    const from = vi.fn().mockReturnValueOnce(query({ data: { owner_user_id: ownerId }, error: null }))
      .mockReturnValueOnce(query({ data: { id: member.id }, error: null }));
    mocks.identity.mockResolvedValue({ client: { from }, user: { id: ownerId } });
    expect((await requireOwner(shopId)).user.id).toBe(ownerId);
  });
});
describe('B03 provisioning saga', () => {
  it('bans first, writes with the user RPC, enables last; returns no credentials', async () => {
    const f = setup();
    const result = await createStaff(f.context as never, shopId, input);
    expect(result).toEqual(member);
    expect(JSON.stringify(result)).not.toContain(input.initialPassword);
    expect(f.createUser).toHaveBeenCalledWith(expect.objectContaining({ ban_duration: '876000h',
      app_metadata: { bayflow_provisioned_by: ownerId, bayflow_provisioned_shop: shopId } }));
    expect(f.rpc).toHaveBeenCalledWith('add_staff_membership', { target_shop_id: shopId, target_user_id: userId, staff_role: 'SA' });
    expect(f.updateUserById).toHaveBeenCalledWith(userId, { ban_duration: 'none' });
    expect(f.createUser.mock.invocationCallOrder[0]).toBeLessThan(f.rpc.mock.invocationCallOrder[0]);
    expect(f.rpc.mock.invocationCallOrder[0]).toBeLessThan(f.updateUserById.mock.invocationCallOrder[0]);
  });
  it.each(['email_exists', 'user_already_exists'])('never modifies an existing email (%s)', async code => {
    const f = setup(); f.createUser.mockResolvedValue({ data: { user: null }, error: { code } });
    await expect(createStaff(f.context as never, shopId, input)).rejects.toMatchObject({ status: 409 });
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.updateUserById).not.toHaveBeenCalled(); expect(f.deleteUser).not.toHaveBeenCalled();
  });
  it('does not write membership after an Auth creation failure', async () => {
    const f = setup(); f.createUser.mockResolvedValue({ data: { user: null }, error: { code: 'unexpected_failure' } });
    await expect(createStaff(f.context as never, shopId, input)).rejects.toMatchObject({ code: 'STAFF_CREATION_FAILED' });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it('compensates only a confirmed unlinked new identity', async () => {
    const f = setup(); f.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(createStaff(f.context as never, shopId, input)).rejects.toMatchObject({ code: 'STAFF_PROVISIONING_INCOMPLETE' });
    expect(f.deleteUser).toHaveBeenCalledWith(userId); expect(f.updateUserById).not.toHaveBeenCalled();
  });
  it.each([{ data: { id: userId }, error: null }, { data: null, error: { code: 'network' } }])
    ('keeps an uncertain/committed identity banned for operator recovery', async check => {
      const f = setup(); f.rpc.mockRejectedValue(new Error('Lost response'));
      f.profile.maybeSingle.mockResolvedValue(check);
      await expect(createStaff(f.context as never, shopId, input)).rejects.toMatchObject({ status: 500 });
      expect(f.deleteUser).not.toHaveBeenCalled(); expect(f.updateUserById).not.toHaveBeenCalled();
    });
  it('reports failed activation without removing a committed membership', async () => {
    const f = setup(); f.updateUserById.mockResolvedValue({ data: {}, error: { code: 'network' } });
    await expect(createStaff(f.context as never, shopId, input)).rejects.toBeInstanceOf(ApiError);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });
});
