'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const form = $('report-form');
  let reports = [], user = null, settings = {}, selected = new Set(), preview = [];
  let editing = null, timer, busy = false, loadSequence = 0;

  function message(text, error = false) {
    $('status').textContent = text;
    $('status').className = error ? 'status error-status' : 'status';
  }

  function lock(text = '') {
    clearTimeout(timer);
    if (user) { try { Store.write('draft', { data: values(), editing }); } catch { /* Masuk kembali tetap tersedia saat storage penuh. */ } }
    ++loadSequence;
    user = null; reports = []; selected.clear(); preview = []; settings = {};
    $('documents').replaceChildren(); $('rows').replaceChildren();
    HTMLFormElement.prototype.reset.call(form);
    $('organization').value = ''; $('logo').value = '';
    $('application').hidden = true; $('account').hidden = true; $('auth-panel').hidden = false;
    $('account-name').textContent = ''; $('auth-status').textContent = text;
    Store.setUser(null);
  }

  async function api(path, method = 'GET', data) {
    let response;
    try {
      response = await fetch('/api/' + path, {
        method, credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(user ? { 'X-Actor-Id': user.id } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) })
      });
    } catch { throw Error('Koneksi terputus. Periksa jaringan Anda dan coba lagi.'); }
    let result;
    try { result = await response.json(); }
    catch { throw Error('Backend online belum tersedia. Gunakan situs Netlify yang telah dikonfigurasi.'); }
    if (!response.ok) {
      const text = result.error || 'Permintaan gagal. Coba lagi.';
      if ((response.status === 401 || response.status === 403) && user) lock(text);
      throw Error(text);
    }
    return result;
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    document.querySelectorAll('#application button, #application input, #application select, #application textarea, #logout').forEach(el => el.disabled = true);
    try { await action(); }
    catch (error) { message(error.message, true); if (!user) $('auth-status').textContent = error.message; }
    finally {
      busy = false;
      document.querySelectorAll('#application button, #application input, #application select, #application textarea, #logout').forEach(el => el.disabled = false);
    }
  }

  function tab(name) {
    for (const id of ['input', 'recap', 'preview']) $(id).hidden = id !== name;
    document.querySelectorAll('[data-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
      b.setAttribute('aria-current', b.dataset.tab === name ? 'page' : 'false');
    });
  }
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));

  function values() { return Object.fromEntries(Object.keys(Store.schema).map(k => [k, form.elements[k].value])); }
  function fill(data) { for (const k of Object.keys(Store.schema)) if (typeof data[k] === 'string') form.elements[k].value = data[k]; }
  function fresh() {
    clearTimeout(timer); editing = null; HTMLFormElement.prototype.reset.call(form);
    $('number').value = 'LK-' + new Date().toLocaleDateString('sv-SE').replaceAll('-', '') + '-' + crypto.randomUUID().slice(0, 8).toUpperCase();
    $('form-title').textContent = 'Input laporan baru'; $('draft-status').textContent = '';
    document.querySelectorAll('.error').forEach(el => el.textContent = '');
    form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  }

  function saveDraft() {
    if (!user) return;
    try { Store.write('draft', { data: values(), editing }); $('draft-status').textContent = 'Draf tersimpan di browser'; }
    catch (error) { message(error.message, true); }
  }
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(saveDraft, 600); });

  async function loadReports() {
    const sequence = ++loadSequence, scope = $('scope').value;
    const loaded = []; let offset = 0;
    do {
      const data = await api('reports?scope=' + scope + '&offset=' + offset);
      if (sequence !== loadSequence) return;
      for (const r of data.reports) loaded.push({ ...Store.validate(r), ownerId: r.ownerId, ownerName: r.ownerName, version: r.version });
      offset = data.nextOffset;
    } while (offset !== null);
    reports = loaded; selected.clear(); preview = []; Report.render([], settings); render();
  }

  async function enter(account) {
    user = account; Store.setUser(user.id); settings = {}; fresh(); $('scope').value = 'mine';
    for (const id of ['search', 'from', 'to', 'category-filter']) $(id).value = '';
    try {
      const s = Store.read('settings', {});
      settings = {
        organization: typeof s?.organization === 'string' ? s.organization.slice(0, 200) : '',
        logo: typeof s?.logo === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s.logo) && s.logo.length < 700000 ? s.logo : ''
      };
      const draft = Store.read('draft', null);
      if (draft?.data) {
        fill(draft.data); editing = draft.editing;
        $('draft-status').textContent = 'Draf akun ini dipulihkan';
        if (editing) $('form-title').textContent = 'Edit laporan';
      }
    } catch (error) { message(error.message, true); }
    $('organization').value = settings.organization || '';
    await loadReports();
    $('account-name').textContent = user.name;
    $('application').hidden = false; $('account').hidden = false; $('auth-panel').hidden = true;
    $('login-password').value = ''; tab('input');
  }

  $('login-form').onsubmit = async event => {
    event.preventDefault(); $('login-button').disabled = true; $('login-button').textContent = 'Memproses…'; $('auth-status').textContent = '';
    try {
      const result = await api('login', 'POST', { email: $('login-email').value.trim(), password: $('login-password').value });
      await enter(result.user);
    } catch (error) { lock(error.message); }
    finally { $('login-password').value = ''; $('login-button').disabled = false; $('login-button').textContent = 'Masuk'; }
  };
  $('logout').onclick = () => run(async () => { saveDraft(); await api('logout', 'POST', {}); lock('Anda telah keluar.'); });

  form.onsubmit = event => {
    event.preventDefault();
    // Validasi dilakukan sebelum kontrol dinonaktifkan selama permintaan server.
    let invalid = null;
    for (const [key, [label]] of Object.entries(Store.schema)) {
      const el = form.elements[key], bad = !el.checkValidity() || (el.required && !el.value.trim());
      $('error-' + key).textContent = bad ? label + ' wajib diisi dengan format yang benar.' : '';
      el.setAttribute('aria-invalid', String(bad)); if (bad && !invalid) invalid = el;
    }
    if (invalid) { invalid.focus(); message('Periksa kolom yang ditandai.', true); return; }
    run(async () => {
      const data = Store.validate({ ...values(), id: editing?.id || crypto.randomUUID() });
      saveDraft();
      await api(editing ? 'reports/' + editing.id : 'reports', editing ? 'PUT' : 'POST', { ...data, version: editing?.version });
      fresh(); try { Store.remove('draft'); } catch (error) { message(error.message, true); }
      $('scope').value = 'mine';
      try { await loadReports(); }
      catch { message('Laporan berhasil disimpan, tetapi rekap belum dapat dimuat. Gunakan Muat ulang data.', true); tab('recap'); return; }
      message('Laporan berhasil disimpan online.'); tab('recap');
    });
  };
  $('reset').onclick = () => {
    if (confirm('Kosongkan formulir dan hapus draf akun ini?')) { fresh(); try { Store.remove('draft'); } catch (error) { message(error.message, true); } }
  };
  $('new-report').onclick = () => tab('input');

  function filtered() {
    const q = $('search').value.trim().toLocaleLowerCase();
    return ReportScope.filter(reports, $('scope').value, user).filter(r =>
      (!q || Object.values(r).some(v => typeof v === 'string' && v.toLocaleLowerCase().includes(q))) &&
      (!$('from').value || r.date >= $('from').value) && (!$('to').value || r.date <= $('to').value) &&
      (!$('category-filter').value || r.category === $('category-filter').value)
    ).sort((a, b) => b.date.localeCompare(a.date));
  }

  function open(ids) {
    preview = ids.filter(id => reports.some(r => r.id === id));
    Report.render(reports.filter(r => preview.includes(r.id)), settings); tab('preview');
  }

  function render() {
    $('badge').textContent = $('total').textContent = reports.length;
    $('month').textContent = reports.filter(r => r.date.startsWith(new Date().toLocaleDateString('sv-SE').slice(0, 7))).length;
    const cats = [...new Set(reports.map(r => r.category))].sort(), old = $('category-filter').value;
    $('categories').textContent = cats.length;
    $('category-filter').replaceChildren(new Option('Semua kategori', ''), ...cats.map(c => new Option(c, c)));
    $('category-filter').value = cats.includes(old) ? old : '';
    $('scope-description').textContent = ($('scope').value === 'mine' ? 'Laporan milik akun Anda.' : 'Laporan seluruh anggota tim. Edit dan hapus hanya untuk pemilik.') + ' Ringkasan mengikuti pilihan ini.';
    const list = filtered(); $('rows').replaceChildren();
    for (const [i, r] of list.entries()) {
      const tr = Report.node('tr'), td = Report.node('td'), check = Report.node('input');
      check.type = 'checkbox'; check.checked = selected.has(r.id); check.setAttribute('aria-label', 'Pilih ' + r.number);
      check.onchange = () => { check.checked ? selected.add(r.id) : selected.delete(r.id); render(); };
      td.append(check); tr.append(td);
      for (const v of [i + 1, r.number, Report.date(r.date), r.title, r.location, r.category, r.reporter, r.ownerName || 'Anggota']) tr.append(Report.node('td', v));
      const actions = Report.node('td', undefined, 'row-actions');
      const buttons = [['Lihat', () => open([r.id])]];
      if (ReportScope.owns(r, user)) buttons.push(
        ['Edit', () => { clearTimeout(timer); editing = { id: r.id, version: r.version }; fill(r); saveDraft(); $('form-title').textContent = 'Edit laporan'; tab('input'); }],
        ['Hapus', () => {
          if (confirm('Hapus laporan ' + r.number + '? Tindakan ini tidak dapat dibatalkan.')) run(async () => {
            await api('reports/' + r.id, 'DELETE', { version: r.version });
            if (editing?.id === r.id) { fresh(); Store.remove('draft'); }
            await loadReports(); message('Laporan dihapus.');
          });
        }]
      );
      for (const [label, fn] of buttons) { const b = Report.node('button', label); b.onclick = fn; actions.append(b); }
      tr.append(actions); $('rows').append(tr);
    }
    $('empty').hidden = list.length > 0;
    $('empty').textContent = reports.length ? 'Tidak ada laporan yang sesuai filter.' : 'Belum ada laporan pada pilihan ini.';
    $('selected-count').textContent = selected.size;
    $('select-all').checked = list.length > 0 && list.every(r => selected.has(r.id));
    $('select-all').indeterminate = list.some(r => selected.has(r.id)) && !$('select-all').checked;
  }

  for (const id of ['search', 'from', 'to', 'category-filter']) $(id).addEventListener('input', render);
  $('scope').onchange = () => run(async () => {
    try { await loadReports(); }
    catch (error) { reports = []; selected.clear(); preview = []; Report.render([], settings); render(); throw error; }
  });
  $('refresh').onclick = () => run(async () => { await loadReports(); message('Data online dimuat ulang.'); });
  $('clear-filter').onclick = () => { for (const id of ['search', 'from', 'to', 'category-filter']) $(id).value = ''; render(); };
  $('select-all').onchange = () => { filtered().forEach(r => $('select-all').checked ? selected.add(r.id) : selected.delete(r.id)); render(); };
  $('print-selected').onclick = () => selected.size ? open([...selected]) : message('Pilih minimal satu laporan.', true);
  function print() { if (!preview.length) return message('Pilih laporan terlebih dahulu.', true); window.print(); }
  $('pdf').onclick = $('print').onclick = print;
  $('copy').onclick = async () => {
    if (!preview.length) return message('Pilih laporan terlebih dahulu.', true);
    const text = reports.filter(r => preview.includes(r.id)).map(r => Report.text(r, settings)).join('\n\n--------------------\n\n');
    try { await navigator.clipboard.writeText(text); message('Teks laporan disalin.'); }
    catch { const area = Report.node('textarea'); area.value = text; document.body.append(area); area.select(); const ok = document.execCommand('copy'); area.remove(); message(ok ? 'Teks laporan disalin.' : 'Browser menolak penyalinan. Salin langsung dari pratinjau.', !ok); }
  };

  function updateSettings(next) { Store.write('settings', next); settings = next; Report.render(reports.filter(r => preview.includes(r.id)), settings); }
  $('organization').onchange = () => { try { updateSettings({ ...settings, organization: $('organization').value.trim() }); } catch (error) { message(error.message, true); } };
  $('logo').onchange = () => {
    const file = $('logo').files[0]; if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 500 * 1024) return message('Gunakan logo PNG/JPG maksimal 500 KB.', true);
    const accountId = user.id, reader = new FileReader();
    reader.onload = () => { if (user?.id !== accountId) return; try { updateSettings({ ...settings, logo: reader.result }); } catch (error) { message(error.message, true); } };
    reader.onerror = () => message('Logo gagal dibaca.', true); reader.readAsDataURL(file);
  };
  $('remove-logo').onclick = () => { try { updateSettings({ ...settings, logo: '' }); $('logo').value = ''; } catch (error) { message(error.message, true); } };

  function download(data) {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, reports: data }, null, 2)], { type: 'application/json' }));
    const a = Report.node('a'); a.href = url; a.download = 'laporan-kejadian-' + new Date().toLocaleDateString('sv-SE') + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('export').onclick = () => { download(reports.map(r => Store.validate(r))); message('Cadangan pilihan laporan dibuat.'); };
  function legacyBackup() {
    try { download(Store.validateList(Store.read('reports', []))); if (user) message('Cadangan data lokal lama dibuat; data lama tetap dipertahankan.'); else $('auth-status').textContent = 'Cadangan data lokal lama dibuat.'; }
    catch (error) { if (user) message(error.message, true); else $('auth-status').textContent = error.message; }
  }
  $('legacy-backup').onclick = $('legacy-backup-login').onclick = legacyBackup;
  $('import').onclick = () => $('import-file').click();
  $('import-file').onchange = () => run(async () => {
    const file = $('import-file').files[0]; if (!file) return;
    try {
      if (file.size > 4000000) throw Error('Berkas impor maksimal 4 MB.');
      const data = JSON.parse(await file.text());
      if (data.version !== 1 || !Array.isArray(data.reports) || data.reports.length > 1000) throw Error('Cadangan harus versi 1 dan maksimal 1.000 laporan.');
      const next = Store.validateList(data.reports);
      if (confirm('Ganti SEMUA laporan milik akun Anda dengan ' + next.length + ' laporan dari cadangan? Laporan anggota lain tetap dipertahankan. Ekspor cadangan dahulu jika diperlukan.')) {
        await api('reports/import', 'POST', { version: 1, reports: next });
        fresh(); Store.remove('draft'); $('scope').value = 'mine'; await loadReports(); message('Laporan Anda berhasil dipulihkan online.');
      }
    } finally { $('import-file').value = ''; }
  });

  window.addEventListener('pagehide', saveDraft);
  (async () => {
    try { const result = await api('session'); await enter(result.user); }
    catch (error) { lock(error.message); }
    finally { $('login-button').disabled = false; $('login-button').textContent = 'Masuk'; }
  })();
})();
