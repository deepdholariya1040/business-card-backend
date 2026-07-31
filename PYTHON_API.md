# Python OCR Service — Integration Specification

## Purpose

The Python service is a standalone microservice responsible for all
image-understanding work performed on a scanned business card. It is
called by the Node.js backend (`src/modules/ocr/scan.service.js`) exactly
once per `/api/ocr/scan` request and is expected to return, in a single
JSON response, three independent results derived from the submitted
image(s):

1. **OCR text recognition** — the raw text printed on the front and/or
   back of the card.
2. **QR Code detection** — the decoded content and payload type of every
   QR code found in either image.
3. **Barcode detection** — the decoded content and symbology of every
   linear or 2D barcode (other than a QR code) found in either image.

The Node backend performs no image analysis itself. It resizes/optimizes
the images before sending them (see "Image preprocessing performed by
Node" below) and, on the way back, stores whatever the Python service
returns onto the `BusinessCard` document essentially unmodified — merging
in a Node-side text-parsing pass (`ocrFieldExtractor.js`) that derives
additional structured fields (phones, emails, PAN, GST, social handles,
etc.) purely from the OCR text the Python service returned. The Python
service therefore does not need to know anything about business-card
field extraction, multi-tenancy, authentication, or the database schema —
its sole responsibility is turning an image into text, QR data, and
barcode data.

This document is written so that a Python developer can implement or
re-implement the service without reading any of the Node.js source code.
It describes only the HTTP contract between the two services.

## How the backend communicates with the Python service

The Node backend reads the Python service's base URL from the
`PYTHON_SERVICE_URL` environment variable (see `ENVIRONMENT_VARIABLES.md`)
and issues a single HTTP request to that exact URL for every scan. There
is no service discovery, retry queue, or asynchronous callback — the
request is synchronous: the Node backend waits for the Python service's
HTTP response before it continues processing the scan, and the scan
request to the end user fails if the Python service does not respond
successfully.

### HTTP method

`POST` is used exclusively. The Python service must expose a single POST
endpoint at the URL configured in `PYTHON_SERVICE_URL` (for example
`http://localhost:5001/api/ocr/process` in local development) that
accepts the multipart payload described below and returns the JSON
response described below. No other HTTP methods are used by the
integration.

### Request headers

The Node backend sends the request using the `form-data` library, which
automatically sets the following header:

| Header | Value |
|---|---|
| `Content-Type` | `multipart/form-data; boundary=<generated-boundary>` |

No `Authorization` header, API key, or other authentication credential is
attached to this request by the Node backend. If the Python service needs
to be secured (recommended for any deployment where it is reachable from
outside the backend's own network), authentication should be layered on
separately — for example via network-level isolation (the Python service
listening only on an internal/private network interface or Docker
network) or a shared-secret header added on both sides. This is a
deployment decision and is not currently part of the wire contract; a
future revision of this document should be updated if a shared-secret
header is introduced.

### Multipart form-data structure

The request body is `multipart/form-data` with up to two file parts. Each
part is streamed directly from disk (the Node backend does not buffer the
entire file into memory), so the Python service should read the incoming
multipart stream rather than assuming the full body arrives at once.

| Field name | Content | Required |
|---|---|---|
| `frontImage` | Front side of the business card, as a binary image file | Present only if the caller supplied a front image |
| `backImage` | Back side of the business card, as a binary image file | Present only if the caller supplied a back image |

At least one of the two fields is always present — the Node backend
rejects the incoming client request with `400 Bad Request` before ever
calling the Python service if neither image was supplied. Both fields may
be present in the same request when the caller submitted both sides of
the card. The Python service must therefore be able to handle three valid
input combinations: front image only, back image only, or both images
together.

Each file is sent with its original filename and content type as
provided by the upload, after having already been converted to a
`.jpg`/`.jpeg` file by the Node backend (see below), so in practice the
Python service will always receive a JPEG payload for each part it
receives, encoded as standard binary image bytes — not base64.

### Image preprocessing performed by Node

Before the request reaches the Python service, the Node backend already
performs the following on each image:

- HEIC/HEIF source images are converted to JPEG.
- The image is resized so its width does not exceed 1500 pixels (aspect
  ratio preserved, smaller images are not upscaled).
- The image is re-encoded as JPEG at quality 80.

Consequently, the Python service should assume it is always receiving a
reasonably-sized, JPEG-encoded image and does not need to implement its
own format conversion for HEIC/HEIF, TIFF, BMP, AVIF, or other formats
accepted by the original upload — Node has already normalized the file by
the time it reaches this service.

### What data the Python service receives, exactly

For a given `/ocr/scan` request, the Python service receives:

- Zero or one binary JPEG file under the `frontImage` field.
- Zero or one binary JPEG file under the `backImage` field.
- No other form fields, query parameters, JSON body, or headers carrying
  business data (no user ID, tenant ID, card ID, or any other
  application-level metadata is included in the request).

Because no identifying or contextual metadata is sent, the Python service
must be entirely stateless with respect to the caller — its only job is
to analyze the image bytes it was given and return a result for that one
request. Any business logic (which user made the request, which company
they belong to, how many scans they have left, etc.) is handled entirely
on the Node side, before and after this call.

## Processing flow from request to response

1. The Python service receives the multipart request and extracts the
   `frontImage` and/or `backImage` file(s).
2. For each image present, the service runs OCR text recognition to
   produce a text transcript of everything printed on that side of the
   card.
3. For each image present, the service independently scans for QR codes
   and decodes any that are found, including identifying the type of
   payload encoded (plain text, URL, vCard, email, etc.).
4. For each image present, the service independently scans for
   non-QR barcodes (1D symbologies such as CODE128/EAN13/UPC-A, and any
   other 2D symbologies the service supports) and decodes any that are
   found.
5. The service assembles a single JSON response containing the OCR text
   for each side (and a merged version), a flat list of all QR codes
   found across both images, and a flat list of all barcodes found across
   both images.
6. The service returns this JSON response with HTTP status `200 OK` on
   success, or an appropriate error status and error body (see "Error
   format" below) if processing could not be completed.

Steps 2–4 are logically independent of one another and, from the Node
backend's perspective, are expected to all be attempted for every image
supplied — a card with no readable text but a valid QR code should still
return that QR code's data, and a card with unreadable/blank barcodes
should not prevent OCR text from being returned.

## Response format — success

On success, the Python service must respond with HTTP `200 OK` and a JSON
body. The Node backend reads the following top-level fields; the exact
key names below must be matched precisely, as the Node backend does not
perform any key transformation:

```json
{
  "provider": "python-ocr-service",
  "frontOCRText": "John Mehta\nSales Manager\nAcme Traders\n+91 9876543210\njohn.mehta@acme.com",
  "backOCRText": "Services: Web Design, SEO, Hosting",
  "mergedOCRText": "John Mehta\nSales Manager\nAcme Traders\n+91 9876543210\njohn.mehta@acme.com\nServices: Web Design, SEO, Hosting",
  "parsedData": {
    "name": "John Mehta",
    "designation": "Sales Manager",
    "company": "Acme Traders",
    "email": "john.mehta@acme.com",
    "phones": ["+91 9876543210"],
    "website": "",
    "address": ""
  },
  "qrCodes": [
    {
      "type": "QR_CODE",
      "dataType": "URL",
      "content": "https://acmetraders.com/contact/john",
      "raw": "https://acmetraders.com/contact/john",
      "confidence": 0.98
    }
  ],
  "barcodes": [
    {
      "type": "CODE128",
      "content": "8901234567890",
      "raw": "8901234567890",
      "confidence": 0.95
    }
  ]
}
```

### OCR text fields

| Field | Type | Description |
|---|---|---|
| `frontOCRText` | string | All recognized text from the front image, in reading order. Empty string (`""`) if no front image was supplied or no text was recognized. |
| `backOCRText` | string | All recognized text from the back image, in reading order. Empty string if no back image was supplied or no text was recognized. |
| `mergedOCRText` | string | `frontOCRText` and `backOCRText` concatenated (front first), separated by a newline. If the Python service omits this field, the Node backend derives it automatically by joining the two fields itself, so populating it is a convenience rather than a strict requirement — but it should be included for forward compatibility. |
| `parsedData` | object | The Python service's own best-effort structured guess at `name`, `designation`, `company`, `email`, `phones` (array), `website`, and `address`. This is optional and used only as a fallback — the Node backend independently re-derives all of these fields (and many more) from the raw OCR text, so an empty or partial `parsedData` object is acceptable and will not cause data loss. |
| `provider` | string | A short identifier for the OCR engine/version that produced this result (e.g. `"python-ocr-service"`, `"tesseract-5.3"`). Stored verbatim as `ocrProvider` on the resulting business card. Optional; defaults to `"python-ocr-service"` on the Node side if omitted. |

For backward compatibility, the Node backend also accepts the OCR text
fields nested one level deeper, under an `ocr` key (i.e.
`{ "ocr": { "frontOCRText": ..., "backOCRText": ..., "mergedOCRText": ...,
"parsedData": ... } }`). New implementations should prefer the flat,
top-level shape shown above; the nested shape exists only so that older
deployments of this service continue to work without modification.

### How detected QR code data should be returned

`qrCodes` must always be present in the response as an array — use an
empty array (`[]`) when no QR code was found in either image, never
`null` or an omitted field. Each entry describes exactly one QR code
found in either the front or the back image:

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | Recommended | The symbol type. For a QR code this is conventionally `"QR_CODE"`. Defaults to `"QR_CODE"` on the Node side if omitted. |
| `dataType` | string | Recommended | The kind of payload encoded inside the QR code, as best determined by the service — for example `"TEXT"`, `"URL"`, `"VCARD"`, `"EMAIL"`, `"PHONE"`, or `"WIFI"`. Defaults to `"TEXT"` on the Node side if omitted. |
| `content` | string | Required | The decoded, human-readable value of the QR code — e.g. a URL, an email address, or plain text. This is the primary field consumers of the API are expected to display or act on. |
| `raw` | string | Recommended | The raw decoded payload exactly as extracted from the QR code, before any interpretation of `dataType`. For most payloads this will be identical to `content`; it exists as a fallback for cases where `content` has been lightly normalized (e.g. trimmed whitespace) and a caller needs the untouched original. |
| `confidence` | number | Optional | A value between `0` and `1` indicating the service's confidence in the decode. Not currently required by the Node backend, but should be included whenever the underlying decoding library exposes one, since it is stored in `rawOCR` for audit purposes and may be surfaced by the frontend in the future. |

If multiple QR codes are present in a single image, or QR codes are
present in both the front and back images, every one of them must appear
as its own entry in the flat `qrCodes` array — the array is not
segmented by image side.

### How detected barcode data should be returned

`barcodes` must always be present in the response as an array — use an
empty array (`[]`) when no barcode was found, never `null` or an omitted
field. Each entry describes exactly one non-QR barcode found in either
image:

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | Required | The barcode symbology that was decoded — for example `"CODE128"`, `"CODE39"`, `"EAN13"`, `"EAN8"`, `"UPC_A"`, `"UPC_E"`, `"ITF"`, or `"PDF417"`. If the symbology cannot be determined, use `"UNKNOWN"` (the Node-side default) rather than omitting the field. |
| `content` | string | Required | The decoded value of the barcode — typically a numeric or alphanumeric product/asset identifier. |
| `raw` | string | Recommended | The raw decoded payload exactly as extracted, before any normalization. Identical to `content` in most cases. |
| `confidence` | number | Optional | Same meaning as for `qrCodes[].confidence` above. |

As with `qrCodes`, every barcode found across both images is returned as
a single flat array, not segmented by image side.

### Confidence values

Wherever a `confidence` field is included (on either a `qrCodes` or
`barcodes` entry), it must be a floating-point number in the inclusive
range `0.0`–`1.0`, where `1.0` represents complete certainty in the
decode. Confidence is optional at the field level: the Node backend does
not reject a response for omitting it, and it currently only flows
through to the `rawOCR` field for audit/debugging purposes rather than
being validated or displayed directly. Future versions of the frontend
may surface low-confidence detections differently, so implementers are
encouraged to populate this field whenever the underlying decoding
library provides one rather than omitting it for convenience.

## Response format — error

If the Python service cannot process the request — for example, the
image is corrupt, unreadable, or an internal error occurs — it should
respond with a non-2xx HTTP status code and a JSON error body:

```json
{
  "success": false,
  "message": "Unable to process the submitted image.",
  "error": "Detailed internal error description for logging purposes"
}
```

| Field | Type | Description |
|---|---|---|
| `success` | boolean | Always `false` for an error response. |
| `message` | string | A short, human-readable description of the failure. This is the value most likely to be surfaced to the end user, so it should avoid leaking internal implementation details (stack traces, file paths, library names). |
| `error` | string | Optional additional detail intended for server-side logs rather than end users. |

An error response from the Python service causes the entire `/ocr/scan`
request on the Node backend to fail — no partial `BusinessCard` record is
created, and no scan-limit credit is consumed for a failed attempt. The
Python service should therefore only return an error status when
processing has genuinely failed; if OCR text recognition succeeds but no
QR code or barcode was found, that is a normal, successful result (empty
`qrCodes`/`barcodes` arrays), not an error condition.

## Success and failure response examples

**Success — front image only, one QR code detected, no barcode:**

```json
{
  "provider": "python-ocr-service",
  "frontOCRText": "Priya Sharma\nFounder\nBloom Studio\npriya@bloomstudio.in",
  "backOCRText": "",
  "mergedOCRText": "Priya Sharma\nFounder\nBloom Studio\npriya@bloomstudio.in",
  "parsedData": {
    "name": "Priya Sharma",
    "designation": "Founder",
    "company": "Bloom Studio",
    "email": "priya@bloomstudio.in",
    "phones": [],
    "website": "",
    "address": ""
  },
  "qrCodes": [
    {
      "type": "QR_CODE",
      "dataType": "VCARD",
      "content": "BEGIN:VCARD\nFN:Priya Sharma\nEMAIL:priya@bloomstudio.in\nEND:VCARD",
      "raw": "BEGIN:VCARD\nFN:Priya Sharma\nEMAIL:priya@bloomstudio.in\nEND:VCARD",
      "confidence": 0.99
    }
  ],
  "barcodes": []
}
```

**Success — front and back images, no QR code, one barcode detected:**

```json
{
  "provider": "python-ocr-service",
  "frontOCRText": "Global Parts Ltd.\nSKU 4471-A",
  "backOCRText": "Warehouse Distribution Center",
  "mergedOCRText": "Global Parts Ltd.\nSKU 4471-A\nWarehouse Distribution Center",
  "parsedData": {
    "name": "",
    "designation": "",
    "company": "Global Parts Ltd.",
    "email": "",
    "phones": [],
    "website": "",
    "address": ""
  },
  "qrCodes": [],
  "barcodes": [
    {
      "type": "CODE128",
      "content": "4471A0098213",
      "raw": "4471A0098213",
      "confidence": 0.92
    }
  ]
}
```

**Failure — unreadable image:**

```json
{
  "success": false,
  "message": "Unable to process the submitted image.",
  "error": "cv2.error: image data could not be decoded (corrupt or unsupported format)"
}
```

## Validation rules

- At least one image file part (`frontImage` or `backImage`) will always
  be present in a well-formed request; the Python service does not need
  to validate that both are missing, but should defensively handle the
  case where only one is present, since that is the common case for a
  single-sided scan.
- Files arriving at this service are always JPEG-encoded images by the
  time the Node backend sends them (see "Image preprocessing performed by
  Node"); the Python service is not required to accept other formats,
  but doing so defensively (for direct testing/debugging of the service
  outside the normal flow) is reasonable.
- `qrCodes` and `barcodes` must always be arrays, never `null`, a string,
  or omitted — the Node backend defaults missing/invalid values to an
  empty array, but an implementation should not rely on that fallback and
  should always emit a well-formed array itself.
- `content` is the one field within each `qrCodes`/`barcodes` entry that
  must never be omitted when a symbol was successfully decoded; a decode
  that produces no usable content should simply not be included in the
  array rather than being represented as an entry with an empty
  `content`.
- Numeric fields such as `confidence` must be valid JSON numbers, not
  strings (e.g. `0.95`, not `"0.95"`).
- The response must be valid JSON with `Content-Type: application/json`;
  the Node backend does not attempt to parse non-JSON response bodies.

## Integration notes for future Python developers

- **Statelessness**: this service should not persist anything about a
  request between calls. All persistence (business card records, scan
  history, audit logs) is owned by the Node backend.
- **Synchronous contract**: the Node backend currently makes a single
  blocking HTTP call and waits for the full response with no configured
  timeout override on the Node side beyond the HTTP client's defaults, so
  processing time directly adds to the end user's perceived scan latency.
  If OCR, QR, and barcode detection are computationally expensive, prefer
  optimizing each step's runtime over introducing asynchronous
  processing, since the current integration has no polling or webhook
  mechanism for a deferred result.
- **Backward-compatible response shape**: the Node backend reads OCR text
  from either the flat, top-level fields or the nested `ocr.*` shape (see
  above), and always defaults `qrCodes`/`barcodes` to empty arrays when
  absent. This means a Python service that only implements OCR (and does
  not yet support barcode/QR detection) will continue to work correctly
  with the current Node backend — cards scanned against such a deployment
  will simply have empty `qrCodes`/`barcodes` arrays. New deployments
  should nonetheless always include both arrays explicitly.
- **Adding new barcode symbologies or QR payload types**: this requires a
  change only in this service. Populate `barcodes[].type` or
  `qrCodes[].dataType` with the new value's string identifier; no
  corresponding change is required on the Node backend, since it stores
  whatever string it receives without validating it against an enum.
- **Testing in isolation**: because the request/response contract has no
  authentication and carries no business metadata, this service can be
  exercised directly with a tool such as `curl` or Postman by posting a
  `multipart/form-data` request with a `frontImage` and/or `backImage`
  file field to the configured endpoint, independent of the Node backend
  or any database.
