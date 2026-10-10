# Email Confirmation Recovery Amendment

Supabase can return `access_denied` with `otp_expired` before BayFlow receives a
PKCE code when a confirmation URL is expired, reused, or consumed by an email-link
scanner. The previous callback rendered the API error envelope directly.

The callback now redirects to `/login?confirmation=expired`, preserves only the
sanitized local destination such as `/owner/onboarding`, and presents a resend
form. Resend uses Supabase's signup-confirmation operation and always returns a
generic success message so account existence is not disclosed. It never accepts
or grants a shop role.

Verification: callback/action tests 14/14, TypeScript and lint passed. The original
expired URL remains unusable; the user must request and open the newest email.
