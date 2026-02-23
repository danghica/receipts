# Receipt region calibration

The file `receipt-regions.json` defines where to read each field on the receipt image. Overlays and extraction use these regions.

## Why overlays can be misaligned

Coordinates are sensitive to **image size and aspect ratio**. If your reference image had different dimensions or crop than the receipts you upload, the same numbers will land on different parts of the page (e.g. on labels instead of values).

## Two coordinate modes

### 1. Normalized (0–1) – default

Each region is `{ "x0", "y0", "x1", "y1" }` with values between 0 and 1:

- `x0` = left edge as fraction of image width  
- `y0` = top edge as fraction of image height  
- `x1` = right edge, `y1` = bottom edge  

**Use when:** All your receipt images have the **same aspect ratio and crop** as the image you used to measure.

### 2. Reference pixels

Add to the config:

```json
"_refWidth": 1000,
"_refHeight": 655
```

Then give each region in **pixels** for an image of that size (e.g. 1000×655). The app will scale regions to the actual image size. This keeps alignment when only resolution changes, not layout.

**Use when:** You measure once in an image editor (e.g. 1000×655) and want to reuse those pixel coordinates.

## How to calibrate

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
   - **Reference pixels:** set `_refWidth` and `_refHeight` to the image size, and use pixel values (e.g. left, top, right, bottom) for each region.

If 项目名称 / 金额 / 税额 end up on the “合计” labels instead of the table row, your y values are too large: move the boxes **up** by using smaller y0/y1 (or measure the table row again).
