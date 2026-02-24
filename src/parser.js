/**
 * Validate and normalize receipt data (dates, amounts).
 * Used after ROI-based extraction; validates required fields and formats.
 */

function normalizeAmount(str) {
  if (str == null || typeof str !== 'string') return null;
  const withDot = str.replace(/[,，]/g, '.').replace(/[￥元\s]/g, '').trim();
  const num = parseFloat(withDot);
  return Number.isFinite(num) ? num : null;
}

function normalizeDate(str) {
  if (str == null || typeof str !== 'string') return null;
  const s = str.trim();
  const cnMatch = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (cnMatch) {
    const [, y, m, d] = cnMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const dashMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dashMatch) {
    const [, y, m, d] = dashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const slashMatch = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slashMatch) {
    const [, y, m, d] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function throwValidationError(errors) {
  const headerErrors = errors.filter((e) => e.startsWith('发票号码') || e.startsWith('开票日期'));
  const namesError = errors.find((e) => e.startsWith('Expected 2 名称'));
  const otherErrors = errors.filter((e) => !headerErrors.includes(e) && e !== namesError);
  const parts = [];
  if (headerErrors.length > 0) {
    parts.push('Missing or invalid header (one of each per receipt): ' + headerErrors.join(', '));
  }
  if (namesError) parts.push(namesError);
  if (otherErrors.length > 0) parts.push('Missing or invalid: ' + otherErrors.join(', '));
  const msg = parts.join('. ');
  const err = new Error(msg);
  err.code = 'MALFORMED';
  err.details = errors;
  throw err;
}

/**
 * Validate extracted receipt data. Throws with code 'MALFORMED' and descriptive message.
 * @param {{ invoiceNumber?: string, invoiceDate?: string, name1?: string, name2?: string, projectName?: string, amount?: number, tax?: number }} data
 */
function validateExtracted(data) {
  const errors = [];
  const invoiceNumber = data && data.invoiceNumber != null ? String(data.invoiceNumber) : '';
  const invoiceDate = data && data.invoiceDate;
  const name1 = data && data.name1;
  const name2 = data && data.name2;
  const projectName = data && data.projectName != null ? String(data.projectName) : '';
  const amount = data && data.amount;
  const tax = data && data.tax;

  if (invoiceNumber.trim() === '') {
    errors.push('发票号码');
  } else if (!/^\d+$/.test(invoiceNumber)) {
    errors.push('发票号码 (must be digits)');
  }
  if (invoiceDate == null) {
    errors.push('开票日期');
  }
  const nameCount = [name1, name2].filter((n) => n != null && String(n).trim() !== '').length;
  if (nameCount < 2) {
    errors.push(`Expected 2 名称, found ${nameCount}`);
  }
  if (projectName.trim() === '') {
    errors.push('项目名称');
  }
  if (amount == null) {
    errors.push('金额');
  }
  if (tax == null) {
    errors.push('税额');
  }
  if (errors.length > 0) {
    throwValidationError(errors);
  }
}

module.exports = { normalizeDate, normalizeAmount, validateExtracted };
