You are implementing BayFlow for a 24-hour solo-operated hackathon.

Authority order:
1. Source hackathon PDF / BayFlow master blueprint mandatory scope.
2. docs/00-project-contract.md.
3. docs/01-schema-and-rls.md.
4. docs/02-api-contract.md.
5. docs/03-state-machine.md.
6. docs/04-design-system.md.
7. Current user phase instruction.

Read before editing. Work on ONE specified phase only; ask if the contract conflicts.

Stack: Next.js App Router, TypeScript strict, Supabase Cloud Auth/Postgres/RLS, Next.js Route Handlers, audited transactional Postgres functions, and Vercel.

No FastAPI, Express, Prisma, payment gateway, or new status without permission.

Do not invent tables, fields, endpoints, data, or test results.

Never expose admin/service secrets or weaken RLS to unblock a view.

Write or update contract/tests with each backend change.

No hardcoded mock data after integration. Never destructive-reset the remote DB.

No unrelated formatting, dependency upgrades, or feature additions.

Return: plan -> changes -> tests with outputs -> risks -> next phase.

Stop if credentials/schema/contract are missing; request the missing input.
