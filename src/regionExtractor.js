/**
 * ROI-based receipt extraction: crop each configured region from the image,
 * run OCR on each crop, normalize text (remove spaces), assign to fields.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { normalizeDate, normalizeAmount } = require('./parser');
const { recognize } = require('./ocr');

const CONFIG_PATH = path.resolve(__dirname, '..', 'config', 'receipt-regions.json');

const FIELD_KEYS = ['发票号码', '开票日期', '名称1', '名称2', '项目名称', '金额', '税额'];

function getConfigPath() {
  const fromCwd = path.resolve(process.cwd(), 'config', 'receipt-regions.json');
  if (fs.existsSync(fromCwd)) return fromCwd;
  if (fs.existsSync(CONFIG_PATH)) return CONFIG_PATH;
  return fromCwd;
}

/**
 * Load region config from config/receipt-regions.json.
 * @returns {Record<string, { x0: number, y0: number, x1: number, y1: number }> | null}
 */
function loadRegionConfig() {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
      console.error('[receipt-regions] Config file not found. Tried:', configPath, 'and', CONFIG_PATH, 'cwd:', process.cwd());
      return null;
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    if (!config || typeof config !== 'object') {
      console.error('[receipt-regions] Invalid config: not an object');
      return null;
    }
    for (const key of FIELD_KEYS) {
      const r = config[key];
      if (!r || typeof r.x0 !== 'number' || typeof r.y0 !== 'number' || typeof r.x1 !== 'number' || typeof r.y1 !== 'number') {
        console.error('[receipt-regions] Invalid config: missing or invalid region for key', key, 'got', r);
        return null;
      }
    }
    return config;
  } catch (e) {
    console.error('[receipt-regions] Failed to load config:', e.message);
    return null;
  }
}

/**
 * Map config field key to result property.
 */
function getResultKey(key) {
  const map = {
    发票号码: 'invoiceNumber',
    开票日期: 'invoiceDate',
    名称1: 'name1',
    名称2: 'name2',
    项目名称: 'projectName',
    金额: 'amount',
    税额: 'tax',
  };
  return map[key] || key;
}

/**
 * Scale region to pixel bbox for current image size.
 * If config has _refWidth and _refHeight, r is in reference pixels; else r is normalized 0-1.
 */
function scaleRegionToPixels(r, imageWidth, imageHeight, config) {
  const refW = config && config._refWidth > 0 ? config._refWidth : null;
  const refH = config && config._refHeight > 0 ? config._refHeight : null;
  if (refW != null && refH != null) {
    return {
      x0: r.x0 * (imageWidth / refW),
      y0: r.y0 * (imageHeight / refH),
      x1: r.x1 * (imageWidth / refW),
      y1: r.y1 * (imageHeight / refH),
    };
  }
  return {
    x0: r.x0 * imageWidth,
    y0: r.y0 * imageHeight,
    x1: r.x1 * imageWidth,
    y1: r.y1 * imageHeight,
  };
}

/**
 * Get pixel bboxes from region config for a given image size (for overlay display).
 */
function getRegionBboxesPixels(regionConfig, imageWidth, imageHeight) {
  const bboxes = {};
  if (!regionConfig || imageWidth == null || imageHeight == null) return bboxes;
  for (const key of FIELD_KEYS) {
    const r = regionConfig[key];
    if (!r) continue;
    bboxes[key] = scaleRegionToPixels(r, imageWidth, imageHeight, regionConfig);
  }
  return bboxes;
}

/**
 * Normalize extracted text: trim and remove all spaces.
 */
function normalizeSpaces(str) {
  return (str || '').trim().replace(/\s+/g, '');
}

/** Saturation threshold: pixels with (max(R,G,B)-min(R,G,B)) > this are considered colored and set to white. */
const SATURATION_THRESHOLD = 28;

/**
 * Set all colored pixels to white; leave black and grey pixels unchanged.
 * @param {Buffer} rawRGBA Buffer of raw RGBA pixels (4 bytes per pixel)
 * @param {number} width
 * @param {number} height
 * @returns {Buffer} Raw RGB buffer (3 bytes per pixel) for the result image
 */
