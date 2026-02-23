/**
 * Crop outer white (or near-white) margins from an image so that normalized
 * region coordinates align consistently across different scans.
 * Uses sharp's trim with an explicit white background.
 */

const sharp = require('sharp');

const WHITE_THRESHOLD = 15; // Pixels within this difference from white (0-255) are trimmed

/**
 * Trim border pixels that are white or near-white from all edges.
 * @param {Buffer} imageBuffer - Raw image file buffer (JPEG, PNG, WebP, etc.)
 * @returns {Promise<Buffer>} Cropped image buffer in same format, or original buffer on failure
 */
async function cropMargins(imageBuffer) {
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    return imageBuffer;
  }
  try {
    const cropped = await sharp(imageBuffer)
      .trim({
        background: '#ffffff',
        threshold: WHITE_THRESHOLD,
      })
      .toBuffer();
    return cropped.length > 0 ? cropped : imageBuffer;
  } catch (e) {
    return imageBuffer;
  }
}

module.exports = { cropMargins };
