# Python Integration Guide

This file is specifically for a Python client using the `requests`
library. It complements `API_DOCUMENTATION.md` (read that first for
full field/validation/role details for every endpoint) with concrete
Python examples.

**Important:** the backend returns the same raw, structured JSON to
every client — Node/React frontend or Python. Nothing here is
formatted, transformed, or parsed specifically for Python. All parsing,
mapping, and post-processing of the response bodies below is expected
to happen in your Python application, not on the server.

## Base setup

```python
import requests

BASE_URL = "https://api.yourdomain.com/api"  # or /api/v1 — identical

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})
```

## Response envelope

Every endpoint returns this shape — check `success` before reading `data`:

```python
def unwrap(response: requests.Response):
    body = response.json()
    if not body.get("success"):
        raise RuntimeError(f"{response.status_code}: {body.get('message')}")
    return body.get("data")
```

## Authentication flow

There is no password grant. Pick one of two flows:

### Option A — Email OTP (recommended for a headless Python client)

```python
# 1. Request an OTP (for an existing account)
r = session.post(f"{BASE_URL}/auth/otp/login/send", json={"email": "user@example.com"})
unwrap(r)  # OTP is emailed to the user, not returned in the response

# 2. User supplies the code they received by email
otp_code = input("Enter the OTP sent to your email: ")

r = session.post(
    f"{BASE_URL}/auth/otp/login/verify",
    json={"email": "user@example.com", "otp": otp_code},
)
data = unwrap(r)
access_token = data["accessToken"]

session.headers.update({"Authorization": f"Bearer {access_token}"})
```

Registration works the same way, using `/auth/otp/register/send` and
`/auth/otp/register/verify` (which also requires `name` on the send step).

### Option B — Google OAuth

Google OAuth is browser-driven (`/auth/google` → Google's consent screen
→ `/auth/google/callback`) and is not practical to drive from a headless
`requests` script. If your Python process needs to act as a specific
user, use Option A, or have that user complete the OAuth flow once in a
browser and hand your script the resulting `accessToken`.

### Refreshing the access token

The refresh flow is cookie-based, so use a `requests.Session()` (as set
up above) so cookies persist across calls.

```python
# One-time: fetch a CSRF token (also stored as a cookie in the session)
r = session.get(f"{BASE_URL}/auth/csrf-token")
csrf_token = unwrap(r)["csrfToken"]

# When the access token expires:
r = session.post(
    f"{BASE_URL}/auth/refresh",
    headers={"x-csrf-token": csrf_token},
)
new_access_token = unwrap(r)["accessToken"]
session.headers.update({"Authorization": f"Bearer {new_access_token}"})
```

### Logout

```python
session.post(f"{BASE_URL}/auth/logout", headers={"x-csrf-token": csrf_token})
```

### `GET /auth/me`

```python
r = session.get(f"{BASE_URL}/auth/me")
current_user = unwrap(r)
```

**Error responses** for all auth endpoints follow the standard envelope,
e.g.:
```json
{ "success": false, "statusCode": 401, "message": "Invalid or expired refresh token." }
```

---

## Users

```python
# List company users (role-scoped automatically by the server)
r = session.get(f"{BASE_URL}/users/company-users", params={"role": "STAFF"})
users = unwrap(r)

# Single user profile + scan counters
r = session.get(f"{BASE_URL}/users/{user_id}")
user = unwrap(r)

# Cards scanned by one user
r = session.get(f"{BASE_URL}/users/{user_id}/cards")
cards = unwrap(r)

# Create a user (allowed target role depends on the caller's own role — see API_DOCUMENTATION.md)
r = session.post(
    f"{BASE_URL}/users",
    json={"name": "Priya Shah", "email": "priya@acme.com", "role": "STAFF", "companyId": company_id},
)
new_user = unwrap(r)

# Update a user
r = session.put(f"{BASE_URL}/users/{user_id}", json={"name": "Priya S."})
updated_user = unwrap(r)

# Delete a user
r = session.delete(f"{BASE_URL}/users/{user_id}")
unwrap(r)
```

**Status codes:** `200` (GET/PUT/DELETE), `201` handled elsewhere for
user creation this endpoint returns `201`, `400` validation, `403`
role/tenant denied, `404` not found, `409` duplicate email.

---

## Companies

```python
# List companies visible to the caller
r = session.get(f"{BASE_URL}/companies")
companies = unwrap(r)

# Search (Super Admin only)
r = session.get(f"{BASE_URL}/companies/search", params={"keyword": "acme", "status": "active"})
results = unwrap(r)

# Company stats (Super Admin only)
r = session.get(f"{BASE_URL}/companies/stats")
stats = unwrap(r)

# Create a company (Super Admin only)
r = session.post(
    f"{BASE_URL}/companies",
    json={"name": "Acme Traders", "mainAdminEmail": "founder@acme.com"},
)
company = unwrap(r)

# Add staff to a company (Main Company Admin / Company Admin)
r = session.post(f"{BASE_URL}/companies/{company_id}/staff", json={"email": "staff@acme.com"})
staff_user = unwrap(r)

# Change a user's role within a company
r = session.put(
    f"{BASE_URL}/companies/{company_id}/users/{user_id}/role",
    json={"role": "COMPANY_ADMIN"},
)
updated_user = unwrap(r)
```

