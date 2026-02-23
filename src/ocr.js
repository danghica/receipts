const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');
const DEBUG_LOG = path.join(__dirname, '..', '.cursor', 'debug-b98c5b.log');
function dlog(location, message, data, hypothesisId) { try { fs.appendFileSync(DEBUG_LOG, JSON.stringify({ sessionId: 'b98c5b', location, message, data: data || {}, timestamp: Date.now(), hypothesisId }) + '\n'); } catch (e) {} }

const LANG = 'chi_sim+chi_tra';
const TESSDATA_DIR = path.join(__dirname, '..', 'tessdata');

function useLocalTessdata() {
  try {
    return (
      fs.existsSync(path.join(TESSDATA_DIR, 'chi_sim.traineddata.gz')) &&
      fs.existsSync(path.join(TESSDATA_DIR, 'chi_tra.traineddata.gz'))
    );
  } catch (e) {
    return false;
  }
}

const WORKER_PATH = path.join(
  __dirname,
  '..',
  'node_modules',
  'tesseract.js',
  'src',
  'worker-script',
  'node',
  'index.js'
);

/**
 * Run Chinese OCR on an image buffer.
 * @param {Buffer} imageBuffer
 * @returns {Promise<{ text: string }>}
 */
async function recognize(imageBuffer) {
  dlog('ocr.js:recognize entry', 'recognize started', { bufferLen: (imageBuffer && imageBuffer.length) || 0 }, 'H4');
  delete process.env.TESSDATA_PREFIX;

  const workerOptions = {
    logger: () => {},
    workerPath: WORKER_PATH,
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0',
    cachePath: path.join(__dirname, '..', '.tesseract-cache'),
  };
  if (useLocalTessdata()) {
    workerOptions.langPath = TESSDATA_DIR;
  }
  const worker = await createWorker(LANG, 1, workerOptions);
  dlog('ocr.js:after createWorker', 'createWorker resolved', {}, 'H4');
  try {
    const result = await worker.recognize(imageBuffer);
    dlog('ocr.js:after worker.recognize', 'worker.recognize resolved', {}, 'H4');
    const data = result.data || {};
    const text = (data.text || '').trim();
    return { text };
  } finally {
    await worker.terminate();
  }
}

module.exports = { recognize };
