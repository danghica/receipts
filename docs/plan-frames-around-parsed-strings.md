# Plan: Frames around parsed OCR strings on the receipt image

## Goal

When the receipt image is displayed after upload, draw **frames (bounding boxes)** around the text regions that were used for each parsed field (发票号码, 开票日期, 名称1, 名称2, 项目名称, 金额, 税额), so the user can see exactly what the OCR associated with each value.

## Approach

We already have **line-level bounding boxes** from Tesseract: each line in `ocrResult.lines` has `text` and `bbox` (x0, y0, x1, y1 in image pixels). We will:

1. **Backend**: When we extract a field from a specific line (in layout-based parsing), record that line’s **bbox** for that field. Return these bboxes plus **image dimensions** so the frontend can scale boxes to the displayed image size.
2. **Frontend**: Overlay a layer on top of the receipt image and draw one rectangle per returned bbox, scaled to the current display size of the image.

---

## 1. Backend

### 1.1 Image dimensions

- **Need**: Frontend must know the **original image size** (width × height) so it can map pixel bboxes to the displayed image (which may be scaled with CSS).
- **Option A**: Add a small dependency (e.g. `image-size`) to read dimensions from the uploaded buffer in Node.
- **Option B**: Omit dimensions and have the frontend use the loaded image’s `naturalWidth` / `naturalHeight` (they match the file we sent). Prefer **Option B** to avoid a new dependency: backend only sends bboxes; frontend gets dimensions from `<img>` after load.

**Decision**: Use **Option B**. Backend returns bboxes in **Tesseract’s coordinate system** (pixels of the image Tesseract saw). Frontend assumes the displayed `<img src="data:...">` has `naturalWidth`/`naturalHeight` equal to that same image, so bboxes are in “natural” pixel coordinates.

### 1.2 Attach bboxes to parsed fields

- **Where**: Layout extraction in [src/parser.js](src/parser.js): `extractFromLines(lines)` currently returns only field values. It decides **which line** is used for each field (发票号码, 开票日期, 名称1, 名称2, 项目名称, 金额, 税额).
- **Change**: When a value is taken from a line, also record that line’s `bbox`. Return a second object `bboxes` keyed by field name (e.g. `发票号码`, `开票日期`, `名称1`, `名称2`, `项目名称`, `金额`, `税额`). Each value is `{ x0, y0, x1, y1 }` (or null if that field was not found from a line).
- **Parser**: Extend `extractFromLines` to accept/return full line objects `{ text, bbox }` (already have bbox from OCR). When setting `out.invoiceNumber` from a line, set e.g. `out._bbox.发票号码 = line.bbox`. Then `parse(text, lines)` and `extractPartial(text, lines)` can return `bboxes` alongside the data (only for fields that came from a line; regex-only fields have no bbox).
- **API**: Include in the JSON response a top-level `bboxes` object, e.g.:

```json
"bboxes": {
  "发票号码": { "x0": 10, "y0": 20, "x1": 200, "y1": 40 },
  "开票日期": { "x0": 10, "y0": 42, "x1": 180, "y1": 58 },
  "名称1": { "x0": 5, "y0": 80, "x1": 250, "y1": 95 },
  "名称2": { "x0": 260, "y0": 80, "x1": 520, "y1": 95 },
  "项目名称": { ... },
  "金额": { ... },
  "税额": { ... }
}
```

Omit keys for fields that have no bbox (e.g. parsed only via regex).

---

## 2. Frontend

### 2.1 Structure

- **Container**: Wrap the receipt `<img id="receipt-image">` in a wrapper (e.g. `div.receipt-image-wrapper`) with `position: relative` and the same effective size as the image (so the overlay aligns with the image).
- **Overlay**: Inside the wrapper, add an overlay element (e.g. `div.receipt-overlay`) with `position: absolute`, `left: 0`, `top: 0`, `width: 100%`, `height: 100%`, and `pointer-events: none` so it doesn’t block clicks. The overlay is sized to match the **displayed** image (e.g. via CSS or JS).

