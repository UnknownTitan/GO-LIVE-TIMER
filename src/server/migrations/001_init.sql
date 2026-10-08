-- Section 6 data model, plus a sessions table for admin sign-in.

CREATE TABLE admins (
  id            serial PRIMARY KEY,
  email         varchar(254) NOT NULL UNIQUE,
  name          varchar(120) NOT NULL,
  password_hash varchar(100),
  active        boolean NOT NULL DEFAULT true
);

CREATE TABLE settings (
  id                  integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  go_live_at          timestamptz,
  headline            varchar(90)  NOT NULL DEFAULT 'Countdown to Phase 1 Go-Live',
  programme_line      varchar(140) NOT NULL DEFAULT 'CLET Digital Transformation Programme · Phase 1',
  sprint_weeks        smallint     NOT NULL DEFAULT 2 CHECK (sprint_weeks BETWEEN 1 AND 8),
  holidays            date[]       NOT NULL DEFAULT '{}',
  reminder_enabled    boolean      NOT NULL DEFAULT true,
  reminder_recipients text[]       NOT NULL DEFAULT '{}',
  reminder_final_sent boolean      NOT NULL DEFAULT false,
  updated_at          timestamptz  NOT NULL DEFAULT now(),
  updated_by          integer REFERENCES admins(id)
);

INSERT INTO settings (id, go_live_at) VALUES (1, '2026-10-15T10:00:00Z');

CREATE TABLE clusters (
  id         serial PRIMARY KEY,
  name       varchar(60) NOT NULL UNIQUE,
  ready      smallint    NOT NULL DEFAULT 0 CHECK (ready >= 0),
  total      smallint    NOT NULL DEFAULT 0 CHECK (total BETWEEN 0 AND 999),
  sort_order smallint    NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by integer REFERENCES admins(id),
  CHECK (ready <= total)
);

CREATE TABLE audit_log (
  id         serial PRIMARY KEY,
  admin_id   integer REFERENCES admins(id),
  action     varchar(60) NOT NULL,
  before     jsonb,
  after      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);

CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY,
  admin_id   integer NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
