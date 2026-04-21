const STORAGE_KEY = 'small-memory-draft-v3';

const defaultPage = () => ({
  text: '',
  font: 'block',
  size: 22,
  textColor: '#555555',
  bgColor: '#ffffff',
  align: 'center',
  lineHeight: 1.6,
  margin: 6,
});

let state = {
  pages: [defaultPage()],
  currentPage: 0,
};

const els = {
  pageText: document.getElementById('pageText'),
  square: document.getElementById('square'),
  pageMeta: document.getElementById('pageMeta'),
  prevPage: document.getElementById('prevPage'),
  nextPage: document.getElementById('nextPage'),
  addPage: document.getElementById('addPage'),
  deletePage: document.getElementById('deletePage'),
  exportJpeg: document.getElementById('exportJpeg'),
  saveJson: document.getElementById('saveJson'),
  loadJson: document.getElementById('loadJson'),
  exportTxt: document.getElementById('exportTxt'),
  newDoc: document.getElementById('newDoc'),
  sizeRange: document.getElementById('sizeRange'),
  textColor: document.getElementById('textColor'),
  bgColor: document.getElementById('bgColor'),
  lineRange: document.getElementById('lineRange'),
  marginRange: document.getElementById('marginRange'),
  jsonFileInput: document.getElementById('jsonFileInput'),
};

function getPage() { return state.pages[state.currentPage]; }

function saveDraft() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.pages) && parsed.pages.length) state = parsed;
  } catch {}
}

function syncPageMeta() {
  els.pageMeta.textContent = `Page ${state.currentPage + 1} / ${state.pages.length}`;
}

function ensurePage(index) {
  while (state.pages.length <= index) state.pages.push(defaultPage());
}

function clonePageStyle(page) {
  return {
    font: page.font,
    size: page.size,
    textColor: page.textColor,
    bgColor: page.bgColor,
    align: page.align,
    lineHeight: page.lineHeight,
    margin: page.margin,
  };
}

function getFontStack(font) {
  return font === 'mincho'
    ? '"Times New Roman", "Hiragino Mincho ProN", "Yu Mincho", serif'
    : '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';
}

function createMeasureBox(page) {
  const box = document.createElement('div');
  const squareRect = els.square.getBoundingClientRect();
  const padPx = (page.margin / 100) * squareRect.width;
  box.style.position = 'fixed';
  box.style.left = '-99999px';
  box.style.top = '0';
  box.style.visibility = 'hidden';
  box.style.pointerEvents = 'none';
  box.style.boxSizing = 'border-box';
  box.style.width = `${Math.max(10, squareRect.width - padPx * 2)}px`;
  box.style.height = `${Math.max(10, squareRect.height - padPx * 2)}px`;
  box.style.fontFamily = getFontStack(page.font);
  box.style.fontSize = `${page.size}px`;
  box.style.lineHeight = String(page.lineHeight);
  box.style.textAlign = page.align === 'left' ? 'left' : 'center';
  box.style.whiteSpace = 'pre-wrap';
  box.style.overflowWrap = 'anywhere';
  box.style.wordBreak = 'break-word';
  box.style.padding = '0';
  box.textContent = '';
  document.body.appendChild(box);
  return box;
}

function fitsText(box, text) {
  box.textContent = text;
  return box.scrollHeight <= box.clientHeight + 0.5;
}

function splitTextForPage(text, page) {
  const box = createMeasureBox(page);
  try {
    if (fitsText(box, text)) return [text, ''];

    let low = 0;
    let high = text.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (fitsText(box, text.slice(0, mid))) low = mid;
      else high = mid - 1;
    }

    let cut = low;
    if (cut < text.length) {
      const slice = text.slice(0, cut);
      const lastBreak = Math.max(
        slice.lastIndexOf('\n'),
        slice.lastIndexOf(' '),
        slice.lastIndexOf('　'),
        slice.lastIndexOf('、'),
        slice.lastIndexOf('。')
      );
      if (lastBreak > Math.max(0, cut - 48)) cut = lastBreak + 1;
    }
    return [text.slice(0, cut), text.slice(cut)];
  } finally {
    box.remove();
  }
}

