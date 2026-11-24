/*
 * SkinLog: front-end
 * Blocos: utilidades -> navegação -> banco local (IndexedDB) -> foto -> registro
 *         -> histórico e gráfico -> comparação -> backup
 * Fotos e registros NUNCA saem do navegador, exceto ao clicar em "Medir diferenças".
 */
document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    const API = 'http://localhost:5000/api';
    const MAX_SIDE = 1024;      // lado maior da foto salva (px)
    const MAX_IMPORT = 500;     // limite de registros ao importar
    const $ = (id) => document.getElementById(id);

    // ========== UTILIDADES ==========
    /** Escapa HTML: todo texto digitado passa por aqui antes de ir para o DOM. */
    const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
    const today = () => {
        const now = new Date();
        return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    };

    let toastTimer;
    function toast(message, type = 'info') {
        const t = $('toast');
        t.textContent = message;
        t.className = `toast show toast--${type}`;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
    }

    $('current-year').textContent = new Date().getFullYear();

    // ========== MENU MOBILE ==========
    const closeMenu = () => {
        $('nav-menu').classList.remove('show');
        $('nav-toggle').setAttribute('aria-expanded', 'false');
        $('nav-toggle').querySelector('i').className = 'ri-menu-line';
    };
    $('nav-toggle').addEventListener('click', () => {
        const open = $('nav-menu').classList.toggle('show');
        $('nav-toggle').setAttribute('aria-expanded', open);
        $('nav-toggle').querySelector('i').className = open ? 'ri-close-line' : 'ri-menu-line';
    });
    document.querySelectorAll('.header__link').forEach(l => l.addEventListener('click', closeMenu));

    // ========== LINK ATIVO AO ROLAR + SCROLL UP ==========
    const sections = document.querySelectorAll('main section[id]');
    const navLinks = document.querySelectorAll('.header__link');
    window.addEventListener('scroll', () => {
        let currentId = sections[0].id;
        sections.forEach(s => { if (window.scrollY >= s.offsetTop - 120) currentId = s.id; });
        navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === `#${currentId}`));
        $('scroll-up').classList.toggle('show', window.scrollY > 400);
    });
    $('scroll-up').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // ========== STATUS DA API (opcional) ==========
    let apiOnline = false;
    async function checkApi() {
        try { apiOnline = (await fetch(`${API}/health`)).ok; } catch { apiOnline = false; }
        $('api-status').className = `api-status ${apiOnline ? 'online' : 'offline'}`;
        $('api-status-text').textContent = apiOnline
            ? 'Análise de diferenças disponível'
            : 'Análise de diferenças indisponível (o resto funciona sem a API)';
    }

    // =====================================================================
    //  BANCO LOCAL (IndexedDB): comporta fotos, ao contrário do localStorage
    // =====================================================================
    const dbReady = new Promise((resolve, reject) => {
        const req = indexedDB.open('skinlog', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('records', { keyPath: 'id', autoIncrement: true });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    /** Executa uma operação em uma transação e devolve o resultado ao concluir. */
    async function tx(mode, fn) {
        const db = await dbReady;
        return new Promise((resolve, reject) => {
            const t = db.transaction('records', mode);
            const request = fn(t.objectStore('records'));
            t.oncomplete = () => resolve(request.result);
            t.onerror = () => reject(t.error || new Error('Falha na transação do banco local.'));
            t.onabort = () => reject(t.error || new Error('Transação do banco local cancelada.'));
        });
    }

    let records = [];   // cache em memória, do mais recente para o mais antigo
    async function refresh() {
        records = await tx('readonly', s => s.getAll());
        records.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
        renderAll();
    }

    // =====================================================================
    //  FOTO: redimensiona e recomprime (remove EXIF, como a localização)
    // =====================================================================
    let photoBlob = null;

    async function toJpeg(file) {
        const bmp = await createImageBitmap(file);
        const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bmp.width * scale);
        canvas.height = Math.round(bmp.height * scale);
        canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
        bmp.close();
        return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('falha')), 'image/jpeg', 0.82));
    }

    $('r-photo').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) return toast('Escolha um arquivo de imagem.', 'error');
        try {
            photoBlob = await toJpeg(file);
            const img = $('photo-preview');
            if (img.src) URL.revokeObjectURL(img.src);
            img.src = URL.createObjectURL(photoBlob);
            img.hidden = false;
            $('photo-hint').hidden = true;
        } catch { toast('Não foi possível ler essa imagem.', 'error'); }
    });

    // =====================================================================
    //  REGISTRO
    // =====================================================================
    ['itch', 'pain', 'redness'].forEach(k =>
        $(`r-${k}`).addEventListener('input', () => { $(`o-${k}`).textContent = $(`r-${k}`).value; }));

    $('r-date').value = today();
    $('r-date').max = today();

    function resetForm() {
        photoBlob = null;
        const img = $('photo-preview');
        if (img.src) URL.revokeObjectURL(img.src);
        img.removeAttribute('src');
        img.hidden = true;
        $('photo-hint').hidden = false;
        ['itch', 'pain', 'redness'].forEach(k => { $(`r-${k}`).value = 0; $(`o-${k}`).textContent = '0'; });
        $('r-products').value = '';
        $('r-notes').value = '';
        $('r-date').value = today();
    }

    $('record-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const area = $('r-area').value.trim();
        const date = $('r-date').value;
        if (!area) return toast('Informe a região do corpo.', 'error');
        if (!date || date > today()) return toast('Escolha uma data válida.', 'error');
        try {
            await tx('readwrite', s => s.add({
                area, date, photo: photoBlob,
                itch: Number($('r-itch').value), pain: Number($('r-pain').value), redness: Number($('r-redness').value),
                products: $('r-products').value.trim(), notes: $('r-notes').value.trim(),
            }));
            resetForm();
            await refresh();
            toast('Registro salvo.', 'success');
        } catch { toast('Não foi possível salvar. Verifique o espaço do navegador.', 'error'); }
    });

    // =====================================================================
    //  HISTÓRICO E GRÁFICO
    // =====================================================================
    let recordUrls = [];   // URLs temporárias das fotos (liberadas a cada renderização)

    const areas = () => [...new Set(records.map(r => r.area))].sort((a, b) => a.localeCompare(b));

    function renderAll() {
        renderAreas();
        renderRecords();
        renderCompareOptions();
    }

    function renderAreas() {
        const current = $('f-area').value;
        $('f-area').innerHTML = `<option value="">Todas as regiões</option>` + areas().map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
        $('f-area').value = areas().includes(current) ? current : '';
        $('areas-list').innerHTML = areas().map(a => `<option value="${esc(a)}"></option>`).join('');
    }

    function renderRecords() {
        recordUrls.forEach(URL.revokeObjectURL);
        recordUrls = [];
        const area = $('f-area').value;
        const list = records.filter(r => !area || r.area === area);

        $('records').innerHTML = list.length ? list.map(r => {
            let img = '<i class="ri-image-line"></i>';
            if (r.photo) {
                const url = URL.createObjectURL(r.photo);
                recordUrls.push(url);
                img = `<img src="${url}" alt="Foto de ${esc(r.area)} em ${fmtDate(r.date)}" loading="lazy" />`;
            }
            return `
        <article class="rec">
          <div class="rec__img">${img}</div>
          <div class="rec__body">
            <strong>${esc(r.area)}</strong>
            <small>${fmtDate(r.date)}</small>
            <div class="rec__scores">
              <span class="pill">Coceira ${r.itch}</span><span class="pill">Dor ${r.pain}</span><span class="pill">Vermelhidão ${r.redness}</span>
            </div>
            ${r.products ? `<small><strong>Produtos:</strong> ${esc(r.products)}</small>` : ''}
            ${r.notes ? `<small>${esc(r.notes)}</small>` : ''}
          </div>
          <div class="rec__foot"><button type="button" class="icon-btn" data-del="${r.id}" aria-label="Excluir registro"><i class="ri-delete-bin-line"></i></button></div>
        </article>`;
        }).join('') : '<p class="empty">Nenhum registro ainda. Crie o primeiro na seção anterior.</p>';

        drawChart(list);
    }
    $('f-area').addEventListener('change', renderRecords);

    $('records').addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-del]');
        if (!btn || !confirm('Excluir este registro e a foto?')) return;
        try {
            await tx('readwrite', s => s.delete(Number(btn.dataset.del)));
            await refresh();
            toast('Registro excluído.', 'success');
        } catch { toast('Não foi possível excluir o registro.', 'error'); }
    });

    /** Gráfico de linhas em canvas: sintomas informados (0 a 10) ao longo do tempo. */
    const SERIES = [['itch', 'Coceira', '#be185d'], ['pain', 'Dor', '#2563eb'], ['redness', 'Vermelhidão', '#d97706']];

    function drawChart(list) {
        const canvas = $('chart');
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth, h = 260;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const g = canvas.getContext('2d');
        g.scale(dpr, dpr);
        g.clearRect(0, 0, w, h);

        const area = $('f-area').value;
        const data = list.filter(r => r.area === area).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
        if (!area) { $('chart-note').textContent = 'Escolha uma região para ver o gráfico.'; return; }
        if (data.length < 2) { $('chart-note').textContent = 'São necessários ao menos 2 registros nesta região.'; return; }
        $('chart-note').textContent = 'Valores informados por você, de 0 (nenhum) a 10 (máximo).';

        const pad = { l: 30, r: 12, t: 28, b: 28 };
        const x = (i) => pad.l + i * (w - pad.l - pad.r) / (data.length - 1);
        const y = (v) => pad.t + (10 - v) * (h - pad.t - pad.b) / 10;

        g.font = '12px system-ui'; g.fillStyle = '#6b6270'; g.strokeStyle = '#e5e1e4'; g.lineWidth = 1;
        [0, 5, 10].forEach(v => { g.beginPath(); g.moveTo(pad.l, y(v)); g.lineTo(w - pad.r, y(v)); g.stroke(); g.fillText(v, 8, y(v) + 4); });
        g.textAlign = 'left'; g.fillText(fmtDate(data[0].date), pad.l, h - 8);
        g.textAlign = 'right'; g.fillText(fmtDate(data[data.length - 1].date), w - pad.r, h - 8);

        let lx = pad.l;
        SERIES.forEach(([key, label, color]) => {
            g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2.5;
            g.beginPath();
            data.forEach((r, i) => i ? g.lineTo(x(i), y(r[key])) : g.moveTo(x(i), y(r[key])));
            g.stroke();
            data.forEach((r, i) => { g.beginPath(); g.arc(x(i), y(r[key]), 3.5, 0, Math.PI * 2); g.fill(); });
            g.textAlign = 'left'; g.fillRect(lx, 8, 10, 10); g.fillStyle = '#1f1720'; g.fillText(label, lx + 14, 17);
            lx += 40 + label.length * 7;
        });
    }
    window.addEventListener('resize', renderRecords);

    // =====================================================================
    //  COMPARAÇÃO ANTES / DEPOIS
    // =====================================================================
    let baUrls = [];

    function renderCompareOptions() {
        const withPhoto = records.filter(r => r.photo);
        const opts = withPhoto.map(r => `<option value="${r.id}">${fmtDate(r.date)} · ${esc(r.area)}</option>`).join('');
        const prevB = $('c-before').value, prevA = $('c-after').value;
        $('c-before').innerHTML = opts;
        $('c-after').innerHTML = opts;
        const ids = withPhoto.map(r => String(r.id));
        // Padrão: "antes" = o mais antigo e "depois" = o mais recente
        $('c-before').value = ids.includes(prevB) ? prevB : (ids[ids.length - 1] || '');
        $('c-after').value = ids.includes(prevA) ? prevA : (ids[0] || '');
        updateCompare();
    }

    function updateCompare() {
        baUrls.forEach(URL.revokeObjectURL);
        baUrls = [];
        const before = records.find(r => String(r.id) === $('c-before').value);
        const after = records.find(r => String(r.id) === $('c-after').value);
        const ready = Boolean(before && after && before.id !== after.id);

        $('ba').hidden = !ready;
        $('ba-range').hidden = !ready;
        $('ba-empty').hidden = ready;
        $('btn-analyze').disabled = !ready || !apiOnline;
        $('analysis').innerHTML = '';
        $('analysis-note').hidden = true;
        if (!ready) {
            $('ba-empty').textContent = records.filter(r => r.photo).length < 2
                ? 'Salve ao menos dois registros com foto para comparar.'
                : 'Escolha dois registros diferentes.';
            return;
        }
        [['ba-before', before], ['ba-after', after]].forEach(([id, r]) => {
            const url = URL.createObjectURL(r.photo);
            baUrls.push(url);
            $(id).src = url;
        });
    }
    $('c-before').addEventListener('change', updateCompare);
    $('c-after').addEventListener('change', updateCompare);
    // O controle define quanto da foto "antes" fica visível (variável CSS --cut)
    $('ba-range').addEventListener('input', e => $('ba').style.setProperty('--cut', `${100 - e.target.value}%`));

    $('btn-analyze').addEventListener('click', async () => {
        const before = records.find(r => String(r.id) === $('c-before').value);
        const after = records.find(r => String(r.id) === $('c-after').value);
        const btn = $('btn-analyze');
        const html = btn.innerHTML;
        btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Medindo...';
        btn.disabled = true;
        try {
            const fd = new FormData();
            fd.append('before', before.photo, 'antes.jpg');
            fd.append('after', after.photo, 'depois.jpg');
            const res = await fetch(`${API}/compare`, { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Falha na análise.');

            const sign = (n) => (n > 0 ? '+' : '') + n.toFixed(1);
            $('analysis').innerHTML = `<table>
        <thead><tr><th>Medida</th><th>Antes</th><th>Depois</th><th>Variação</th></tr></thead>
        <tbody>
          <tr><td>Brilho médio</td><td>${data.before.brightness}%</td><td>${data.after.brightness}%</td><td>${sign(data.after.brightness - data.before.brightness)}</td></tr>
          <tr><td>Tom avermelhado</td><td>${data.before.redness}</td><td>${data.after.redness}</td><td>${sign(data.after.redness - data.before.redness)}</td></tr>
          <tr><td>Diferença visual entre as imagens</td><td colspan="3">${data.difference}%</td></tr>
        </tbody></table>`;
            $('analysis-note').hidden = false;
        } catch (err) { toast(err.message || 'Não foi possível conectar à API.', 'error'); }
        finally { btn.innerHTML = html; btn.disabled = !apiOnline; }
    });

    // =====================================================================
    //  BACKUP (exportar, importar e apagar)
    // =====================================================================
    const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

    $('btn-export').addEventListener('click', async () => {
        if (!records.length) return toast('Não há registros para exportar.', 'error');
        const out = [];
        for (const r of records) {
            out.push({
                area: r.area, date: r.date, itch: r.itch, pain: r.pain, redness: r.redness, products: r.products, notes: r.notes,
                photo: r.photo ? await blobToDataUrl(r.photo) : null
            });
        }
        const blob = new Blob([JSON.stringify({ app: 'skinlog', version: 1, records: out })], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `skinlog-backup-${today()}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    /** Valida cada item importado: não confiamos em arquivos de fora. */
    const score = (v) => Number.isInteger(v) && v >= 0 && v <= 10;
    const validDate = (value) => {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [year, month, day] = value.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    };
    const valid = (r) => r && typeof r.area === 'string' && r.area.trim() && r.area.length <= 60
        && validDate(r.date) && r.date <= today() && [r.itch, r.pain, r.redness].every(score)
        && (r.products == null || (typeof r.products === 'string' && r.products.length <= 200))
        && (r.notes == null || (typeof r.notes === 'string' && r.notes.length <= 500))
        && (r.photo === null || (typeof r.photo === 'string' && r.photo.startsWith('data:image/jpeg;base64,')));

    $('import-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > 120 * 1024 * 1024) return toast('O arquivo de backup excede o limite de 120 MB.', 'error');

        let json;
        try {
            json = JSON.parse(await file.text());
        } catch {
            return toast('Arquivo de backup inválido.', 'error');
        }
        const list = Array.isArray(json?.records) ? json.records : [];
        if (json?.app !== 'skinlog' || json?.version !== 1 || !list.length || list.length > MAX_IMPORT || !list.every(valid)) {
            return toast('Arquivo de backup inválido ou incompatível.', 'error');
        }

        let imported;
        try {
            imported = [];
            for (const r of list) {
                let photo = null;
                if (r.photo) {
                    photo = await (await fetch(r.photo)).blob();
                    const bitmap = await createImageBitmap(photo);
                    bitmap.close();
                }
                imported.push({
                    area: r.area.trim(), date: r.date, photo, itch: r.itch, pain: r.pain, redness: r.redness,
                    products: r.products || '', notes: r.notes || '',
                });
            }
        } catch {
            return toast('Uma das fotos do backup está inválida ou não pôde ser lida.', 'error');
        }

        try {
            await tx('readwrite', s => {
                let request;
                imported.forEach(r => { request = s.add(r); });
                return request;
            });
            await refresh();
            toast(`${list.length} registro(s) importado(s).`, 'success');
        } catch { toast('Não foi possível salvar os registros importados.', 'error'); }
    });

    $('btn-clear').addEventListener('click', async () => {
        if (!records.length) return toast('Não há dados para apagar.', 'error');
        if (!confirm('Apagar TODOS os registros e fotos deste navegador? Esta ação não pode ser desfeita.')) return;
        try {
            await tx('readwrite', s => s.clear());
            await refresh();
            toast('Todos os dados foram apagados.', 'success');
        } catch { toast('Não foi possível apagar os dados.', 'error'); }
    });

    // ========== INICIALIZAÇÃO ==========
    navigator.storage?.persist?.();    // pede ao navegador para não apagar os dados sozinho
    refresh().catch(() => toast('Seu navegador não permitiu salvar dados locais.', 'error'));
    checkApi();
    window.dispatchEvent(new Event('scroll'));
});
