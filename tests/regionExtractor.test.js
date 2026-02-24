/**
 * Tests for regionExtractor.js: getRegionBboxesPixels, loadRegionConfig, getConfigPath.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const {
  getRegionBboxesPixels,
  loadRegionConfig,
  getConfigPath,
} = require('../src/regionExtractor');

describe('getRegionBboxesPixels', () => {
  const normalizedConfig = {
    发票号码: { x0: 0.75, y0: 0.03, x1: 1, y1: 0.09 },
    开票日期: { x0: 0.75, y0: 0.07, x1: 1, y1: 0.13 },
    名称1: { x0: 0.068, y0: 0.19, x1: 0.457, y1: 0.28 },
    名称2: { x0: 0.566, y0: 0.19, x1: 1, y1: 0.28 },
    项目名称: { x0: 0, y0: 0.4, x1: 0.217, y1: 0.47 },
    金额: { x0: 0.675, y0: 0.4, x1: 0.76, y1: 0.47 },
    税额: { x0: 0.929, y0: 0.4, x1: 1, y1: 0.47 },
  };

  it('returns empty object for null config or missing dimensions', () => {
    assert.deepStrictEqual(getRegionBboxesPixels(null, 100, 100), {});
    assert.deepStrictEqual(getRegionBboxesPixels(normalizedConfig, null, 100), {});
    assert.deepStrictEqual(getRegionBboxesPixels(normalizedConfig, 100, null), {});
  });

  it('scales normalized (0-1) regions to pixel bboxes', () => {
    const w = 400;
    const h = 300;
    const bboxes = getRegionBboxesPixels(normalizedConfig, w, h);
    assert.strictEqual(Object.keys(bboxes).length, 7);
    assert.deepStrictEqual(bboxes['发票号码'], {
      x0: 300,
      y0: 9,
      x1: 400,
      y1: 27,
    });
    assert.deepStrictEqual(bboxes['税额'], {
      x0: 371.6,
      y0: 120,
      x1: 400,
      y1: 141,
    });
  });

  it('scales with _refWidth/_refHeight when present', () => {
    const refConfig = {
      _refWidth: 800,
      _refHeight: 600,
      发票号码: { x0: 600, y0: 18, x1: 800, y1: 54 },
      开票日期: { x0: 600, y0: 42, x1: 800, y1: 78 },
      名称1: { x0: 54.4, y0: 114, x1: 365.6, y1: 168 },
      名称2: { x0: 452.8, y0: 114, x1: 800, y1: 168 },
      项目名称: { x0: 0, y0: 240, x1: 173.6, y1: 282 },
      金额: { x0: 540, y0: 240, x1: 608, y1: 282 },
      税额: { x0: 743.2, y0: 240, x1: 800, y1: 282 },
    };
    const bboxes = getRegionBboxesPixels(refConfig, 400, 300);
    assert.strictEqual(bboxes['发票号码'].x0, 300);
    assert.strictEqual(bboxes['发票号码'].y0, 9);
  });
});

describe('loadRegionConfig', () => {
  it('returns config object when config file exists in project', () => {
    const config = loadRegionConfig();
    if (config) {
      assert(typeof config === 'object');
      assert(config['发票号码']);
      assert.strictEqual(typeof config['发票号码'].x0, 'number');
    }
  });
});

describe('getConfigPath', () => {
  it('returns a path ending with receipt-regions.json', () => {
    const p = getConfigPath();
    assert(p.endsWith('receipt-regions.json'));
  });
});
