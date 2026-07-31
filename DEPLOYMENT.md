# Deployment

## Important: uploaded images must persist

The app stores images on local disk (`src/uploads/originals`), served at
`/uploads/...`. On any platform with ephemeral filesystems, mount a
persistent volume/disk at that path or images will be lost on redeploy.

## Docker

```bash
docker compose up -d --build
```

This starts the backend + a MongoDB container, with a named volume
(`uploads-data`) so images survive container restarts/rebuilds. Set your
real secrets in `.env` (loaded via `env_file` in `docker-compose.yml`).

## Railway / Render

1. Connect the repo, set the build command to `npm ci` and start command to
   `npm start` (or let the platform auto-detect via `package.json`).
2. Add a **persistent volume** mounted at `src/uploads` (Railway: Volumes tab;
   Render: Disks) — without this, uploaded images disappear on every deploy.
3. Set all variables from `.env.example` in the platform's environment
   variable settings. Set `SERVER_URL` to your public HTTPS URL so image
   URLs are always correct (falls back to request-derived host if unset).
4. Update `GOOGLE_CALLBACK_URL` to the platform's public URL.

## VPS / Oracle Cloud / AWS EC2 (PM2 + Nginx)

```bash
npm ci --omit=dev
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Put Nginx in front (see `nginx.conf`) to terminate TLS and reverse-proxy to
the Node process. Nginx forwards `X-Forwarded-Proto`/`X-Forwarded-Host`,
which the app uses (via `trust proxy`) to build correct image URLs and
detect HTTPS for secure cookies.

> **Note on PM2 cluster mode:** the built-in rate limiters use in-memory
> state. If you run more than one PM2 instance, each process has its own
> counters (effectively multiplying the limits). For strict, shared rate
> limiting across instances, back `express-rate-limit` with a Redis store
> (`rate-limit-redis`) — not required for a single instance.

## Environment parity checklist

- [ ] `MONGODB_URI` points to a reachable, backed-up database
- [ ] `SERVER_URL` set to the public backend URL
- [ ] `PYTHON_SERVICE_URL` points to a reachable Python OCR microservice
      that supports OCR text recognition and Barcode/QR Code detection
      (see `PYTHON_API.md`); the two services are typically deployed as
      separate processes/containers, so this URL will not be `localhost`
      in most production topologies
- [ ] `CLIENT_URL` / `CORS_ALLOWED_ORIGINS` match the real frontend origin(s)
- [ ] `GOOGLE_CALLBACK_URL` matches what's registered in Google Cloud Console
- [ ] SMTP configured (Email OTP won't actually send email otherwise)
- [ ] `NODE_ENV=production`
- [ ] Uploads volume/disk is persistent
