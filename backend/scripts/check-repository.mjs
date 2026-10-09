import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const localDirectories = new Set(['.git', 'node_modules', '.next', '.test-data', '.temp', '.branches']);
const placeholder = value => !value || /^(?:your[-_]|replace[-_]|example|<)/i.test(value);
const sensitiveName = /(?:PASSWORD|SECRET|SERVICE_ROLE|ACCESS_TOKEN|DATABASE_URL|DB_URL|PRIVATE_KEY|AUTH_TOKEN)/i;

// Findings contain only a file, line and category. Never include matched values.
export function scanText(text, file, localSecrets = []) {
  const findings = [];
  const add = (kind, offset) => findings.push({ file, line: text.slice(0, offset).split('\n').length, kind });
  const signatures = [
    ['secret key', /\bsb_secret_[A-Za-z0-9_-]{15,}/g],
    ['access token', /\b(?:sbp_|ghp_|github_pat_)[A-Za-z0-9_]{20,}/g],
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ];
  for (const [kind, expression] of signatures) {
    for (const match of text.matchAll(expression)) add(kind, match.index);
  }
  for (const match of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try {
      if (JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url')).role === 'service_role') add('privileged JWT', match.index);
    } catch { /* Not a JWT payload. */ }
  }
  for (const match of text.matchAll(/\b(?:postgres(?:ql)?|https?):\/\/[^\s:@/]+:[^\s@/]{6,}@(?<host>\[[^\]]+\]|[^\s:/?#]+)/g)) {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(match.groups.host)) add('remote credential URL', match.index);
  }
  for (const value of localSecrets) {
    const offset = text.indexOf(value);
    if (offset >= 0) add('matches a local secret', offset);
  }
  return findings;
}

export function envEntries(text) {
  return text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    return match ? [{ name: match[1], value: match[2].replace(/^['"]|['"]$/g, '') }] : [];
  });
}

export function templateProblems(text, file) {
  const problems = scanText(text, file);
  for (const entry of envEntries(text)) {
    const harmlessLocalOrigin = entry.name === 'NEXT_PUBLIC_SITE_URL' && entry.value === 'http://localhost:3000';
    if (!placeholder(entry.value) && !harmlessLocalOrigin) problems.push({ file, kind: 'env template has a configured value; use an empty placeholder' });
  }
  return problems;
}

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: root, maxBuffer: 128 * 1024 * 1024, ...options });
}
function ignored(file) {
  try { git(['check-ignore', '-q', '--', file]); return true; }
  catch (error) { if (error.status === 1) return false; throw error; }
}
function envFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return localDirectories.has(entry.name) ? [] : envFiles(path);
    return /^(?:\.env(?:\.|$)|.*\.env(?:\.|$)|\.envrc$)/.test(entry.name) ? [path] : [];
  });
}

function scanObjects(objects, secrets, label, findings) {
  if (!objects.length) return;
  const batch = git(['cat-file', '--batch'], { input: objects.map(item => item.hash).join('\n') + '\n' });
  let offset = 0;
  for (const object of objects) {
    const end = batch.indexOf(10, offset);
    const [, type, length] = batch.subarray(offset, end).toString('utf8').split(' ');
    const size = Number(length);
    if (end < 0 || !Number.isSafeInteger(size)) throw new Error('Invalid Git object response');
    const body = batch.subarray(end + 1, end + 1 + size);
    offset = end + 1 + size + 1;
    if (type !== 'blob') continue;
    const file = `${label}:${object.file}:${object.hash.slice(0, 8)}`;
    if (/(?:^|\/)\.env(?:\.|$)/.test(object.file) && !/(?:^|\/)\.env\.example$/.test(object.file)) findings.push({ file, kind: 'env file in Git objects' });
    if (!body.includes(0)) {
      const text = body.toString('utf8');
      findings.push(...scanText(text, file, secrets));
      if (/(?:^|\/)\.env\.example$/.test(object.file)) findings.push(...templateProblems(text, file));
    }
  }
}

export function checkRepository({ history = false } = {}) {
  const findings = [];
  const secrets = [];
  const envs = envFiles(root);
  for (const path of envs) {
    const file = relative(root, path).replaceAll('\\', '/');
    const text = readFileSync(path, 'utf8');
    if (file.endsWith('/.env.example')) findings.push(...templateProblems(text, file));
    else if (!ignored(file)) findings.push({ file, kind: 'local env file is not ignored' });
    for (const { name, value } of envEntries(text)) {
      if (sensitiveName.test(name) && !placeholder(value) && value.length >= 10) secrets.push(value);
    }
  }
  const candidates = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of candidates) {
    const path = join(root, file);
    if (!existsSync(path)) continue; // Deleted tracked files are not push candidates.
    if (/(?:^|\/)(?:node_modules|\.next|\.test-data|\.temp|\.branches|\.vercel|coverage|test-results|playwright-report)\//.test(file)
      || /\.(?:pem|key|p12|pfx|jks|keystore|dump|backup|sqlite3?|tsbuildinfo|log)$/.test(file)) findings.push({ file, kind: 'tracked local/generated or credential artifact' });
    if (/(?:^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('/.env.example')) findings.push({ file, kind: 'tracked env file' });
    const buffer = readFileSync(path);
    if (!buffer.includes(0)) findings.push(...scanText(buffer.toString('utf8'), file, secrets));
  }
  // Scan the index independently: staged content can differ from the working file.
  const indexed = git(['ls-files', '--stage', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean).map(entry => {
    const split = entry.indexOf('\t');
    const [, hash] = entry.slice(0, split).split(' ');
    return { hash, file: entry.slice(split + 1) };
  });
  scanObjects(indexed, secrets, 'index', findings);
  let objectCount = 0;
  if (history) {
    const objects = git(['rev-list', '--objects', '--all'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(line => {
      const split = line.indexOf(' ');
      return { hash: split < 0 ? line : line.slice(0, split), file: split < 0 ? '(commit/tree)' : line.slice(split + 1) };
    });
    objectCount = objects.length;
    scanObjects(objects, secrets, 'history', findings);
  }
  return { candidateFiles: candidates.length, indexedBlobs: indexed.length, localEnvFiles: envs.length, historyObjects: objectCount, findings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkRepository({ history: process.argv.includes('--history') });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.findings.length ? 1 : 0;
  } catch {
    console.error('Repository audit could not complete. Check Git/filesystem access. No credential values were printed.');
    process.exitCode = 1;
  }
}
