# Add 名字 (custom name) column and manual input

## Goal

- Add a **last column** to the spreadsheet titled **名字**.
- This column is **not** filled by OCR; it is filled by a **new text field** on the page, placed under 税额, with **default value blank**.
- On Accept, the value from this field is sent to the API and written to the new column.

---

## 1. Excel layer – [src/excel.js](src/excel.js)

- Append **'名字'** to the end of `HEADERS`:  
  `['发票号码', '开票日期', '名称1', '名称2', '项目名称', '金额', '税额', '名字']`.
- In **`appendReceipt(data)`**, extend the row array with the new field: add `data.customName` (or `data.name`) as the last element. Use a single property name consistently (e.g. `customName`) to avoid confusion with `name1`/`name2`. Default to `''` if undefined.
- **Existing workbooks:** When loading an existing file, the header row may only have 7 columns. Optionally: after reading the workbook, ensure row 1 has at least 8 columns and set cell `(1, 8)` to `'名字'` if it is empty, so old files get the new header without requiring a manual "Reset spreadsheet".

---

## 2. Backend – [src/index.js](src/index.js)

- **POST /api/accept-receipt:** Read from the JSON body a new field, e.g. `customName` (or `name`). Normalize with `String(...).trim()` and default to `''`. Add it to the `data` object passed to `validateExtracted` and `appendReceipt`.
- **Validation:** 名字 is optional; no change to `validateExtracted` logic (it can ignore `customName`). No new validation rules.

---

## 3. Frontend – [public/app.js](public/app.js)

- **Stable field order:** Append **'名字'** to `FIELD_ORDER` so it is last:  
  `['发票号码', '开票日期', '名称1', '名称2', '项目名称', '金额', '税额', '名字']`.
- **Result table:** In `showResult`, when iterating `FIELD_ORDER`, add a row for **名字**:
  - **Value cell:** an `<input type="text">` with `data-field="名字"`, pre-filled with `parsed['名字']` if present, otherwise **blank** (so default is blank; OCR never sends 名字).
  - **ROI cell:** no crop image for 名字; show "—" or leave empty.
- **Accept payload:** In the Accept click handler, include the new field in the payload, e.g. `customName`, by reading the input with `data-field="名字"` and adding it to the object sent to `/api/accept-receipt` (in the same stable order; 名字 last).

---

## 4. Summary of file changes

| File | Change |
|------|--------|
| [src/excel.js](src/excel.js) | Add `'名字'` to `HEADERS`. In `appendReceipt`, add `data.customName` (default `''`) as last element of the row. Optionally ensure existing workbooks get header for column 8. |
| [src/index.js](src/index.js) | In POST /api/accept-receipt, read `body.customName`, normalize to string, add to `data`, pass to `appendReceipt`. |
| [public/app.js](public/app.js) | Add `'名字'` to `FIELD_ORDER`. In `showResult`, render 名字 row with blank default and no ROI image. In Accept handler, add `customName` from input to payload. |

---

## 5. Behaviour

- **Upload:** Unchanged. Server does not return 名字 in `parsed`; frontend still renders the 名字 row with blank value.
- **Accept:** User can type a value in 名字 (or leave it blank). On submit, the payload includes `customName`; server writes it to the last column.
- **Reset spreadsheet:** With updated `createEmptyWorkbook`, the new file will have the 名字 header; reset clears all rows and keeps the 8-column header.
