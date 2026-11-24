-- Up Migration
ALTER TABLE users ADD COLUMN phone TEXT, ADD COLUMN timezone TEXT;
ALTER TABLE recipients
  ADD COLUMN preferred_name TEXT,
  ADD COLUMN date_of_birth DATE,
  ADD COLUMN notes TEXT CHECK (char_length(notes) <= 500);
ALTER TABLE circles ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE circles DROP CONSTRAINT circles_created_by_fkey,
  ADD CONSTRAINT circles_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- Down Migration
ALTER TABLE circles DROP CONSTRAINT circles_created_by_fkey,
  ADD CONSTRAINT circles_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE circles ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE recipients DROP COLUMN notes, DROP COLUMN date_of_birth, DROP COLUMN preferred_name;
ALTER TABLE users DROP COLUMN timezone, DROP COLUMN phone;