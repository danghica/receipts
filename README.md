# Receipt management (local)

A local Node.js web app that extracts data from Chinese receipt images (发票) and appends them to an Excel spreadsheet.

## Requirements

- Node.js 18+
- Receipt images in Chinese with: 1 发票号码, 1 开票日期, 2 名称, 1 项目名称, 1 金额, 1 税额.

## Setup

```bash
npm install
```

## Run

```bash
npm start
```

Then open the URL shown in the terminal (e.g. http://localhost:3000). If port 3000 is in use, the server will try 3001, 3002, and so on. Upload a receipt image; the app will run OCR (Tesseract with Chinese), parse the fields, check that 发票号码 is unique, and either append a row to `receipts.xlsx` or show an error (duplicate or malformed data). Each row has 7 columns: 发票号码, 开票日期, 名称1, 名称2, 项目名称, 金额, 税额. If you have an existing `receipts.xlsx` from an older version (12 columns), delete it or rename it so the app can create a new file with the correct layout.

## Config

- **Port**: `PORT` (default 3000). If 3000 is in use, the server tries 3001, 3002, etc.
- **Excel file**: `RECEIPTS_EXCEL_PATH` (default `./receipts.xlsx` in the project root).

## Responses

- **Success**: Receipt added; response includes `invoiceNumber` for confirmation.
- **Duplicate**: 发票号码 already exists in the spreadsheet.
- **Malformed**: Missing or invalid fields (e.g. missing 开票日期, or not exactly 2 line items); message lists what went wrong.

**Note:** If you see "Error opening data file ./eng.traineddata" or "TESSDATA_PREFIX", the app now unsets `TESSDATA_PREFIX` and uses CDN language data. If it persists, ensure no other process or shell profile sets `TESSDATA_PREFIX` when starting the app.
