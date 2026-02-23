# API Reference

All responses that return JSON use `Content-Type: application/json` unless noted. Error responses include a `message` field suitable for display.

## Endpoints

### `GET /`

Serves the single-page app: `public/index.html`.

- **Response:** HTML.

---

### `GET /api/build`

Returns a simple build or server-start timestamp (for footer display).

- **Response:** `200`
- **Body:** `{ "timestamp": "<ISO date string>" }`

---

### `GET /api/receipt-regions`

Returns the region configuration used for OCR and overlay bboxes.

- **Response:** `200` — JSON object with keys 发票号码, 开票日期, 名称1, 名称2, 项目名称, 金额, 税额; values are `{ x0, y0, x1, y1 }` (normalized 0–1 or reference pixels if `_refWidth`/`_refHeight` are set). Keys starting with `_` are metadata.
- **Error:** `404` — `{ "error": "Region config not found" }` when config file is missing or invalid.

---

### `POST /receipt`

Upload a receipt image. The server crops white margins, runs OCR on each configured region, and returns the cropped image, parsed fields, region bboxes, and optional ROI crops.

- **Request:** `multipart/form-data` with one file:
  - `image` — image file (JPEG, PNG, GIF, WebP). Max size 10 MB.
- **Response:** `200` — Success:
  ```json
  {
    "image": "data:<mimetype>;base64,...",
    "parsed": {
      "发票号码": "...",
      "开票日期": "...",
      "名称1": "...",
      "名称2": "...",
      "项目名称": "...",
      "金额": 123.45,
      "税额": 12.34
    },
    "parsedCrops": { "<field>": "data:image/...;base64,...", ... },
    "bboxes": {
      "<field>": { "x0": number, "y0": number, "x1": number, "y1": number },
      ...
    }
  }
  ```
  - `parsed` does not include 名字; the frontend shows 名字 as a separate blank input.
  - `bboxes` are in image pixels (same coordinate system as the returned `image`).
- **Errors:**
  - `400` — No file: `{ "success": false, "error": "malformed", "message": "Missing or invalid: no image file uploaded." }`
  - `400` — No region config or image dimensions: body may include `image` and `bboxes`; `message` explains (e.g. region config required or image format not supported).
  - `400` — File type: `{ "message": "Only image files (JPEG, PNG, GIF, WebP) are allowed" }`
  - `400` — Too large: `{ "message": "Image file too large. Maximum size is 10MB." }`
  - `503` — OCR timeout: `{ "success": false, "error": "server", "message": "OCR timed out. ..." }`
  - `500` — Server error: `{ "success": false, "message": "An error occurred while processing the receipt." }`

---

### `POST /api/accept-receipt`

Validate receipt data, check 发票号码 uniqueness, append one row to the spreadsheet, and optionally save the receipt image to `ORIGINALS/`.

- **Request:** `multipart/form-data` or form-encoded body with:
  - `invoiceNumber` (string, required)
  - `invoiceDate` (string, required)
  - `name1`, `name2` (strings, required)
  - `projectName` (string, required)
  - `amount`, `tax` (numbers, required)
  - `customName` (string, optional) — 名字; stored with all spaces stripped
  - `image` (file, optional) — if provided, saved as `ORIGINALS/{发票号码}.{ext}` and filename written to ORIGINAL column
- **Response:** `200` — Success:
  ```json
  {
    "success": true,
    "message": "Receipt added.",
    "invoiceNumber": "..."
  }
  ```
- **Errors:**
  - `400` — Validation failed: `{ "success": false, "message": "Missing or invalid: ..." }` (same validation as in [parser](architecture.md#module-overview)).
  - `409` — Duplicate 发票号码: `{ "success": false, "message": "The receipt with 发票号码 ... was already submitted by <名字>." }` (or “(no name recorded)”).
  - `500` — Server error: `{ "success": false, "message": "An error occurred while accepting the receipt." }`

---

### `POST /api/reset-receipts`

Recreate the Excel file with only headers (no data rows). Use with care.

- **Request:** No body required.
- **Response:** `200` — `{ "success": true, "message": "Spreadsheet reset. All receipt data has been cleared." }`
- **Error:** `500` — `{ "success": false, "message": "Failed to reset spreadsheet." }`

---

## Validation rules (accept)

- **发票号码:** Required; must be non-empty and digits only.
- **开票日期:** Required; must be present (normalized to `YYYY-MM-DD` by parser).
- **名称1, 名称2:** At least two non-empty names required.
- **项目名称:** Required, non-empty.
- **金额, 税额:** Required; must be valid numbers (parser’s `normalizeAmount`).
- **名字 (customName):** Optional; any string, stored with spaces removed.

These match the logic in `src/parser.js` (`validateExtracted`).
