# Environment Variables

All variables live in `.env` (see `.env.example` for a fillable template).
Variables marked **(unchanged)** existed before this upgrade and keep the
exact same name/meaning for backward compatibility.

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` (unchanged) | `development` | `development` \| `production` |
| `PORT` (unchanged) | `5000` | HTTP port |
| `API_PREFIX` | `/api` | Base API path; `/api/v1` alias is auto-derived |
| `MONGODB_URI` (unchanged) | — | MongoDB connection string |
| `CLIENT_URL` (unchanged) | `http://localhost:5173` | Primary frontend origin (also added to CORS whitelist) |
| `CORS_ALLOWED_ORIGINS` | `[CLIENT_URL]` | Comma-separated extra allowed origins |
| `SERVER_URL` | *(derived from request)* | Public backend URL, used to build image URLs |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` (unchanged) | — | Google OAuth credentials |
| `ACCESS_TOKEN_SECRET` / `ACCESS_TOKEN_EXPIRES_IN` (unchanged) | `30m` | JWT access token |
| `REFRESH_TOKEN_SECRET` / `REFRESH_TOKEN_EXPIRES_IN` (unchanged) | `7d` | JWT refresh token (httpOnly cookie) |
| `CSRF_STRICT` | `false` | Enforce CSRF header check on `/auth/refresh`, `/auth/logout` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | — | Email OTP delivery. If unset, OTP is logged to console instead of sent |
| `MAIL_FROM` | `no-reply@ocr-saas.local` | From address for OTP emails |
| `OTP_LENGTH` | `6` | Digits in generated OTP |
| `OTP_EXPIRY_MINUTES` | `5` | OTP validity window |
| `OTP_MAX_ATTEMPTS` | `5` | Wrong-code attempts allowed per OTP |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60` | Minimum time between OTP resends |
| `OTP_MAX_PER_HOUR` | `5` | Max OTP requests per email+IP per hour |
| `DEFAULT_NORMAL_USER_SCAN_LIMIT_{DAILY,MONTHLY,YEARLY}` | `25/500/5000` | Fallback limits for `NORMAL_USER` (existing per-user `scanLimits`/`customLimits` on the User document always take precedence) |
| `DEFAULT_COMPANY_SCAN_LIMIT_{DAILY,MONTHLY,YEARLY}` | `100/10000/100000` | Fallback limits for a company (existing `Company.scanLimits` always takes precedence) |
| `DEFAULT_STAFF_SCAN_LIMIT_{DAILY,MONTHLY,YEARLY}` | `50/1000/10000` | Reserved for future per-staff overrides |
| `MAX_FILE_SIZE_MB` | `10` | Max upload size |
| `MAX_UPLOADS_PER_REQUEST` | `2` | Max files per OCR request (front+back) |
| `UPLOAD_DRIVER` | `local` | `local` now; `s3`/`cloudinary`/`gcs` reserved for future storage providers |
| `RATE_LIMIT_WINDOW_MINUTES` / `RATE_LIMIT_MAX` | `15 / 300` | Global API rate limit |
| `AUTH_RATE_LIMIT_WINDOW_MINUTES` / `AUTH_RATE_LIMIT_MAX` | `15 / 20` | Auth-endpoint rate limit |
| `JSON_BODY_LIMIT` | `10mb` | Max JSON/urlencoded body size |
| `LOG_LEVEL` | `info` | Pino log level |
| `PYTHON_SERVICE_URL` | — | URL of the Python microservice that performs OCR text recognition **and** Barcode/QR Code detection for every `/ocr/scan` request. See `PYTHON_API.md` for the full request/response contract. |

**Note on the current defaults for scan limits:** the existing
`limit.service.js` reads limits from the `User`/`Company` documents
directly (`user.scanLimits`, `user.customLimits`, `company.scanLimits`),
which is unchanged. The `DEFAULT_*` env vars above are provided so new
users/companies can be created with sensible, centrally-configured
starting limits instead of hardcoded numbers, and are intended to be used
wherever new User/Company documents are created going forward.
