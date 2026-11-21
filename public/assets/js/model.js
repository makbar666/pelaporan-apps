"use strict";
globalThis.IncidentModel = (() => {
  const regions = [
    "Kab. Banjarnegara",
    "Kab. Banyumas",
    "Kab. Batang",
    "Kab. Blora",
    "Kab. Boyolali",
    "Kab. Brebes",
    "Kab. Cilacap",
    "Kab. Demak",
    "Kab. Grobogan",
    "Kab. Jepara",
    "Kab. Karanganyar",
    "Kab. Kebumen",
    "Kab. Kendal",
    "Kab. Klaten",
    "Kab. Kudus",
    "Kab. Magelang",
    "Kab. Pati",
    "Kab. Pekalongan",
    "Kab. Pemalang",
    "Kab. Purbalingga",
    "Kab. Purworejo",
    "Kab. Rembang",
    "Kab. Semarang",
    "Kab. Sragen",
    "Kab. Sukoharjo",
    "Kab. Tegal",
    "Kab. Temanggung",
    "Kab. Wonogiri",
    "Kab. Wonosobo",
    "Kota Magelang",
    "Kota Pekalongan",
    "Kota Salatiga",
    "Kota Semarang",
    "Kota Surakarta",
    "Kota Tegal",
  ];
  const categories = [
    "Banjir",
    "Tanah Longsor",
    "Angin Kencang / Puting Beliung",
    "Kebakaran Hutan dan Lahan (Karhutla)",
    "Kebakaran Pemukiman/Gedung",
    "Gempa Bumi",
    "Kekeringan",
    "Gelombang Pasang / Abrasi",
    "Orang Tenggelam / Laka Air",
    "Lainnya",
  ];
  const statuses = [
    "Dalam Penanganan / Siaga",
    "Terkendali / Asesmen Selesai",
    "Selesai / Tuntas",
  ];
  function validate(input, fields) {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw Error("Data laporan tidak valid.");
    const data = {};
    for (const [key, [label, type, required]] of Object.entries(fields)) {
      let value = input[key];
      if (type === "photos") {
        if (value === undefined) value = [];
        if (
          !Array.isArray(value) ||
          value.length > 3 ||
          value.some(
            (p) =>
              typeof p !== "string" ||
              p.length > 180000 ||
              !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(p),
          )
        )
          throw Error(
            "Foto harus JPEG, maksimal 3 foto terkompresi (135 KB per foto).",
          );
        data[key] = [...value];
        continue;
      }
      if (type === "number") {
        if (value === undefined || value === "") value = 0;
        if (
          !["string", "number"].includes(typeof value) ||
          !/^\d+$/.test(String(value)) ||
          !Number.isSafeInteger(Number(value)) ||
          Number(value) > (key === "loss" ? 1000000000000000 : 10000000)
        )
          throw Error(
            label +
              " harus bilangan bulat tidak negatif dalam batas yang diizinkan.",
          );
        data[key] = Number(value);
        continue;
      }
      if (value === undefined && !required)
        value = key === "recordType" ? "legacy" : "";
      if (
        typeof value !== "string" ||
        value.length > (type === "textarea" ? 20000 : 300) ||
        (required && !value.trim())
      )
        throw Error(label + " tidak valid atau belum diisi.");
      data[key] = value.trim();
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
      !Number.isFinite(Date.parse(data.date)) ||
      new Date(data.date).toISOString().slice(0, 10) !== data.date
    )
      throw Error("Tanggal kejadian tidak valid.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time))
      throw Error("Waktu kejadian tidak valid.");
    if (!["legacy", "disaster"].includes(data.recordType))
      throw Error("Jenis rekaman tidak valid.");
    if (data.recordType === "disaster") {
      if (!regions.includes(data.district))
        throw Error("Pilih kabupaten/kota Jawa Tengah.");
      for (const key of ["subdistrict", "village", "source"])
        if (!data[key]) throw Error(fields[key][0] + " wajib diisi.");
      if (!categories.includes(data.category))
        throw Error("Jenis bencana tidak valid.");
      if (!statuses.includes(data.handlingStatus))
        throw Error("Status penanganan tidak valid.");
    }
    return data;
  }
  return { regions, categories, statuses, validate };
})();
