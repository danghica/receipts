/**
 * Parse OCR text from a Chinese receipt and validate.
 * Per receipt: 1 发票号码, 1 开票日期, 2 名称, 1 项目名称, 1 金额, 1 税额.
 * Handles OCR with spaces inside key words and values adjacent to labels.
 * When Tesseract returns lines (layout), we associate label with value by same line.
 * Returns { invoiceNumber, invoiceDate, name1, name2, projectName, amount, tax } or throws.
 */

/** Build regex source that matches key with optional spaces between characters (OCR-friendly). */
function keyPattern(key) {
  const escaped = key.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return escaped.join('\\s*');
}

/** Normalize line for matching: collapse spaces so "发 票 号 码" matches "发票号码". */
function lineNorm(s) {
  return (s || '').replace(/\s+/g, '').trim();
}

/**
 * Find value on a line that contains the label. Value is text after ":" or after the label.
 * line.text can have spaces (OCR); label can be "发票号码" or regex source.
 */
function valueFromLine(lineText, labelPattern) {
  const norm = lineNorm(lineText);
  const re = typeof labelPattern === 'string'
    ? new RegExp(labelPattern.replace(/\s+/g, '') + '[：:]?\\s*(.+)', 'i')
    : labelPattern;
  const m = (lineText || '').match(re) || norm.match(re);
  return m && m[1] ? m[1].replace(/\s+/g, ' ').trim() : null;
}

/**
 * Normalize bbox from Tesseract (may have x0,y0,x1,y1) to { x0, y0, x1, y1 }.
 */
function normBbox(bbox) {
  if (!bbox || typeof bbox !== 'object') return null;
  const x0 = bbox.x0 ?? bbox.left;
  const y0 = bbox.y0 ?? bbox.top;
  const x1 = bbox.x1 ?? (bbox.left != null && bbox.width != null ? bbox.left + bbox.width : null);
  const y1 = bbox.y1 ?? (bbox.top != null && bbox.height != null ? bbox.top + bbox.height : null);
  if (x0 == null || y0 == null || x1 == null || y1 == null) return null;
  return { x0, y0, x1, y1 };
}

/**
 * Find amount value under a column identified by the first occurrence of a label (e.g. 金额 or 税额).
 * Uses word-level bboxes: first word matching the label in reading order defines the column; value is
 * the first amount-like word in lines below that overlaps the column.
 * @param {Array<{ text, bbox, words? }>} lines
 * @param {'金额'|'税额'} columnLabel
 * @returns {{ value: number|null, bbox: { x0, y0, x1, y1 }|null }}
 */
function findAmountUnderColumn(lines, columnLabel) {
  const entries = [];
  (lines || []).forEach((line, lineIdx) => {
    const words = line && line.words && Array.isArray(line.words) ? line.words : [];
    words.forEach((w) => {
      if (w && w.bbox && w.bbox.x0 != null && w.bbox.y0 != null) {
        entries.push({ word: w, lineIdx, line });
      }
    });
  });
  if (entries.length === 0) return { value: null, bbox: null };
  entries.sort((a, b) => {
    const ya = a.word.bbox.y0;
    const yb = b.word.bbox.y0;
    if (ya !== yb) return ya - yb;
    return (a.word.bbox.x0 || 0) - (b.word.bbox.x0 || 0);
  });
  const isAmountCol = (w) => {
    const n = lineNorm(w.text || '');
    if (columnLabel === '金额') return n === '金' || n === '金额' || /^金\s*额?$/.test(n);
    if (columnLabel === '税额') return n === '税' || n === '税额' || n === '税领' || /^税\s*[额领]?$/.test(n);
    return false;
  };
  const header = entries.find((e) => isAmountCol(e.word));
  if (!header) return { value: null, bbox: null };
  const h = header.word.bbox;
  const colX0 = h.x0 - 5;
  const colX1 = (h.x1 || h.x0) + 5;
  const headerY1 = h.y1 != null ? h.y1 : h.y0 + 1;
  const below = entries.filter((e) => (e.word.bbox.y0 || 0) >= headerY1 - 2);
  const overlaps = (w) => {
    const x0 = w.bbox.x0 || 0;
    const x1 = w.bbox.x1 != null ? w.bbox.x1 : w.bbox.x0 || 0;
    return x0 < colX1 && x1 > colX0;
  };
  const amountLike = (t) => /[\d,，.．.\s]/.test(t || '') && /\d/.test(t) && Number.isFinite(normalizeAmount(t));
  const candidates = below.filter((e) => overlaps(e.word) && amountLike(e.word.text));
  if (candidates.length === 0) return { value: null, bbox: null };
  candidates.sort((a, b) => {
    const ya = a.word.bbox.y0 || 0;
    const yb = b.word.bbox.y0 || 0;
    if (ya !== yb) return ya - yb;
    return (a.word.bbox.x0 || 0) - (b.word.bbox.x0 || 0);
  });
  const chosen = candidates[0].word;
  const value = normalizeAmount(chosen.text);
  return { value: Number.isFinite(value) ? value : null, bbox: normBbox(chosen.bbox) };
}

