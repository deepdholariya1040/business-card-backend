# OCR Architecture

Pipeline: `ocr.controller.js` → `ocr.service.js` → `limit.service.js`
(scan-limit check) → `upload.middleware.js` (`optimizeImage`, HEIC/HEIF
conversion, resize/compress) → `scan.service.js` (calls the external
`PYTHON_SERVICE_URL` OCR microservice, which performs text recognition
**and** Barcode/QR Code detection on the same image in a single request)
→ **`ocrFieldExtractor.js`** (parses the returned OCR text into
structured fields) → `BusinessCard.create()` (persists the OCR text, the
structured fields, and the detected `qrCodes`/`barcodes` together).

## Barcode / QR Code detection

Barcode and QR Code detection is performed entirely by the external
Python OCR microservice as part of the same `/scan` request that produces
the OCR text — Node does not run any image analysis of its own for this
feature. `scan.service.js` sends the front and/or back image to the
Python service exactly once; the Python service's JSON response carries
three logically independent pieces of data: the OCR text (`ocr.*` /
top-level `frontOCRText`/`backOCRText`/`mergedOCRText`), a `qrCodes`
array, and a `barcodes` array. `ocr.service.js` reads `result.qrCodes`
and `result.barcodes` directly off the top-level response, defaulting
each to an empty array whenever the field is absent or not an array, so
the stored document is always well-formed regardless of the exact
response shape the deployed Python service version sends.

Because detection happens upstream, adding support for a new barcode
symbology or QR payload type requires a change only in the Python
service — the Node backend simply stores and returns whatever it
receives under `qrCodes`/`barcodes`. See `PYTHON_API.md` for the full
contract between the Node backend and the Python service, including the
exact JSON shape of `qrCodes[]` and `barcodes[]`.

## Field extraction (`src/modules/ocr/ocrFieldExtractor.js`)

The external OCR microservice returns raw text (`frontOCRText`,
`backOCRText`, `mergedOCRText`) and its own best-effort `parsedData`
(name/designation/company/email/phones/website/address). This upgrade
adds a Node-side extraction engine that independently derives the richer
field set from that raw text:

- **Multiple phones/emails/websites** — regex-extracted, deduplicated
  (phone dedup is digit-normalized so the same number in different
  formats, e.g. with/without a country code, isn't double-counted).
- **PAN / GST** — detected via their official Indian format regexes
  (`[A-Z]{5}[0-9]{4}[A-Z]`, GSTIN 15-char pattern), independent of any
  label being present.
- **Services / Products** — captured from labeled lines
  (`Services: ...`, `Products: ...`), split into arrays.
- **Social links** (LinkedIn/Instagram/Facebook/Twitter/WhatsApp/
  Telegram) — detected via domain patterns even without a label, and via
  `Platform: @handle` patterns when only a handle is printed.
- **UPI** — detected by known PSP handle suffixes (`@okaxis`, `@ybl`,
  `@paytm`, etc.), so a UPI VPA isn't mistaken for an email address.
- **Any other `Label: value` line** that isn't one of the above is
  stored verbatim as `dynamicFields[Label]` — this is what guarantees an
  unrecognized field is captured instead of silently dropped.
- **Anything left over** (unlabeled lines not otherwise captured, e.g.
  name/title lines) is preserved in `dynamicFields.uncategorizedText`, so
  no OCR text is ever discarded.

`ocr.service.js` merges the extractor's output with the OCR provider's own
`parsedData` (provider's values win where both exist) and stores the full
raw provider response verbatim in `rawOCR` for audit/reprocessing.

This was verified against multiple simulated card layouts (rich labeled
layout, unlabeled layout, and a legacy simple layout) — see the upgrade
report for the actual extraction output and Mongoose-validated document
shapes.

## Data model (`businessCard.model.js`)

**Existing fields (unchanged):** `frontImage`, `backImage`, `frontOCRText`,
`backOCRText`, `mergedOCRText`, `parsedData.{name, designation, company,
email, phones, website, address}`.

**New, additive fields** (default to empty/null on every existing record —
no migration required, nothing is removed or renamed):

```json
{
  "phones": [],
  "emails": [],
  "websites": [],
  "dynamicFields": { "PAN": "", "GST": "", "Services": [], "Instagram": "", "WhatsApp": "", "UPI": "" },
  "rawOCR": null,
  "ocrProvider": "default",
  "qrCodes": [],
  "barcodes": [],
  "isDeleted": false,
  "deletedAt": null
}
```

- `dynamicFields` is a free-form map (`Mixed` type, schema option
  `minimize: false` so it always serializes as `{}` rather than being
  stripped from responses when empty) — supports unlimited custom keys
  per card without further schema changes.
- `rawOCR` retains the OCR provider's full raw response for audit/
  reprocessing/future-provider-migration purposes.
- `ocrProvider` future-proofs swapping/mixing OCR engines later.
- `qrCodes` / `barcodes` hold every QR code or barcode detected in the
  front or back image, exactly as returned by the Python OCR service
  (see `DATABASE_SCHEMA.md` for the per-entry shape and `PYTHON_API.md`
  for the full response contract). Both default to an empty array on
  every record, including cards scanned before this feature existed.

## Image URLs

`frontImage`/`backImage` continue to be written to disk and stored exactly
as before. A response mapper (`responseMapper.middleware.js`) computes
correct `frontImageUrl`/`backImageUrl` on every API response based on the
current request's host (or `SERVER_URL` if set), fixing broken/incorrect
URLs across localhost, LAN, Docker, and reverse-proxy deployments — see
`SECURITY.md` and `DEPLOYMENT.md`.

## Scan limits

`limit.service.js` logic (daily/monthly/yearly counting per user or per
company) is unchanged. `DEFAULT_*_SCAN_LIMIT_*` env vars (see
`ENVIRONMENT_VARIABLES.md`) are available for seeding new
users/companies with configurable starting limits.
