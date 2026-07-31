# API Documentation

Complete reference for every API exposed by this backend. Use this file
if you are integrating a frontend or another backend service without
reading the source code. A live, auto-generated Swagger UI is also
available at `GET /api-docs` and can be used to try requests directly.

- **Base URL:** `{SERVER_URL}/api` (an identical `/api/v1` alias exists)
- **Response envelope (all endpoints, success and error):**

```json
{ "success": true, "statusCode": 200, "message": "...", "data": { } }
```
```json
{ "success": false, "statusCode": 400, "message": "..." }
```

- **Authentication header** (unless noted otherwise):
  `Authorization: Bearer <accessToken>`
- **Roles:** `SUPER_ADMIN`, `MAIN_COMPANY_ADMIN`, `COMPANY_ADMIN`, `STAFF`, `NORMAL_USER`
- Every list/detail response below has already had internal-only fields
  removed by the global response mapper: `refreshToken`, `otpHash`, `otp`,
  and Mongoose's `__v` never appear in any API response, regardless of module.

---

## 1. Auth (`/auth`)

### 1.1 `GET /auth/google`
Starts Google OAuth login. No auth required. Browser redirect only (not
called via `fetch`/`axios`) — it forwards the user to Google's consent
screen.

### 1.2 `GET /auth/google/callback`
Google OAuth redirect target. No auth required (Google supplies the
identity). On success, sets an httpOnly `refreshToken` cookie and
redirects the browser to `${CLIENT_URL}/#token=<accessToken>`.

### 1.3 `POST /auth/otp/register/send`
Request an OTP to create a new Email/OTP account.
- **Auth:** none
- **Rate limit:** `AUTH_RATE_LIMIT_MAX` per `AUTH_RATE_LIMIT_WINDOW_MINUTES` (IP) and `OTP_MAX_PER_HOUR` (IP + email)
- **Body:** `{ "name": "string, required", "email": "string, required" }`
- **Validation:** 400 if `name` or `email` missing; 409 if an account with that email already exists
- **Success (200):** `{ "data": { "email": "...", "expiresInSeconds": 300 } }` — no OTP code is ever returned in the response, it is emailed only
- **Errors:** `400` missing fields, `409` account exists, `429` rate-limited

### 1.4 `POST /auth/otp/register/verify`
Verify the OTP and create the account + session.
- **Auth:** none
- **Body:** `{ "email": "string, required", "otp": "string, required" }`
- **Success (201):** `{ "data": { "user": { ... }, "accessToken": "..." } }`; also sets the `refreshToken` httpOnly cookie
- **Errors:** `400` missing fields / invalid or expired OTP, `429` too many attempts

### 1.5 `POST /auth/otp/login/send`
Request an OTP to log in to an existing Email/OTP account.
- **Auth:** none
- **Rate limit:** same as 1.3
- **Body:** `{ "email": "string, required" }`
- **Errors:** `400` missing email, `403` account deactivated, `404` no account with that email, `429` rate-limited

### 1.6 `POST /auth/otp/login/verify`
Verify the OTP and log in.
- **Auth:** none
- **Body:** `{ "email": "string, required", "otp": "string, required" }`
- **Success (200):** `{ "data": { "user": { ... }, "accessToken": "..." } }`; also sets the `refreshToken` cookie
- **Errors:** `400` missing fields / invalid or expired OTP

### 1.7 `GET /auth/me`
Returns the currently authenticated user.
- **Auth:** required (Bearer)
- **Success (200):** `{ "data": { "_id", "name", "email", "role", "companyId", "tenantId", "canManageStaff", "isActive", ... } }` — never includes `refreshToken`

### 1.8 `GET /auth/csrf-token`
Issues a CSRF token for the cookie-authenticated endpoints below.
- **Auth:** none
- **Success (200):** `{ "data": { "csrfToken": "..." } }`; also sets a readable `csrfToken` cookie
- **Notes:** call this once, then send the value back in the `x-csrf-token` header on `/auth/refresh` and `/auth/logout`

### 1.9 `POST /auth/refresh`
Rotates the access token using the httpOnly `refreshToken` cookie.
- **Auth:** refresh cookie only (no Bearer header)
- **Headers:** `x-csrf-token: <token from 1.8>` (enforced once `CSRF_STRICT=true`)
- **Success (200):** `{ "data": { "accessToken": "..." } }`; rotates the `refreshToken` cookie
- **Errors:** `401` missing/invalid/expired refresh token, `403` CSRF mismatch (strict mode)

### 1.10 `POST /auth/logout`
Clears the session.
- **Auth:** required (Bearer) + CSRF header (see 1.9)
- **Success (200):** clears the `refreshToken` cookie, invalidates the stored refresh token server-side

