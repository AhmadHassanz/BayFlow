# F02 verification — 2026-10-10 (Asia/Karachi)

Implemented before F03, as explicitly requested in the combined F02/F03 work
order. The user requested no website startup or browser preview; verification is
automated rather than a claimed browser or screenshot gate.

## Changes

- `/shops/[slug]` uses the existing session-free public shop detail service behind
  the B04 API. Malformed slugs and unpublished shops use Next not-found handling.
- Profiles render name/address/city/phone, actual service DTOs with pagination,
  whole-PKR guide prices, configured split shifts/closed days and the shop timezone.
- Date/slot overview consumes the existing slots API, with 14 shop-local dates,
  explicit full/available states, refresh on focus, loading, empty and retry states.
- Service/time CTAs preserve shop/service/date/slot IDs for F03. Directory rows now
  link to profiles; shared public navigation works away from the homepage.
- Public not-found and retry boundaries have Workshop Ledger styling. No fabricated
  ratings, reviews, opening hours or product catalog data was added.

## Actual automated outputs

Commands run from `D:\BAYFLOW\frontend` at the F02 gate:

```text
npm run test
Test Files 15 passed (15)
Tests 160 passed (160)
exit 0

npm run typecheck
tsc --noEmit
exit 0

npm run lint
eslint .
exit 0

npm run build
Compiled successfully
Generating static pages (10/10)
Route includes dynamic /shops/[slug]
exit 0
```

New profile/query/client tests cover DTO rendering, service links and guide prices,
split/closed hours, neutral review copy, date changes, local-calendar boundaries,
full and available slots, empty catalogs/days, retry, malformed identifiers,
missing shops and preserving database failures as errors rather than false 404s.

Pinned Testing Library/DOM/user-event and jsdom dev dependencies enable these
interactions in Vitest without starting Next.js. Existing pinned dependencies
were not upgraded. Final F02/F03 combined verification is recorded in
[F03 verification](../f03/README.md).

## Limits

No real-browser responsive screenshots, frontend server, Cloud writes or remote
schema changes occurred during F02/F03. Profile layout and live Cloud appointment
availability remain manual review items. Booking links were completed by the
immediately following F03 phase rather than routing users to a placeholder.
