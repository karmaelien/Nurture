-- Up Migration
CREATE TABLE task_series (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  circle_id INT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  recipient_id INT NOT NULL,
  assigned_caregiver_id INT,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  recurrence JSONB NOT NULL CHECK (jsonb_typeof(recurrence) = 'object'),
  starts_on TEXT NOT NULL,
  due_time TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', clock_timestamp()),
  stopped_at TIMESTAMPTZ,
  progress JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(progress) = 'object'),
  UNIQUE (circle_id, id),
  FOREIGN KEY (circle_id, recipient_id) REFERENCES recipients(circle_id, id) ON DELETE CASCADE,
  FOREIGN KEY (circle_id, assigned_caregiver_id) REFERENCES circle_members(circle_id, user_id)
    ON DELETE SET NULL (assigned_caregiver_id)
);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  circle_id INT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  recipient_id INT NOT NULL,
  assigned_caregiver_id INT,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  completed_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  series_id INT,
  occurrence_date TEXT,
  UNIQUE (series_id, occurrence_date),
  FOREIGN KEY (circle_id, series_id) REFERENCES task_series(circle_id, id) ON DELETE CASCADE,
  FOREIGN KEY (circle_id, recipient_id) REFERENCES recipients(circle_id, id) ON DELETE CASCADE,
  FOREIGN KEY (circle_id, assigned_caregiver_id) REFERENCES circle_members(circle_id, user_id)
    ON DELETE SET NULL (assigned_caregiver_id),
  CHECK ((series_id IS NULL) = (occurrence_date IS NULL)),
  CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR (status = 'pending' AND completed_at IS NULL))
);
CREATE TABLE task_occurrence_exceptions (
  series_id INT NOT NULL REFERENCES task_series(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL,
  PRIMARY KEY (series_id, occurrence_date)
);
CREATE INDEX tasks_circle_due_idx ON tasks(circle_id, due_at, id);
CREATE INDEX tasks_series_idx ON tasks(series_id);
CREATE INDEX task_series_circle_idx ON task_series(circle_id, id);

-- Down Migration
DROP TABLE task_occurrence_exceptions;
DROP TABLE tasks;
DROP TABLE task_series;
