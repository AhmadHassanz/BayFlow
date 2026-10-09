# BayFlow - Garage Operations, Without the Guesswork

BayFlow is a multi-tenant auto repair workflow platform for customers, garage owners, service advisors, technicians, parts staff, and QC inspectors.

This repository is currently at **Phase S00: Foundation**. No application code has been generated yet. The authority files in `docs/` freeze the product, data, API, state, and design contracts before implementation begins.

## What problem it solves

BayFlow tracks a repair from public booking through service advisor intake, technician inspection, estimate approval or rejection, parts ordering and allocation, repair, mandatory QC, pickup, and completion.

## Customer / Owner / SA / Technician / Parts / QC roles

See [docs/00-project-contract.md](docs/00-project-contract.md) for role boundaries and [docs/03-state-machine.md](docs/03-state-machine.md) for legal actions.

## Technology and architecture

Planned stack:

- Next.js App Router with React and TypeScript strict.
- Supabase Cloud Auth, Postgres, RLS, and transactional Postgres functions.
- Same-origin `/api/v1/*` Route Handlers with Zod validation and typed JSON envelopes.
- Vercel deployment.

## Prerequisites and exact versions

Not installed in S00. B00 must scaffold and pin exact versions in `package.json`, lockfile, and `.nvmrc`.

## Installation

Not available until B00. This phase intentionally contains no Next.js app or package scripts.

## Environment variables

The future environment contract is documented in [docs/00-project-contract.md](docs/00-project-contract.md). `.env.example` is expected in B00/B12 when the app skeleton exists.

## Supabase migration and seed instructions

No migrations exist in S00. Schema and RLS contracts are frozen in [docs/01-schema-and-rls.md](docs/01-schema-and-rls.md).

## Development / lint / typecheck / test / build

Not runnable in S00 because no dependencies or application code have been installed. B00 must define:

- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:e2e`
- `npm run build`

## Demo credentials

None in S00. Disposable seed users are introduced only in B11.

## Live Vercel deployment and Supabase configuration

Not configured in S00. B00 creates the deployable skeleton; B12 hardens deployment instructions.

## Full booking lifecycle + QC loop demonstration

Target demo: booking -> assignment -> inspection -> estimate -> approval/rejection -> parts -> repair -> QC fail/fix/pass -> pickup -> completed. See [docs/05-progress-ledger.md](docs/05-progress-ledger.md) for phase gates.

## Security: RLS, authorization, transaction guarantees

Security contract is frozen in [docs/01-schema-and-rls.md](docs/01-schema-and-rls.md), [docs/02-api-contract.md](docs/02-api-contract.md), and [docs/03-state-machine.md](docs/03-state-machine.md).

## Known limitations and optional features

S00 creates only repository guardrails and documentation. Optional features such as email, payment, invoice PDF, voice call, and AI front desk are explicitly deferred until all core gates pass.
