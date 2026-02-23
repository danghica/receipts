# Development

This document describes the source layout, scripts, and how to extend the Receipt management app.

## Source layout

```
receipt management/
├── config/
│   ├── receipt-regions.json      # Region definitions (required)
│   └── receipt-regions.README.md # Calibration instructions
├── docs/                         # Documentation (this folder)
├── public/                       # Static frontend
│   ├── index.html                # Single-page UI
│   ├── app.js                    # Upload, result display, Accept, overlay
│   └── favicon.svg
├── scripts/
│   └── download-tessdata.js      # Download chi_sim/chi_tra to ./tessdata
├── src/
│   ├── index.js                  # Express app, routes, upload + accept
│   ├── cropMargins.js            # Trim white margins (Sharp)
│   ├── excel.js                  # Excel create/read/append/reset, lock
│   ├── ocr.js                    # Tesseract.js wrapper (recognize)
│   ├── parser.js                 # normalizeDate/Amount, extract/parse, validate
│   ├── regionExtractor.js        # Load config, crop regions, OCR per region, bboxes
│   └── unset-tessdata.js         # delete process.env.TESSDATA_PREFIX
├── run.js                        # Start with TESSDATA_PREFIX unset
├── package.json
├── nodemon.json
└── README.md
```

## Entry point and server

- **Runtime entry:** `npm start` runs `node run.js`. `run.js` clears `TESSDATA_PREFIX` and spawns `node -r src/unset-tessdata.js src/index.js`, so the main process is `src/index.js`.
- **Static files:** Served from `public/` via `express.static`. The root route `GET /` serves `public/index.html`.

## Key files for common changes

| Goal | Primary files |
|------|----------------|
| Add/change API routes | `src/index.js` |
| Change Excel columns or logic | `src/excel.js` |
| Change validation or field parsing | `src/parser.js` |
| Change region list or scaling | `src/regionExtractor.js` (and `config/receipt-regions.json`) |
| Change upload/OCR pipeline | `src/index.js` (POST /receipt), `src/regionExtractor.js`, `src/ocr.js` |
| Change UI or Accept payload | `public/index.html`, `public/app.js` |
| Change margin cropping | `src/cropMargins.js` |

## Scripts

- **`npm start`** — `node run.js` (server with TESSDATA_PREFIX unset).
- **`npm run dev`** — `nodemon run.js` (restart on file changes; see `nodemon.json`).
- **`npm run download-tessdata`** — `node scripts/download-tessdata.js`; downloads `chi_sim` and `chi_tra` to `./tessdata`.

## Extending the app

### Adding a new OCR field

1. Add the region to `config/receipt-regions.json` with key matching the display name (e.g. a new field name).
2. In `src/regionExtractor.js`: add the key to `FIELD_KEYS`, and in `extractFromRegions` add handling to map OCR text to the result object (and optionally to `getResultKey`).
3. In `src/index.js`: include the new field in the `parsed` object in the POST /receipt response; for Accept, read it from the request body and add to `data`, then pass to `validateExtracted` and `appendReceipt` if it is required.
4. In `src/excel.js`: add the header and row value in `HEADERS` and in `appendReceipt` (and optionally in `getOrCreateWorkbook` for existing files).
5. In `public/app.js`: add the label to `FIELD_ORDER`, ensure the result table and Accept payload include the new field (e.g. in `fieldToKey` and the payload build).

### Adding a manual-only field (like 名字)

1. Do **not** add a region in `config/receipt-regions.json`.
2. Add the column in `src/excel.js` (HEADERS and appendReceipt).
3. In `src/index.js` (POST /api/accept-receipt): read the value from the body, normalize, add to `data`.
4. In `public/app.js`: add to `FIELD_ORDER` and to the Accept payload; in `showResult`, render a row with an input and no ROI image (e.g. show "—" in the ROI cell).

### Changing overlay styling

- Overlay structure: `public/index.html` has `.receipt-image-wrapper` and `.receipt-overlay`; frames and labels are created in `public/app.js` (`drawRegionOverlay`). Styles for `.region-frame` and `.region-label` are in the `<style>` block in `index.html`.

## Testing and debugging

- **No test suite:** The project does not include an automated test suite. Manual testing: run `npm run dev`, upload a receipt, edit, and accept.
- **Excel lock:** All Excel operations are serialized in `excel.js` via `withLock`; concurrent requests wait for the lock.
- **OCR timeout:** POST /receipt uses a long timeout (e.g. 600000 ms); on timeout the server returns 503.
- **Debug logging:** `src/index.js` and `src/ocr.js` can write to a debug log file under `.cursor/debug-*.log`; this is optional and can be removed or gated.

## Planning documents

For historical context and implementation details of specific features:

- [docs/plan-add-名字-column.md](plan-add-名字-column.md)
- [docs/plan-frames-around-parsed-strings.md](plan-frames-around-parsed-strings.md)

See [docs/README.md](README.md) for the full documentation index.
