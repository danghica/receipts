# User Guide

This guide covers setup, running the app, and the normal workflow (upload → review → accept).

## Requirements

- **Node.js 18+**
- Receipt images in Chinese with the expected layout. Expected fields: **发票号码**, **开票日期**, **名称1**, **名称2**, **项目名称**, **金额**, **税额**. Layout must match the regions defined in `config/receipt-regions.json`.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Region config (required)**

   Ensure `config/receipt-regions.json` exists and defines all seven regions. See [Configuration](configuration.md) and [config/receipt-regions.README.md](../config/receipt-regions.README.md) for calibration.

3. **Tesseract language data (optional)**

   To avoid CDN and improve reliability, download language data locally:

   ```bash
   npm run download-tessdata
   ```

   This populates `./tessdata` with Chinese data. If you skip this, the app will use the Tesseract.js CDN.

## Run

Start the server:

```bash
npm start
```

Or with auto-restart on file changes:

```bash
npm run dev
```

Then open the URL shown in the terminal (e.g. `http://localhost:3000`). If the port is in use, the server tries the next one (3001, 3002, …).

## Flow

### 1. Upload

- Choose a receipt image and click **Upload**.
- The app:
  - Crops white margins.
  - Runs OCR on each region from `config/receipt-regions.json` (no full-image OCR).
- You see:
  - The receipt image with **blue region overlays** (frames around each configured field).
  - A **table of editable values** and ROI thumbnails for each region.

### 2. Edit (optional)

- Change any value in the table (e.g. fix OCR errors or fill **名字**).
- **名字** is a manual field under 税额; it defaults to blank and is not filled by OCR.

### 3. Accept

- Click **Accept**.
- The app:
  - Validates all required fields.
  - Checks that **发票号码** is not already in the spreadsheet.
  - Appends one row to `receipts.xlsx` with: 发票号码, 开票日期, 名称1, 名称2, 项目名称, 金额, 税额, 名字, ORIGINAL, 全部.
  - If an image was sent with Accept (the one currently displayed), saves the cropped image to `ORIGINALS/{发票号码}.{ext}` and writes that filename in the ORIGINAL column.

### Possible outcomes

- **Success:** Receipt added; message shows 发票号码. ORIGINAL and `ORIGINALS/` are set when an image was sent.
- **Duplicate:** 发票号码 already exists; message may include the 名字 of the existing submission.
- **Malformed:** Missing or invalid fields; message lists what’s wrong.

## Data storage

- **receipts.xlsx** — One row per accepted receipt. Columns: 发票号码, 开票日期, 名称1, 名称2, 项目名称, 金额, 税额, 名字, ORIGINAL, 全部. ORIGINAL holds the filename of the stored image (e.g. `26337000000187987298.png`). 全部 = 金额 + 税额.
- **ORIGINALS/** — Directory (project root) where cropped receipt images are saved, named by 发票号码. Created automatically when the first receipt is accepted with an image.

## Reset spreadsheet

A footer or link to reset receipts calls `POST /api/reset-receipts`, which clears all data in `receipts.xlsx` and recreates the file with only headers. Use with care.

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start the server (`node run.js`). |
| `npm run dev` | Start with nodemon (restart on file changes). |
| `npm run download-tessdata` | Download Tesseract language data (e.g. chi_sim, chi_tra) to `./tessdata`. |

## Disclaimer

This software is provided as-is, without warranty. There is no guarantee of correctness of OCR results or stored data. Verify any data that matters for accounting, tax, or legal purposes. See the [LICENSE](../LICENSE) file for full terms.
