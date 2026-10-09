import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Supplemental SQL verification only; this does not emulate Supabase Auth or REST.
const backendDirectory = fileURLToPath(new URL('../', import.meta.url));
const testRoot = fileURLToPath(new URL('../.test-data/', import.meta.url));
await mkdir(testRoot, { recursive: true });
const directory = await mkdtemp(`${testRoot}postgres-`);
const disposableRelativePath = relative(resolve(testRoot), resolve(directory));
if (!disposableRelativePath || disposableRelativePath.startsWith('..') || isAbsolute(disposableRelativePath)
  || !basename(directory).startsWith('postgres-')) {
  throw new Error('Disposable PostgreSQL directory must stay inside backend/.test-data.');
}
const password = randomBytes(24).toString('hex');
const port = 55432;
const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres?sslmode=disable`;
const postgres = new EmbeddedPostgres({
  databaseDir: directory, user: 'postgres', password, port, persistent: false,
  postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {},
});

async function run(script, args, environment = {}) {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: backendDirectory, env: { ...process.env, ...environment }, stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', resolve);
  });
  if (exitCode !== 0) throw new Error(`Verification command failed with exit code ${exitCode}`);
}

const cli = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url));
let client;
try {
  await postgres.initialise();
  await postgres.start();
  client = postgres.getPgClient();
  await client.connect();
  // Minimal platform fixtures are confined to this disposable cluster. Application
  // DDL is exclusively loaded by the CLI from supabase/migrations.
  await client.query(`
    create role supabase_admin nologin;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth authorization supabase_admin;
    create schema extensions;
    grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (
      instance_id uuid, id uuid primary key, aud text, role text, email text unique,
      encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb,
      raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
      confirmation_token text, recovery_token text, email_change_token_new text, email_change text
    );
    create table auth.identities (
      id uuid primary key, user_id uuid references auth.users(id), provider_id text,
      identity_data jsonb, provider text, last_sign_in_at timestamptz,
      created_at timestamptz, updated_at timestamptz, unique(provider_id, provider)
    );
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::uuid
    $$;
  `);
  await client.end();
  client = undefined;
  console.log('PostgreSQL 17: applying migrations with Supabase CLI to disposable loopback database.');
  // The CLI calls any explicit URL "remote", even for this generated loopback URL.
  // This target is always a newly created disposable local cluster, never Cloud.
  await run(cli, ['db', 'reset', '--db-url', databaseUrl, '--yes']);
  // Race suites use multiple real connections internally and commit isolated
  // fixtures; keep files sequential so unrelated visibility fixtures stay stable.
  await run('--test', ['--test-concurrency=1', 'tests/*.test.mjs'], {
    BAYFLOW_TEST_DB_URL: databaseUrl,
  });
  if (process.argv.includes('--generate-types')) {
    await run(fileURLToPath(new URL('./generate-types.mjs', import.meta.url)), [], {
      BAYFLOW_TYPEGEN_DB_URL: databaseUrl,
    });
  }
  // Migration history must make a second application a no-op.
  await run(cli, ['migration', 'up', '--db-url', databaseUrl]);
  console.log('PostgreSQL verification complete. Supabase Auth/REST checks require a separate Cloud test project.');
} finally {
  if (client) await client.end();
  try { await postgres.stop(); }
  catch (error) {
    // On Windows the library kills the process tree, then removes the cluster
    // without filesystem retries. Child handles may outlive the parent briefly.
    // stop() clears its process before attempting removal; retry only this
    // verified, freshly generated disposable directory after shutdown.
    if (!['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(error?.code)) throw error;
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    console.log('Disposable PostgreSQL directory cleanup succeeded after filesystem retry.');
  }
}
