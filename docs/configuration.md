# Configuration

This document describes configuration files and environment variables used by the Receipt management app.

## Region config: `config/receipt-regions.json`

**Required.** This file defines where to read each receipt field on the image. The server loads it from `config/receipt-regions.json` (relative to current working directory or the app directory). Overlays and extraction both use these regions. The **名字** (custom name) field is not read from the image; it is a manual text input and has no region in this config.

### Why overlays can be misaligned

Coordinates depend on **image size and aspect ratio**. If your reference image had different dimensions or crop than the receipts you upload, the same numbers will land on different parts of the page (e.g. on labels instead of values).

### Two coordinate modes

#### 1. Normalized (0–1) — default

Each region is `{ "x0", "y0", "x1", "y1" }` with values between 0 and 1:

- `x0` = left edge as fraction of image width  
- `y0` = top edge as fraction of image height  
- `x1` = right edge, `y1` = bottom edge  

Use when all receipt images have the **same aspect ratio and crop** as the image you used to measure.

#### 2. Reference pixels

Add to the config:

```json
"_refWidth": 1000,
"_refHeight": 655
```

Then give each region in **pixels** for an image of that size (e.g. 1000×655). The app scales regions to the actual image size. This keeps alignment when only resolution changes, not layout.

Use when you measure once in an image editor (e.g. 1000×655) and want to reuse those pixel coordinates.

### Required keys

The server expects exactly these region keys (all required for a valid config):

- `发票号码`
- `开票日期`
- `名称1`
- `名称2`
- `项目名称`
- `金额`
- `税额`

Keys starting with `_` (e.g. `_refWidth`, `_refHeight`) are metadata and are not used as regions.

### Example (normalized)

```json
{
  "发票号码": { "x0": 0.75, "y0": 0.03, "x1": 1, "y1": 0.09 },
  "开票日期": { "x0": 0.75, "y0": 0.07, "x1": 1, "y1": 0.13 },
  "名称1": { "x0": 0.068, "y0": 0.19, "x1": 0.457, "y1": 0.28 },
  "名称2": { "x0": 0.566, "y0": 0.19, "x1": 1, "y1": 0.28 },
  "项目名称": { "x0": 0, "y0": 0.4, "x1": 0.217, "y1": 0.47 },
  "金额": { "x0": 0.675, "y0": 0.4, "x1": 0.76, "y1": 0.47 },
  "税额": { "x0": 0.929, "y0": 0.4, "x1": 1, "y1": 0.47 }
}
```

### How to calibrate

1. Open a **typical** receipt image (same layout and crop you’ll use when uploading) in an image editor.
2. Note the **image dimensions** (width × height).
3. For each field, draw a rectangle around the **value** (not the label):
   - 发票号码: the number only  
   - 开票日期: the date  
   - 名称1: buyer name (购买方 名称)  
   - 名称2: seller name (销售方 名称)  
   - 项目名称: the item name in the table (e.g. 汽油*92号车用汽油(VIB))  
   - 金额: the amount in the table (e.g. 408.17)  
   - 税额: the tax amount in the table (e.g. 53.06)  
4. Write coordinates:
   - **Normalized:** divide left by width, top by height, etc. (all 0–1).  
   - **Reference pixels:** set `_refWidth` and `_refHeight` to the image size, and use pixel values (left, top, right, bottom) for each region.

If 项目名称 / 金额 / 税额 end up on the “合计” labels instead of the table row, your y values are too large: move the boxes **up** by using smaller y0/y1 (or measure the table row again).

See also: [config/receipt-regions.README.md](../config/receipt-regions.README.md) in the repo.

---

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Base port for the HTTP server. If the port is in use, the server tries PORT+1, PORT+2, … up to PORT+10. | `3000` |
| `RECEIPTS_EXCEL_PATH` | Full path to the Excel file. | `./receipts.xlsx` (relative to process cwd) |

The Excel file and the `ORIGINALS` directory are created in the same directory as the Excel path (ORIGINALS is created in process cwd when saving the first image).

---

## Tesseract / tessdata

The app **unsets** `TESSDATA_PREFIX` so Tesseract.js can use its own language data (CDN or local). If you see an error like "Error opening data file ./eng.traineddata", ensure no other process or shell profile sets `TESSDATA_PREFIX` when starting the app.

- **Optional:** Run `npm run download-tessdata` to store Chinese language data in `./tessdata`. When present, OCR uses that instead of the CDN.
- See [User guide](user-guide.md) for run instructions.
