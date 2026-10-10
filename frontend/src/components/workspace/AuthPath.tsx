import Link from 'next/link';

export const staffRoles = [
  { value: 'SA', label: 'Service advisor', detail: 'Manage bookings and customers.' },
  { value: 'TECHNICIAN', label: 'Technician', detail: 'Inspect and repair vehicles.' },
  { value: 'PARTS', label: 'Parts', detail: 'Manage parts and stock.' },
  { value: 'QC', label: 'Quality control', detail: 'Check completed repairs.' },
] as const;

export type StaffRole = (typeof staffRoles)[number]['value'];

export function isStaffRole(value: string | undefined): value is StaffRole {
  return staffRoles.some(role => role.value === value);
}

export function AccountTypeChoice({ next }: { next: string }) {
  return <div className="auth-choices" aria-label="Choose account type">
    <Link className="auth-choice" href={`/signup?type=customer&next=${encodeURIComponent(next)}`}><strong>Customer</strong><span>Book a visit and follow your repair.</span></Link>
    <Link className="auth-choice" href="/signup?type=owner&next=%2Fowner%2Fonboarding"><strong>Workshop owner</strong><span>Create your workshop, services and team.</span></Link>
  </div>;
}
