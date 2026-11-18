'use strict';
window.Report = (() => {
  function node(tag,text,cls) { const n=document.createElement(tag); if(text !== undefined) n.textContent=text; if(cls) n.className=cls; return n; }
  function date(value) { return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric'}).format(new Date(value+'T12:00:00')); }
  function text(r,settings) {
    return [settings.organization || 'NAMA ORGANISASI','LAPORAN KEJADIAN','Nomor: '+r.number,...Object.entries(Store.schema).filter(([k])=>k!=='number').map(([k,[label]])=>label+': '+(k==='date'?date(r[k]):r[k]||'—')),'Tanggal penyusunan: '+date(new Date().toLocaleDateString('sv-SE')),'Pelapor,','\n\n'+r.reporter,r.division].join('\n\n');
  }
  function render(reports,settings) {
    const root=document.getElementById('documents'); root.replaceChildren();
    for(const r of reports) {
      const page=node('article',undefined,'document'); const head=node('div',undefined,'letterhead');
      if(settings.logo) { const img=node('img'); img.src=settings.logo; img.alt='Logo organisasi'; head.append(img); }
      head.append(node('h2',settings.organization || 'NAMA ORGANISASI')); page.append(head,node('h3','LAPORAN KEJADIAN'),node('p','Nomor: '+r.number,'report-number'));
      const info=node('dl');
      for(const key of ['title','date','time','location','category','reporter','division']) { info.append(node('dt',Store.schema[key][0]),node('dd',key==='date'?date(r[key]):r[key])); }
      page.append(info);
      for(const key of ['description','chronology','impact','actions','recommendations','notes']) { const block=node('section',undefined,'report-section'); block.append(node('h4',Store.schema[key][0]),node('p',r[key]||'—')); page.append(block); }
      const sign=node('div',undefined,'signature'); sign.append(node('p','Tanggal penyusunan: '+date(new Date().toLocaleDateString('sv-SE'))),node('p','Pelapor,'),node('p',r.reporter,'sign-name'),node('p',r.division)); page.append(sign); root.append(page);
    }
    document.getElementById('preview-empty').hidden=reports.length>0;
  }
  return {render,text,date,node};
})();
