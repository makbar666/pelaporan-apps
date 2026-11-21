"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("report-form");
  let reports = [],
    user = null,
    settings = {},
    selected = new Set(),
    preview = [];
  let editing = null,
    timer,
    busy = false,
    loadSequence = 0;
  let photos = [],
    previewReports = [],
    summaryMode = false;

  function message(text, error = false) {
    $("status").textContent = text;
    $("status").className = error ? "status error-status" : "status";
  }

  function lock(text = "") {
    clearTimeout(timer);
    if (user) {
      try {
        Store.write("draft", { data: values(), editing });
      } catch {
        /* Masuk kembali tetap tersedia saat storage penuh. */
      }
    }
    ++loadSequence;
    user = null;
    reports = [];
    selected.clear();
    preview = [];
    previewReports = [];
    photos = [];
    settings = {};
    $("detail-dialog").close();
    $("detail-content").replaceChildren();
    renderPhotos();
    $("documents").replaceChildren();
    $("rows").replaceChildren();
    HTMLFormElement.prototype.reset.call(form);
    $("organization").value = "";
    $("logo").value = "";
    $("application").hidden = true;
    $("account").hidden = true;
    $("auth-panel").hidden = false;
    $("account-name").textContent = "";
    $("auth-status").textContent = text;
    Store.setUser(null);
  }

  async function api(path, method = "GET", data) {
    let response;
    try {
      response = await fetch("/api/" + path, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...(user ? { "X-Actor-Id": user.id } : {}),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
    } catch {
      throw Error("Koneksi terputus. Periksa jaringan Anda dan coba lagi.");
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw Error(
        "Backend online belum tersedia. Gunakan situs Netlify yang telah dikonfigurasi.",
      );
    }
    if (!response.ok) {
      const text = result.error || "Permintaan gagal. Coba lagi.";
      if ((response.status === 401 || response.status === 403) && user)
        lock(text);
      throw Error(text);
    }
    return result;
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    document
      .querySelectorAll(
        "#application button, #application input, #application select, #application textarea, #logout",
      )
      .forEach((el) => (el.disabled = true));
    try {
      await action();
    } catch (error) {
      message(error.message, true);
      if (!user) $("auth-status").textContent = error.message;
    } finally {
      busy = false;
      document
        .querySelectorAll(
          "#application button, #application input, #application select, #application textarea, #logout",
        )
        .forEach((el) => (el.disabled = false));
    }
  }

  function tab(name) {
    for (const id of ["input", "recap", "preview"]) $(id).hidden = id !== name;
    document.querySelectorAll("[data-tab]").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === name);
      b.setAttribute("aria-current", b.dataset.tab === name ? "page" : "false");
    });
  }
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => (b.onclick = () => tab(b.dataset.tab)));

  function values() {
    const data = Object.fromEntries(
      Object.entries(Store.schema).map(([k, f]) => [
        k,
        f[1] === "photos" ? photos : form.elements[k].value,
      ]),
    );
    if (!data.title)
      data.title =
        (data.category || "Kejadian") +
        " — " +
        (data.district || data.location || "Jawa Tengah");
    if (!data.location)
      data.location = [data.village, data.subdistrict, data.district]
        .filter(Boolean)
        .join(", ");
    return data;
  }
  function setRecordMode(type) {
    for (const key of ["district", "subdistrict", "village", "source", "handlingStatus"]) {
      form.elements[key].required = type === "disaster";
      document.querySelector('label[for="' + key + '"]').textContent = Store.schema[key][0] + (type === "disaster" ? " *" : "");
    }
  }
  function fill(data) {
    setRecordMode(data.recordType || "legacy");
    for (const [k, f] of Object.entries(Store.schema)) {
      if (f[1] === "photos") continue;
      const el = form.elements[k];
      if (data[k] !== undefined) {
        if (
          el.tagName === "SELECT" &&
          data[k] &&
          !Array.from(el.options).some((o) => o.value === data[k])
        )
          el.add(new Option(data[k], data[k]));
        el.value = data[k];
      }
    }
    photos = [...(data.photos || [])];
    renderPhotos();
  }
  function fresh() {
    clearTimeout(timer);
    editing = null;
    HTMLFormElement.prototype.reset.call(form);
    photos = [];
    renderPhotos();
    $("recordType").value = "disaster";
    setRecordMode("disaster");
    $("handlingStatus").value = IncidentModel.statuses[0];
    $("division").value = "Pusdalops PB";
    $("date").value = new Date().toLocaleDateString("sv-SE");
    $("time").value = new Date().toTimeString().slice(0, 5);
    $("number").value =
      "LK-" +
      new Date().toLocaleDateString("sv-SE").replaceAll("-", "") +
      "-" +
      crypto.randomUUID().slice(0, 8).toUpperCase();
    $("form-title").textContent = "Input laporan baru";
    $("draft-status").textContent = "";
    document.querySelectorAll(".error").forEach((el) => (el.textContent = ""));
    form
      .querySelectorAll("[aria-invalid]")
      .forEach((el) => el.removeAttribute("aria-invalid"));
  }

  function saveDraft() {
    if (!user) return;
    try {
      Store.write("draft", { data: values(), editing });
      $("draft-status").textContent = "Draf tersimpan di browser";
    } catch (error) {
      message(error.message, true);
    }
  }
  form.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(saveDraft, 600);
  });

  async function loadReports() {
    const sequence = ++loadSequence,
      scope = $("scope").value;
    const loaded = [];
    let offset = 0;
    do {
      const data = await api("reports?scope=" + scope + "&offset=" + offset);
      if (sequence !== loadSequence) return;
      for (const r of data.reports)
        loaded.push({
          ...Store.validate(r),
          ownerId: r.ownerId,
          ownerName: r.ownerName,
          version: r.version,
          photoCount: r.photoCount || 0,
        });
      offset = data.nextOffset;
    } while (offset !== null);
    reports = loaded;
    selected.clear();
    preview = [];
    previewReports = [];
    Report.render([], settings);
    render();
  }

  async function enter(account) {
    user = account;
    Store.setUser(user.id);
    settings = {};
    fresh();
    $("scope").value = "mine";
    for (const id of [
      "search",
      "from",
      "to",
      "category-filter",
      "district-filter",
      "status-filter",
    ])
      $(id).value = "";
    try {
      const s = Store.read("settings", {});
      settings = {
        organization:
          typeof s?.organization === "string"
            ? s.organization.slice(0, 200)
            : "",
        logo:
          typeof s?.logo === "string" &&
          /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s.logo) &&
          s.logo.length < 700000
            ? s.logo
            : "",
      };
      const draft = Store.read("draft", null);
      if (draft?.data) {
        fill({ ...draft.data, recordType: draft.data.recordType || "legacy" });
        editing = draft.editing;
        $("draft-status").textContent = "Draf akun ini dipulihkan";
        if (editing) $("form-title").textContent = "Edit laporan";
      }
    } catch (error) {
      message(error.message, true);
    }
    $("organization").value = settings.organization || "";
    await loadReports();
    $("account-name").textContent = user.name;
    $("application").hidden = false;
    $("account").hidden = false;
    $("auth-panel").hidden = true;
    $("login-password").value = "";
    tab("input");
  }

  $("login-form").onsubmit = async (event) => {
    event.preventDefault();
    $("login-button").disabled = true;
    $("login-button").textContent = "Memproses…";
    $("auth-status").textContent = "";
    try {
      const result = await api("login", "POST", {
        email: $("login-email").value.trim(),
        password: $("login-password").value,
      });
      await enter(result.user);
    } catch (error) {
      lock(error.message);
    } finally {
      $("login-password").value = "";
      $("login-button").disabled = false;
      $("login-button").textContent = "Masuk";
    }
  };
  $("logout").onclick = () =>
    run(async () => {
      saveDraft();
      await api("logout", "POST", {});
      lock("Anda telah keluar.");
    });

  form.onsubmit = (event) => {
    event.preventDefault();
    // Validasi dilakukan sebelum kontrol dinonaktifkan selama permintaan server.
    let invalid = null;
    for (const [key, [label, type]] of Object.entries(Store.schema)) {
      if (type === "photos" || type === "hidden") continue;
      const el = form.elements[key],
        bad = !el.checkValidity() || (el.required && !el.value.trim());
      $("error-" + key).textContent = bad
        ? label + " wajib diisi dengan format yang benar."
        : "";
      el.setAttribute("aria-invalid", String(bad));
      if (bad && !invalid) invalid = el;
    }
    if (invalid) {
      invalid.focus();
      message("Periksa kolom yang ditandai.", true);
      return;
    }
    run(async () => {
      const data = Store.validate({
        ...values(),
        id: editing?.id || crypto.randomUUID(),
      });
      saveDraft();
      await api(
        editing ? "reports/" + editing.id : "reports",
        editing ? "PUT" : "POST",
        { ...data, version: editing?.version },
      );
      fresh();
      try {
        Store.remove("draft");
      } catch (error) {
        message(error.message, true);
      }
      $("scope").value = "mine";
      try {
        await loadReports();
      } catch {
        message(
          "Laporan berhasil disimpan, tetapi rekap belum dapat dimuat. Gunakan Muat ulang data.",
          true,
        );
        tab("recap");
        return;
      }
      message("Laporan berhasil disimpan online.");
      tab("recap");
    });
  };
  $("reset").onclick = () => {
    if (confirm("Kosongkan formulir dan hapus draf akun ini?")) {
      fresh();
      try {
        Store.remove("draft");
      } catch (error) {
        message(error.message, true);
      }
    }
  };
  $("new-report").onclick = () => tab("input");

  function filtered() {
    const q = $("search").value.trim().toLocaleLowerCase();
    return ReportScope.filter(reports, $("scope").value, user)
      .filter(
        (r) =>
          (!q ||
            Object.values(r).some(
              (v) => typeof v === "string" && v.toLocaleLowerCase().includes(q),
            )) &&
          (!$("from").value || r.date >= $("from").value) &&
          (!$("to").value || r.date <= $("to").value) &&
          (!$("category-filter").value ||
            r.category === $("category-filter").value) &&
          (!$("district-filter").value ||
            r.district === $("district-filter").value) &&
          (!$("status-filter").value ||
            r.handlingStatus === $("status-filter").value),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async function fullReport(id) {
    return (await api("reports/" + id)).report;
  }
  async function open(ids) {
    const rows = [];
    for (const id of ids) rows.push(await fullReport(id));
    preview = ids;
    previewReports = rows;
    summaryMode = false;
    Report.render(rows, settings);
    tab("preview");
  }
  function bars(id, rows, key) {
    const counts = new Map();
    for (const r of rows) {
      const label = r[key] || "Belum ditentukan";
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    const sorted = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8),
      root = $(id);
    root.replaceChildren();
    if (!sorted.length) {
      root.append(Report.node("p", "Belum ada data pada filter ini.", "help"));
      return;
    }
    for (const [label, count] of sorted) {
      const row = Report.node("div", undefined, "bar-row"),
        track = Report.node("div", undefined, "bar-track"),
        fill = Report.node("div", undefined, "bar-fill");
      fill.style.width = (count / sorted[0][1]) * 100 + "%";
      track.append(fill);
      row.append(
        Report.node("span", label),
        track,
        Report.node("strong", count),
      );
      root.append(row);
    }
  }

  function render() {
    $("badge").textContent = reports.length;
    for (const [id, key, label] of [
      ["category-filter", "category", "Semua jenis"],
      ["district-filter", "district", "Semua wilayah"],
      ["status-filter", "handlingStatus", "Semua status"],
    ]) {
      const old = $(id).value,
        options = [
          ...new Set(reports.map((r) => r[key]).filter(Boolean)),
        ].sort();
      $(id).replaceChildren(
        new Option(label, ""),
        ...options.map((c) => new Option(c, c)),
      );
      $(id).value = options.includes(old) ? old : "";
    }
    const displayed = filtered(),
      t = Report.totals(displayed);
    $("total").textContent = displayed.length;
    $("month").textContent =
      displayed.filter((r) =>
        r.date.startsWith(new Date().toLocaleDateString("sv-SE").slice(0, 7)),
      ).length + " bulan ini";
    $("affected-total").textContent = t.affected.toLocaleString("id-ID");
    $("evacuated-total").textContent = t.evacuated + " mengungsi";
    $("casualties-total").textContent = t.deaths + " / " + t.injured;
    $("houses-total").textContent =
      t.houseHeavy + t.houseMedium + t.houseLight + t.houseFlooded;
    $("loss-total").textContent = Report.rupiah(t.loss);
    bars("chart-types", displayed, "category");
    bars("chart-regions", displayed, "district");
    $("scope-description").textContent =
      ($("scope").value === "mine"
        ? "Laporan milik akun Anda."
        : "Laporan seluruh anggota tim.") +
      " Statistik mengikuti semua filter. Data lama dapat melengkapi wilayah melalui Edit.";
    const list = filtered();
    $("rows").replaceChildren();
    for (const [i, r] of list.entries()) {
      const tr = Report.node("tr"),
        td = Report.node("td"),
        check = Report.node("input");
      check.type = "checkbox";
      check.checked = selected.has(r.id);
      check.setAttribute("aria-label", "Pilih " + r.number);
      check.onchange = () => {
        check.checked ? selected.add(r.id) : selected.delete(r.id);
        render();
      };
      td.append(check);
      tr.append(td);
      for (const v of [
        i + 1,
        r.number + " / " + Report.date(r.date) + " " + r.time,
        [r.district, r.subdistrict, r.village].filter(Boolean).join(", ") ||
          r.location,
        r.category,
        "Terdampak: " +
          r.affected +
          "; rumah: " +
          (r.houseHeavy + r.houseMedium + r.houseLight + r.houseFlooded),
        r.handlingStatus || "Belum ditentukan",
        r.ownerName || r.reporter,
      ])
        tr.append(Report.node("td", v));
      tr.children[2].replaceChildren(
        Report.node("strong", r.title),
        Report.node("small", r.number),
        Report.node("small", Report.date(r.date) + " · " + r.time),
      );
      if (r.photoCount)
        tr.children[2].append(
          Report.node("small", r.photoCount + " foto dokumentasi"),
        );
      if (ReportScope.owns(r, user)) {
        const select = Report.node("select");
        select.className = "status-select";
        select.setAttribute("aria-label", "Ubah status " + r.number);
        select.add(new Option("Ubah status…", ""));
        for (const status of IncidentModel.statuses)
          select.add(new Option(status, status));
        select.onchange = () => {
          if (select.value)
            run(async () => {
              const data = await fullReport(r.id);
              await api("reports/" + r.id, "PUT", {
                ...data,
                handlingStatus: select.value,
                version: r.version,
              });
              await loadReports();
              message("Status penanganan diperbarui.");
            });
        };
        tr.children[6].append(select);
      }
      const actions = Report.node("td", undefined, "row-actions");
      const buttons = [
        [
          "Detail",
          () =>
            run(async () => {
              const data = await fullReport(r.id);
              $("detail-content").replaceChildren(
                Report.article(data, settings),
              );
              $("detail-official").onclick = () =>
                run(async () => {
                  $("detail-dialog").close();
                  await open([r.id]);
                });
              $("detail-dialog").showModal();
            }),
        ],
        ["Cetak", () => run(() => open([r.id]))],
      ];
      if (ReportScope.owns(r, user))
        buttons.push(
          [
            "Edit",
            () =>
              run(async () => {
                const data = await fullReport(r.id);
                clearTimeout(timer);
                editing = { id: data.id, version: data.version };
                fill(Store.validate(data));
                saveDraft();
                $("form-title").textContent = "Edit laporan";
                tab("input");
              }),
          ],
          [
            "Hapus",
            () => {
              if (
                confirm(
                  "Hapus laporan " +
                    r.number +
                    "? Tindakan ini tidak dapat dibatalkan.",
                )
              )
                run(async () => {
                  await api("reports/" + r.id, "DELETE", {
                    version: r.version,
                  });
                  if (editing?.id === r.id) {
                    fresh();
                    Store.remove("draft");
                  }
                  await loadReports();
                  message("Laporan dihapus.");
                });
            },
          ],
        );
      for (const [label, fn] of buttons) {
        const b = Report.node("button", label);
        b.onclick = fn;
        actions.append(b);
      }
      tr.append(actions);
      $("rows").append(tr);
    }
    $("empty").hidden = list.length > 0;
    $("empty").textContent = reports.length
      ? "Tidak ada laporan yang sesuai filter."
      : "Belum ada laporan pada pilihan ini.";
    $("selected-count").textContent = selected.size;
    $("select-all").checked =
      list.length > 0 && list.every((r) => selected.has(r.id));
    $("select-all").indeterminate =
      list.some((r) => selected.has(r.id)) && !$("select-all").checked;
  }

  for (const id of [
    "search",
    "from",
    "to",
    "category-filter",
    "district-filter",
    "status-filter",
  ])
    $(id).addEventListener("input", render);
  $("scope").onchange = () =>
    run(async () => {
      try {
        await loadReports();
      } catch (error) {
        reports = [];
        selected.clear();
        preview = [];
        Report.render([], settings);
        render();
        throw error;
      }
    });
  $("refresh").onclick = () =>
    run(async () => {
      await loadReports();
      message("Data online dimuat ulang.");
    });
  $("clear-filter").onclick = () => {
    for (const id of [
      "search",
      "from",
      "to",
      "category-filter",
      "district-filter",
      "status-filter",
    ])
      $(id).value = "";
    render();
  };
  $("select-all").onchange = () => {
    filtered().forEach((r) =>
      $("select-all").checked ? selected.add(r.id) : selected.delete(r.id),
    );
    render();
  };
  $("print-selected").onclick = () =>
    selected.size
      ? run(() => open([...selected]))
      : message("Pilih minimal satu laporan.", true);
  function print() {
    if (!preview.length) return message("Pilih laporan terlebih dahulu.", true);
    window.print();
  }
  $("pdf").onclick = $("print").onclick = print;
  $("copy").onclick = async () => {
    if (!preview.length) return message("Pilih laporan terlebih dahulu.", true);
    const text = (
      summaryMode
        ? [
            "REKAPITULASI KEJADIAN BENCANA",
            "Jumlah kejadian: " + previewReports.length,
            ...previewReports.map((r) => Report.text(r, settings)),
          ]
        : previewReports.map((r) => Report.text(r, settings))
    ).join("\n\n--------------------\n\n");
    try {
      await navigator.clipboard.writeText(text);
      message("Teks laporan disalin.");
    } catch {
      const area = Report.node("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      message(
        ok
          ? "Teks laporan disalin."
          : "Browser menolak penyalinan. Salin langsung dari pratinjau.",
        !ok,
      );
    }
  };

  function updateSettings(next) {
    Store.write("settings", next);
    settings = next;
    Report.render(previewReports, settings, summaryMode);
  }
  $("organization").onchange = () => {
    try {
      updateSettings({
        ...settings,
        organization: $("organization").value.trim(),
      });
    } catch (error) {
      message(error.message, true);
    }
  };
  $("logo").onchange = () => {
    const file = $("logo").files[0];
    if (!file) return;
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 500 * 1024
    )
      return message("Gunakan logo PNG/JPG maksimal 500 KB.", true);
    const accountId = user.id,
      reader = new FileReader();
    reader.onload = () => {
      if (user?.id !== accountId) return;
      try {
        updateSettings({ ...settings, logo: reader.result });
      } catch (error) {
        message(error.message, true);
      }
    };
    reader.onerror = () => message("Logo gagal dibaca.", true);
    reader.readAsDataURL(file);
  };
  $("remove-logo").onclick = () => {
    try {
      updateSettings({ ...settings, logo: "" });
      $("logo").value = "";
    } catch (error) {
      message(error.message, true);
    }
  };

  function download(data) {
    const blob = new Blob(
      [JSON.stringify({ version: 1, reports: data }, null, 2)],
      { type: "application/json" },
    );
    if (blob.size > 4000000)
      throw Error(
        "Cadangan melebihi batas impor 4 MB. Pilih lebih sedikit laporan menggunakan checkbox atau filter.",
      );
    const url = URL.createObjectURL(blob);
    const a = Report.node("a");
    a.href = url;
    a.download =
      "laporan-kejadian-" + new Date().toLocaleDateString("sv-SE") + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("export").onclick = () =>
    run(async () => {
      const data = [];
      for (const r of filtered().filter(
        (r) => !selected.size || selected.has(r.id),
      ))
        data.push(Store.validate(await fullReport(r.id)));
      if (
        new Blob([JSON.stringify({ version: 1, reports: data })]).size > 4000000
      )
        throw Error(
          "Cadangan melebihi 4 MB. Pilih lebih sedikit laporan untuk dicadangkan dalam beberapa berkas.",
        );
      download(data);
      message("Cadangan lengkap, termasuk foto, berhasil dibuat.");
    });
  $("csv").onclick = () => {
    const blob = new Blob([Report.csv(filtered())], {
        type: "text/csv;charset=utf-8",
      }),
      url = URL.createObjectURL(blob),
      a = Report.node("a");
    a.href = url;
    a.download = "rekap-bencana.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("preview-summary").onclick = () => {
    previewReports = filtered();
    summaryMode = true;
    preview = previewReports.map((r) => r.id);
    Report.render(previewReports, settings, true);
    tab("preview");
  };
  $("close-detail").onclick = () => $("detail-dialog").close();
  function legacyBackup() {
    try {
      download(Store.validateList(Store.read("reports", [])));
      if (user)
        message(
          "Cadangan data lokal lama dibuat; data lama tetap dipertahankan.",
        );
      else $("auth-status").textContent = "Cadangan data lokal lama dibuat.";
    } catch (error) {
      if (user) message(error.message, true);
      else $("auth-status").textContent = error.message;
    }
  }
  $("legacy-backup").onclick = $("legacy-backup-login").onclick = legacyBackup;
  $("import").onclick = () => $("import-file").click();
  $("import-file").onchange = () =>
    run(async () => {
      const file = $("import-file").files[0];
      if (!file) return;
      try {
        if (file.size > 4000000) throw Error("Berkas impor maksimal 4 MB.");
        const data = JSON.parse(await file.text());
        if (
          data.version !== 1 ||
          !Array.isArray(data.reports) ||
          data.reports.length > 1000
        )
          throw Error("Cadangan harus versi 1 dan maksimal 1.000 laporan.");
        const next = Store.validateList(data.reports);
        if (
          confirm(
            "Ganti SEMUA laporan milik akun Anda dengan " +
              next.length +
              " laporan dari cadangan? Laporan anggota lain tetap dipertahankan. Ekspor cadangan dahulu jika diperlukan.",
          )
        ) {
          await api("reports/import", "POST", { version: 1, reports: next });
          fresh();
          Store.remove("draft");
          $("scope").value = "mine";
          await loadReports();
          message("Laporan Anda berhasil dipulihkan online.");
        }
      } finally {
        $("import-file").value = "";
      }
    });

  function renderPhotos() {
    const root = $("photo-previews");
    root.replaceChildren();
    photos.forEach((src, index) => {
      const card = Report.node("div", undefined, "photo-card"),
        img = Report.node("img"),
        button = Report.node("button", "Hapus foto");
      img.src = src;
      img.alt = "Foto kejadian " + (index + 1);
      button.type = "button";
      button.onclick = () => {
        photos.splice(index, 1);
        renderPhotos();
        saveDraft();
      };
      card.append(img, button);
      root.append(card);
    });
  }
  async function compressPhoto(file) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    )
      throw Error("Gunakan gambar PNG/JPEG/WebP maksimal 10 MB.");
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 40000000)
        throw Error(
          "Resolusi foto terlalu besar. Gunakan maksimal 40 megapiksel.",
        );
      const canvas = document.createElement("canvas");
      let scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
      for (let i = 0; i < 6; i++) {
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const value = canvas.toDataURL("image/jpeg", 0.7);
        if (value.length <= 180000) return value;
        scale *= 0.75;
      }
      throw Error(
        "Foto tidak dapat dikompresi ke batas ukuran. Gunakan gambar lebih kecil.",
      );
    } finally {
      bitmap.close();
    }
  }
  $("photos").onchange = () =>
    run(async () => {
      try {
        const files = [...$("photos").files];
        if (files.length + photos.length > 3)
          throw Error("Maksimal 3 foto per kejadian.");
        const added = [];
        for (const file of files) added.push(await compressPhoto(file));
        photos.push(...added);
        renderPhotos();
        saveDraft();
        message("Foto siap disimpan bersama laporan online.");
      } finally {
        $("photos").value = "";
      }
    });
  for (const [id, options] of [
    ["district", IncidentModel.regions],
    ["category", IncidentModel.categories],
    ["handlingStatus", IncidentModel.statuses],
  ])
    for (const option of options) $(id).add(new Option(option, option));
  window.addEventListener("pagehide", saveDraft);
  (async () => {
    try {
      const result = await api("session");
      await enter(result.user);
    } catch (error) {
      lock(error.message);
    } finally {
      $("login-button").disabled = false;
      $("login-button").textContent = "Masuk";
    }
  })();
})();
