# Database Schema

MongoDB via Mongoose. All existing collections/fields/relationships are
unchanged; only additive fields and indexes were introduced.

## User (`users`)

Existing: `googleId, name, email(unique), avatar, role, previousRole,
tenantId→Company, companyId→Company, createdBy→User, canManageStaff,
scanLimits{daily,monthly,yearly}, customLimits{enabled,daily,monthly,yearly},
isActive, timestamps`.

New: `provider (GOOGLE|EMAIL, default GOOGLE)`, `isVerified (default true)`,
`refreshToken (select:false — was referenced in code but missing from the
original schema; now persists correctly)`, `lastLoginAt`, `lastLoginIp`,
`lastLoginDevice`.

New indexes: `{companyId, role}`, `{tenantId}`, `{provider}`.

## Company (`companies`)

Unchanged fields/relationships. New index: `{isActive}`.

## BusinessCard (`businesscards`)

Existing: `tenantId→Company, companyId→Company, createdBy→User, frontImage,
backImage, frontOCRText, backOCRText, mergedOCRText,
parsedData{name,designation,company,email,phones,website,address},
timestamps`.

New (all additive, see `OCR_ARCHITECTURE.md`): `phones[], emails[],
websites[], dynamicFields (Mixed), rawOCR (Mixed), ocrProvider, isDeleted,
deletedAt`.

Also new: `qrCodes[]` and `barcodes[]`, populated whenever the Python OCR
microservice detects a QR code or a barcode in the front or back image of
the card (see `PYTHON_API.md` for the exact contract with that service).
Both default to an empty array, so existing records and records scanned
before this feature was added remain valid without any migration or
backfill.

```
qrCodes: [
  {
    type: String (default "QR_CODE"),
    dataType: String (default "TEXT"),  // e.g. TEXT, URL, VCARD, EMAIL
    content: String (default ""),        // decoded, human-readable value
    raw: String (default "")             // raw decoded payload as returned by the scanner
  }
]

barcodes: [
  {
    type: String (default "UNKNOWN"),   // barcode symbology, e.g. CODE128, EAN13, UPC_A
    content: String (default ""),
    raw: String (default "")
  }
]
```

Each entry in `qrCodes` or `barcodes` corresponds to one detected symbol;
a single image containing multiple codes produces multiple array
entries. Both arrays are read verbatim from the Python OCR service's
response and are not modified, deduplicated, or reprocessed by the
backend.

New indexes: `{companyId, createdAt}`, `{tenantId, createdAt}`,
`{createdBy, createdAt}`, `{isDeleted}`, and a text index across
`mergedOCRText`/`parsedData.name`/`parsedData.company` for search.

## AuditLog (`auditlogs`)

Unchanged fields: `actorId→User, actorRole, action, targetId, tenantId,
companyId, ip, userAgent, timestamps`.

New indexes: `{actorId, createdAt}`, `{companyId, createdAt}`,
`{tenantId, createdAt}`, `{action, createdAt}`.

## Otp (`otps`) — new collection

```
email, otpHash (sha256), purpose (REGISTER|LOGIN), pendingName,
attempts, maxAttempts, consumed, ip, userAgent, expiresAt, timestamps
```

TTL index on `expiresAt` (`expireAfterSeconds: 0`) — MongoDB automatically
deletes expired OTP documents, no cleanup job required. Compound index on
`{email, purpose, createdAt}` for fast "latest OTP" lookups.

## Relationships (unchanged)

`User.companyId/tenantId → Company._id`, `BusinessCard.companyId/tenantId →
Company._id`, `BusinessCard.createdBy → User._id`, `AuditLog.actorId →
User._id`.
