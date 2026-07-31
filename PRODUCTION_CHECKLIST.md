# Production Readiness Checklist

## Before first deploy

- [ ] Rotate the Google OAuth client secret (the uploaded `.env` had a live
      one — treat it as compromised)
- [ ] Generate strong, distinct `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET`
- [ ] Set `NODE_ENV=production`
- [ ] Set `SERVER_URL` to your real public backend URL
- [ ] Configure real SMTP credentials (`SMTP_HOST/USER/PASS`) — otherwise
      Email OTP only logs codes to the console
- [ ] Set `CORS_ALLOWED_ORIGINS` to your real frontend origin(s)
- [ ] Point `MONGODB_URI` at a backed-up, access-controlled database
- [ ] Mount a persistent volume/disk for `src/uploads` (see `DEPLOYMENT.md`)
- [ ] Set `CSRF_STRICT=true` once frontend sends `x-csrf-token`
- [ ] Confirm the Python OCR service reachable at `PYTHON_SERVICE_URL` is
      running a version that returns `qrCodes`/`barcodes` in its response
      (see `PYTHON_API.md`); older deployments that only return OCR text
      still work, but scans against them will simply have empty
      `qrCodes`/`barcodes` arrays

## Security

- [ ] Confirm no password fields/endpoints exist anywhere (by design)
- [ ] Confirm rate limiting is active on `/api` and auth routes
- [ ] Confirm `helmet`, CORS whitelist, mongo-sanitize, HPP are active
      (all wired in `src/app.js`)
- [ ] Review `SECURITY.md`

## Scaling

- 10–100 users: default config works as-is (single instance).
- 1,000–10,000 users: enable PM2 cluster mode (`ecosystem.config.js`),
  move rate limiting to a shared Redis store, add MongoDB read replicas /
  connection pooling as needed, and consider migrating `UPLOAD_DRIVER` to
  `s3`/`cloudinary` (see `src/services/storage/storage.service.js`) so
  uploads aren't tied to a single instance's disk.

## Observability

- [ ] Ship Pino JSON logs (`NODE_ENV=production`) to your log aggregator
- [ ] Monitor `/health` endpoint
- [ ] Review `AuditLog` collection retention policy (currently unbounded —
      add a TTL index or scheduled archival job if required by your data
      retention policy)

## Backward compatibility (verified in this upgrade)

- [ ] Existing Google OAuth login flow unchanged
- [ ] Existing JWT/refresh flow unchanged (cookie name, claims, expiry)
- [ ] Existing RBAC roles/permissions unchanged
- [ ] Existing OCR/scan flow unchanged, with Barcode/QR Code detection
      now additionally returned and stored on every scan (see
      `OCR_ARCHITECTURE.md` and `PYTHON_API.md`)
- [ ] Existing BusinessCard/User/Company schemas backward compatible
      (only additive fields, all with safe defaults)
- [ ] Existing `/uploads/...` static file serving path unchanged
- [ ] Existing API response shape (`{success, statusCode, message, data}`)
      unchanged; only new, additive fields were introduced
