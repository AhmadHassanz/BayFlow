import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...next, ...typescript,
  globalIgnores(['.next/**', '.next-f13/**', 'test-results/**', 'playwright-report/**', 'next-env.d.ts', 'src/lib/supabase/database.types.ts']),
]);
