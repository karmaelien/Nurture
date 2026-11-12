-- Up Migration
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  username      TEXT NOT NULL,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE circles (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  budget      INT CHECK (budget >= 0),  -- cents
  created_by  INT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE circle_members (
  circle_id  INT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL
                CHECK (role IN ('owner','member')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, user_id)
);

CREATE TABLE refresh_tokens (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recipients(
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  circle_id   INT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE care_relationships(
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  relationship  TEXT NOT NULL CHECK (relationship IN ('parent','grandparent','sibling','friend','spouse','child','other')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, recipient_id)
);

CREATE TABLE audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,        -- 'recipient.view', 'login.failed', 'member.remove'
  circle_id   INT,
  target_id   TEXT,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_members_user      ON circle_members(user_id);
CREATE INDEX idx_members_circle ON circle_members(circle_id);
CREATE INDEX idx_documents_dash    ON documents(circle_id);
CREATE INDEX idx_tasks_dash        ON tasks(circle_id);
CREATE INDEX idx_refresh_hash      ON refresh_tokens(token_hash);
CREATE INDEX idx_recipients_circle ON recipients(circle_id);
CREATE INDEX idx_care_rel_recipient ON care_relationships(recipient_id);


-- Down Migration
DROP TABLE care_relationships;
DROP TABLE recipients;
DROP TABLE refresh_tokens;
DROP TABLE circle_members;
DROP TABLE circles;
DROP TABLE users;
DROP TABLE audit_log;