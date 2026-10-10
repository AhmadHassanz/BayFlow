// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AccountTypeChoice, GarageRoleChoice } from '@/components/workspace/AuthPath';

afterEach(cleanup);

it('shows separate customer and garage paths before account details', () => {
  render(<AccountTypeChoice next="/customer" />);
  expect(screen.getByRole('link', { name: /Customer/ }).getAttribute('href')).toContain('type=customer');
  expect(screen.getByRole('link', { name: /Garage/ }).getAttribute('href')).toContain('type=garage');
});

it('lets an owner create an account and sends every staff role to sign in', () => {
  render(<GarageRoleChoice next="/customer" />);
  expect(screen.getByRole('link', { name: /Owner/ }).getAttribute('href')).toContain('/signup?');
  for (const name of ['Service advisor', 'Technician', 'Parts', 'Quality control']) {
    expect(screen.getByRole('link', { name: new RegExp(name) }).getAttribute('href')).toContain('/login?');
  }
});
