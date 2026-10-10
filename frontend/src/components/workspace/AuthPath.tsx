import Link from 'next/link';

export const garageRoles = [
  { value: 'OWNER', label: 'Owner', detail: 'Create and manage a garage.' },
  { value: 'SA', label: 'Service advisor', detail: 'Manage bookings and customers.' },
  { value: 'TECHNICIAN', label: 'Technician', detail: 'Inspect and repair vehicles.' },
  { value: 'PARTS', label: 'Parts', detail: 'Manage parts and stock.' },
  { value: 'QC', label: 'Quality control', detail: 'Check completed repairs.' },
] as const;

export type GarageRole = (typeof garageRoles)[number]['value'];

export function isGarageRole(value: string | undefined): value is GarageRole {
  return garageRoles.some(role => role.value === value);
}

export function AccountTypeChoice({ next }: { next: string }) {
  return <div className="auth-choices" aria-label="Choose account type">
    <Link className="auth-choice" href={`/signup?type=customer&next=${encodeURIComponent(next)}`}><strong>Customer</strong><span>Book a visit and follow your repair.</span></Link>
    <Link className="auth-choice" href={`/signup?type=garage&next=${encodeURIComponent(next)}`}><strong>Garage</strong><span>Set up a garage or join your team.</span></Link>
  </div>;
}

export function GarageRoleChoice({ next }: { next: string }) {
  return <div className="auth-role-list" aria-label="Choose your garage role">
    {garageRoles.map(role => <Link className="auth-choice" key={role.value} href={`${role.value === 'OWNER' ? '/signup' : '/login'}?type=garage&role=${role.value}&next=${encodeURIComponent(next)}`}><strong>{role.label}</strong><span>{role.detail}</span></Link>)}
  </div>;
}
