#!/usr/bin/env node
/**
 * Download Tesseract Chinese language data to ./tessdata for offline use.
 * Run once: npm run download-tessdata
 * Then OCR will load from disk instead of the CDN.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const TESSDATA = path.join(__dirname, '..', 'tessdata');
const LANGS = ['chi_sim', 'chi_tra'];
const BASE = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data';
const VERSION = '4.0.0';

function download(url, onProgress) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`${url} → ${res.statusCode}`));
        return;
      }
      const total = parseInt(res.headers['content-length'], 10) || null;
      const chunks = [];
      let received = 0;
      let lastReported = 0;
      const step = 256 * 1024;
      res.on('data', (c) => {
        chunks.push(c);
        received += c.length;
        if (onProgress && (received - lastReported >= step || received === total)) {
          lastReported = received;
          const pct = total ? Math.round((received / total) * 100) : null;
          const mb = (received / (1024 * 1024)).toFixed(1);
          const totalMb = total ? (total / (1024 * 1024)).toFixed(1) : '?';
          onProgress(received, total, pct, mb, totalMb);
        }
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(TESSDATA, { recursive: true });
  for (const lang of LANGS) {
    const url = `${BASE}/${lang}/${VERSION}/${lang}.traineddata.gz`;
    const file = path.join(TESSDATA, `${lang}.traineddata.gz`);
    if (fs.existsSync(file)) {
      console.log(`${lang}: already exists, skip`);
      continue;
    }
    process.stdout.write(`${lang}: downloading... 0%\n`);
    const buf = await download(url, (received, total, pct, mb, totalMb) => {
      const pctStr = pct != null ? `${pct}%` : `${mb} MB`;
      process.stdout.write(`\r${lang}: ${mb} / ${totalMb} MB (${pctStr})   `);
    });
    process.stdout.write('\n');
    fs.writeFileSync(file, buf);
    console.log(`${lang}: saved to ${file}`);
  }
  console.log('Done. OCR will use ./tessdata when present.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
