-- Up Migration
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  username      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dashboards (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  budget      INT,  -- cents
  created_by  INT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE dashboard_members (
  dashboard_id  INT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL
                CHECK (role IN ('owner','admin','member')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dashboard_id, user_id)
);

CREATE TABLE documents (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dashboard_id  INT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  contents      TEXT,
  created_by    INT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dashboard_id  INT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  type          TEXT,
  description   TEXT,
  deadline      TIMESTAMPTZ,
  created_by    INT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_members_user      ON dashboard_members(user_id);
CREATE INDEX idx_members_dashboard ON dashboard_members(dashboard_id);
CREATE INDEX idx_documents_dash    ON documents(dashboard_id);
CREATE INDEX idx_tasks_dash        ON tasks(dashboard_id);
CREATE INDEX idx_refresh_hash      ON refresh_tokens(token_hash);


-- Down Migration
DROP TABLE refresh_tokens;
DROP TABLE tasks;
DROP TABLE documents;
DROP TABLE dashboard_members;
DROP TABLE dashboards;
DROP TABLE users;