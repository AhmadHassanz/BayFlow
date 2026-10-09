// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingAccount } from '@/components/booking/BookingAccount';
const mocks = vi.hoisted(() => ({ login: vi.fn(), signup: vi.fn(), logout: vi.fn() }));
vi.mock('@/lib/auth/actions', () => mocks);
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
const returnTo = '/book/b1100000-0000-4000-8000-000000001001?resume=1';

it('waits for signup email confirmation and never posts a booking or pretends to be signed in', async () => {
  mocks.signup.mockResolvedValue({ data: { requiresEmailConfirmation: true }, error: null });
  const authenticated = vi.fn(); const save = vi.fn().mockReturnValue(true); const user = userEvent.setup();
  render(<BookingAccount identity={null} beforeAuth={save} onAuthenticated={authenticated} returnTo={returnTo} />);
  await user.click(screen.getByRole('button', { name: 'Create an account' }));
  await user.type(screen.getByLabelText(/Full name/), 'Test Customer');
  await user.type(screen.getByLabelText(/Email address/), 'customer@example.test');
  await user.type(screen.getByLabelText(/Password/), 'Test-Password-123!');
  await user.click(screen.getByRole('button', { name: /Create my account/ }));
  await screen.findByRole('heading', { name: 'Check your email.' });
  expect(save).toHaveBeenCalled(); expect(authenticated).not.toHaveBeenCalled();
  expect(mocks.signup).toHaveBeenCalledWith({ fullName: 'Test Customer', email: 'customer@example.test', password: 'Test-Password-123!' }, returnTo);
  expect(screen.getByText(/appointment is not reserved yet/)).toBeTruthy();
});

it('keeps duplicate-email errors actionable without logging in or replacing an existing account', async () => {
  mocks.signup.mockResolvedValue({ error: 'Unable to create an account. If this email is registered, sign in.' });
  const authenticated = vi.fn(); const user = userEvent.setup();
  render(<BookingAccount identity={null} beforeAuth={() => true} onAuthenticated={authenticated} returnTo={returnTo} />);
  await user.click(screen.getByRole('button', { name: 'Create an account' }));
  await user.type(screen.getByLabelText(/Full name/), 'Test Customer');
  await user.type(screen.getByLabelText(/Email address/), 'customer@example.test');
  await user.type(screen.getByLabelText(/Password/), 'Test-Password-123!');
  await user.click(screen.getByRole('button', { name: /Create my account/ }));
  expect((await screen.findByRole('alert')).textContent).toContain('sign in');
  expect(authenticated).not.toHaveBeenCalled(); expect(mocks.login).not.toHaveBeenCalled();
});

it('rejects invalid signup input before invoking auth or saving the draft', async () => {
  const save = vi.fn(); const user = userEvent.setup();
  render(<BookingAccount identity={null} beforeAuth={save} onAuthenticated={vi.fn()} returnTo={returnTo} />);
  await user.click(screen.getByRole('button', { name: 'Create an account' }));
  await user.click(screen.getByRole('button', { name: /Create my account/ }));
  expect((await screen.findByRole('alert')).textContent).toContain('12–128');
  expect(save).not.toHaveBeenCalled(); expect(mocks.signup).not.toHaveBeenCalled();
});
