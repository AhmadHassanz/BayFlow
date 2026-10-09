# F01 verification — 2026-10-10 (Asia/Karachi)

## Scope and prerequisite decision

Implemented the public home and searchable workshop index only. The user asked
the agent to choose what should happen first after the missing F00 foundation and
F01's dead-link conflict were identified. Included only the visual/accessibility
foundation necessary for F01. Full F00, B00 and later frontend phases remain open.
No database migration, Cloud write, booking mutation, dependency change, or
additional application route was added.

Cards use “Call to arrange a visit” with the actual returned phone number until
F02/F03 supply online profile/booking destinations. This is a device dialer action,
not booking creation. The demo fixture numbers have not been called or verified.

## Automated checks

Run in `D:\BAYFLOW\frontend`:

```text
npm run test
Test Files 13 passed (13)
Tests 150 passed (150)
exit 0

npm run typecheck
tsc --noEmit
exit 0

npm run lint
eslint .
exit 0 (after replacing home anchors with next/link)

npm run build
Compiled successfully
Generating static pages (10/10)
Route (app): / is static; existing API routes remain dynamic
exit 0
```

Eight new catalog-client tests cover exact filter encoding, public route paths,
server pagination, 400/403/404/500 handling, safe error messages, malformed DTOs,
network failure, and rejecting invalid filters/IDs before fetching. Fixtures
exist only in tests. Existing backend contract tests remain passing.

## Production browser checks

Started with `npm run start -- --hostname 127.0.0.1` on port 3000 after the final
production build. Local ignored `frontend/.env.local` contains only the linked
Cloud URL, publishable key, and local site URL, obtained using the existing CLI
session. No admin key or demo credential is included in that file.

- Home title, editorial hero, process promise, search, index and footer rendered.
- Live API directory returned City Motors, Lahore Auto Care and Northside Garage.
  Their addresses, phones and Brake inspection service names rendered from APIs.
- Entered Lahore and submitted: two workshops, both in Lahore.
- Entered NoSuchCity and submitted: zero workshops and the empty-search state.
- Clear search: restored three workshops.
- Hero CTA navigated to `#workshops`; all anchors were `/`, existing section IDs,
  or API-derived `tel:` destinations. No call was initiated.
- Reviewed screenshots at 1440 x 1000 and 375 x 812. Document width was 1425 and
  360 respectively (the viewport minus scrollbar), with no horizontal overflow.
- Mobile directory is a vertical list with stacked search inputs and call links.
- Keyboard Tab from City focused Workshop name with a solid 3px focus outline.
- Loading state observed during initial load and filter changes.

Screenshots: [desktop](desktop.png), [mobile](mobile.png).

## Limitations

Error/forbidden/not-found behavior is covered at the typed API client boundary;
these were not induced against Cloud in the browser. The three-workshop Cloud
dataset does not exercise pagination controls or the more-than-three-services
summary in-browser. No Vercel deployment or actual phone connection is claimed.
The user-modified generated `database.types.ts` was neither edited nor staged.