function coloredPixelsToWhite(rawRGBA, width, height) {
  const out = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const R = rawRGBA[i * 4];
    const G = rawRGBA[i * 4 + 1];
    const B = rawRGBA[i * 4 + 2];
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const saturation = max - min;
    if (saturation > SATURATION_THRESHOLD) {
      out[i * 3] = 255;
      out[i * 3 + 1] = 255;
      out[i * 3 + 2] = 255;
    } else {
      out[i * 3] = R;
      out[i * 3 + 1] = G;
      out[i * 3 + 2] = B;
    }
  }
  return out;
}

/**
 * Extract receipt fields by cropping each region and running OCR on each crop.
 * @param {Buffer} imageBuffer Cropped/normalized receipt image
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @param {Record<string, { x0, y0, x1, y1 }>} regionConfig Normalized 0-1 or reference pixels
 * @returns {Promise<{ invoiceNumber: string, invoiceDate: string, name1: string, name2: string, projectName: string, amount: number, tax: number, bboxes: Record<string, { x0, y0, x1, y1 }> }>}
 */
async function extractFromRegions(imageBuffer, imageWidth, imageHeight, regionConfig) {
  const result = {
    invoiceNumber: '',
    invoiceDate: '',
    name1: '',
    name2: '',
    projectName: '',
    amount: null,
    tax: null,
    bboxes: {},
    crops: {},
  };

  const w = Math.max(1, Math.round(imageWidth));
  const h = Math.max(1, Math.round(imageHeight));

  for (const key of FIELD_KEYS) {
    const r = regionConfig[key];
    if (!r) continue;
    const pixel = scaleRegionToPixels(r, imageWidth, imageHeight, regionConfig);
    result.bboxes[key] = pixel;

    let left = Math.round(pixel.x0);
    let top = Math.round(pixel.y0);
    let width = Math.round(pixel.x1 - pixel.x0);
    let height = Math.round(pixel.y1 - pixel.y0);

    left = Math.max(0, Math.min(left, w - 1));
    top = Math.max(0, Math.min(top, h - 1));
    width = Math.max(1, Math.min(width, w - left));
    height = Math.max(1, Math.min(height, h - top));

    let raw = '';
    try {
      const croppedMeta = await sharp(imageBuffer)
        .extract({ left, top, width, height })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const { data: rawRGBA, info } = croppedMeta;
      const roiW = info.width;
      const roiH = info.height;
      const rgbNoColor = coloredPixelsToWhite(rawRGBA, roiW, roiH);
      const forOcr = await sharp(rgbNoColor, { raw: { width: roiW, height: roiH, channels: 3 } })
        .png()
        .toBuffer();
      result.crops[key] = forOcr.toString('base64');
      const ocrResult = await recognize(forOcr);
      raw = normalizeSpaces(ocrResult.text || '');
    } catch (e) {
      raw = '';
    }

    if (key === '发票号码') {
      const digitsOnly = (raw || '').replace(/发票号码/g, '').replace(/\D/g, '');
      result.invoiceNumber = digitsOnly;
    } else if (key === '开票日期') {
      const normalized = normalizeDate(raw);
      result.invoiceDate = normalized != null ? normalized : raw;
    } else if (key === '金额') {
      const amountStr = (raw || '').replace(/[^\d.,，\s]/g, '');
      const num = normalizeAmount(amountStr);
      result.amount = num != null && Number.isFinite(num) ? num : null;
    } else if (key === '税额') {
      const taxStr = (raw || '').replace(/[^\d.,，\s]/g, '');
      const num = normalizeAmount(taxStr);
      result.tax = num != null && Number.isFinite(num) ? num : null;
    } else {
      const prop = getResultKey(key);
      if (prop && result.hasOwnProperty(prop)) {
        let value = raw;
        if (key === '名称1' || key === '名称2') {
          value = (raw || '').replace(/^[：:]\s*/, '');
        }
        result[prop] = value;
      }
    }
  }

  return result;
}

module.exports = { loadRegionConfig, getConfigPath, extractFromRegions, getRegionBboxesPixels };
