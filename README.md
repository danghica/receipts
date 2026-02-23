# Receipt management (local)

A local Node.js web app that extracts data from Chinese receipt images (发票), lets you review and edit the values, then saves them to an Excel spreadsheet and stores the cropped receipt image in an `ORIGINALS` folder.

## Disclaimer

This software is provided as-is, without warranty of any kind. There is no guarantee of correctness of OCR results or stored data. Use at your own risk; verify any data that matters for accounting, tax, or legal purposes. See the [LICENSE](LICENSE) file for full terms.

## Features

- **Upload** a receipt image → crop/normalize margins → OCR only in configured regions (no full-image OCR).
- **Editable result**: All extracted fields are shown in a table with text inputs; you can correct OCR mistakes before accepting.
- **Accept**: Validates data, checks 发票号码 uniqueness, appends one row to `receipts.xlsx`, and saves the cropped image to `ORIGINALS/{发票号码}.png` (or .jpg/.webp). The spreadsheet’s **ORIGINAL** column stores the filename.
- **Optional 名字** field: Manual text under 税额, default blank; stored with all spaces stripped.
- **Reset spreadsheet**: Footer link to clear all data in `receipts.xlsx` (file is recreated with headers).

## Requirements

- Node.js 18+
- Receipt images in Chinese. Expected fields: **发票号码**, **开票日期**, **名称1**, **名称2**, **项目名称**, **金额**, **税额**. Layout must match the regions defined in `config/receipt-regions.json`.

## Setup

```bash
npm install
```

Optional: download Tesseract language data locally (avoids CDN and can improve reliability):

```bash
npm run download-tessdata
```

## Run

```bash
npm start
```

Or with auto-restart on file changes:

```bash
npm run dev
```

Then open the URL shown in the terminal (e.g. http://localhost:3000). If the port is in use, the server tries the next one (3001, 3002, …).

## Flow

1. **Upload**: Choose an image and click **Upload**. The app crops white margins, runs OCR on each region from `config/receipt-regions.json`, and shows the receipt image with blue region overlays and a table of editable values (and ROI thumbnails).
2. **Edit** (optional): Change any value in the table (e.g. fix OCR errors or fill 名字).
3. **Accept**: Click **Accept**. The app validates the data, checks that 发票号码 is not already in the spreadsheet, then:
   - Appends one row to `receipts.xlsx` with columns: 发票号码, 开票日期, 名称1, 名称2, 项目名称, 金额, 税额, 名字, ORIGINAL.
   - Saves the cropped receipt image to `ORIGINALS/{发票号码}.{ext}` and writes that filename in the ORIGINAL column.

## Config

- **Region config** (required): `config/receipt-regions.json` defines the bounding boxes for each field. See [config/receipt-regions.README.md](config/receipt-regions.README.md) for calibration.
- **Port**: `PORT` (default 3000). If in use, the server tries 3001, 3002, etc.
- **Excel file**: `RECEIPTS_EXCEL_PATH` (default `./receipts.xlsx` in the project root).

For full documentation (architecture, API, configuration, user guide, development), see the **[docs/](docs/)** directory.

## Data storage

- **receipts.xlsx**: One row per accepted receipt. Columns: 发票号码, 开票日期, 名称1, 名称2, 项目名称, 金额, 税额, 名字, ORIGINAL. The ORIGINAL column holds the filename of the stored image (e.g. `26337000000187987298.png`).
- **ORIGINALS/**: Directory in the project root where cropped receipt images are saved, named by 发票号码 (e.g. `26337000000187987298.png`). Created automatically when the first receipt is accepted.

## Responses (Accept)

- **Success**: Receipt added; message shows 发票号码. The ORIGINAL column and `ORIGINALS/` file are set when an image was sent with Accept (the image currently displayed after upload).
- **Duplicate**: 发票号码 already exists in the spreadsheet.
- **Malformed**: Missing or invalid fields; message lists what’s wrong.

## Tesseract / tessdata

The app unsets `TESSDATA_PREFIX` so Tesseract.js can use its own language data. If you see "Error opening data file ./eng.traineddata", ensure no other process or shell profile sets `TESSDATA_PREFIX` when starting the app. Running `npm run download-tessdata` stores language data locally for the app to use.

## Scripts

| Script               | Description                                      |
|----------------------|--------------------------------------------------|
| `npm start`          | Start the server (`node run.js`).                |
| `npm run dev`        | Start with nodemon (restart on file changes).   |
| `npm run download-tessdata` | Download Tesseract language data (e.g. chi_sim). |
