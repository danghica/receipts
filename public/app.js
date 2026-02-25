(function () {
  const FIELD_ORDER = ['发票号码', '开票日期', '名称1', '名称2', '项目名称', '金额', '税额', '名字'];

  const form = document.getElementById('form');
  const fileInput = document.getElementById('image');
  const submitBtn = document.getElementById('submit');
  const messageEl = document.getElementById('message');
  const resultSection = document.getElementById('result');
  const resultHeading = document.getElementById('result-heading');
  const receiptImage = document.getElementById('receipt-image');
  const receiptOverlay = document.getElementById('receipt-overlay');
  const parsedBody = document.getElementById('parsed-entries-body');
  const acceptReceiptBtn = document.getElementById('accept-receipt-btn');
  const acceptMessageEl = document.getElementById('accept-message');
  const uploadSuccessMsg = document.getElementById('upload-success-msg');
  const skipReceiptBtn = document.getElementById('skip-receipt-btn');
  const batchSummarySection = document.getElementById('batch-summary');
  const batchSummaryTbody = document.getElementById('batch-summary-table-body');

  let batchQueue = [];
  let addedReceipts = [];
  let batchMode = false;

  function showMessage(text, isError) {
    messageEl.textContent = text;
    messageEl.className = isError ? 'error' : 'success';
    messageEl.removeAttribute('aria-live');
    messageEl.setAttribute('aria-live', 'polite');
  }

  function showAcceptMessage(text, isError) {
    if (!acceptMessageEl) return;
    acceptMessageEl.textContent = text;
    acceptMessageEl.className = 'result-actions-message ' + (isError ? 'error' : 'success');
    acceptMessageEl.setAttribute('aria-live', 'polite');
  }

  function clearAcceptMessage() {
    if (acceptMessageEl) {
      acceptMessageEl.textContent = '';
      acceptMessageEl.className = 'result-actions-message';
    }
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
  }

  function inputValueForParsed(val) {
    if (val === null || val === undefined || val === '') return '';
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
    clearAcceptMessage();
    receiptOverlay.innerHTML = '';
    receiptImage.onload = null;
    receiptImage.src = imageDataUrl || '';
    resultHeading.textContent = added ? 'Receipt added' : 'Receipt';
    parsedBody.innerHTML = '';
    if (parsed && typeof parsed === 'object') {
      FIELD_ORDER.forEach(function (label) {
        var raw = parsed[label];
        var displayValue = inputValueForParsed(raw);
        var cellClass = (raw === null || raw === undefined || raw === '') ? 'parsed-missing' : '';
        var tr = document.createElement('tr');
        var th = document.createElement('th');
        th.scope = 'row';
        th.textContent = label;
        tr.appendChild(th);
        var tdVal = document.createElement('td');
        tdVal.className = cellClass;
        var input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('data-field', label);
        input.value = displayValue;
        tdVal.appendChild(input);
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

  function getCurrentFormPayload() {
    const payload = {};
    const fieldToKey = {
      '发票号码': 'invoiceNumber',
      '开票日期': 'invoiceDate',
      '名称1': 'name1',
      '名称2': 'name2',
      '项目名称': 'projectName',
      '金额': 'amount',
      '税额': 'tax',
      '名字': 'customName'
    };
    FIELD_ORDER.forEach(function (label) {
      const input = resultSection.querySelector('input[data-field="' + label + '"]');
      const key = fieldToKey[label];
      if (key && input) payload[key] = input.value != null ? String(input.value).trim() : '';
    });
    return payload;
  }

  function renderBatchSummary() {
    if (!batchSummaryTbody) return;
    batchSummaryTbody.innerHTML = '';
    if (addedReceipts.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.setAttribute('colspan', '8');
      td.textContent = 'No receipts were added in this batch.';
      tr.appendChild(td);
      batchSummaryTbody.appendChild(tr);
    } else {
      const colOrder = ['invoiceNumber', 'invoiceDate', 'name1', 'name2', 'projectName', 'amount', 'tax', 'customName'];
      addedReceipts.forEach(function (row) {
        const tr = document.createElement('tr');
        colOrder.forEach(function (key) {
          const td = document.createElement('td');
          td.textContent = row[key] != null ? String(row[key]) : '';
          tr.appendChild(td);
        });
        batchSummaryTbody.appendChild(tr);
      });
    }
    hideResult();
    if (batchSummarySection) batchSummarySection.classList.add('visible');
  }

  function advanceBatch() {
    if (batchQueue.length === 0) {
      hideResult();
      if (batchSummarySection) batchSummarySection.classList.add('visible');
      renderBatchSummary();
      batchMode = false;
      showSkipButton(false);
      if (acceptReceiptBtn) acceptReceiptBtn.disabled = false;
      return;
    }
    const nextFile = batchQueue.shift();
    setLoading(true);
    if (acceptReceiptBtn) acceptReceiptBtn.disabled = true;
    if (skipReceiptBtn) skipReceiptBtn.disabled = true;
    const formData = new FormData();
    formData.append('image', nextFile);
    fetch('/receipt', { method: 'POST', body: formData })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (result) {
        if (result.ok && result.data && result.data.image) {
          clearAcceptMessage();
          showResult(result.data.image, result.data.parsed || {}, false, result.data.bboxes, result.data.parsedCrops);
          showSkipButton(true);
        } else {
          showMessage(result.data && result.data.message ? result.data.message : 'Something went wrong.', true);
          batchQueue = [];
          hideResult();
          if (batchSummarySection) batchSummarySection.classList.add('visible');
          renderBatchSummary();
          batchMode = false;
          showSkipButton(false);
        }
      })
      .catch(function () {
        showMessage('Network or server error. Please try again.', true);
        batchQueue = [];
        hideResult();
        if (batchSummarySection) batchSummarySection.classList.add('visible');
        renderBatchSummary();
        batchMode = false;
        showSkipButton(false);
      })
      .finally(function () {
        setLoading(false);
        if (acceptReceiptBtn) acceptReceiptBtn.disabled = false;
        if (skipReceiptBtn) skipReceiptBtn.disabled = false;
      });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function hideBatchSummary() {
    if (batchSummarySection) batchSummarySection.classList.remove('visible');
  }

  function showSkipButton(show) {
    if (skipReceiptBtn) skipReceiptBtn.style.display = show ? '' : 'none';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const files = fileInput.files && Array.from(fileInput.files).filter(function (f) {
      return f && f.type && f.type.startsWith('image/');
    });
    if (!files || files.length === 0) {
      showMessage('Please select one or more image files.', true);
      return;
    }

    hideBatchSummary();

    setLoading(true);
    messageEl.textContent = '';
    messageEl.className = '';
    if (uploadSuccessMsg) uploadSuccessMsg.textContent = '';
    hideResult();

    if (files.length === 1) {
      const formData = new FormData();
      formData.append('image', files[0]);
      try {
        const res = await fetch('/receipt', { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          if (uploadSuccessMsg) uploadSuccessMsg.textContent = 'Receipt scanned. Review and accept.';
          if (data.image) showResult(data.image, data.parsed || {}, false, data.bboxes, data.parsedCrops);
          form.reset();
          return;
        }
        showMessage(data.message || 'Something went wrong.', true);
      } catch (err) {
        showMessage('Network or server error. Please try again.', true);
      } finally {
        setLoading(false);
      }
      return;
    }

    batchMode = true;
    addedReceipts = [];
    batchQueue = files.slice(1);
    const formData = new FormData();
    formData.append('image', files[0]);
    try {
      const res = await fetch('/receipt', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (uploadSuccessMsg) uploadSuccessMsg.textContent = 'Receipt 1 of ' + files.length + '. Review and accept or skip.';
        if (data.image) showResult(data.image, data.parsed || {}, false, data.bboxes, data.parsedCrops);
        showSkipButton(true);
      } else {
        showMessage(data.message || 'Something went wrong.', true);
        batchMode = false;
      }
    } catch (err) {
      showMessage('Network or server error. Please try again.', true);
      batchMode = false;
    } finally {
      setLoading(false);
    }
  });

  if (acceptReceiptBtn) {
    acceptReceiptBtn.addEventListener('click', function () {
      var payload = getCurrentFormPayload();
      acceptReceiptBtn.disabled = true;
      clearAcceptMessage();
      var formData = new FormData();
      Object.keys(payload).forEach(function (k) { formData.append(k, payload[k] || ''); });
      var imgSrc = receiptImage && receiptImage.src;
      var doAccept = function () {
        return fetch('/api/accept-receipt', { method: 'POST', body: formData });
      };
      var buildFormDataWithImage = function (blob) {
        formData.append('image', blob, (payload.invoiceNumber || 'receipt') + '.png');
        return doAccept();
      };
      var p = (imgSrc && imgSrc.indexOf('data:') === 0)
        ? fetch(imgSrc).then(function (r) { return r.blob(); }).then(buildFormDataWithImage)
        : doAccept();
      p.then(function (r) { return r.json().then(function (data) { return { ok: r.ok, status: r.status, data: data }; }); })
        .then(function (result) {
          if (result.ok && result.data && result.data.success) {
            showAcceptMessage('Receipt added. 发票号码: ' + (result.data.invoiceNumber || ''), false);
            resultHeading.textContent = 'Receipt added';
            if (batchMode) {
              addedReceipts.push(payload);
              if (batchQueue.length > 0) {
                acceptMessageEl.textContent = (acceptMessageEl ? acceptMessageEl.textContent : '') + ' Next receipt…';
              }
              advanceBatch();
              return;
            }
          } else if (result.status === 409) {
            showAcceptMessage(result.data && result.data.message ? result.data.message : '发票号码 already exists in spreadsheet.', true);
          } else {
            showAcceptMessage(result.data && result.data.message ? result.data.message : 'Failed to add receipt.', true);
          }
        })
        .catch(function () {
          showAcceptMessage('Network or server error. Please try again.', true);
        })
        .finally(function () {
          if (!batchMode) acceptReceiptBtn.disabled = false;
        });
    });
  }

  if (skipReceiptBtn) {
    skipReceiptBtn.addEventListener('click', function () {
      if (!batchMode) return;
      skipReceiptBtn.disabled = true;
      advanceBatch();
    });
  }
})();
