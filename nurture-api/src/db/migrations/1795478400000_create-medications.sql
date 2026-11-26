-- Up Migration
CREATE TABLE medications (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  circle_id INT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  recipient_id INT NOT NULL,
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  dosage TEXT NOT NULL CHECK (length(btrim(dosage)) BETWEEN 1 AND 120),
  schedule JSONB NOT NULL CHECK (jsonb_typeof(schedule) = 'object'),
  assigned_caregiver_id INT,
  history_version INT,
  history_through TIMESTAMPTZ,
  UNIQUE (circle_id, id),
  FOREIGN KEY (circle_id, recipient_id) REFERENCES recipients(circle_id, id) ON DELETE CASCADE,
  FOREIGN KEY (circle_id, assigned_caregiver_id) REFERENCES circle_members(circle_id, user_id)
    ON DELETE SET NULL (assigned_caregiver_id)
);
CREATE INDEX medications_circle_recipient_idx ON medications (circle_id, recipient_id, id);
CREATE TABLE medication_occurrences (
  id TEXT PRIMARY KEY,
  medication_id INT NOT NULL,
  circle_id INT NOT NULL,
  recipient_id INT NOT NULL,
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  name TEXT NOT NULL,
  definition_version INT NOT NULL CHECK (definition_version > 0),
  dosage TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  taken_at TIMESTAMPTZ,
  overdue_after_minutes INT NOT NULL CHECK (overdue_after_minutes BETWEEN 0 AND 1440),
  reminder_before_minutes INT CHECK (reminder_before_minutes BETWEEN 0 AND 1440),
  UNIQUE (medication_id, recipient_id, scheduled_at),
  FOREIGN KEY (circle_id, medication_id) REFERENCES medications(circle_id, id) ON DELETE CASCADE,
  FOREIGN KEY (circle_id, recipient_id) REFERENCES recipients(circle_id, id) ON DELETE CASCADE,
  CHECK ((status = 'completed' AND taken_at IS NOT NULL) OR (status = 'pending' AND taken_at IS NULL))
);
CREATE INDEX medication_occurrences_circle_time_idx ON medication_occurrences (circle_id, scheduled_at, id);
CREATE INDEX medication_occurrences_pending_idx ON medication_occurrences (circle_id, scheduled_at) WHERE status = 'pending';

-- Down Migration
DROP TABLE medication_occurrences;
DROP TABLE medications;