See `API_DOCUMENTATION.md` §3 for the full list of 16 company endpoints,
their required roles, and every error case.

---

## OCR scan

`multipart/form-data` uploads — do not set `Content-Type` manually, let
`requests` set the multipart boundary:

```python
with open("front.jpg", "rb") as front, open("back.jpg", "rb") as back:
    r = session.post(
        f"{BASE_URL}/ocr/scan",
        files={
            "frontImage": ("front.jpg", front, "image/jpeg"),
            "backImage": ("back.jpg", back, "image/jpeg"),
        },
    )
card = unwrap(r)

print(card["parsedData"])   # {"name": ..., "designation": ..., "phones": [...], ...}
print(card["qrCodes"])      # []  or list of detected QR codes
print(card["barcodes"])     # []  or list of detected barcodes
```

At least one of `frontImage` / `backImage` is required; both may be sent
together. Max 10 MB per file. Supported extensions: `.jpg .jpeg .png
.webp .bmp .tiff .tif .heic .heif .avif`.

**Errors:**
```json
{ "success": false, "statusCode": 400, "message": "At least one image (front or back) is required." }
```
```json
{ "success": false, "statusCode": 403, "message": "Scan limit reached." }
```
(exact limit message depends on `limit.service.js` / configured `DEFAULT_*_SCAN_LIMIT_*` values)

---

## Business cards

```python
# List (with search + filters)
r = session.get(f"{BASE_URL}/business-cards", params={"search": "acme"})
cards = unwrap(r)

# Single card
r = session.get(f"{BASE_URL}/business-cards/{card_id}")
card = unwrap(r)

# Update
r = session.put(
    f"{BASE_URL}/business-cards/{card_id}",
    json={"parsedData": {"name": "Corrected Name"}},
)
updated_card = unwrap(r)

# Delete (soft-delete)
r = session.delete(f"{BASE_URL}/business-cards/{card_id}")
unwrap(r)
```

`data` for these endpoints is always the raw `BusinessCard` document
shape shown in `API_DOCUMENTATION.md` §5 — parse `parsedData`,
`dynamicFields`, `qrCodes`, and `barcodes` however your application
needs; the server does not reshape this for you.

---

## Dashboard

```python
r = session.get(f"{BASE_URL}/dashboard")
stats = unwrap(r)
# {"totalUsers": ..., "totalCompanies": ..., "totalCards": ...,
#  "todayScans": ..., "monthlyScans": ..., "yearlyScans": ...,
#  "limits": {"daily": ..., "monthly": ..., "yearly": ...}}
```

---

## Audit logs

```python
r = session.get(f"{BASE_URL}/audit-logs")
logs = unwrap(r)
# list of {"actorId": {"name": ..., "email": ...}, "actorRole": ...,
#          "action": ..., "targetId": ..., "companyId": ...,
#          "ip": ..., "userAgent": ..., "createdAt": ...}
```

`SUPER_ADMIN` sees every log; every other allowed role (`MAIN_COMPANY_ADMIN`,
`COMPANY_ADMIN`) is server-side restricted to their own company — there is
no query parameter that can widen this.

---

## Error handling pattern

```python
def call(method, path, **kwargs):
    r = session.request(method, f"{BASE_URL}{path}", **kwargs)
    body = r.json()
    if not body.get("success"):
        # body: {"success": False, "statusCode": ..., "message": ...}
        raise RuntimeError(f"[{body.get('statusCode', r.status_code)}] {body.get('message')}")
    return body.get("data")
```

Status codes you should branch on: `401` (access token expired — refresh
and retry once), `403` (permission/tenant denied — do not retry), `404`
(resource missing), `429` (back off and retry later per `Retry-After`
if present).

## Notes

- All timestamps are ISO 8601 UTC strings (`createdAt`, `updatedAt`).
- All Mongo IDs are plain 24-character hex strings (already converted
  from `ObjectId` server-side) — no special parsing required.
- Image fields come in pairs: a stored relative path (`frontImage`,
  `backImage`) and a ready-to-use absolute URL (`frontImageUrl`,
  `backImageUrl`). Use the `*Url` field directly; the non-`Url` field is
  a storage-internal path and is not guaranteed to be fetchable directly.
- Nothing in this document changes based on the caller being a Python
  script versus the existing frontend — the JSON is identical either way.