function repaginateFrom(startIndex) {
  let carry = state.pages.slice(startIndex).map(p => p.text || '').join('');
  const base = clonePageStyle(state.pages[startIndex]);
  let i = startIndex;

  if (!carry) {
    state.pages[startIndex].text = '';
    while (state.pages.length > 1 && !state.pages[state.pages.length - 1].text && state.pages.length - 1 > state.currentPage) {
      state.pages.pop();
    }
    return;
  }

  while (true) {
    ensurePage(i);
    Object.assign(state.pages[i], base);
    const [current, overflow] = splitTextForPage(carry, state.pages[i]);
    state.pages[i].text = current;
    if (!overflow) {
      for (let j = i + 1; j < state.pages.length; j++) {
        Object.assign(state.pages[j], base);
        state.pages[j].text = '';
      }
      break;
    }
    carry = overflow;
    i += 1;
  }

  while (state.pages.length > 1 && !state.pages[state.pages.length - 1].text && state.pages.length - 1 > state.currentPage) {
    state.pages.pop();
  }
  if (state.currentPage >= state.pages.length) state.currentPage = state.pages.length - 1;
}

function reflowAllPagesWithPatch(patch) {
  const fullText = state.pages.map(page => page.text || '').join('');
  const template = { ...defaultPage(), ...clonePageStyle(getPage()), ...patch };
  state.pages = [{ ...template, text: '' }];
  state.currentPage = 0;

  if (!fullText) {
    applyPageToUI();
    saveDraft();
    return;
  }

  let carry = fullText;
  let index = 0;
  while (true) {
    ensurePage(index);
    state.pages[index] = { ...template, text: '' };
    const [current, overflow] = splitTextForPage(carry, state.pages[index]);
    state.pages[index].text = current;
    if (!overflow) {
      state.pages.length = index + 1;
      break;
    }
    carry = overflow;
    index += 1;
  }
  applyPageToUI();
  saveDraft();
}

function applyPageToUI(forceText = true) {
  const page = getPage();
  if (forceText) els.pageText.value = page.text;
  els.pageText.style.color = page.textColor;
  els.pageText.style.fontSize = `${page.size}px`;
  els.pageText.style.lineHeight = String(page.lineHeight);
  els.pageText.style.padding = `${page.margin}%`;
  els.pageText.style.fontFamily = getFontStack(page.font);
  els.pageText.classList.toggle('align-left', page.align === 'left');
  els.square.style.background = page.bgColor;
  els.pageText.scrollTop = 0;

  els.sizeRange.value = page.size;
  els.textColor.value = page.textColor;
  els.bgColor.value = page.bgColor;
  els.lineRange.value = page.lineHeight;
  els.marginRange.value = page.margin;
  document.querySelectorAll('[data-font]').forEach(btn => btn.classList.toggle('active', btn.dataset.font === page.font));
  document.querySelectorAll('[data-align]').forEach(btn => btn.classList.toggle('active', btn.dataset.align === page.align));
  syncPageMeta();
}

function updateCurrentPageOnly(patch) {
  state.pages[state.currentPage] = { ...getPage(), ...patch };
  applyPageToUI();
  saveDraft();
}

function updateAllPages(patch, shouldReflow = false) {
  if (shouldReflow) {
    reflowAllPagesWithPatch(patch);
    return;
  }
  state.pages = state.pages.map(page => ({ ...page, ...patch }));
  applyPageToUI();
  saveDraft();
}

function showPanel(name) {
  document.querySelectorAll('.panel').forEach(panel => panel.classList.remove('show'));
  if (!name) return;
  const panel = document.getElementById(`panel-${name}`);
  if (panel) panel.classList.add('show');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function wrapLines(ctx, text, maxWidth) {
  const sourceLines = text.split('\n');
  const out = [];
  for (const src of sourceLines) {
    if (src === '') { out.push(''); continue; }
    let line = '';
    for (const ch of src) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

function renderPageToCanvas(page) {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = page.bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const pad = (page.margin / 100) * canvas.width;
  const textWidth = canvas.width - pad * 2;
  const textHeight = canvas.height - pad * 2;
  const fontPx = page.size * (canvas.width / (els.square.clientWidth || canvas.width));
  const lineHeightPx = fontPx * page.lineHeight;

  ctx.fillStyle = page.textColor;
  ctx.textBaseline = 'top';
  ctx.textAlign = page.align === 'left' ? 'left' : 'center';
  ctx.font = `${fontPx}px ${page.font === 'mincho' ? 'Times New Roman, serif' : 'Helvetica, Arial, sans-serif'}`;

  const lines = wrapLines(ctx, page.text || '', textWidth);
  const totalHeight = Math.max(lineHeightPx, lines.length * lineHeightPx);
  let y = pad + Math.max(0, (textHeight - totalHeight) / 2);
  const x = page.align === 'left' ? pad : pad + textWidth / 2;

  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeightPx;
  }
  return canvas;
}

function saveCanvasAsJPEG(canvas, filename) {
  if (!canvas) { alert('JPEG export failed.'); return; }
  if (canvas.toBlob) {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, filename);
      else downloadDataUrl(canvas.toDataURL('image/jpeg', 0.96), filename);
    }, 'image/jpeg', 0.96);
  } else {
    downloadDataUrl(canvas.toDataURL('image/jpeg', 0.96), filename);
  }
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function exportJPEG() {
  const pagesToExport = state.pages.filter(page => (page.text || '').length > 0);
  const targets = pagesToExport.length ? pagesToExport : [getPage()];
  const stamp = timestamp();
  targets.forEach((page, idx) => {
    const canvas = renderPageToCanvas(page);
    setTimeout(() => saveCanvasAsJPEG(canvas, `small-memory-${stamp}-page-${idx + 1}.jpg`), idx * 220);
  });
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `small-memory-${timestamp()}.json`);
}

