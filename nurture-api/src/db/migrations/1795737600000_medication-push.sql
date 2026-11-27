-- Up Migration
CREATE TABLE medication_push_subscriptions (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX medication_push_user ON medication_push_subscriptions(user_id);
CREATE TABLE medication_push_deliveries (
  subscription_id INT NOT NULL REFERENCES medication_push_subscriptions(id) ON DELETE CASCADE,
  occurrence_id TEXT NOT NULL REFERENCES medication_occurrences(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('reminder', 'missed')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, occurrence_id, kind)
);

-- Down Migration
DROP TABLE medication_push_deliveries;
DROP TABLE medication_push_subscriptions;
