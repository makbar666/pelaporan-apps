-- Jalankan pada branch pengembangan Neon terlebih dahulu.
-- Akun Neon Auth tidak otomatis menjadi anggota aplikasi.
CREATE TABLE IF NOT EXISTS incident_members (
    user_id text PRIMARY KEY,
    display_name text NOT NULL,
    enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS incident_reports (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL REFERENCES incident_members(user_id),
    report_number text NOT NULL CHECK (length(trim(report_number)) BETWEEN 1 AND 300),
    data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 1
);
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS incident_reports_number_unique
    ON incident_reports (lower(report_number));
CREATE INDEX IF NOT EXISTS incident_reports_owner_idx ON incident_reports(owner_id);

-- Tabel hanya diakses backend. Jangan memberi akses langsung kepada browser.
REVOKE ALL ON incident_members, incident_reports FROM PUBLIC;
ALTER TABLE incident_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;
-- Backend menggunakan role pemilik tabel. Role lain ditolak tanpa policy eksplisit.
