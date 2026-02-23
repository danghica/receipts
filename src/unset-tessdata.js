// Unset TESSDATA_PREFIX so Tesseract.js loads language data from CDN only.
// Use: node -r ./src/unset-tessdata.js src/index.js
delete process.env.TESSDATA_PREFIX;
