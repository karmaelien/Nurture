-- Up Migration
CREATE TABLE invites (
    circle_id       INT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
    invitee_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by    INT REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    responded_at    TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    PRIMARY KEY (circle_id, invitee_id)

);

-- Down Migration
DROP TABLE invites;