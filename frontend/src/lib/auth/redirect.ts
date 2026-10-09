export function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/api/v1/me';
  // Parsing catches protocol-relative forms and encoded URL parser surprises.
  const base = new URL('https://bayflow.invalid');
  const target = new URL(value, base);
  return target.origin === base.origin && !target.pathname.startsWith('/auth/')
    ? `${target.pathname}${target.search}${target.hash}` : '/api/v1/me';
}
