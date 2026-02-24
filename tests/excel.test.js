/**
 * Tests for excel.js. Uses a temp file so the real receipts.xlsx is not modified.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const tmpDir = path.join(os.tmpdir(), `receipt-excel-test-${Date.now()}`);
const testExcelPath = path.join(tmpDir, 'test-receipts.xlsx');

before(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  process.env.RECEIPTS_EXCEL_PATH = testExcelPath;
});

after(() => {
  try {
    if (fs.existsSync(testExcelPath)) fs.unlinkSync(testExcelPath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  } catch (_) {}
});

describe('excel (with temp file)', () => {
  it('resetReceipts creates file; getExistingInvoiceNumbers returns empty', async () => {
    const { resetReceipts, getExistingInvoiceNumbers } = require('../src/excel');
    await resetReceipts();
    assert(fs.existsSync(testExcelPath));
    const numbers = await getExistingInvoiceNumbers();
    assert(Array.isArray(numbers));
    assert.strictEqual(numbers.length, 0);
  });

  it('appendReceipt adds row; getExistingInvoiceNumbers returns it', async () => {
    const { appendReceipt, getExistingInvoiceNumbers } = require('../src/excel');
    await appendReceipt({
      invoiceNumber: '12345678901234',
      invoiceDate: '2024-01-15',
      name1: 'A',
      name2: 'B',
      projectName: 'Item',
      amount: 100,
      tax: 10,
      customName: 'Test',
      originalFileName: '',
    });
    const numbers = await getExistingInvoiceNumbers();
    assert(numbers.includes('12345678901234'));
  });

  it('getCustomNameByInvoiceNumber returns name for existing 发票号码', async () => {
    const { getCustomNameByInvoiceNumber } = require('../src/excel');
    const name = await getCustomNameByInvoiceNumber('12345678901234');
    assert.strictEqual(name, 'Test');
  });

  it('getCustomNameByInvoiceNumber returns null for unknown or empty', async () => {
    const { getCustomNameByInvoiceNumber } = require('../src/excel');
    assert.strictEqual(await getCustomNameByInvoiceNumber('nonexistent'), null);
    assert.strictEqual(await getCustomNameByInvoiceNumber(''), null);
    assert.strictEqual(await getCustomNameByInvoiceNumber(null), null);
  });
});