### 2.2 Drawing the frames

- When the **image has loaded** and we have `bboxes` + parsed data:
  - Read the image’s **display size** (e.g. `img.getBoundingClientRect()` or `offsetWidth`/`offsetHeight`) and **natural size** (`naturalWidth`, `naturalHeight`).
  - Scale factor: `sx = displayWidth / naturalWidth`, `sy = displayHeight / naturalHeight`.
  - For each entry in `bboxes`, create a box (e.g. a `div` with a border, or an SVG `rect`) positioned and sized with:
    - `left = bbox.x0 * sx`, `top = bbox.y0 * sy`
    - `width = (bbox.x1 - bbox.x0) * sx`, `height = (bbox.y1 - bbox.y0) * sy`
  - Append these boxes to the overlay so they sit exactly over the corresponding text on the image.

**Alternative (simpler for scaling)**: Make the overlay the same size as the image in **natural** pixels (e.g. set overlay width/height to `naturalWidth`/`naturalHeight` and rely on the parent or image container to scale). Then position boxes with `left: x0px; top: y0px; width: (x1-x0)px; height: (y1-y0)px` and the whole overlay scales with the image. This avoids recalculating on resize if the wrapper scales the image and overlay together.

**Recommended**: Use a wrapper that contains both the `<img>` and the overlay, and size the overlay to 100% of the image’s **rendered** size. On image load (and optionally on window resize), compute scale from natural to rendered and position/size each box in the overlay with the same scale. Keep one overlay element and many child box divs (or one SVG with multiple `<rect>` elements).

### 2.3 Styling

- Frames: e.g. a 2px solid border (e.g. blue or a distinct color), no fill (transparent background).
- Optional: small label (field name) near each box or on hover. Can be a later enhancement.

### 2.4 When to show frames

- Show frames only when the result section is visible and the API response includes `bboxes` (and optionally `parsed`). If `bboxes` is empty or missing, show the image without frames.

---

## 3. Implementation order

1. **Parser**: Extend `extractFromLines` to record and return bboxes for each field (using the line’s bbox when a value is taken from that line). Expose bboxes from `parse()` and `extractPartial()` (e.g. return `{ data, bboxes }` or add `bboxes` to the returned object).
2. **Server**: Add `bboxes` (and if needed image dimensions) to the JSON response for success, duplicate, and malformed (when image + parsed are returned).
3. **Frontend**: Add wrapper + overlay around the receipt image; on image load (and when `bboxes` are present), create and position frame elements; style them; clear overlay when hiding the result or on new upload.

---

## 4. Edge cases

- **No layout**: If OCR returns no blocks/lines, bboxes will be empty; frontend shows image only, no frames.
- **Mixed extraction**: Some fields from layout (have bbox), some from regex (no bbox); draw only the frames we have.
- **Image scaling**: Use natural vs displayed size so frames stay aligned when the image is scaled (max-width/max-height) or when the window is resized. Consider a single `ResizeObserver` or `window.resize` to recompute overlay positions if the image container size changes.
- **Aspect ratio**: If the image is letterboxed (e.g. object-fit), the overlay should match the same visible rect; the plan above assumes the overlay is exactly over the image’s displayed area.

---

## 5. Files to touch

| Area        | File(s) |
|------------|---------|
| Parser     | [src/parser.js](src/parser.js) – `extractFromLines` return bboxes; `parse` / `extractPartial` expose them. |
| Server     | [src/index.js](src/index.js) – Add `bboxes` to response payload. |
| Frontend   | [public/index.html](public/index.html) – Wrapper + overlay markup and styles. |
| Frontend   | [public/app.js](public/app.js) – Pass `bboxes` to result view; on image load, create/position frame elements; clear on hide. |

---

## 6. Bbox format

- **From Tesseract**: Typically `{ x0, y0, x1, y1 }` in pixels (origin top-left). Use the same in the API.
- **Frontend**: Same; convert to CSS (e.g. `left`, `top`, `width`, `height` in px or scaled values) for the overlay.
