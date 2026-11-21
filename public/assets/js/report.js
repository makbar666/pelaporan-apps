"use strict";
window.Report = (() => {
  function node(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  const date = (value) =>
    new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(value + "T12:00:00"));
  const rupiah = (value) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value || 0);
  const numeric = [
    "deaths",
    "injured",
    "evacuated",
    "affected",
    "houseHeavy",
    "houseMedium",
    "houseLight",
    "houseFlooded",
    "loss",
  ];
  function totals(rows) {
    return Object.fromEntries(
      numeric.map((k) => [
        k,
        rows.reduce((s, r) => s + (Number(r[k]) || 0), 0),
      ]),
    );
  }
  function text(r, settings = {}) {
    const lines = [
      settings.organization || "BPBD Provinsi Jawa Tengah",
      "LAPORAN KEJADIAN BENCANA",
      "Nomor: " + r.number,
    ];
    for (const key of [
      "title",
      "date",
      "time",
      "district",
      "subdistrict",
      "village",
      "location",
      "category",
      "handlingStatus",
      "chronology",
      ...numeric,
      "facilities",
      "actions",
      "recommendations",
      "source",
      "reporter",
      "division",
      "description",
      "impact",
      "notes",
    ])
      if (Store.schema[key])
        lines.push(
          Store.schema[key][0] +
            ": " +
            (key === "date"
              ? date(r[key])
              : key === "loss"
                ? rupiah(r[key])
                : r[key] === 0
                  ? 0
                  : r[key] || "—"),
        );
    return lines.join("\n\n");
  }
  function article(r, settings) {
    const page = node("article", undefined, "document"),
      head = node("div", undefined, "letterhead");
    if (settings.logo) {
      const img = node("img");
      img.src = settings.logo;
      img.alt = "Logo instansi";
      head.append(img);
    }
    head.append(
      node("h2", settings.organization || "BPBD Provinsi Jawa Tengah"),
    );
    page.append(
      head,
      node("h3", "LAPORAN KEJADIAN BENCANA"),
      node("p", "Nomor: " + r.number, "report-number"),
    );
    const dl = node("dl");
    for (const key of [
      "title",
      "date",
      "time",
      "category",
      "district",
      "subdistrict",
      "village",
      "location",
      "handlingStatus",
      "reporter",
      "source",
    ]) {
      dl.append(
        node("dt", Store.schema[key][0]),
        node("dd", key === "date" ? date(r[key]) : r[key] || "—"),
      );
    }
    page.append(dl);
    for (const [title, body] of [
      ["Kronologi kejadian", r.chronology],
      [
        "Korban dan dampak penduduk",
        `Meninggal: ${r.deaths || 0} jiwa; luka: ${r.injured || 0} jiwa; mengungsi: ${r.evacuated || 0} jiwa; terdampak: ${r.affected || 0} jiwa.`,
      ],
      [
        "Kerusakan dan kerugian",
        `Rumah rusak berat: ${r.houseHeavy || 0}; sedang: ${r.houseMedium || 0}; ringan: ${r.houseLight || 0}; terendam: ${r.houseFlooded || 0}.\nFasilitas umum: ${r.facilities || "—"}\nEstimasi kerugian: ${rupiah(r.loss)}`,
      ],
      ["Upaya penanganan", r.actions],
      ["Rekomendasi tindak lanjut", r.recommendations],
      ["Deskripsi tambahan", r.description],
      ["Dampak tambahan", r.impact],
      ["Catatan", r.notes],
    ]) {
      const s = node("section", undefined, "report-section");
      s.append(node("h4", title), node("p", body || "—"));
      page.append(s);
    }
    if (r.photos?.length) {
      const s = node("section", undefined, "report-photos");
      s.append(node("h4", "Dokumentasi"));
      for (const src of r.photos) {
        const img = node("img");
        img.src = src;
        img.alt = "Dokumentasi kejadian";
        s.append(img);
      }
      page.append(s);
    }
    const sign = node("div", undefined, "signature");
    sign.append(
      node("p", "Disusun: " + date(new Date().toLocaleDateString("sv-SE"))),
      node("p", "Petugas pelapor,"),
      node("p", r.reporter, "sign-name"),
      node("p", r.division || "Pusdalops PB"),
    );
    page.append(sign);
    return page;
  }
  function render(rows, settings, summary = false) {
    const root = document.getElementById("documents");
    root.replaceChildren();
    if (summary && rows.length) {
      const t = totals(rows),
        page = node("article", undefined, "document");
      page.append(
        node("h2", settings.organization || "BPBD Provinsi Jawa Tengah"),
        node("h3", "REKAPITULASI KEJADIAN BENCANA"),
        node(
          "p",
          `Jumlah kejadian: ${rows.length}. Penduduk terdampak: ${t.affected}; mengungsi: ${t.evacuated}; meninggal: ${t.deaths}; luka: ${t.injured}. Estimasi kerugian: ${rupiah(t.loss)}.`,
        ),
      );
      for (const r of rows) {
        const s = node("section", undefined, "report-section");
        s.append(
          node(
            "h4",
            `${date(r.date)} · ${r.category} · ${r.district || r.location}`,
          ),
          node(
            "p",
            `${r.number} — ${r.title}\n${r.chronology}\nStatus: ${r.handlingStatus || "Belum ditentukan"}\nPetugas: ${r.reporter}`,
          ),
        );
        page.append(s);
      }
      root.append(page);
    } else for (const r of rows) root.append(article(r, settings));
    document.getElementById("preview-empty").hidden = rows.length > 0;
  }
  function csv(rows) {
    const keys = [
      "number",
      "date",
      "time",
      "district",
      "subdistrict",
      "village",
      "category",
      "handlingStatus",
      ...numeric,
      "facilities",
      "chronology",
      "actions",
      "source",
      "reporter",
    ];
    const cell = (v) =>
      '"' +
      String(v ?? "")
        .replace(/^[\s]*[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    return (
      "\uFEFF" +
      [
        keys.map((k) => Store.schema[k][0]),
        ...rows.map((r) => keys.map((k) => r[k])),
      ]
        .map((row) => row.map(cell).join(","))
        .join("\r\n")
    );
  }
  return { node, date, rupiah, totals, text, render, article, csv };
})();
