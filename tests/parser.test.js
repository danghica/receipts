/**
 * Tests for parser.js: normalizeDate, normalizeAmount, validateExtracted.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { normalizeDate, normalizeAmount, validateExtracted } = require('../src/parser');

describe('normalizeAmount', () => {
  it('returns number for simple decimal string', () => {
    assert.strictEqual(normalizeAmount('123.45'), 123.45);
    assert.strictEqual(normalizeAmount('0'), 0);
    assert.strictEqual(normalizeAmount('408.17'), 408.17);
  });

  it('replaces comma with dot (comma treated as decimal separator)', () => {
    assert.strictEqual(normalizeAmount('1,234.56'), 1.234); // comma → dot gives "1.234.56" → 1.234
    assert.strictEqual(normalizeAmount('408，17'), 408.17);   // Chinese comma → dot
  });

  it('strips ￥ 元 and spaces', () => {
    assert.strictEqual(normalizeAmount('￥ 408.17'), 408.17);
    assert.strictEqual(normalizeAmount('408 元'), 408);
  });

  it('returns null for null, undefined, non-string', () => {
    assert.strictEqual(normalizeAmount(null), null);
    assert.strictEqual(normalizeAmount(undefined), null);
    assert.strictEqual(normalizeAmount(123), null);
  });

  it('returns null for empty or non-numeric string', () => {
    assert.strictEqual(normalizeAmount(''), null);
    assert.strictEqual(normalizeAmount('abc'), null);
    assert.strictEqual(normalizeAmount('  '), null);
  });
});

describe('normalizeDate', () => {
  it('normalizes Chinese date format to ISO-like', () => {
    assert.strictEqual(normalizeDate('2024年1月5日'), '2024-01-05');
    assert.strictEqual(normalizeDate('2024 年 12 月 31 日'), '2024-12-31');
  });

  it('normalizes dash-separated date', () => {
    assert.strictEqual(normalizeDate('2024-01-05'), '2024-01-05');
    assert.strictEqual(normalizeDate('2024-1-5'), '2024-01-05');
  });

  it('normalizes slash-separated date', () => {
    assert.strictEqual(normalizeDate('2024/01/05'), '2024-01-05');
  });

  it('returns null for null, undefined, non-string', () => {
    assert.strictEqual(normalizeDate(null), null);
    assert.strictEqual(normalizeDate(undefined), null);
  });

  it('returns null for invalid or unrecognized format', () => {
    assert.strictEqual(normalizeDate(''), null);
    assert.strictEqual(normalizeDate('not a date'), null);
    assert.strictEqual(normalizeDate('01/05/2024'), null);
  });
});

describe('validateExtracted', () => {
  const validData = {
    invoiceNumber: '26337000000187987298',
    invoiceDate: '2024-01-15',
    name1: 'Seller Name',
    name2: 'Buyer Name',
    projectName: 'Some Item',
    amount: 408.17,
    tax: 12.34,
  };

  it('does not throw for valid data', () => {
    assert.doesNotThrow(() => validateExtracted(validData));
  });

  it('throws MALFORMED for missing 发票号码', () => {
    assert.throws(
      () => validateExtracted({ ...validData, invoiceNumber: '' }),
      (err) => err.code === 'MALFORMED' && err.message.includes('发票号码')
    );
  });

  it('throws MALFORMED for 发票号码 with non-digits', () => {
    assert.throws(
      () => validateExtracted({ ...validData, invoiceNumber: 'ABC123' }),
      (err) => err.code === 'MALFORMED' && err.message.includes('must be digits')
    );
  });

  it('throws MALFORMED for missing 开票日期', () => {
    assert.throws(
      () => validateExtracted({ ...validData, invoiceDate: null }),
      (err) => err.code === 'MALFORMED' && err.message.includes('开票日期')
    );
  });

  it('throws MALFORMED when fewer than 2 名称', () => {
    assert.throws(
      () => validateExtracted({ ...validData, name1: '', name2: '' }),
      (err) => err.code === 'MALFORMED' && err.message.includes('Expected 2 名称')
    );
    assert.throws(
      () => validateExtracted({ ...validData, name2: '' }),
      (err) => err.code === 'MALFORMED'
    );
  });

  it('throws MALFORMED for missing 项目名称', () => {
    assert.throws(
      () => validateExtracted({ ...validData, projectName: '' }),
      (err) => err.code === 'MALFORMED' && err.message.includes('项目名称')
    );
  });

  it('throws MALFORMED for missing 金额 or 税额', () => {
    assert.throws(
      () => validateExtracted({ ...validData, amount: null }),
      (err) => err.code === 'MALFORMED' && err.message.includes('金额')
    );
    assert.throws(
      () => validateExtracted({ ...validData, tax: null }),
      (err) => err.code === 'MALFORMED' && err.message.includes('税额')
    );
  });

  it('sets err.details to the list of error fields', () => {
    try {
      validateExtracted({ ...validData, invoiceNumber: '', invoiceDate: null });
    } catch (err) {
      assert.strictEqual(err.code, 'MALFORMED');
      assert(Array.isArray(err.details));
      assert(err.details.includes('发票号码'));
      assert(err.details.includes('开票日期'));
    }
  });
});
