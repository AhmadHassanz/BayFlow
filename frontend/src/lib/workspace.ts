import type { Membership } from '@/lib/contracts/auth';
import type { BookingIdentity } from '@/lib/api/booking';
import { safeNext } from '@/lib/auth/redirect';

export const roleNames: Record<Membership['role'], string> = { OWNER: 'Owner', SA: 'Service advisor', TECHNICIAN: 'Technician', PARTS: 'Parts', QC: 'Quality control' };
export function authDestination(next: string | null) {
  const path = safeNext(next);
  return path === '/api/v1/me' || /^\/(login|signup)(\/|\?|#|$)/.test(path) ? '/customer' : path;
}
export function activeMemberships(identity: BookingIdentity) {
  return identity.memberships.filter(item => item.active && item.userId === identity.user.id);
}
export function shopMembership(identity: BookingIdentity, shopId: string) {
  return activeMemberships(identity).find(item => item.shopId === shopId);
}
export const roleSegments: Record<Membership['role'], string> = { OWNER: 'advisor', SA: 'advisor', TECHNICIAN: 'technician', PARTS: 'parts', QC: 'qc' };
export function membershipHome(membership: Membership) { return `/shops/${membership.shopId}/${roleSegments[membership.role]}`; }
export function identityHome(identity: BookingIdentity) {
  const memberships = activeMemberships(identity);
  if (memberships.some(item => item.role === 'OWNER')) return '/owner';
  return memberships[0] ? membershipHome(memberships[0]) : '/customer';
}
export function canUseWorkspace(role: Membership['role'], segment: string) { return roleSegments[role] === segment; }
