/* ============================================================
   Texam — lector de textos
   Todo ocurre en el navegador. Ningún archivo sale del equipo.
   ============================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const drop = $('drop'), zone = $('zone'), errEl = $('err');
  const readerWrap = $('readerWrap'), reader = $('reader');
  const docMeta = $('docMeta');
  const fileInput = $('fileInput');
  const toc = $('toc'), tocNav = $('tocNav'), scrim = $('scrim');
  const btnToc = $('btn-toc'), progressBar = $('progressBar');

  let currentKey = null;       // identidad del documento (nombre+tamaño)
  let chapters = [];           // secciones para el índice (epub)
  let tocObserver = null;

  /* -------------------------------------------------- utilidades */
  const esc = (s) => s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();

  const fmtBytes = (n) => n < 1024 ? n + ' B'
    : n < 1048576 ? (n / 1024).toFixed(1) + ' KB'
    : (n / 1048576).toFixed(1) + ' MB';

  // nomenclatura de "epub:type" etc. — selector seguro
  const qsa = (root, sel) => Array.from(root.querySelectorAll(sel));

  // Opciones de saneado: permiten blob:/data: (imágenes del EPUB) y conservan ids/enlaces.
  const SANITIZE = {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['id', 'target', 'xlink:href', 'epub:type'],
    ALLOWED_URI_REGEXP: /^(?:(?:blob|data|https?|mailto|tel|xmpp|file):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  };
  const clean = (html) => DOMPurify.sanitize(html, SANITIZE);

  function slug(s, i) {
    const base = (s || 'sec')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    return 'sec-' + (base || 'x') + '-' + i;
  }

  /* -------------------------------------------------- tema y tipografía */
  const store = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: (k) => { try { localStorage.removeItem(k); } catch {} },
  };

  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    store.set('texam.theme', t);
    const b = $('themeBtn');
    if (b) {
      b.textContent = t === 'dark' ? '☀' : '☾';
      b.title = t === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
      b.setAttribute('aria-label', b.title);
    }
  }
  applyTheme(store.get('texam.theme',
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  let fontSize = parseInt(store.get('texam.fontSize', '19'), 10) || 19;
  function applyFont() {
    document.documentElement.style.setProperty('--reader-size', fontSize + 'px');
    store.set('texam.fontSize', String(fontSize));
  }
  applyFont();

  /* -------------------------------------------------- entrada de archivos */
  $('openBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => { if (e.target.files[0]) load(e.target.files[0]); });

  ['dragenter', 'dragover'].forEach((ev) =>
    document.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('hot'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    document.addEventListener(ev, (e) => {
      e.preventDefault();
      if (ev === 'drop' || e.relatedTarget === null) zone.classList.remove('hot');
    }));
  document.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length) load(e.dataTransfer.files[0]);
  });

  function toast(msg) { errEl.textContent = msg || ''; }

  /* -------------------------------------------------- carga principal */
  async function load(file) {
    toast('');
    try {
      const ext = extOf(file.name);
      const name = file.name;
      const data = await readFile(file, ext);
      const doc = await parse(name, ext, data, file);
      render(doc, name, file.size);
    } catch (e) {
      console.error(e);
      toast('No se pudo abrir «' + file.name + '»: ' + (e.message || e));
      showReader(false);
    }
  }

  function readFile(file, ext) {
    const asText = ['txt', 'text', 'log', 'csv', 'md', 'markdown', 'mdown', 'rtf', 'html', 'htm', 'xhtml'];
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onerror = () => rej(new Error('lectura fallida'));
      r.onload = () => res(r.result);
      if (asText.includes(ext)) r.readAsText(file, 'utf-8');
      else r.readAsArrayBuffer(file);
    });
  }

  async function parse(name, ext, data, file) {
    switch (ext) {
      case 'txt': case 'text': case 'log': case 'csv':
        return { title: name, html: textToHtml(stripBom(data)), kind: 'text' };
      case 'md': case 'markdown': case 'mdown':
        return { title: name, html: mdToHtml(stripBom(data)), kind: 'md' };
      case 'html': case 'htm': case 'xhtml':
        return { title: name, html: htmlToHtml(stripBom(data)), kind: 'html' };
      case 'rtf':
        return { title: name, html: textToHtml(rtfToText(stripBom(data))), kind: 'text' };
      case 'docx':
        return await docxToDoc(data, name);
      case 'doc':
        return docToDoc(data, name);
      case 'epub':
        return await epubToDoc(data, name);
      case 'pdf':
        return await pdfToDoc(data, name);
      default:
        return sniff(name, data);
    }
  }

  function sniff(name, data) {
    if (typeof data === 'string') return { title: name, html: textToHtml(stripBom(data)), kind: 'text' };
    const bytes = new Uint8Array(data.slice(0, 5));
    const magic = String.fromCharCode(...bytes);
    if (magic.startsWith('PK')) throw new Error('formato comprimido no reconocido (¿docx o epub?)');
    if (magic.startsWith('%PDF')) throw new Error('PDF: renómbralo a .pdf');
    return { title: name, html: textToHtml(decodeBest(data)), kind: 'text' };
  }

  const stripBom = (s) => s.replace(/^\uFEFF/, '');

  /* -------------------------------------------------- conversores */
  function textToHtml(text) {
    const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
    return blocks.map((b) => {
      const t = b.trim();
      if (!t) return '';
      if (/^[\-\*\_\=\#]{3,}$/.test(t)) return '<hr>';
      return '<p>' + esc(t).replace(/\n/g, '<br>') + '</p>';
    }).join('\n');
  }

  function mdToHtml(md) {
    try {
      marked.setOptions({ gfm: true, breaks: false });
      return clean(marked.parse(md));
    } catch (e) {
      return textToHtml(md);
    }
  }

  function htmlToHtml(src) {
    const doc = new DOMParser().parseFromString(src, 'text/html');
    const body = doc.body ? doc.body.innerHTML : src;
    return clean(body);
  }

  /* Parser RTF mínimo: descarta grupos de destino (fuentes, colores, estilos)
     y conserva solo el texto con \par/\line como saltos y \uN/\'hh como caracteres. */
  function rtfToText(src) {
    const SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'filetbl',
      'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'themedata',
      'datastore', 'latentstyles', 'pgptbl', 'xmlnstbl', 'wgrffmtfilter',
      'fchars', 'lchars', 'pntext', 'header', 'footer', 'footnote', 'pict', 'object']);
    const isLetter = (c) => c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z';
    let out = '', i = 0, skipDepth = 0;
    const stack = [];
    const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === '{') {
        i++;
        let skip = false;
        if (src[i] === '\\') {
          let k = i + 1, word = '';
          if (src[k] === '*') { skip = true; k++; }
          while (k < n && isLetter(src[k])) word += src[k++];
          if (SKIP.has(word)) skip = true;
        }
        stack.push(skip);
        if (skip) skipDepth++;
        continue;
      }
      if (c === '}') { i++; if (stack.pop()) skipDepth--; continue; }
      if (c === '\\') {
        i++;
        const d = src[i];
        if (d === "'") {
          const h = src.slice(i + 1, i + 3);
          i += 3;
          if (!skipDepth) out += String.fromCharCode(parseInt(h, 16));
          continue;
        }
        if (d === 'u') {
          i++;
          let num = '';
          if (src[i] === '-') { num = '-'; i++; }
          while (src[i] >= '0' && src[i] <= '9') num += src[i++];
          if (src[i] === '?' || src[i] === ' ') i++;
          if (!skipDepth) out += String.fromCharCode(((+num) + 65536) % 65536);
          continue;
        }
        if (d === '{' || d === '}' || d === '\\') {
          if (!skipDepth) out += d;
          i++;
          continue;
        }
        let k = i, word = '';
        if (src[k] === '*') k++;
        while (k < n && isLetter(src[k])) word += src[k++];
        if (src[k] === '-') k++;
        while (src[k] >= '0' && src[k] <= '9') k++;
        if (src[k] === ' ') k++;
        i = k;
        if (!skipDepth) {
          if (word === 'par' || word === 'line' || word === 'sect') out += '\n';
          else if (word === 'tab') out += '\t';
          else if (word === 'emdash') out += '—';
          else if (word === 'endash') out += '–';
          else if (word === 'bullet') out += '•';
        }
        continue;
      }
      if (c === '\r' || c === '\n') { i++; continue; }
      if (!skipDepth) out += c;
      i++;
    }
    return out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function docxToDoc(data, name) {
    const out = await mammoth.convertToHtml({ arrayBuffer: data });
    return { title: name, html: clean(out.value), kind: 'docx' };
  }

  // .doc (Word 97-2003) es un contenedor binario: extracción heurística.
  // Se decodifican dos candidatos (cp1252 y UTF-16LE) y se elige el más "textual".
  const DOC_KEEP = '\\p{Script=Latin}\\p{N}\\p{Zs}\\n\\r\\t.,;:!?\'"()\\[\\]\\-–—«»¿¡…%€$@&*+=<>/|~^_#';
  const DOC_DROP = new RegExp('[^' + DOC_KEEP + ']', 'gu');
  function docDecode(bytes, encoding) {
    let s;
    try { s = new TextDecoder(encoding, { fatal: false }).decode(bytes); }
    catch { return { text: '', score: 0 }; }
    const total = s.length || 1;
    const kept = s.replace(DOC_DROP, '\u0001');         // la basura pasa a marca
    const allowed = total - (kept.split('\u0001').length - 1);
    const text = kept
      .replace(/\u0001{4,}/g, '\n\n')                   // rachas largas separan párrafos
      .replace(/[^\S\n]*\u0001[^\S\n]*/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/(\n\s*){3,}/g, '\n\n')
      .trim();
    return { text, score: allowed / total };
  }
  function docToDoc(data, name) {
    let bytes = new Uint8Array(data);
    // firma OLE2 (D0 CF 11 E0 A1 B1 1A E1): no es texto, fuera
    if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
      bytes = bytes.subarray(8);
    }
    const cp = docDecode(bytes, 'windows-1252');
    const u16 = docDecode(bytes, 'utf-16le');
    const best = cp.score >= u16.score ? cp : u16;
    const ok = best.text.length > 120 && best.text.replace(/\s/g, '').length > 80;
    return {
      title: name,
      html: ok ? textToHtml(best.text)
               : '<p style="font-family:var(--ui-font)">Este <code>.doc</code> antiguo usa un formato binario que no se puede leer con fiabilidad.</p>'
                 + '<p style="font-family:var(--ui-font)">Ábrelo en Word o LibreOffice y guárdalo como <code>.docx</code>, o expórtalo a <code>.pdf</code>.</p>',
      kind: 'doc',
      warn: ok ? 'Extracción aproximada de un .doc antiguo (formato no documentado).' : null,
    };
  }

  /* -------------------------------------------------- EPUB */
  function normalizePath(path) {
    const parts = path.split('/');
    const out = [];
    for (const p of parts) {
      if (p === '.' || p === '') continue;
      if (p === '..') out.pop();
      else out.push(p);
    }
    return out.join('/');
  }
  const dirOf = (p) => p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';

  function zipFiles(zip) {
    const list = [];
    zip.forEach((rel, f) => { if (!f.dir) list.push(rel); });
    return list;
  }
  function findInZip(zip, path, list) {
    const tries = [path, decodeURIComponent(path), path.replace(/\\/g, '/')];
    for (const t of tries) { const f = zip.file(t); if (f) return f; }
    const lower = path.toLowerCase();
    const hit = (list || zipFiles(zip)).find((n) => n.toLowerCase() === lower);
    return hit ? zip.file(hit) : null;
  }

  async function epubToDoc(data, name) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip no disponible');
    const zip = await JSZip.loadAsync(data);
    const list = zipFiles(zip);

    const containerFile = findInZip(zip, 'META-INF/container.xml', list);
    if (!containerFile) throw new Error('EPUB sin META-INF/container.xml');
    const container = new DOMParser().parseFromString(await containerFile.async('string'), 'application/xml');
    const rootfile = container.querySelector('rootfile');
    const opfPath = rootfile && rootfile.getAttribute('full-path');
    if (!opfPath) throw new Error('EPUB sin OPF');
    const opfDir = dirOf(opfPath);

    const opfFile = findInZip(zip, opfPath, list);
    const opf = new DOMParser().parseFromString(await opfFile.async('string'), 'application/xml');

    const title = (opf.querySelector('metadata > title') || {}).textContent?.trim() || name;
    const author = (opf.querySelector('metadata > creator') || {}).textContent?.trim() || '';
    const lang = (opf.querySelector('metadata > language') || {}).textContent?.trim() || '';

    const manifest = {};
    qsa(opf, 'manifest > item').forEach((it) => {
      manifest[it.getAttribute('id')] = {
        href: it.getAttribute('href'),
        type: it.getAttribute('media-type') || '',
        props: it.getAttribute('properties') || '',
      };
    });

    const spine = qsa(opf, 'spine > itemref')
      .map((r) => manifest[r.getAttribute('idref')])
      .filter(Boolean);

    // --- índice: EPUB3 (nav) o EPUB2 (NCX)
    let tocEntries = [];
    const navItem = Object.values(manifest).find((m) => /nav/.test(m.props)) ||
                    Object.values(manifest).find((m) => /nav\.x?html?$/i.test(m.href));
    if (navItem) {
      const navFile = findInZip(zip, normalizePath(opfDir + navItem.href), list);
      if (navFile) {
        const ndoc = new DOMParser().parseFromString(await navFile.async('string'), 'text/html');
        const nav = ndoc.querySelector('nav[epub\\:type="toc"], nav[role="doc-toc"], nav') || ndoc;
        qsa(nav, 'a[href]').forEach((a) => {
          tocEntries.push({ label: (a.textContent || '').trim(), href: a.getAttribute('href') });
        });
      }
    }
    if (!tocEntries.length) {
      const ncxItem = Object.values(manifest).find((m) => m.type === 'application/x-dtbncx+xml');
      if (ncxItem) {
        const nf = findInZip(zip, normalizePath(opfDir + ncxItem.href), list);
        if (nf) {
          const ndoc = new DOMParser().parseFromString(await nf.async('string'), 'application/xml');
          qsa(ndoc, 'navPoint').forEach((np) => {
            const src = np.querySelector('content');
            const label = (np.querySelector('navLabel > text') || {}).textContent || '';
            if (src) tocEntries.push({ label: label.trim(), href: src.getAttribute('src') });
          });
        }
      }
    }

    // --- capítulos
    const frag = document.createDocumentFragment();
    const hrefToIndex = {};
    let idx = 0;
    for (const item of spine) {
      if (!/x?html/i.test(item.type) && !/\.x?html?$/i.test(item.href)) continue;
      const path = normalizePath(opfDir + item.href);
      const f = findInZip(zip, path, list);
      if (!f) continue;
      let xhtml = await f.async('string');
      const dom = new DOMParser().parseFromString(xhtml, 'text/html');
      const body = dom.body || dom.documentElement;
      await resolveAssets(zip, body, path, list);
      const sec = document.createElement('section');
      sec.className = 'chapter';
      sec.id = 'ch-' + idx;
      sec.innerHTML = clean(body.innerHTML);
      frag.appendChild(sec);
      const base = item.href.split('#')[0];
      hrefToIndex[base] = idx;
      hrefToIndex[normalizePath(base)] = idx;
      idx++;
    }
    if (!idx) throw new Error('EPUB sin contenido legible');

    // índice final (con capítulo destino)
    chapters = tocEntries.map((e) => {
      const file = e.href.split('#')[0];
      const t = hrefToIndex[file] ?? hrefToIndex[normalizePath(file)];
      return { label: e.label || ('Capítulo'), target: t != null ? '#ch-' + t : '#ch-0' };
    }).filter((e) => e.label);

    return {
      title, author, lang,
      html: frag,               // fragmento ya construido
      kind: 'epub',
      predefinedToc: true,
    };
  }

  async function resolveAssets(zip, root, chapterPath, list) {
    const dir = dirOf(chapterPath);
    const imgs = qsa(root, 'img[src], image');
    for (const el of imgs) {
      const raw = el.getAttribute('src') || el.getAttribute('xlink:href') || el.getAttribute('href');
      if (!raw || /^(https?:|data:)/i.test(raw)) continue;
      const path = normalizePath(dir + raw);
      const f = findInZip(zip, path, list);
      if (!f) continue;
      try {
        const raw = await f.async('uint8array');
        const url = URL.createObjectURL(new Blob([raw], { type: mimeOf(path) }));
        if (el.tagName.toLowerCase() === 'image') {
          el.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', url);
          el.setAttribute('href', url);
        } else {
          el.setAttribute('src', url);
        }
      } catch {}
    }
  }

  function mimeOf(p) {
    const e = extOf(p);
    return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
             svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' }[e] || 'application/octet-stream';
  }

  /* -------------------------------------------------- PDF */
  async function pdfToDoc(data, name) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js no disponible');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
    const parts = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      let line = '', y = null, out = [];
      for (const it of tc.items) {
        const ty = it.transform[5];
        if (y !== null && Math.abs(ty - y) > 2) { out.push(line.trim()); line = ''; }
        line += it.str + (it.hasEOL ? '' : ' ');
        y = ty;
      }
      if (line.trim()) out.push(line.trim());
      parts.push('<p class="pdf-page">' + out.filter(Boolean).map(esc).join('<br>') + '</p>');
    }
    return { title: name, html: parts.join('\n<hr>\n'), kind: 'pdf' };
  }

  /* -------------------------------------------------- render */
  function showReader(on) {
    readerWrap.hidden = !on;
    drop.hidden = on;
    document.body.classList.toggle('is-reading', on);
    btnToc.hidden = !(on && chapters.length > 1);
    docMeta.hidden = !on;
  }

  function render(doc, name, size) {
    reader.innerHTML = '';
    if (doc.predefinedToc) {
      reader.appendChild(doc.html);
    } else {
      const holder = document.createElement('div');
      holder.innerHTML = doc.html;
      reader.appendChild(holder);
    }

    // metadatos
    const bits = [];
    if (doc.author) bits.push(esc(doc.author));
    bits.push(esc(name));
    bits.push(fmtBytes(size));
    bits.push((doc.kind || '').toUpperCase());
    docMeta.innerHTML = bits.filter(Boolean).join(' · ') +
      (doc.warn ? '<br><span style="color:var(--muted)">' + esc(doc.warn) + '</span>' : '');

    // índice generado para formatos sin TOC propio
    if (!doc.predefinedToc) {
      chapters = buildHeadingToc(reader);
    }

    renderToc(doc);
    $('bookTitle').textContent = doc.title && doc.title !== name ? doc.title : name;

    showReader(true);
    currentKey = 'texam.pos.' + name + ':' + size;
    window.scrollTo(0, 0);
    restorePos();
    observeHeadings();
    updateProgress();
  }

  function buildHeadingToc(root) {
    const out = [];
    qsa(root, 'h1, h2, h3').forEach((h, i) => {
      if (!h.id) h.id = slug(h.textContent, i);
      out.push({
        label: h.textContent.trim().slice(0, 120),
        target: '#' + h.id,
        level: +h.tagName[1],
      });
    });
    return out;
  }

  function renderToc() {
    tocNav.innerHTML = '';
    if (!chapters.length) { btnToc.hidden = true; return; }
    chapters.forEach((c) => {
      const a = document.createElement('a');
      a.href = c.target;
      a.textContent = c.label;
      if (c.level === 2) a.className = 'lvl2';
      if (c.level >= 3) a.className = 'lvl3';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const el = document.querySelector(c.target);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        closeToc();
      });
      tocNav.appendChild(a);
    });
    btnToc.hidden = false;
  }

  /* -------------------------------------------------- índice ui */
  function openToc() { toc.classList.add('open'); scrim.classList.add('open'); }
  function closeToc() { toc.classList.remove('open'); scrim.classList.remove('open'); }
  btnToc.addEventListener('click', openToc);
  $('tocClose').addEventListener('click', closeToc);
  scrim.addEventListener('click', closeToc);

  /* -------------------------------------------------- progreso y posición */
  let saveTimer = null;
  function updateProgress() {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const pct = h > 0 ? Math.min(100, Math.max(0, (window.scrollY / h) * 100)) : 0;
    progressBar.style.width = pct + '%';
  }
  function restorePos() {
    const saved = store.get(currentKey, null);
    if (saved) {
      const y = parseInt(saved, 10);
      if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }
  window.addEventListener('scroll', () => {
    updateProgress();
    if (currentKey) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => store.set(currentKey, String(Math.round(window.scrollY))), 250);
    }
  }, { passive: true });
  window.addEventListener('resize', updateProgress);

  /* -------------------------------------------------- resaltado del índice */
  function observeHeadings() {
    if (tocObserver) tocObserver.disconnect();
    const targets = chapters.map((c) => document.querySelector(c.target)).filter(Boolean);
    if (!targets.length) return;
    tocObserver = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const id = '#' + en.target.id;
        qsa(tocNav, 'a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === id));
      });
    }, { rootMargin: '-10% 0px -75% 0px', threshold: 0 });
    targets.forEach((t) => tocObserver.observe(t));
  }

  /* -------------------------------------------------- controles */
  $('fontInc').addEventListener('click', () => { fontSize = Math.min(28, fontSize + 1); applyFont(); });
  $('fontDec').addEventListener('click', () => { fontSize = Math.max(14, fontSize - 1); applyFont(); });
  $('themeBtn').addEventListener('click', () =>
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === '+' || e.key === '=') { fontSize = Math.min(28, fontSize + 1); applyFont(); }
    else if (e.key === '-') { fontSize = Math.max(14, fontSize - 1); applyFont(); }
    else if (e.key === 'j') window.scrollBy(0, window.innerHeight * 0.9);
    else if (e.key === 'k') window.scrollBy(0, -window.innerHeight * 0.9);
    else if (e.key === 'Escape') closeToc();
  });
})();
