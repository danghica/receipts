# Architecture

This document describes the system design, main modules, and data flow of the Receipt management app.

## Overview

The app is a **single-process Node.js web server** (Express) that:

1. Serves a static frontend (HTML/CSS/JS) for uploading receipt images and reviewing parsed data.
2. Accepts receipt image uploads, crops white margins, runs **region-based OCR** (Tesseract) on configured regions, and returns parsed fields plus region overlays.
3. Accepts “Accept” submissions: validates data, checks 发票号码 uniqueness, appends one row to an Excel file, and optionally saves the cropped image to `ORIGINALS/`.

There is **no database**: persistence is the Excel file (`receipts.xlsx`) and the `ORIGINALS/` folder.

## High-level flow

```
┌─────────────┐     POST /receipt      ┌─────────────┐     region config     ┌──────────────────┐
│   Browser   │ ────────────────────►  │   Express   │ ◄───────────────────  │ receipt-regions  │
│  (public/)  │     image file         │  (index.js) │                       │     .json        │
└─────────────┘                        └──────┬──────┘                       └──────────────────┘
       │                                      │
       │                                      │ cropMargins()
       │                                      ▼
       │                               ┌─────────────┐
       │                               │ cropMargins │  trim white borders
       │                               └──────┬──────┘
       │                                      │
       │                                      │ extractFromRegions()
       │                                      ▼
       │                               ┌─────────────────┐     recognize()    ┌─────────────┐
       │                               │ regionExtractor  │ ─────────────────► │    ocr.js   │
       │                               │ (crop + OCR per  │                    │ Tesseract   │
       │                               │  region)         │                    └─────────────┘
       │                               └──────┬──────────┘
       │                                      │
       │  JSON: image, parsed, bboxes,        │
       │        parsedCrops                   │
       ◄──────────────────────────────────────┘
```

**Accept flow:**

```
┌─────────────┐   POST /api/accept-receipt   ┌─────────────┐   validateExtracted()   ┌─────────────┐
│   Browser   │   (fields + optional image)  │  index.js   │ ──────────────────────► │  parser.js  │
└─────────────┘ ──────────────────────────► └──────┬──────┘                         └─────────────┘
                                                    │
                                                    │ getExistingInvoiceNumbers()
                                                    │ appendReceipt()
                                                    ▼
                                             ┌─────────────┐
                                             │  excel.js   │  receipts.xlsx, ORIGINALS/
                                             └─────────────┘
```

## Module overview

| Module | Path | Responsibility |
|--------|------|-----------------|
| **Server** | `src/index.js` | Express app, routes, multer upload, image cropping, calling region extraction and Excel; responds with JSON (parsed data, bboxes, image data URL). |
| **Region extraction** | `src/regionExtractor.js` | Loads `config/receipt-regions.json`, scales regions to pixels, crops each region from the image, runs OCR per crop, normalizes text; returns field values and pixel bboxes (and base64 crops). |
| **OCR** | `src/ocr.js` | Wraps Tesseract.js: `recognize(imageBuffer)` → `{ text }`. Uses `chi_sim+chi_tra`, optional local `tessdata/`. |
| **Parser** | `src/parser.js` | Text parsing and validation: `normalizeDate`, `normalizeAmount`, regex/layout extraction (`extractFromLines`, `extractPartial`, `parse`), `validateExtracted`. Used for validation on accept; layout/bbox logic is also used when full-page OCR is available (region extractor uses only per-region OCR). |
| **Crop margins** | `src/cropMargins.js` | `cropMargins(imageBuffer)`: uses Sharp to trim near-white borders so region coordinates align across scans. |
| **Excel** | `src/excel.js` | Workbook create/read/write: `getOrCreateWorkbook`, `appendReceipt`, `resetReceipts`, `getExistingInvoiceNumbers`, `getCustomNameByInvoiceNumber`. Writes to `receipts.xlsx` and uses a lock to serialize writes. |
| **Frontend** | `public/index.html`, `public/app.js` | Single-page UI: file input, upload to `/receipt`, display image + overlay (region frames) + editable table; Accept sends fields (and optional image) to `/api/accept-receipt`. |

## Data shapes

### Parsed receipt (from upload)

- **Backend → frontend:** `parsed` object with Chinese keys: `发票号码`, `开票日期`, `名称1`, `名称2`, `项目名称`, `金额`, `税额`. The 名字 field is not from OCR; it is a separate input, default blank.
- **Bboxes:** `bboxes` — one entry per configured region key, `{ x0, y0, x1, y1 }` in image pixels (from region config scaled to current image size). Used to draw blue frames on the receipt image.
- **Parsed crops:** `parsedCrops` — base64 data URLs of each cropped region image (for ROI thumbnails in the table).

### Accept payload

- **Frontend → backend:** Form or JSON body with `invoiceNumber`, `invoiceDate`, `name1`, `name2`, `projectName`, `amount`, `tax`, `customName`, and optional `image` file. Backend normalizes 名字 by stripping all spaces.

### Excel row

- Columns: 发票号码, 开票日期, 名称1, 名称2, 项目名称, 金额, 税额, 名字, ORIGINAL, 全部.  
- `ORIGINAL` = filename in `ORIGINALS/` (e.g. `26337000000187987298.png`).  
- `全部` = 金额 + 税额 (total).  
- Existing workbooks get headers for columns 8–10 if missing (名字, ORIGINAL, 全部).

## Configuration and environment

- **Region config:** Required. Path: `config/receipt-regions.json` (see [Configuration](configuration.md)). Defines bounding boxes for 发票号码, 开票日期, 名称1, 名称2, 项目名称, 金额, 税额. 名字 has no region; it is manual input only.
- **Environment:** `PORT` (default 3000), `RECEIPTS_EXCEL_PATH` (default `./receipts.xlsx`).  
- **Tesseract:** `TESSDATA_PREFIX` is unset so Tesseract.js uses CDN or local `tessdata/` (see [User guide](user-guide.md)).

## Concurrency and errors

- **Excel:** All Excel operations are serialized via an async lock in `excel.js` to avoid concurrent write corruption.
- **Upload:** Large uploads are limited (e.g. 10 MB). OCR runs with a long timeout (e.g. 10 minutes); on timeout the server returns 503.
- **Accept:** Duplicate 发票号码 returns 409 with a message that can include the 名字 of the existing submission.

## Planning documents

Implemented features are described in:

- [plan-add-名字-column.md](plan-add-名字-column.md) — 名字 column and manual input.
- [plan-frames-around-parsed-strings.md](plan-frames-around-parsed-strings.md) — Frames around parsed regions (implemented using region config bboxes; parser bboxes from full-page layout are used in parser.js for layout-based parsing when lines are available).
