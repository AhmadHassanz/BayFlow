import { NextResponse } from 'next/server';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function success<T>(data: T, status = 200) {
  return NextResponse.json({ data, error: null }, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
}
export function failure(error: unknown) {
  const known = error instanceof ApiError ? error : error instanceof z.ZodError
    ? new ApiError(400, 'INVALID_INPUT', 'Check the submitted fields.')
    : new ApiError(500, 'INTERNAL_ERROR', 'The request could not be completed.');
  const requestId = crypto.randomUUID();
  console.error('[bayflow-api]', { requestId, status: known.status, code: known.code });
  return NextResponse.json({ data: null, error: { code: known.code, message: known.message, details: { requestId } } },
    { status: known.status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Request-Id': requestId } });
}
export async function jsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 16384) throw new ApiError(400, 'INVALID_INPUT', 'Request is too large.');
  try { return JSON.parse(text); } catch { throw new ApiError(400, 'INVALID_INPUT', 'Expected a JSON body.'); }
}
export function requireSameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new ApiError(403, 'FORBIDDEN', 'A same-origin request is required.');
}
export function databaseError(error: { code?: string } | null): never {
  if (error?.code === '42501') throw new ApiError(403, 'FORBIDDEN', 'You cannot manage this team.');
  if (error?.code === 'P0002') throw new ApiError(404, 'NOT_FOUND', 'Membership was not found.');
  if (error?.code === '23505') throw new ApiError(409, 'MEMBERSHIP_EXISTS', 'This account already has a membership.');
  if (error?.code === '22023') throw new ApiError(400, 'INVALID_INPUT', 'Invalid membership change.');
  throw new ApiError(500, 'DATABASE_ERROR', 'The database operation could not be completed.');
}
