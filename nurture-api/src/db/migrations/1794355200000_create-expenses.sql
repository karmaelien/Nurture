-- Up Migration
-- Composite key keeps each expense's recipient inside its own care circle.
ALTER TABLE recipients ADD CONSTRAINT recipients_circle_id_id_key UNIQUE (circle_id, id);
CREATE TABLE expenses (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  circle_id INT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  recipient_id INT NOT NULL,
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 200),
  category TEXT NOT NULL CHECK (category IN ('medication','appointment','insurance','utilities','other')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents BETWEEN 1 AND 9007199254740991),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  incurred_on DATE NOT NULL,
  FOREIGN KEY (circle_id, recipient_id) REFERENCES recipients(circle_id, id) ON DELETE CASCADE
);
CREATE INDEX expenses_circle_date_idx ON expenses(circle_id, incurred_on DESC, id);

-- Down Migration
DROP TABLE expenses;
ALTER TABLE recipients DROP CONSTRAINT recipients_circle_id_id_key;