/**
 * Extract fields using line layout: find the line containing the label, value is rest of line.
 * Returns { fields, bboxes }. bboxes is keyed by field label (发票号码, 开票日期, 名称1, 名称2, 项目名称, 金额, 税额).
 */
function extractFromLines(lines) {
  const out = {};
  const bboxes = {};
  if (!lines || lines.length === 0) return { fields: out, bboxes };

  const hasWords = lines.some((l) => l && l.words && Array.isArray(l.words) && l.words.length > 0);
  if (hasWords) {
    const amt = findAmountUnderColumn(lines, '金额');
    if (amt.value != null) {
      out.amount = amt.value;
      if (amt.bbox) bboxes['金额'] = amt.bbox;
    }
    const taxResult = findAmountUnderColumn(lines, '税额');
    if (taxResult.value != null) {
      out.tax = taxResult.value;
      if (taxResult.bbox) bboxes['税额'] = taxResult.bbox;
    }
  }

  for (const line of lines) {
    const raw = (line && line.text) ? line.text : '';
    const norm = lineNorm(raw);
    if (norm.includes('发票号码') && /\d+/.test(raw)) {
      const v = valueFromLine(raw, /发票\s*号\s*码\s*[：:\s]*([^\s]+)/);
      if (v && /^\d+$/.test(v.replace(/\s/g, ''))) {
        out.invoiceNumber = v.replace(/\s/g, '');
        const b = normBbox(line.bbox);
        if (b) bboxes['发票号码'] = b;
      }
    }
    if (norm.includes('开票日期') && /\d{4}/.test(raw)) {
      const v = valueFromLine(raw, /开\s*票\s*日\s*期\s*[：:\s]*(.+)/);
      if (v) {
        out.invoiceDate = v;
        const b = normBbox(line.bbox);
        if (b) bboxes['开票日期'] = b;
      }
    }
  }
  const nameLineObjs = lines.filter((l) => {
    const t = (l && l.text) ? l.text : '';
    const n = lineNorm(t);
    return n.includes('名称') && (n.includes('：') || n.includes(':') || (t.match(/名称\s*[：:\s]/) && t.length > 10));
  });
  if (nameLineObjs.length >= 2) {
    const v1 = valueFromLine(nameLineObjs[0].text, /名\s*称\s*[：:\s]*(.+)/);
    const v2 = valueFromLine(nameLineObjs[1].text, /名\s*称\s*[：:\s]*(.+)/);
    if (v1) {
      out.name1 = v1;
      const b = normBbox(nameLineObjs[0].bbox);
      if (b) bboxes['名称1'] = b;
    }
    if (v2) {
      out.name2 = v2;
      const b = normBbox(nameLineObjs[1].bbox);
      if (b) bboxes['名称2'] = b;
    }
  } else if (nameLineObjs.length === 1) {
    const raw = nameLineObjs[0].text || '';
    const nameRegex = /名\s*称\s*[：:\s]*([^\n]+?)(?=\s*名\s*称|项\s*目|金\s*额|税\s*[额领]|$)/g;
    const matches = [...raw.matchAll(nameRegex)];
    if (matches.length >= 2) {
      const v1 = (matches[0][1] || '').replace(/\s*[罗等]\s*$/, '').trim();
      const v2 = (matches[1][1] || '').trim();
      if (v1) out.name1 = v1;
      if (v2) out.name2 = v2;
      const b = normBbox(nameLineObjs[0].bbox);
      if (b) {
        if (out.name1) bboxes['名称1'] = b;
        if (out.name2) bboxes['名称2'] = b;
      }
    } else if (matches.length === 1) {
      const v1 = (matches[0][1] || '').replace(/\s*[罗等]\s*$/, '').trim();
      if (v1) {
        out.name1 = v1;
        const b = normBbox(nameLineObjs[0].bbox);
        if (b) bboxes['名称1'] = b;
      }
    }
  }
  for (const line of lines) {
    const raw = (line && line.text) ? line.text : '';
    const norm = lineNorm(raw);
    if (norm.includes('项目名称') && !out.projectName) {
      const v = valueFromLine(raw, /项\s*目\s*名\s*称\s*[：:\s]*([^规格单位数量单价]*?)(?=\s*规格|\s*单位|$)/);
      if (v && v.replace(/\s/g, '').length > 0) {
        out.projectName = v.trim();
        const b = normBbox(line.bbox);
        if (b) bboxes['项目名称'] = b;
      }
    }
    if (norm.includes('金额') && /[\d.]+/.test(raw) && !out.amount) {
      const m = raw.match(/金\s*额\s*[：:\s]*([\d.\s,，]+)/) || raw.match(/([\d.]+\s*[\d.]+)/);
      if (m && m[1]) {
        out.amount = normalizeAmount(m[1]);
        const b = normBbox(line.bbox);
        if (b) bboxes['金额'] = b;
      }
    }
    if ((norm.includes('税额') || norm.includes('税领')) && /[\d.]+/.test(raw) && !out.tax) {
      const m = raw.match(/税\s*[额领]\s*[：:\s]*([\d.\s,，]+)/) || raw.match(/(\d+\.?\d*)\s*$/);
      if (m && m[1]) {
        out.tax = normalizeAmount(m[1]);
        const b = normBbox(line.bbox);
        if (b) bboxes['税额'] = b;
      }
    }
  }
  return { fields: out, bboxes };
}

