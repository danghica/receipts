(function () {
  const form = document.getElementById('form');
  const fileInput = document.getElementById('image');
  const submitBtn = document.getElementById('submit');
  const messageEl = document.getElementById('message');
  const resultSection = document.getElementById('result');
  const resultHeading = document.getElementById('result-heading');
  const receiptImage = document.getElementById('receipt-image');
  const receiptOverlay = document.getElementById('receipt-overlay');
  const parsedBody = document.getElementById('parsed-entries-body');
  const resetReceiptsBtn = document.getElementById('reset-receipts-btn');

  function showMessage(text, isError) {
    messageEl.textContent = text;
    messageEl.className = isError ? 'error' : 'success';
    messageEl.removeAttribute('aria-live');
    messageEl.setAttribute('aria-live', 'polite');
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
  }

  function formatParsedValue(val) {
    if (val === null || val === undefined || val === '') return '—';
    return String(val);
  }

  function configToPixelBboxes(regionConfig, width, height) {
    if (!regionConfig || !width || !height) return {};
    var refW = regionConfig._refWidth > 0 ? regionConfig._refWidth : null;
    var refH = regionConfig._refHeight > 0 ? regionConfig._refHeight : null;
    var bboxes = {};
    Object.keys(regionConfig).forEach(function (label) {
      if (label.indexOf('_') === 0) return;
      var r = regionConfig[label];
      if (!r || typeof r.x0 !== 'number' || typeof r.y0 !== 'number' || typeof r.x1 !== 'number' || typeof r.y1 !== 'number') return;
      if (refW != null && refH != null) {
        bboxes[label] = {
          x0: r.x0 * (width / refW),
          y0: r.y0 * (height / refH),
          x1: r.x1 * (width / refW),
          y1: r.y1 * (height / refH)
        };
      } else {
        bboxes[label] = {
          x0: r.x0 * width,
          y0: r.y0 * height,
          x1: r.x1 * width,
          y1: r.y1 * height
        };
      }
    });
    return bboxes;
  }

  function drawRegionOverlay(img, overlay, bboxes) {
    if (!overlay || !img || !bboxes || typeof bboxes !== 'object') return;
    var keys = Object.keys(bboxes);
    if (keys.length === 0) return;
    var nw = img.naturalWidth;
    var nh = img.naturalHeight;
    if (!nw || !nh) return;
    var dw = img.offsetWidth;
    var dh = img.offsetHeight;
    if (!dw || !dh) return;
    var sx = dw / nw;
    var sy = dh / nh;
    overlay.innerHTML = '';
    keys.forEach(function (label) {
      var b = bboxes[label];
      if (!b || b.x0 == null || b.y0 == null || b.x1 == null || b.y1 == null) return;
      var x0 = b.x0 * sx;
      var y0 = b.y0 * sy;
      var w = (b.x1 - b.x0) * sx;
      var h = (b.y1 - b.y0) * sy;
      var frame = document.createElement('div');
      frame.className = 'region-frame';
      frame.setAttribute('title', label);
      frame.style.left = x0 + 'px';
      frame.style.top = y0 + 'px';
      frame.style.width = w + 'px';
      frame.style.height = h + 'px';
      overlay.appendChild(frame);
      var lbl = document.createElement('div');
      lbl.className = 'region-label';
      lbl.textContent = label;
      lbl.style.left = x0 + 'px';
      lbl.style.top = Math.max(0, y0 - 18) + 'px';
      overlay.appendChild(lbl);
    });
  }

  function showResult(imageDataUrl, parsed, added, bboxes, parsedCrops) {
    receiptOverlay.innerHTML = '';
    receiptImage.onload = null;
    receiptImage.src = imageDataUrl || '';
    resultHeading.textContent = added ? 'Receipt added' : 'Receipt could not be added';
    parsedBody.innerHTML = '';
    if (parsed && typeof parsed === 'object') {
      var keys = Object.keys(parsed).filter(function (k) { return k !== 'bboxes'; });
      keys.forEach(function (label) {
        var raw = parsed[label];
        var display = formatParsedValue(raw);
        var cellClass = (raw === null || raw === undefined || raw === '') ? 'parsed-missing' : '';
        var tr = document.createElement('tr');
        var th = document.createElement('th');
        th.scope = 'row';
        th.textContent = label;
        tr.appendChild(th);
        var tdVal = document.createElement('td');
        tdVal.className = cellClass;
        tdVal.textContent = display;
        tr.appendChild(tdVal);
        var tdRoi = document.createElement('td');
        tdRoi.className = 'parsed-roi-cell';
        if (parsedCrops && parsedCrops[label]) {
          var img = document.createElement('img');
          img.src = parsedCrops[label];
          img.alt = label + ' crop';
          img.title = label;
          tdRoi.appendChild(img);
        } else {
          tdRoi.textContent = '—';
        }
        tr.appendChild(tdRoi);
        parsedBody.appendChild(tr);
      });
    }
    function drawOverlay() {
      var nw = receiptImage.naturalWidth;
      var nh = receiptImage.naturalHeight;
      if (!nw || !nh) return;
      fetch('/api/receipt-regions').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (regionConfig) {
        if (!regionConfig) return;
        var pixelBboxes = configToPixelBboxes(regionConfig, nw, nh);
        if (Object.keys(pixelBboxes).length > 0) drawRegionOverlay(receiptImage, receiptOverlay, pixelBboxes);
      });
    }
    receiptImage.onload = drawOverlay;
    if (receiptImage.complete && receiptImage.naturalWidth) drawOverlay();
    resultSection.classList.add('visible');
  }

  function hideResult() {
    resultSection.classList.remove('visible');
    receiptImage.removeAttribute('src');
    receiptImage.onload = null;
    receiptOverlay.innerHTML = '';
    parsedBody.innerHTML = '';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      showMessage('Please select an image file.', true);
      return;
    }

    setLoading(true);
    messageEl.textContent = '';
    messageEl.className = '';
    hideResult();

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/receipt', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));

      if (data.success) {
        const msg = data.invoiceNumber
          ? "Receipt added. 发票号码: " + data.invoiceNumber
          : (data.message || 'Receipt added.');
        showMessage(msg, false);
        if (data.image) showResult(data.image, data.parsed || {}, true, data.bboxes, data.parsedCrops);
        form.reset();
        return;
      }

      if (data.error === 'duplicate') {
        showMessage('发票号码 already exists in spreadsheet. This receipt was not added.', true);
        if (data.image) showResult(data.image, data.parsed || {}, false, data.bboxes, data.parsedCrops);
        return;
      }

      if (data.error === 'malformed') {
        showMessage('Invalid or incomplete data: ' + (data.message || 'check the receipt image.'), true);
        if (data.image) showResult(data.image, data.parsed || {}, false, data.bboxes, data.parsedCrops);
        return;
      }

      showMessage(data.message || 'Something went wrong.', true);
      if (data.image) showResult(data.image, data.parsed || {}, false, data.bboxes, data.parsedCrops);
    } catch (err) {
      showMessage('Network or server error. Please try again.', true);
    } finally {
      setLoading(false);
    }
  });

  if (resetReceiptsBtn) {
    resetReceiptsBtn.addEventListener('click', function () {
      if (!confirm('Clear all receipt data from receipts.xlsx? This cannot be undone.')) return;
      resetReceiptsBtn.disabled = true;
      fetch('/api/reset-receipts', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.success) {
            showMessage(data.message || 'Spreadsheet reset.', false);
          } else {
            showMessage(data.message || 'Failed to reset.', true);
          }
        })
        .catch(function () {
          showMessage('Network or server error. Please try again.', true);
        })
        .finally(function () {
          resetReceiptsBtn.disabled = false;
        });
    });
  }
})();
