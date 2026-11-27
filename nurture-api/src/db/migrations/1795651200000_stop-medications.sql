-- Up Migration
ALTER TABLE medications ADD COLUMN stopped_at TIMESTAMPTZ;

-- Down Migration
ALTER TABLE medications DROP COLUMN stopped_at;
