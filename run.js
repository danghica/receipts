#!/usr/bin/env node
/**
 * Start the app with TESSDATA_PREFIX removed from the environment.
 * This prevents Tesseract native code from trying to load ./eng.traineddata.
 * Usage: node run.js
 */
const { spawn } = require('child_process');
const path = require('path');

const env = { ...process.env };
delete env.TESSDATA_PREFIX;

const child = spawn(
  process.execPath,
  ['-r', path.join(__dirname, 'src', 'unset-tessdata.js'), path.join(__dirname, 'src', 'index.js')],
  {
    env,
    stdio: 'inherit',
    cwd: __dirname,
  }
);

child.on('exit', (code, signal) => {
  process.exit(code != null ? code : signal ? 128 + signal : 0);
});
