// Prevent Tesseract.js worker from using system tessdata (avoids "Error opening data file ./eng.traineddata").
delete process.env.TESSDATA_PREFIX;

const fs = require('fs');
const express = require('express');
const path = require('path');
const DEBUG_LOG = path.join(__dirname, '..', '.cursor', 'debug-b98c5b.log');
try { fs.mkdirSync(path.dirname(DEBUG_LOG), { recursive: true }); } catch (e) {}
function dlog(location, message, data, hypothesisId) { try { fs.appendFileSync(DEBUG_LOG, JSON.stringify({ sessionId: 'b98c5b', location, message, data: data || {}, timestamp: Date.now(), hypothesisId }) + '\n'); } catch (e) {} }
const imageSize = require('image-size');
const multer = require('multer');
const { cropMargins } = require('./cropMargins');
const sharp = require('sharp');
const { validateExtracted, normalizeDate, normalizeAmount } = require('./parser');
const { loadRegionConfig, getConfigPath, extractFromRegions, getRegionBboxesPixels } = require('./regionExtractor');
const { getExistingInvoiceNumbers, appendReceipt, resetReceipts, ORIGINALS_DIR } = require('./excel');

(function logRegionConfig() {
  const configPath = getConfigPath();
  console.log('[receipt-regions] Config path:', configPath, '| exists:', fs.existsSync(configPath), '| cwd:', process.cwd());
  const config = loadRegionConfig();
  console.log('[receipt-regions] Config loaded:', !!config);
})();

let SERVER_STARTED = null;

const app = express();
const PORT_BASE = parseInt(process.env.PORT, 10) || 3000;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowed = /^image\/(jpeg|png|gif|webp)$/i;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'));
  },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/build', (req, res) => {
  res.json({ timestamp: SERVER_STARTED || new Date().toISOString() });
});

app.get('/api/receipt-regions', (req, res) => {
  const config = loadRegionConfig();
  if (!config) return res.status(404).json({ error: 'Region config not found' });
  res.json(config);
});

app.post('/api/reset-receipts', async (req, res) => {
  try {
    await resetReceipts();
    res.json({ success: true, message: 'Spreadsheet reset. All receipt data has been cleared.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Failed to reset spreadsheet.',
    });
  }
});

app.post('/api/accept-receipt', upload.single('image'), async (req, res) => {
  try {
    const body = req.body || {};
    const invoiceNumber = body.invoiceNumber != null ? String(body.invoiceNumber).trim() : '';
    const invoiceDateRaw = body.invoiceDate != null ? String(body.invoiceDate).trim() : '';
    const invoiceDate = invoiceDateRaw ? normalizeDate(invoiceDateRaw) : null;
    const name1 = body.name1 != null ? String(body.name1).trim() : '';
    const name2 = body.name2 != null ? String(body.name2).trim() : '';
    const projectName = body.projectName != null ? String(body.projectName).trim() : '';
    const amount = normalizeAmount(body.amount);
    const tax = normalizeAmount(body.tax);
    const customNameRaw = body.customName != null ? String(body.customName).trim() : '';
    const customName = customNameRaw.replace(/\s+/g, '');

    const data = {
      invoiceNumber,
      invoiceDate,
      name1,
      name2,
      projectName,
      amount: amount != null ? amount : null,
      tax: tax != null ? tax : null,
      customName,
      originalFileName: '',
    };

    try {
      validateExtracted(data);
    } catch (e) {
      const message = e.code === 'MALFORMED' ? e.message : 'Missing or invalid: ' + (e.message || 'parse error');
      return res.status(400).json({ success: false, message });
    }

    const existing = await getExistingInvoiceNumbers();
    if (existing.includes(data.invoiceNumber)) {
      return res.status(409).json({
        success: false,
        message: '发票号码 already exists in spreadsheet.',
      });
    }

    if (req.file && req.file.buffer && data.invoiceNumber) {
      try {
        fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
        const ext = (req.file.mimetype === 'image/jpeg' || req.file.mimetype === 'image/jpg') ? '.jpg' : req.file.mimetype === 'image/png' ? '.png' : req.file.mimetype === 'image/webp' ? '.webp' : '.png';
        const safeName = String(data.invoiceNumber).replace(/[^a-zA-Z0-9._-]/g, '') || 'receipt';
        const filename = safeName + ext;
        const filepath = path.join(ORIGINALS_DIR, filename);
        fs.writeFileSync(filepath, req.file.buffer);
        data.originalFileName = filename;
      } catch (e) {
        console.error('Failed to save original image:', e);
      }
    }

    await appendReceipt(data);
    return res.status(200).json({
      success: true,
      message: 'Receipt added.',
      invoiceNumber: data.invoiceNumber,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while accepting the receipt.',
    });
  }
});

