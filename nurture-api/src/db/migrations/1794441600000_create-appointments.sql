-- Up Migration
CREATE TABLE appointments (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  circle_id INT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  recipient_id INT NOT NULL,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  location TEXT CHECK (length(location) <= 240),
  assigned_caregiver_id INT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed')),
  FOREIGN KEY (circle_id, recipient_id) REFERENCES recipients(circle_id, id) ON DELETE CASCADE,
  FOREIGN KEY (circle_id, assigned_caregiver_id) REFERENCES circle_members(circle_id, user_id)
    ON DELETE SET NULL (assigned_caregiver_id)
);
CREATE INDEX appointments_circle_start_idx ON appointments (circle_id, starts_at, id);

-- Down Migration
DROP TABLE appointments;
