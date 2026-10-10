// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AccountTypeChoice, isStaffRole } from '@/components/workspace/AuthPath';

afterEach(cleanup);

it('shows separate customer and owner signup paths before account details', () => {
  render(<AccountTypeChoice next="/customer" />);
  expect(screen.getByRole('link', { name: /Customer/ }).getAttribute('href')).toContain('type=customer');
  const owner = screen.getByRole('link', { name: /Workshop owner/ }).getAttribute('href');
  expect(owner).toContain('type=owner');
  expect(owner).toContain('next=%2Fowner%2Fonboarding');
});

it('recognizes only employee roles as staff login hints', () => {
  for (const role of ['SA', 'TECHNICIAN', 'PARTS', 'QC']) expect(isStaffRole(role)).toBe(true);
  expect(isStaffRole('OWNER')).toBe(false);
  expect(isStaffRole('CUSTOMER')).toBe(false);
});
