import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const baseURL = process.env.BAYFLOW_E2E_BASE_URL ?? 'http://localhost:3104';
const origin = new URL(baseURL);
if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
  throw new Error('The automatic QA server is loopback HTTP only.');
const port = origin.port || '3104';
const next = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const environment = { ...process.env, NEXT_PUBLIC_SITE_URL: origin.origin, BAYFLOW_E2E_BUILD: '1' };
let child;
async function runBuild() {
  const code = await new Promise((resolve, reject) => {
    child = spawn(process.execPath, [next, 'build'], { env: environment, stdio: 'inherit', windowsHide: true });
    child.once('error', reject); child.once('exit', resolve);
  });
  if (code !== 0) throw new Error('The isolated production QA build failed.');
}
process.on('SIGINT', () => { child?.kill(); process.exit(0); });
process.on('SIGTERM', () => { child?.kill(); process.exit(0); });
await runBuild();
child = spawn(process.execPath, [next, 'start', '-p', port, '-H', '127.0.0.1'], { env: environment, stdio: 'inherit', windowsHide: true });
child.once('error', () => process.exit(1));
child.once('exit', code => process.exit(code ?? 1));
