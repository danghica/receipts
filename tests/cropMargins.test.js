/**
 * Tests for cropMargins.js.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { cropMargins } = require('../src/cropMargins');

describe('cropMargins', () => {
  it('returns same reference for null or undefined', async () => {
    assert.strictEqual(await cropMargins(null), null);
    assert.strictEqual(await cropMargins(undefined), undefined);
  });

  it('returns same buffer for empty buffer', async () => {
    const empty = Buffer.alloc(0);
    const result = await cropMargins(empty);
    assert.strictEqual(result, empty);
  });

  it('returns same buffer for non-Buffer input that is truthy', async () => {
    const notBuffer = {};
    const result = await cropMargins(notBuffer);
    assert.strictEqual(result, notBuffer);
  });

  it('returns a buffer for valid image buffer', async () => {
    const sharp = require('sharp');
    const tinyImage = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
    const result = await cropMargins(tinyImage);
    assert(Buffer.isBuffer(result));
    assert(result.length > 0);
  });

  it('returns original buffer on sharp failure (invalid image)', async () => {
    const invalid = Buffer.from('not an image');
    const result = await cropMargins(invalid);
    assert.strictEqual(result, invalid);
  });
});