---

## 2. Users (`/users`)

All routes require `Authorization: Bearer <accessToken>`.

### 2.1 `GET /users`
Lists `NORMAL_USER` accounts only (not company staff — see 2.2 for those).
- **Role required:** `SUPER_ADMIN`
- **Errors:** `403` any other role
- **Success (200):** array of users, `refreshToken` excluded

### 2.2 `GET /users/company-users`
Lists users belonging to a company, scoped by the caller's role.
- **Roles:** `SUPER_ADMIN`, `MAIN_COMPANY_ADMIN`, `COMPANY_ADMIN`
- **Query params:**
  | Param | Type | Notes |
  |---|---|---|
  | `companyId` | string | `SUPER_ADMIN` only — filter to one company. Ignored (forced to caller's own company) for admin roles. |
  | `role` | string | Filter by role. `COMPANY_ADMIN` is always forced to `STAFF` regardless of this value. |
- **Tenant isolation:** `MAIN_COMPANY_ADMIN`/`COMPANY_ADMIN` can only ever see their own `companyId`; `COMPANY_ADMIN` can only ever see `STAFF` users.
- **Errors:** `403` for `STAFF`/`NORMAL_USER`

### 2.3 `GET /users/:id/cards`
Returns every business card scanned by a given user.
- **URL param:** `id` — target user's Mongo `_id`
- **Access rule:** `SUPER_ADMIN`, same-company admin/staff, or the user themselves. All other callers get `403`.
- **Errors:** `404` user not found, `403` access denied

### 2.4 `GET /users/:id`
Returns a single user profile plus their scan counters (`totalCards`, `todayScans`, `monthlyScans`, `yearlyScans`).
- **Access rule:** `SUPER_ADMIN`, same company, or self. Otherwise `403`.
- **Errors:** `404` not found, `403` access denied

### 2.5 `POST /users`
Creates a user. The allowed target `role` depends on the caller's own role (strict role-ladder — no privilege escalation possible):

| Caller role | May create |
|---|---|
| `SUPER_ADMIN` | `MAIN_COMPANY_ADMIN` only |
| `MAIN_COMPANY_ADMIN` | `COMPANY_ADMIN` only |
| `COMPANY_ADMIN` (with `canManageStaff`) | `STAFF` only |
| anyone else | `403` |

- **Body:** `{ "name": "string, required", "email": "string, required, unique", "role": "string, required — must match table above", "companyId": "string, optional", "canManageStaff": "boolean, optional" }`
- **Errors:** `409` email already exists, `403` role not allowed for caller / `canManageStaff` false, `404` companyId not found, `400` Company Admin/Staff limit reached

### 2.6 `PUT /users/:id`
Updates editable fields on a user. `email`, `role`, `googleId`, `companyId`, `tenantId`, `createdBy`, and `previousRole` are always stripped from the request body server-side and can never be changed through this endpoint (mass-assignment protection).
- **Access rule:** same as 2.4
- **Errors:** `404` not found, `403` access denied

### 2.7 `DELETE /users/:id`
Permanently deletes a user record.
- **Access rule:** `SUPER_ADMIN` or same company
- **Errors:** `404` not found, `403` access denied

---

## 3. Companies (`/companies`)

All routes require `Authorization: Bearer <accessToken>`. Authorization
for every endpoint below is enforced inside the service layer (not just
the route), so it applies no matter which alias/prefix is used.

### 3.1 `GET /companies`
- **Role scope:** `SUPER_ADMIN` sees all companies; every other role sees only their own company (or an empty result if not attached to one).

### 3.2 `GET /companies/search`
- **Role required:** `SUPER_ADMIN`
- **Query params:** `keyword` (name, case-insensitive), `email` (main admin email, case-insensitive), `status` (`active` | `blocked` | `expired`)
- **Errors:** `403` non-Super-Admin

### 3.3 `GET /companies/stats`
- **Role required:** `SUPER_ADMIN`
- **Success (200):** `{ totalCompanies, activeCompanies, blockedCompanies, expiredCompanies, totalUsers }`

### 3.4 `GET /companies/:id/users`
- **Access rule:** `SUPER_ADMIN` or same company
- **Success (200):** users with only `name email role avatar isActive` selected

### 3.5 `GET /companies/:id`
- **Access rule:** `SUPER_ADMIN` or same company
- **Errors:** `404` not found, `403` access denied

### 3.6 `POST /companies`
Creates a new company and promotes an existing user to its Main Company Admin.
- **Role required:** `SUPER_ADMIN`
- **Body:** `{ "name": "string, required", "mainAdminEmail": "string, required — must be an existing user's email", ...other company fields }`
- **Errors:** `404` `mainAdminEmail` not found, `403` non-Super-Admin

### 3.7 `PUT /companies/:id`
- **Role required:** `SUPER_ADMIN`
- **Errors:** `404` not found, `403` non-Super-Admin

### 3.8 `DELETE /companies/:id`
Deactivates (soft-blocks) a company: sets `isActive: false` and demotes every user in that company to `NORMAL_USER` (their prior role is retained internally so `PUT /companies/:id/recover` can restore it).
- **Role required:** `SUPER_ADMIN`

### 3.9 `PUT /companies/:id/recover`
Reactivates a previously deactivated company and restores affected users' prior roles.
- **Role required:** `SUPER_ADMIN`

### 3.10 `PUT /companies/:id/change-main-admin`
- **Role required:** `SUPER_ADMIN`
- **Body:** `{ "email": "string, required — existing user's email" }`
- **Errors:** `400` missing email, `404` company or user not found

### 3.11 `POST /companies/:id/admins`
Promotes an existing user to `COMPANY_ADMIN` within the company.
- **Role required:** `MAIN_COMPANY_ADMIN`, and only for their own company
- **Body:** `{ "email": "string, required" }`
- **Errors:** `403` wrong role or wrong company, `400` Company Admin limit reached (`maxCompanyAdmins`), `404` user not found

### 3.12 `DELETE /companies/:id/admins/:userId`
Demotes a Company Admin back to `NORMAL_USER`.
- **Role required:** `MAIN_COMPANY_ADMIN`, same company as the target user

### 3.13 `POST /companies/:id/staff`
Promotes an existing user to `STAFF`.
- **Role required:** `MAIN_COMPANY_ADMIN` or `COMPANY_ADMIN`, same company
- **Body:** `{ "email": "string, required" }`
- **Errors:** `400` staff limit reached (`maxStaff`), `404` user not found

### 3.14 `DELETE /companies/:id/staff/:userId`
Demotes a staff member back to `NORMAL_USER`.
- **Role required:** `MAIN_COMPANY_ADMIN` or `COMPANY_ADMIN`, same company

### 3.15 `PUT /companies/:id/subscription`
- **Role required:** `SUPER_ADMIN`
- **Body:** `{ "expiryDate": "ISO date, optional", "startDate": "ISO date, optional" }`

### 3.16 `PUT /companies/:id/users/:userId/role`
Changes a user's role within the company, with escalation guards:
- **Role required:** `SUPER_ADMIN`, or the company's own `MAIN_COMPANY_ADMIN`
- **Body:** `{ "role": "one of MAIN_COMPANY_ADMIN | COMPANY_ADMIN | STAFF" }`
- **Guards:** a `MAIN_COMPANY_ADMIN` cannot change their own role, cannot assign `MAIN_COMPANY_ADMIN` to anyone, and cannot modify another `MAIN_COMPANY_ADMIN`
- **Errors:** `400` invalid role, `403` any guard violated, `404` user not found

---

## 4. OCR (`/ocr`)

### 4.1 `POST /ocr/scan`
Scans a business card image (front and/or back), runs OCR + barcode/QR
detection, and creates a `BusinessCard` record.
- **Auth:** required (Bearer)
- **Headers:** `Content-Type: multipart/form-data`
- **Body fields (multipart):**
  | Field | Type | Required | Notes |
  |---|---|---|---|
  | `frontImage` | file | conditionally required | JPG/JPEG/PNG/WEBP/BMP/TIFF/TIF/HEIC/HEIF/AVIF, max 10 MB |
  | `backImage` | file | conditionally required | same rules |
- At least one of the two files must be present.
- **Errors:** `400` neither file supplied / unsupported file type / over size limit, `403` scan limit reached for the user or company
- **Success (200):** the created `BusinessCard` (see §5 for the full shape) including `frontImageUrl`/`backImageUrl`, `parsedData`, `qrCodes`, `barcodes`. Internal OCR metadata (`rawOCR`, `ocrProvider`, raw text fields) is stripped by `businessCard.service.js`'s sanitizer before the response leaves the server.

---

## 5. Business Cards (`/business-cards`)

All routes require `Authorization: Bearer <accessToken>`.

### 5.1 `GET /business-cards`
Lists cards visible to the caller.
- **Query params:**
  | Param | Type | Notes |
  |---|---|---|
  | `search` | string | matches name/designation/company/email/website/address/phones (case-insensitive) |
  | `companyId` | string | `SUPER_ADMIN` only |
  | `role` | string | filter by the scanning user's role, scoped to the caller's own company for non-Super-Admins |
  | `createdBy` | string \| `"all"` | filter to one scanning user; validated against company membership for admin roles |
- **Visibility by role:**
  | Role | Sees |
  |---|---|
  | `SUPER_ADMIN` | own cards by default; all cards once any filter (`companyId`/`role`/`createdBy`) is supplied |
  | `MAIN_COMPANY_ADMIN` | every card created by anyone in their company |
  | `COMPANY_ADMIN` | their own cards + cards created by `STAFF` in their company |
  | `STAFF` / `NORMAL_USER` | only their own cards |

### 5.2 `GET /business-cards/:id`
- **Access rule:** enforced by `canAccessCard()` — same visibility table as 5.1, evaluated per-record
- **Errors:** `404` not found, `403` access denied

### 5.3 `PUT /business-cards/:id`
Updates editable fields (e.g. corrected `parsedData`) on a card.
- **Access rule:** same as 5.2

### 5.4 `DELETE /business-cards/:id`
Soft-deletes a card (`isDeleted: true`); it no longer appears in list results.
- **Access rule:** same as 5.2

### Business card response shape (all of 5.1–5.3 and §4.1)
```json
{
  "_id": "665f1c2a9b1e4a0012a34567",
  "tenantId": "665f1c2a9b1e4a0012a30001",
  "companyId": "665f1c2a9b1e4a0012a30001",
  "createdBy": "665f1c2a9b1e4a0012a30099",
  "frontImage": "front/6d1f...-optimized.jpg",
  "frontImageUrl": "https://api.example.com/uploads/front/6d1f...-optimized.jpg",
  "backImage": "back/9a2e...-optimized.jpg",
  "backImageUrl": "https://api.example.com/uploads/back/9a2e...-optimized.jpg",
  "parsedData": {
    "name": "John Mehta",
    "designation": "Sales Manager",
    "company": "Acme Traders",
    "email": "john.mehta@acme.com",
    "phones": ["+91 9876543210"],
    "website": "",
    "address": ""
  },
  "dynamicFields": { "Services": ["Web Design", "SEO", "Hosting"] },
  "qrCodes": [{ "type": "QR_CODE", "dataType": "URL", "content": "https://acmetraders.com/contact/john" }],
  "barcodes": [{ "type": "CODE128", "content": "8901234567890" }],
  "isDeleted": false,
  "createdAt": "2026-07-25T09:12:44.201Z",
  "updatedAt": "2026-07-25T09:12:44.201Z"
}
```
`rawOCR`, `frontOCRText`, `backOCRText`, `mergedOCRText`, `ocrProvider`, and
any internal keys inside `dynamicFields` (`uncategorizedText`, `provider`,
`confidence`, etc.) are removed before this object ever reaches the client.

---

## 6. Dashboard (`/dashboard`)

### 6.1 `GET /dashboard`
Returns usage statistics scoped to the caller.
- **Auth:** required (Bearer)
- **Scope by role:**
  | Role | Scope |
  |---|---|
  | `SUPER_ADMIN` | global totals across every company/user |
  | `MAIN_COMPANY_ADMIN` / `COMPANY_ADMIN` / `STAFF` | totals for their own company only |
  | `NORMAL_USER` | totals for themselves only |
- **Success (200):** `{ totalUsers, totalCompanies, totalCards, todayScans, monthlyScans, yearlyScans, limits: { daily, monthly, yearly } }`

---

## 7. Audit Logs (`/audit-logs`)

### 7.1 `GET /audit-logs`
- **Role required:** `SUPER_ADMIN`, `MAIN_COMPANY_ADMIN`, `COMPANY_ADMIN`
- **Scope:** `SUPER_ADMIN` sees every log; all other allowed roles are automatically filtered to their own `companyId` — this filter cannot be overridden by any request parameter.
- **Success (200):** array of `{ actorId: { name, email }, actorRole, action, targetId, tenantId, companyId, ip, userAgent, createdAt }`
- **Errors:** `403` for `STAFF`/`NORMAL_USER`

---

## Rate Limits

| Scope | Limit |
|---|---|
| Global (`/api/*`) | `RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW_MINUTES`, per IP |
| Auth endpoints | `AUTH_RATE_LIMIT_MAX` per `AUTH_RATE_LIMIT_WINDOW_MINUTES`, per IP |
| OTP send endpoints | `OTP_MAX_PER_HOUR`, keyed by IP + email |

All limiter values are configured via environment variables — see `ENVIRONMENT_VARIABLES.md`.

## Standard Error Codes

| Status | Meaning |
|---|---|
| 400 | Validation failure / malformed request |
| 401 | Missing, invalid, or expired token |
| 403 | Authenticated but not authorized (role, tenant, or ownership check failed) |
| 404 | Resource not found |
| 409 | Conflict (duplicate email, etc.) |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error (message is generic in production; no stack trace, DB error, or file path is ever exposed) |
