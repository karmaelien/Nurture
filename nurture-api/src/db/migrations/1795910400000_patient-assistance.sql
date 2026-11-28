-- Up Migration
CREATE TABLE patient_assistance_reports (
  id UUID PRIMARY KEY,
  circle_id INT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  recipient_id INT NOT NULL,
  medication_id INT,
  medication_name TEXT NOT NULL CHECK (length(btrim(medication_name)) BETWEEN 1 AND 120),
  reason TEXT NOT NULL CHECK (reason IN ('price_increase', 'not_covered')),
  previous_cost_cents INT CHECK (previous_cost_cents BETWEEN 0 AND 100000000),
  current_cost_cents INT CHECK (current_cost_cents BETWEEN 0 AND 100000000),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  reported_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  dismissed_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  request_body JSONB NOT NULL,
  FOREIGN KEY (circle_id, recipient_id) REFERENCES recipients(circle_id, id) ON DELETE CASCADE,
  FOREIGN KEY (circle_id, medication_id) REFERENCES medications(circle_id, id) ON DELETE SET NULL (medication_id),
  CHECK ((reason = 'price_increase' AND previous_cost_cents IS NOT NULL AND current_cost_cents IS NOT NULL AND current_cost_cents > previous_cost_cents)
    OR (reason = 'not_covered' AND previous_cost_cents IS NULL AND current_cost_cents IS NULL))
);
CREATE INDEX patient_assistance_reports_circle_idx ON patient_assistance_reports (circle_id, created_at DESC, id DESC);
CREATE INDEX patient_assistance_reports_active_idx ON patient_assistance_reports (circle_id, recipient_id, created_at DESC, id DESC) WHERE dismissed_at IS NULL;

-- Down Migration
DROP TABLE patient_assistance_reports;