app.get('/', (req, res) => {
  // #region agent log
  dlog('index.js:GET /', 'home page requested', {}, 'H1');
  // #endregion
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.post('/receipt', upload.single('image'), async (req, res) => {
  // #region agent log
  dlog('index.js:POST /receipt', 'request entered', { hasFile: !!(req && req.file), hasBuffer: !!(req && req.file && req.file.buffer) }, 'H2');
  // #endregion
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        error: 'malformed',
        message: 'Missing or invalid: no image file uploaded.',
      });
    }

    let imageBuffer = req.file.buffer;
    try {
      imageBuffer = await cropMargins(imageBuffer);
    } catch (e) {
      imageBuffer = req.file.buffer;
    }

    let imageWidth;
    let imageHeight;
    try {
      const dimensions = imageSize(imageBuffer);
      imageWidth = dimensions && dimensions.width;
      imageHeight = dimensions && dimensions.height;
    } catch (e) {
      imageWidth = null;
      imageHeight = null;
    }
    if ((imageWidth == null || imageHeight == null || imageWidth <= 0 || imageHeight <= 0) && imageBuffer && imageBuffer.length > 0) {
      try {
        const meta = await sharp(imageBuffer).metadata();
        if (meta && meta.width > 0 && meta.height > 0) {
          imageWidth = meta.width;
          imageHeight = meta.height;
        }
      } catch (e2) {}
    }
    if ((imageWidth == null || imageHeight == null || imageWidth <= 0 || imageHeight <= 0) && req.file.buffer && req.file.buffer !== imageBuffer) {
      try {
        const dims = imageSize(req.file.buffer);
        if (dims && dims.width > 0 && dims.height > 0) {
          imageWidth = dims.width;
          imageHeight = dims.height;
        }
      } catch (e2) {}
      if ((imageWidth == null || imageHeight == null) && req.file.buffer.length > 0) {
        try {
          const meta = await sharp(req.file.buffer).metadata();
          if (meta && meta.width > 0 && meta.height > 0) {
            imageWidth = meta.width;
            imageHeight = meta.height;
          }
        } catch (e3) {}
      }
    }

    const regionConfig = loadRegionConfig();
    const useRegions = regionConfig && imageWidth != null && imageHeight != null && imageWidth > 0 && imageHeight > 0;
    const overlayBboxes = useRegions ? getRegionBboxesPixels(regionConfig, imageWidth, imageHeight) : {};

    const imageBase64 = imageBuffer.toString('base64');
    const imageDataUrl = `data:${req.file.mimetype};base64,${imageBase64}`;
    const withImage = (payload) => ({ ...payload, image: imageDataUrl });

    if (!useRegions) {
      const message = regionConfig
        ? 'Could not read image dimensions. The image format may not be supported.'
        : 'Region config required. Add config/receipt-regions.json.';
      return res.status(400).json(withImage({
        success: false,
        error: 'malformed',
        message,
        bboxes: overlayBboxes,
      }));
    }

    const OCR_TIMEOUT_MS = 600000;
    const timeoutPromise = new Promise((_, reject) => {
      dlog('index.js:timeout scheduled', 'OCR timeout scheduled', { timeoutMs: OCR_TIMEOUT_MS, at: Date.now() }, 'H1');
      setTimeout(() => reject(new Error('OCR_TIMEOUT')), OCR_TIMEOUT_MS);
    });
    let data;
    try {
      data = await Promise.race([
        extractFromRegions(imageBuffer, imageWidth, imageHeight, regionConfig),
        timeoutPromise,
      ]);
    } catch (ocrErr) {
      if (ocrErr && ocrErr.message === 'OCR_TIMEOUT') {
        dlog('index.js:OCR timeout', 'OCR timed out', { timeoutMs: OCR_TIMEOUT_MS }, 'H2');
        return res.status(503).json(withImage({
          success: false,
          error: 'server',
          message: 'OCR timed out. The recognition service may be slow or unavailable. Please try again.',
        }));
      }
      throw ocrErr;
    }
    dlog('index.js:after extractFromRegions', 'extractFromRegions returned', {}, 'H5');
    const parsedCrops = {};
    if (data.crops && req.file.mimetype) {
      for (const k of Object.keys(data.crops)) {
        parsedCrops[k] = `data:${req.file.mimetype};base64,${data.crops[k]}`;
      }
    }
    return res.status(200).json({
      image: imageDataUrl,
      parsed: {
        发票号码: data.invoiceNumber,
        开票日期: data.invoiceDate,
        名称1: data.name1,
        名称2: data.name2,
        项目名称: data.projectName,
        金额: data.amount,
        税额: data.tax,
      },
      parsedCrops,
      bboxes: overlayBboxes,
    });
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'malformed',
        message: 'Image file too large. Maximum size is 10MB.',
      });
    }
    if (err.message && err.message.includes('Only image files')) {
      return res.status(400).json({
        success: false,
        error: 'malformed',
        message: err.message,
      });
    }
    console.error(err);
    return res.status(500).json({
      success: false,
      error: 'server',
      message: 'An error occurred while processing the receipt.',
    });
  }
});

const PORT_MAX_OFFSET = 10;

function tryListen(port, offset = 0) {
  const p = port + offset;
  const server = app.listen(p, () => {
    if (SERVER_STARTED == null) SERVER_STARTED = new Date().toISOString();
    // #region agent log
    dlog('index.js:listen callback', 'server listening', { port: p }, 'H1');
    // #endregion
    console.log(`Receipt management app running at http://localhost:${p}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && offset < PORT_MAX_OFFSET) {
      console.warn(`Port ${p} in use, trying ${p + 1}...`);
      tryListen(port, offset + 1);
    } else {
      throw err;
    }
  });
}

tryListen(PORT_BASE);
