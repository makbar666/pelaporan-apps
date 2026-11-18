'use strict';
(() => {
 const $=id=>document.getElementById(id), form=$('report-form');
 let reports=[], settings={organization:'',logo:''}, selected=new Set(), preview=[], editing=null, timer, healthy=true;
 const message=(text,error=false)=>{ $('status').textContent=text; $('status').className=error?'status error-status':'status'; };
 function attempt(fn) { try { return fn(); } catch(e) { message(e.message,true); return false; } }
 function tab(name) { for(const id of ['input','recap','preview']) $(id).hidden=id!==name; document.querySelectorAll('[data-tab]').forEach(b=>{ b.classList.toggle('active',b.dataset.tab===name); b.setAttribute('aria-current',b.dataset.tab===name?'page':'false'); }); }
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
 function fresh() { clearTimeout(timer); editing=null; HTMLFormElement.prototype.reset.call(form); $('number').value='LK-'+new Date().toLocaleDateString('sv-SE').replaceAll('-','')+'-'+crypto.randomUUID().slice(0,8).toUpperCase(); $('form-title').textContent='Input laporan baru'; $('draft-status').textContent=''; document.querySelectorAll('.error').forEach(e=>e.textContent=''); form.querySelectorAll('[aria-invalid]').forEach(e=>e.removeAttribute('aria-invalid')); }
 function values() { return Object.fromEntries(Object.keys(Store.schema).map(k=>[k,form.elements[k].value])); }
 function fill(data) { for(const k of Object.keys(Store.schema)) if(typeof data[k]==='string') form.elements[k].value=data[k]; }
 function saveReports(next) { Store.write('reports',Store.validateList(next)); reports=next; healthy=true; render(); }
 form.addEventListener('input',()=>{ clearTimeout(timer); timer=setTimeout(()=>attempt(()=>{ Store.write('draft',{data:values(),editing}); $('draft-status').textContent='Draf tersimpan otomatis'; }),600); });
 form.onsubmit=e=>{ e.preventDefault(); attempt(()=>{
   if(!healthy) throw Error('Pulihkan data lokal melalui impor JSON sebelum menyimpan laporan baru.');
   let invalid=null; for(const [k,[label]] of Object.entries(Store.schema)) { const el=form.elements[k], bad=!el.checkValidity() || (el.required&&!el.value.trim()); $('error-'+k).textContent=bad?label+' wajib diisi dengan format yang benar.':''; el.setAttribute('aria-invalid',String(bad)); if(bad&&!invalid) invalid=el; } if(invalid) { invalid.focus(); throw Error('Periksa kolom yang ditandai.'); }
   const r=Store.validate({...values(),id:editing||crypto.randomUUID()});
   if(reports.some(x=>x.id!==r.id&&x.number.toLowerCase()===r.number.toLowerCase())) throw Error('Nomor laporan sudah digunakan.');
   saveReports(editing?reports.map(x=>x.id===editing?r:x):[...reports,r]); fresh(); attempt(()=>Store.remove('draft')); message('Laporan berhasil disimpan.'); tab('recap');
 }); };
 $('reset').onclick=()=>{ if(confirm('Kosongkan formulir dan hapus draf?')) { fresh(); attempt(()=>Store.remove('draft')); } };
 $('new-report').onclick=()=>tab('input');
 function open(ids) { preview=ids.filter(id=>reports.some(r=>r.id===id)); Report.render(reports.filter(r=>preview.includes(r.id)),settings); tab('preview'); }
 function filtered() { const q=$('search').value.trim().toLocaleLowerCase(); return reports.filter(r=>(!q||Object.values(r).some(v=>v.toLocaleLowerCase().includes(q)))&&(!$('from').value||r.date>=$('from').value)&&(!$('to').value||r.date<=$('to').value)&&(!$('category-filter').value||r.category===$('category-filter').value)).sort((a,b)=>b.date.localeCompare(a.date)); }
 function render() {
   $('badge').textContent=$('total').textContent=reports.length; $('month').textContent=reports.filter(r=>r.date.startsWith(new Date().toLocaleDateString('sv-SE').slice(0,7))).length;
   const cats=[...new Set(reports.map(r=>r.category))].sort(); $('categories').textContent=cats.length; const old=$('category-filter').value; $('category-filter').replaceChildren(new Option('Semua kategori',''),...cats.map(c=>new Option(c,c))); $('category-filter').value=cats.includes(old)?old:'';
   const list=filtered(); $('rows').replaceChildren(); list.forEach((r,i)=>{ const tr=Report.node('tr'), td=Report.node('td'), check=Report.node('input'); check.type='checkbox'; check.checked=selected.has(r.id); check.setAttribute('aria-label','Pilih '+r.number); check.onchange=()=>{ check.checked?selected.add(r.id):selected.delete(r.id); render(); }; td.append(check); tr.append(td);
     for(const v of [i+1,r.number,Report.date(r.date),r.title,r.location,r.category,r.reporter]) tr.append(Report.node('td',v));
     const actions=Report.node('td',undefined,'row-actions'); for(const [label,fn] of [['Lihat',()=>open([r.id])],['Edit',()=>{ clearTimeout(timer); editing=r.id; fill(r); $('form-title').textContent='Edit laporan'; tab('input'); }],['Hapus',()=>{ if(confirm('Hapus laporan '+r.number+'? Tindakan ini tidak dapat dibatalkan.')) attempt(()=>{ saveReports(reports.filter(x=>x.id!==r.id)); selected.delete(r.id); preview=preview.filter(id=>id!==r.id); Report.render(reports.filter(x=>preview.includes(x.id)),settings); render(); message('Laporan dihapus.'); }); }]]) { const b=Report.node('button',label); b.onclick=fn; actions.append(b); } tr.append(actions); $('rows').append(tr);
   }); $('empty').hidden=list.length>0; $('empty').textContent=reports.length?'Tidak ada laporan yang sesuai filter.':'Belum ada laporan. Mulai dengan membuat laporan baru.'; $('selected-count').textContent=selected.size; $('select-all').checked=list.length>0&&list.every(r=>selected.has(r.id)); $('select-all').indeterminate=list.some(r=>selected.has(r.id))&&!$('select-all').checked;
 }
 for(const id of ['search','from','to','category-filter']) $(id).addEventListener('input',render);
 $('clear-filter').onclick=()=>{ for(const id of ['search','from','to','category-filter']) $(id).value=''; render(); };
 $('select-all').onchange=()=>{ filtered().forEach(r=>$('select-all').checked?selected.add(r.id):selected.delete(r.id)); render(); };
 $('print-selected').onclick=()=>selected.size?open([...selected]):message('Pilih minimal satu laporan.',true);
 function print() { if(!preview.length) return message('Pilih laporan terlebih dahulu.',true); window.print(); } $('pdf').onclick=$('print').onclick=print;
 $('copy').onclick=async()=>{ if(!preview.length) return message('Pilih laporan terlebih dahulu.',true); const text=reports.filter(r=>preview.includes(r.id)).map(r=>Report.text(r,settings)).join('\n\n--------------------\n\n'); try { await navigator.clipboard.writeText(text); message('Teks laporan disalin.'); } catch { const area=Report.node('textarea'); area.value=text; document.body.append(area); area.select(); const ok=document.execCommand('copy'); area.remove(); message(ok?'Teks laporan disalin.':'Browser menolak penyalinan. Gunakan HTTPS atau salin langsung dari pratinjau.',!ok); } };
 function updateSettings(next) { Store.write('settings',next); settings=next; Report.render(reports.filter(r=>preview.includes(r.id)),settings); }
 $('organization').onchange=()=>attempt(()=>updateSettings({...settings,organization:$('organization').value.trim()}));
 $('logo').onchange=()=>attempt(()=>{ const file=$('logo').files[0]; if(!file) return; if(!['image/png','image/jpeg'].includes(file.type)||file.size>500*1024) throw Error('Gunakan logo PNG/JPG maksimal 500 KB.'); const reader=new FileReader(); reader.onload=()=>attempt(()=>updateSettings({...settings,logo:reader.result})); reader.onerror=()=>message('Logo gagal dibaca.',true); reader.readAsDataURL(file); });
 $('remove-logo').onclick=()=>attempt(()=>{ updateSettings({...settings,logo:''}); $('logo').value=''; });
 $('export').onclick=()=>attempt(()=>{ if(!healthy) throw Error('Data lokal rusak. Cadangan baru tidak dapat dibuat.'); const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,reports},null,2)],{type:'application/json'})); const a=Report.node('a'); a.href=url; a.download='laporan-kejadian-'+new Date().toLocaleDateString('sv-SE')+'.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); message('Cadangan JSON dibuat. Logo, pengaturan, dan draf tidak disertakan.'); });
 $('import').onclick=()=>$('import-file').click();
 $('import-file').onchange=async()=>{ const file=$('import-file').files[0]; if(!file)return; try { if(file.size>20*1024*1024) throw Error('Berkas maksimal 20 MB.'); const data=JSON.parse(await file.text()); if(data.version!==1) throw Error('Versi cadangan tidak didukung.'); const next=Store.validateList(data.reports); if(confirm('Ganti SEMUA laporan lokal dengan '+next.length+' laporan dari cadangan? Ekspor data lama terlebih dahulu jika diperlukan.')) { saveReports(next); selected.clear(); preview=[]; Report.render([],settings); render(); message('Cadangan berhasil dipulihkan.'); } } catch(e) { message(e.message,true); } finally { $('import-file').value=''; } };
 fresh(); attempt(()=>{ try { reports=Store.validateList(Store.read('reports',[])); } catch(e) { healthy=false; throw e; } });
 attempt(()=>{ const s=Store.read('settings',{}); if(!s||typeof s!=='object') throw Error('Pengaturan lokal tidak valid.'); settings={organization:typeof s.organization==='string'?s.organization.slice(0,200):'',logo:typeof s.logo==='string'&&/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s.logo)&&s.logo.length<700000?s.logo:''}; $('organization').value=settings.organization; });
 attempt(()=>{ const draft=Store.read('draft',null); if(draft) { if(!draft.data||typeof draft.data!=='object') throw Error('Draf tidak valid.'); fill(draft.data); editing=typeof draft.editing==='string'&&reports.some(r=>r.id===draft.editing)?draft.editing:null; $('draft-status').textContent='Draf sebelumnya dipulihkan'; if(editing)$('form-title').textContent='Edit laporan'; } }); render();
})();

