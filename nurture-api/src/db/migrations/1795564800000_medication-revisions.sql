-- Up Migration
ALTER TABLE medications ADD COLUMN effective_from TIMESTAMPTZ;
CREATE TABLE medication_revisions (
  medication_id INT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  version INT NOT NULL,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ NOT NULL,
  definition JSONB NOT NULL,
  PRIMARY KEY (medication_id, version),
  CHECK (effective_from IS NULL OR effective_to >= effective_from)
);

-- Down Migration
DROP TABLE medication_revisions;
ALTER TABLE medications DROP COLUMN effective_from;
