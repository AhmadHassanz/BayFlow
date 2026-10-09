import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const backend = fileURLToPath(new URL('../../../', import.meta.url));
const cliPath = fileURLToPath(new URL('../../../node_modules/supabase/dist/supabase.js', import.meta.url));

function parseCliJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error('Empty CLI output.');
  try { return JSON.parse(trimmed); } catch { /* Supabase can print progress before JSON. */ }
  for (const marker of ['\n{', '\n[']) {
    const index = trimmed.indexOf(marker);
    if (index >= 0) return JSON.parse(trimmed.slice(index + 1));
  }
  throw new Error('Unparseable CLI JSON output.');
}

async function cliOnce(args) {
  const result = await execute(process.execPath, [cliPath, ...args], {
    cwd: backend, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return parseCliJson(result.stdout);
}

export async function cli(args) {
  const attempts = args[0] === 'db' && args[1] === 'query' ? 3 : 1;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await cliOnce(args); }
    catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  if (lastError) {
    // CLI output can contain sensitive credentials. Do not relay it from a test.
    throw new Error(`Supabase CLI ${args[0]} ${args[1] ?? ''} failed. Check CLI login/link separately.`);
  }
  throw new Error(`Supabase CLI ${args[0]} ${args[1] ?? ''} failed. Check CLI login/link separately.`);
}

export async function connectCloud() {
  const expectedRef = process.env.BAYFLOW_TEST_PROJECT_REF;
  if (!expectedRef || !/^[a-z]{20}$/.test(expectedRef)) {
    throw new Error('Set BAYFLOW_TEST_PROJECT_REF to the intended disposable Cloud project reference.');
  }
  const linkedRef = (await readFile(new URL('../../../supabase/.temp/project-ref', import.meta.url), 'utf8')).trim();
  if (linkedRef !== expectedRef) throw new Error('Test project reference does not match the linked project.');
  const keys = await cli(['projects', 'api-keys', '--project-ref', expectedRef, '--reveal', '--output', 'json']);
  const publicKey = keys.find((key) => key.type === 'publishable')?.api_key
    ?? keys.find((key) => key.name === 'anon')?.api_key;
  const adminKey = keys.find((key) => key.name === 'service_role')?.api_key
    ?? keys.find((key) => key.type === 'secret')?.api_key;
  if (!publicKey || !adminKey) throw new Error('The signed-in CLI account cannot obtain the required project keys.');
  const baseUrl = `https://${expectedRef}.supabase.co`;

  async function request(path, { method = 'GET', body, token, admin = false, headers = {} } = {}) {
    const key = admin ? adminKey : publicKey;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        apikey: key,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(admin && key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { status: response.status, ok: response.ok, data };
  }

  async function query(sql) {
    const result = await cli(['db', 'query', '--linked', '--output', 'json', sql]);
    if (!Array.isArray(result.rows)) throw new Error('Unexpected CLI query result.');
    return result.rows;
  }

  async function requireSuccess(path, options) {
    const result = await request(path, options);
    if (!result.ok) throw new Error(`Cloud request failed: ${options?.method ?? 'GET'} ${path.split('?')[0]} (HTTP ${result.status}).`);
    return result.data;
  }

  return { ref: expectedRef, request, query, requireSuccess };
}

export function sqlLiteral(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value && typeof value === 'object' && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype))
    return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
  if (typeof value !== 'string') throw new Error('Unsupported SQL fixture value.');
  return `'${value.replaceAll("'", "''")}'`;
}

export function fixtureInsert(table, rows, { immutable = false } = {}) {
  if (!/^[a-z_]+$/.test(table) || !rows.length) throw new Error('Invalid fixture table or rows.');
  const columns = Object.keys(rows[0]);
  if (!columns.every((column) => /^[a-z_]+$/.test(column))) throw new Error('Invalid fixture column.');
  const values = rows.map((row) => `(${columns.map((column) => sqlLiteral(row[column])).join(',')})`).join(',');
  const conflict = immutable ? 'do nothing' : `do update set ${columns.filter((column) => column !== 'id').map((column) => `${column}=excluded.${column}`).join(',')}`;
  return `insert into public.${table} (${columns.join(',')}) values ${values} on conflict (id) ${conflict};`;
}
