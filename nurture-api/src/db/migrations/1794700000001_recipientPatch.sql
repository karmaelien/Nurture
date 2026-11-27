-- Up Migration
ALTER TABLE recipients ADD COLUMN version INT NOT NULL DEFAULT 1;
-- Down Migration
ALTER TABLE recipients DROP COLUMN version;
