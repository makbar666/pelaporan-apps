import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { validateReport, validateImport } from "../server/validation.mjs";
const report = {
  number: "BPBD-1",
  title: "Banjir",
  date: "2026-11-21",
  time: "23:12",
  location: "Desa",
  category: "Banjir",
  reporter: "Petugas",
  division: "Pusdalops",
  chronology: "Kronologi",
  recordType: "disaster",
  district: "Kab. Demak",
  subdistrict: "Sayung",
  village: "Desa",
  source: "BPBD kabupaten",
  handlingStatus: "Dalam Penanganan / Siaga",
};
test("disaster fields normalize counts, preserve bounded photos and reject malformed impact", () => {
  const data = validateReport({
    ...report,
    affected: "123",
    houseHeavy: "2",
    loss: "1000000",
  });
  assert.equal(data.affected, 123);
  assert.equal(data.deaths, 0);
  assert.equal(data.loss, 1000000);
  assert.deepEqual(data.photos, []);
  for (const value of [-1, 1.5, "abc", null, true, 10000001])
    assert.throws(() => validateReport({ ...report, deaths: value }));
  for (const key of [
    "district",
    "subdistrict",
    "village",
    "source",
    "handlingStatus",
  ])
    assert.throws(() => validateReport({ ...report, [key]: "" }));
  assert.throws(() => validateReport({ ...report, category: "<script>" }));
  assert.throws(() =>
    validateReport({ ...report, photos: ["data:image/svg+xml;base64,AAAA"] }),
  );
  assert.throws(() =>
    validateReport({ ...report, photos: ["x".repeat(180001)] }),
  );
  assert.throws(() =>
    validateReport({
      ...report,
      photos: Array(4).fill("data:image/jpeg;base64,/9j/AAAA"),
    }),
  );
  assert.equal(
    validateImport({
      version: 1,
      reports: [{ ...report, photos: ["data:image/jpeg;base64,/9j/AAAA"] }],
    })[0].photos.length,
    1,
  );
});
test("legacy reports are preserved without invented impact or district", () => {
  const {
    recordType,
    district,
    subdistrict,
    village,
    source,
    handlingStatus,
    ...legacy
  } = report;
  const data = validateReport(legacy);
  assert.equal(data.recordType, "legacy");
  assert.equal(data.district, "");
  assert.equal(data.number, legacy.number);
  assert.equal(data.loss, 0);
});
test("CSV escapes all fields and spreadsheet formulas; report text includes impact", async () => {
  const context = {
    window: {},
    Store: {
      schema: JSON.parse(await readFile("assets/report-fields.json", "utf8")),
    },
  };
  runInNewContext(await readFile("assets/js/report.js", "utf8"), context);
  const r = validateReport({
    ...report,
    village: "=SUM(1,2)",
    affected: 12,
    loss: 1234567,
  });
  const csv = context.window.Report.csv([r]);
  assert.ok(csv.includes('"\'=SUM(1,2)"'));
  assert.ok(context.window.Report.text(r).includes("12"));
});
