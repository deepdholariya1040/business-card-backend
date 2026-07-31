# Installation

## Prerequisites

- Node.js >= 22
- MongoDB (local, Atlas, or any hosted instance)
- (Optional but recommended for production) an SMTP provider for Email OTP

## Steps

```bash
git clone <repo>
cd backend-fixed
npm install
cp .env.example .env
```

Fill in `.env`:

- `MONGODB_URI` — your MongoDB connection string.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` — from
  Google Cloud Console (unchanged from your existing setup).
- `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` — long random strings, must
  be different from each other.
- `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` — for Email OTP delivery. If left
  empty, OTP codes are logged to the server console instead (fine for local
  development, **not** for production).

Run in development:

```bash
npm run dev
```

Run in production:

```bash
npm start
# or, with PM2:
pm2 start ecosystem.config.js
```

## Verifying the install

- `GET http://localhost:5000/health` → `{ "success": true, ... }`
- `GET http://localhost:5000/api-docs` → Swagger UI
- `GET http://localhost:5000/api/auth/google` → should redirect to Google
