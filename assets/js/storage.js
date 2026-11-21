'use strict';
window.Store = (() => {
  const keys = {reports:'incident_reports_v1',settings:'report_settings_v1',draft:'report_draft_v1'};
  function setUser(id) {
    keys.settings = 'report_settings_v1_' + encodeURIComponent(id || 'signed-out');
    keys.draft = 'report_draft_v1_' + encodeURIComponent(id || 'signed-out');
  }
  const schema = JSON.parse(document.getElementById('field-schema').textContent);
  function validate(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r) || typeof r.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(r.id)) throw Error('Identitas laporan tidak valid.');
    return { ...IncidentModel.validate(r, schema), id: r.id };
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
  return {schema,validate,validateList,read,write,remove,setUser};
})();
