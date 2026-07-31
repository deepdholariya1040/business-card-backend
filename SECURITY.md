# Security

## Authentication

- **Google OAuth** (unchanged) and **Email OTP** (new) only. No password
  field, password login, forgot/reset password, or password hashing exists
  anywhere in the system, by design.
- Email OTP: 6-digit numeric code, SHA-256 hashed at rest (never stored or
  logged in plaintext), single-use, expires after `OTP_EXPIRY_MINUTES`,
  capped at `OTP_MAX_ATTEMPTS` wrong guesses, resend cooldown and hourly cap
  per email+IP, auto-deleted via a MongoDB TTL index (no cron needed).
- JWT access tokens (short-lived) + refresh tokens (httpOnly, `secure` in
  production, `sameSite=strict` cookie, 7d).

## Transport / request security

- `helmet()` security headers.
- CORS whitelist (`CLIENT_URL` + `CORS_ALLOWED_ORIGINS`), credentialed.
- `hpp()` HTTP parameter pollution protection.
- `express-mongo-sanitize` — strips `$`/`.` operator-injection attempts from
  body/query/params.
- Custom lightweight XSS sanitizer — HTML-escapes string fields in request
  bodies (excludes `password`/`otp`/`email`/token fields, which must remain
  exact).
- Global + auth-specific + OTP-specific rate limiting
  (`express-rate-limit`).
- Request body size capped via `JSON_BODY_LIMIT`.
- `compression()` for response size.

## CSRF

`/auth/refresh` and `/auth/logout` are the only cookie-authenticated
mutating endpoints (everything else uses the `Authorization: Bearer`
header, which is not vulnerable to classic CSRF). They're protected by a
double-submit cookie token (`GET /auth/csrf-token` issues it; the frontend
echoes it back via the `x-csrf-token` header). Enforcement is currently
**advisory** (`CSRF_STRICT=false`) so the existing frontend isn't broken
mid-migration — flip to `true` once the frontend sends the header.

## Data protection

- Sensitive fields (`refreshToken`, OTP hashes, `__v`) are stripped from
  API responses via `.select()` calls plus a defense-in-depth response
  mapper.
- Passwords: N/A (none exist).
- Uploaded files are validated by extension + MIME sniffing
  (`file-type`), size-limited, and stored under UUID filenames (prevents
  path traversal / filename collisions / guessable URLs).

## Audit logging

Every login, logout, registration, and OCR scan writes an `AuditLog`
document with actor, role, action, tenant/company, IP, and user agent —
unchanged from the existing implementation, now also covering Email OTP
events.

## Known limitations / recommendations

- Rotate the Google OAuth client secret that was present in the uploaded
  `.env` before deploying — treat it as compromised since it was shared
  outside your secret manager.
- Rate limiting is in-memory; use a shared store (Redis) if you run
  multiple server instances.
- CSRF enforcement is opt-in until the frontend adopts the header.
