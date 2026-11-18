'use strict';
window.Store = (() => {
  const keys = {reports:'incident_reports_v1',settings:'report_settings_v1',draft:'report_draft_v1'};
  const schema = JSON.parse(document.getElementById('field-schema').textContent);
  function validate(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r) || typeof r.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(r.id)) throw Error('Identitas laporan tidak valid.');
    const clean = {id:r.id};
    for (const [key,[label,type,required]] of Object.entries(schema)) {
      const v = r[key];
      if (typeof v !== 'string' || v.length > (type === 'textarea' ? 20000 : 300) || (required && !v.trim())) throw Error(label + ' tidak valid atau belum diisi.');
      clean[key] = v.trim();
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean.date) || !Number.isFinite(Date.parse(clean.date)) || new Date(clean.date).toISOString().slice(0,10) !== clean.date) throw Error('Tanggal kejadian tidak valid.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(clean.time)) throw Error('Waktu kejadian tidak valid.');
    return clean;
  }
  function validateList(data) {
    if (!Array.isArray(data) || data.length > 10000) throw Error('Daftar laporan tidak valid (maksimal 10.000 laporan).');
    const result = data.map(validate);
    if (new Set(result.map(r=>r.id)).size !== result.length || new Set(result.map(r=>r.number.toLowerCase())).size !== result.length) throw Error('Ada identitas atau nomor laporan duplikat.');
    return result;
  }
  function read(name, fallback) {
    try { const raw = localStorage.getItem(keys[name]); return raw === null ? fallback : JSON.parse(raw); }
    catch { throw Error('Data lokal tidak dapat dibaca. Data lama tetap dipertahankan. Pulihkan melalui cadangan JSON atau periksa izin penyimpanan browser.'); }
  }
  function write(name,value) {
    try { localStorage.setItem(keys[name], JSON.stringify(value)); }
    catch { throw Error('Gagal menyimpan. Penyimpanan browser penuh atau tidak diizinkan. Ekspor cadangan sebelum melanjutkan.'); }
  }
  function remove(name) { try { localStorage.removeItem(keys[name]); } catch { throw Error('Gagal menghapus data lokal.'); } }
  return {schema,validate,validateList,read,write,remove};
})();
