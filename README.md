# OCR SaaS Backend

Production-hardened, multi-tenant OCR SaaS backend. Existing OCR, scan,
RBAC, and Google OAuth flows are preserved 100% as-is; this upgrade adds
security hardening, Email OTP authentication, dynamic OCR fields,
configurable scan limits, image URL fixes, deployment tooling, and —most
recently— automatic Barcode and QR Code detection on every scanned
business card.

The backend no longer performs OCR alone. Every image submitted to the
`/api/ocr/scan` endpoint is forwarded to the external Python OCR
microservice, which now returns three categories of data in a single
response: the recognized text from the front and back of the card, any
QR codes found in the image (including their decoded content and data
type), and any linear or 2D barcodes found in the image (including their
decoded content and symbology). All three categories are persisted on
the `BusinessCard` document and returned to the client, so a single scan
request can capture a name/contact OCR result, a QR-encoded vCard or
payment link, and a product/asset barcode at the same time.

See also: `INSTALLATION.md`, `DEPLOYMENT.md`, `API_DOCUMENTATION.md`,
`ENVIRONMENT_VARIABLES.md`, `RBAC.md`, `SECURITY.md`,
`OCR_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `PRODUCTION_CHECKLIST.md`,
`PYTHON_API.md`.

## Quick Start

```bash
npm install
cp .env.example .env   # fill in secrets
npm run dev
```

API docs (Swagger UI): `http://localhost:5000/api-docs`
Health check: `http://localhost:5000/health`

## Authentication

Only two login methods exist — **no password auth anywhere**:

- **Google OAuth** — unchanged: `GET /api/auth/google` → callback → JWT.
- **Email OTP** — new: request a 6-digit code, verify it, get a JWT.
  - Register: `POST /api/auth/otp/register/send` → `POST /api/auth/otp/register/verify`
  - Login: `POST /api/auth/otp/login/send` → `POST /api/auth/otp/login/verify`

## Tech Stack

Express 5, MongoDB/Mongoose, Passport (Google OAuth), JWT, Multer + Sharp
(image processing), Nodemailer (OTP email), Helmet/rate-limiting/mongo-sanitize
(security), Pino (logging), Swagger (API docs).