function exportTXT() {
  const body = state.pages.map((page, i) => `--- Page ${i + 1} ---\n${page.text || ''}`).join('\n\n');
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `small-memory-${timestamp()}.txt`);
}

function loadJSONFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed.pages) || !parsed.pages.length) throw new Error('Invalid file');
      state = parsed;
      state.currentPage = Math.min(state.currentPage || 0, state.pages.length - 1);
      applyPageToUI();
      saveDraft();
    } catch {
      alert('JSON could not be loaded.');
    }
  };
  reader.readAsText(file);
}

function addPage() {
  state.pages.push({ ...clonePageStyle(getPage()), text: '' });
  state.currentPage = state.pages.length - 1;
  applyPageToUI();
  saveDraft();
  els.pageText.focus();
}

function deletePage() {
  if (state.pages.length === 1) {
    updateCurrentPageOnly({ text: '' });
    return;
  }
  state.pages.splice(state.currentPage, 1);
  state.currentPage = Math.max(0, state.currentPage - 1);
  applyPageToUI();
  saveDraft();
}

function movePage(delta) {
  const next = state.currentPage + delta;
  if (next < 0 || next >= state.pages.length) return;
  state.currentPage = next;
  applyPageToUI();
  saveDraft();
}

function resetDocument() {
  state = { pages: [defaultPage()], currentPage: 0 };
  applyPageToUI();
  saveDraft();
}

loadDraft();
applyPageToUI();

els.pageText.addEventListener('input', e => {
  const before = e.target.value;
  const start = e.target.selectionStart;
  const end = e.target.selectionEnd;
  state.pages[state.currentPage] = { ...getPage(), text: before };
  repaginateFrom(state.currentPage);
  const currentText = getPage().text || '';
  if (currentText !== before) {
    e.target.value = currentText;
    const pos = Math.min(start, currentText.length);
    e.target.setSelectionRange(pos, Math.min(end, currentText.length));
  }
  applyPageToUI(false);
  saveDraft();
});

els.prevPage.addEventListener('click', () => movePage(-1));
els.nextPage.addEventListener('click', () => movePage(1));
els.addPage.addEventListener('click', addPage);
els.deletePage.addEventListener('click', deletePage);
els.sizeRange.addEventListener('input', e => updateAllPages({ size: Number(e.target.value) }, true));
els.textColor.addEventListener('input', e => updateAllPages({ textColor: e.target.value }));
els.bgColor.addEventListener('input', e => updateAllPages({ bgColor: e.target.value }));
els.lineRange.addEventListener('input', e => updateAllPages({ lineHeight: Number(e.target.value) }, true));
els.marginRange.addEventListener('input', e => updateAllPages({ margin: Number(e.target.value) }, true));
els.exportJpeg.addEventListener('click', exportJPEG);
els.saveJson.addEventListener('click', exportJSON);
els.exportTxt.addEventListener('click', exportTXT);
els.loadJson.addEventListener('click', () => els.jsonFileInput.click());
els.newDoc.addEventListener('click', () => { if (confirm('Start a new document?')) resetDocument(); });
els.jsonFileInput.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (file) loadJSONFile(file);
  e.target.value = '';
});

document.querySelectorAll('[data-panel]').forEach(btn => {
  btn.addEventListener('click', () => {
    const name = btn.dataset.panel;
    const panel = document.getElementById(`panel-${name}`);
    const open = panel.classList.contains('show');
    showPanel(open ? null : name);
  });
});

document.querySelectorAll('[data-font]').forEach(btn => {
  btn.addEventListener('click', () => updateAllPages({ font: btn.dataset.font }, true));
});

document.querySelectorAll('[data-align]').forEach(btn => {
  btn.addEventListener('click', () => updateAllPages({ align: btn.dataset.align }, true));
});

let touchStartX = 0;
els.square.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
els.square.addEventListener('touchend', e => {
  const diff = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(diff) < 40) return;
  if (diff > 0) movePage(-1);
  else movePage(1);
}, { passive: true });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
}
