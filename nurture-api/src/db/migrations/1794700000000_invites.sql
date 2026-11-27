-- Up Migration
CREATE TABLE invites (
    circle_id       INT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
    invitee_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    responded_at    TIMESTAMPTZ,
    token_hash      TEXT UNIQUE NOT NULL,
    status          TEXT CHECK (pending, accepted, declined, cancelled),
    CREATE UNIQUE INDEX one_per_circle ON (circle_id, email) WHERE status = 'pending'

);
-- Down Migration
DROP TABLE invites;