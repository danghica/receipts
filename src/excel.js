const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const EXCEL_PATH = process.env.RECEIPTS_EXCEL_PATH || path.join(process.cwd(), 'receipts.xlsx');
const ORIGINALS_DIR = path.join(process.cwd(), 'ORIGINALS');

const HEADERS = [
  '发票号码',
  '开票日期',
  '名称1',
  '名称2',
  '项目名称',
  '金额',
  '税额',
  '名字',
  'ORIGINAL',
  '全部',
];

let writeLock = null;

function withLock(fn) {
  return async (...args) => {
    while (writeLock) await writeLock;
    writeLock = fn(...args);
    try {
      return await writeLock;
    } finally {
      writeLock = null;
    }
  };
}

async function createEmptyWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Receipts', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };
  return workbook;
}

async function getOrCreateWorkbook() {
  if (fs.existsSync(EXCEL_PATH)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(EXCEL_PATH);
    const sheet = workbook.worksheets[0];
    if (sheet) {
      const cell8 = sheet.getCell(1, 8);
      if (cell8.value == null || String(cell8.value).trim() === '') {
        cell8.value = '名字';
      }
      const cell9 = sheet.getCell(1, 9);
      if (cell9.value == null || String(cell9.value).trim() === '') {
        cell9.value = 'ORIGINAL';
      }
      const cell10 = sheet.getCell(1, 10);
      if (cell10.value == null || String(cell10.value).trim() === '') {
        cell10.value = '全部';
      }
    }
    return workbook;
  }
  return createEmptyWorkbook();
}

async function resetReceipts() {
  const workbook = await createEmptyWorkbook();
  await workbook.xlsx.writeFile(EXCEL_PATH);
}

async function getExistingInvoiceNumbers() {
  const workbook = await getOrCreateWorkbook();
  const sheet = workbook.worksheets[0];
  const numbers = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const cell = sheet.getCell(r, 1);
    const val = cell.value;
    if (val != null && String(val).trim() !== '') numbers.push(String(val).trim());
  }
  return numbers;
}

/** Returns the 名字 (custom name) for the row with the given 发票号码, or null if not found. */
async function getCustomNameByInvoiceNumber(invoiceNumber) {
  if (invoiceNumber == null || String(invoiceNumber).trim() === '') return null;
  const workbook = await getOrCreateWorkbook();
  const sheet = workbook.worksheets[0];
  const key = String(invoiceNumber).trim();
  for (let r = 2; r <= sheet.rowCount; r++) {
    const cell = sheet.getCell(r, 1);
    const val = cell.value;
    if (val != null && String(val).trim() === key) {
      const nameCell = sheet.getCell(r, 8);
      const nameVal = nameCell.value;
      return nameVal != null ? String(nameVal).trim() : '';
    }
  }
  return null;
}

async function appendReceipt(data) {
  const workbook = await getOrCreateWorkbook();
  const sheet = workbook.worksheets[0];
  const amount = data.amount != null ? Number(data.amount) : 0;
  const tax = data.tax != null ? Number(data.tax) : 0;
  const total = amount + tax;
  const row = [
    data.invoiceNumber,
    data.invoiceDate,
    data.name1,
    data.name2,
    data.projectName,
    data.amount,
    data.tax,
    data.customName != null ? data.customName : '',
    data.originalFileName != null ? data.originalFileName : '',
    total,
  ];
  sheet.addRow(row);
  await workbook.xlsx.writeFile(EXCEL_PATH);
}

const getExistingInvoiceNumbersLocked = withLock(getExistingInvoiceNumbers);
const getCustomNameByInvoiceNumberLocked = withLock(getCustomNameByInvoiceNumber);
const appendReceiptLocked = withLock(appendReceipt);
const resetReceiptsLocked = withLock(resetReceipts);

module.exports = {
  EXCEL_PATH,
  ORIGINALS_DIR,
  getExistingInvoiceNumbers: getExistingInvoiceNumbersLocked,
  getCustomNameByInvoiceNumber: getCustomNameByInvoiceNumberLocked,
  appendReceipt: appendReceiptLocked,
  resetReceipts: resetReceiptsLocked,
};