/**
 * For any field that has a value but no bbox, find a line containing that value and use its bbox.
 * Normalizes numbers (strip spaces) so "408. 17" matches "408.17".
 */
function assignBboxesFromValueLines(lines, valueByKey, bboxes) {
  const result = { ...bboxes };
  if (!lines || lines.length === 0) return result;
  const keys = ['发票号码', '开票日期', '名称1', '名称2', '项目名称', '金额', '税额'];
  for (const key of keys) {
    if (result[key]) continue;
    let val = valueByKey[key];
    if (val == null || val === '') continue;
    val = String(val).trim();
    const line = lines.find((l) => {
      const t = (l && l.text) || '';
      if (t.includes(val)) return true;
      const tNorm = t.replace(/\s/g, '');
      const vNorm = val.replace(/\s/g, '');
      if (vNorm.length >= 2 && tNorm.includes(vNorm)) return true;
      if (/^[\d.]+$/.test(vNorm) && t.replace(/[\s,，]/g, '').includes(vNorm)) return true;
      return false;
    });
    if (line) {
      const b = normBbox(line.bbox);
      if (b) result[key] = b;
    }
  }
  return result;
}

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

function extractInvoiceNumber(text) {
  const k1 = keyPattern('发票号码');
  const k2 = keyPattern('号码');
  const patterns = [
    new RegExp(k1 + '\\s*[：:\\s]*(\\d+)'),
    new RegExp(k1 + '\\s*[：:\\s]*([^\\s\\n]+)'),
    new RegExp(k2 + '\\s*[：:\\s]*(\\d+)'),
    /发票号码[：:\s]*(\d+)/,
    /发票号码[：:\s]*([^\s\n]+)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function extractInvoiceDate(text) {
  const dateCore = '(\\d{4}\\s*年\\s*\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日?|\\d{4}[-/]\\d{1,2}[-/]\\d{1,2})';
  const k1 = keyPattern('开票日期');
  const k2 = keyPattern('日期');
  const patterns = [
    new RegExp(k1 + '\\s*[：:\\s]*' + dateCore),
    new RegExp(k2 + '\\s*[：:\\s]*' + dateCore),
    /开票日期[：:\s]*(\d{4}[-年/]\d{1,2}[-月/]\d{1,2}[日]?)/,
    /开票日期[：:\s]*(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日?)/,
    /日期[：:\s]*(\d{4}[-年/]\d{1,2}[-月/]\d{1,2}[日]?)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function extractNames(text) {
  const nameKey = keyPattern('名称');
  const nextKey = '(?:' + [keyPattern('名称'), keyPattern('项目名称'), keyPattern('金额'), keyPattern('税额')].join('|') + ')';
  const re = new RegExp(nameKey + '\\s*[：:\\s]*([^\\n]+?)(?=' + nextKey + '|$)', 'g');
  const names = [...text.matchAll(re)].map((m) => m[1].trim());
  if (names.length === 0) {
    const fallback = /名称[：:\s]*([^\n]+?)(?=\s*名称|项目名称|金额|税额|$)/g;
    return [...text.matchAll(fallback)].map((m) => m[1].trim());
  }
  return names;
}

function extractProjectName(text) {
  const k = keyPattern('项目名称');
  const nextKey = '(?:' + [keyPattern('名称'), keyPattern('金额'), keyPattern('税额')].join('|') + ')';
  const re = new RegExp(k + '\\s*[：:\\s]*([^\\n]+?)(?=' + nextKey + '|规格|单位|数量|单价|$)', 'i');
  let m = text.match(re);
  if (m && m[1]) return m[1].trim();
  m = text.match(/项目名称[：:\s]*([^\n]+?)(?=\s*名称|金额|税额|$)/);
  return m && m[1] ? m[1].trim() : null;
}

function extractAmount(text) {
  const k = keyPattern('金额');
  const re = new RegExp(k + '\\s*[：:\\s]*([\\d.￥元\\s,，]+)');
  let m = text.match(re);
  if (m && m[1]) return normalizeAmount(m[1]);
  const kComma = '金\\s*[,，]?\\s*额';
  const reComma = new RegExp(kComma + '\\s*[：:\\s]*([\\d.￥元\\s,，]+)');
  m = text.match(reComma);
  if (m && m[1]) return normalizeAmount(m[1]);
  m = text.match(/金额[：:\s]*([\d.￥元\s,，]+)/);
  return m && m[1] ? normalizeAmount(m[1]) : null;
}

function extractTax(text) {
  const k = keyPattern('税额');
  const re = new RegExp(k + '\\s*[：:\\s]*([\\d.￥元\\s,，]+)');
  let m = text.match(re);
  if (m && m[1]) return normalizeAmount(m[1]);
  const taxKeyAlt = keyPattern('税') + '\\s*[额领]\\s*';
  const reAlt = new RegExp(taxKeyAlt + '[：:\\s]*([\\d.￥元\\s,，]+)');
  m = text.match(reAlt);
  if (m && m[1]) return normalizeAmount(m[1]);
  m = text.match(/税额[：:\s]*([\d.￥元\s,，]+)/);
  return m && m[1] ? normalizeAmount(m[1]) : null;
}

/**
 * Parse and validate. Returns { invoiceNumber, invoiceDate, name1, name2, projectName, amount, tax } or throws.
 * If lines[] is provided (from Tesseract layout), uses same-line association first, then fills gaps with regex.
 */
function parse(text, lines) {
  const errors = [];
  const layoutResult = Array.isArray(lines) && lines.length > 0 ? extractFromLines(lines) : { fields: {}, bboxes: {} };
  const layout = layoutResult.fields;
  const layoutBboxes = layoutResult.bboxes || {};
  const invoiceNumber = layout.invoiceNumber != null ? layout.invoiceNumber : extractInvoiceNumber(text);
  const invoiceDateRaw = layout.invoiceDate != null ? layout.invoiceDate : extractInvoiceDate(text);
  const invoiceDate = invoiceDateRaw ? normalizeDate(invoiceDateRaw) : null;
  let names = [];
  if (layout.name1 != null && layout.name2 != null) {
    names = [layout.name1, layout.name2];
  } else {
    names = extractNames(text);
    if (layout.name1 != null) names[0] = layout.name1;
    if (layout.name2 != null) names[1] = layout.name2;
  }
  const projectName = layout.projectName != null ? layout.projectName : extractProjectName(text);
  const amount = layout.amount != null ? layout.amount : extractAmount(text);
  const tax = layout.tax != null ? layout.tax : extractTax(text);

  if (invoiceNumber == null || String(invoiceNumber).trim() === '') {
    errors.push('发票号码');
  } else if (!/^\d+$/.test(String(invoiceNumber))) {
    errors.push('发票号码 (must be digits)');
  }

  if (invoiceDate == null) {
    errors.push('开票日期');
  }

  if (names.length < 2) {
    errors.push(`Expected 2 名称, found ${names.length}`);
  }

  if (projectName == null || String(projectName).trim() === '') {
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

  const valueByKey = {
    发票号码: String(invoiceNumber).trim(),
    开票日期: invoiceDate,
    名称1: names[0] || '',
    名称2: names[1] || '',
    项目名称: String(projectName).trim(),
    金额: amount,
    税额: tax,
  };
  const finalBboxes = Array.isArray(lines) && lines.length > 0
    ? assignBboxesFromValueLines(lines, valueByKey, layoutBboxes)
    : layoutBboxes;

  return {
    invoiceNumber: valueByKey.发票号码,
    invoiceDate: valueByKey.开票日期,
    name1: valueByKey.名称1,
    name2: valueByKey.名称2,
    projectName: valueByKey.项目名称,
    amount: valueByKey.金额,
    tax: valueByKey.税额,
    bboxes: finalBboxes,
  };
}

/**
 * Extract all fields without validation. Returns same shape as parsed but with null or '' for missing.
 * When lines are provided, uses layout association first.
 */
function extractPartial(text, lines) {
  const layoutResult = Array.isArray(lines) && lines.length > 0 ? extractFromLines(lines) : { fields: {}, bboxes: {} };
  const layout = layoutResult.fields;
  const invoiceNumber = layout.invoiceNumber != null ? layout.invoiceNumber : extractInvoiceNumber(text);
  const invoiceDateRaw = layout.invoiceDate != null ? layout.invoiceDate : extractInvoiceDate(text);
  const invoiceDate = invoiceDateRaw ? normalizeDate(invoiceDateRaw) : null;
  let names = extractNames(text);
  if (layout.name1 != null) names[0] = layout.name1;
  if (layout.name2 != null) names[1] = layout.name2;
  const projectName = layout.projectName != null ? layout.projectName : extractProjectName(text);
  const amount = layout.amount != null ? layout.amount : extractAmount(text);
  const tax = layout.tax != null ? layout.tax : extractTax(text);
  const parsed = {
    发票号码: invoiceNumber != null && String(invoiceNumber).trim() !== '' ? String(invoiceNumber).trim() : null,
    开票日期: invoiceDate,
    名称1: names[0] != null ? String(names[0]).trim() : null,
    名称2: names[1] != null ? String(names[1]).trim() : null,
    项目名称: projectName != null && String(projectName).trim() !== '' ? String(projectName).trim() : null,
    金额: amount != null ? amount : null,
    税额: tax != null ? tax : null,
  };
  const partialBboxes = Array.isArray(lines) && lines.length > 0
    ? assignBboxesFromValueLines(lines, parsed, layoutResult.bboxes || {})
    : (layoutResult.bboxes || {});

  return {
    parsed,
    bboxes: partialBboxes,
  };
}

/**
 * Validate extracted receipt data. Throws with code 'MALFORMED' and same messages as parse().
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

module.exports = { parse, extractPartial, normalizeDate, normalizeAmount, validateExtracted };
