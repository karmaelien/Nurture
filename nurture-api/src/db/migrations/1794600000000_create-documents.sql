-- Up Migration
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE care_documents (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  circle_id integer NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  recipient_id integer NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  category text NOT NULL CHECK (category IN ('medical','insurance','financial','personal','other')),
  file_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type = 'application/pdf'),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  file_bytes bytea NOT NULL CHECK (octet_length(file_bytes) = size_bytes),
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending','processing','ready','failed')),
  processing_error text,
  processing_started_at timestamptz,
  processing_token uuid,
  uploaded_by integer REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  sharing_mode text NOT NULL CHECK (sharing_mode IN ('circle','selected')),
  UNIQUE (circle_id,id),
  FOREIGN KEY (circle_id,recipient_id) REFERENCES recipients(circle_id,id) ON DELETE CASCADE
);
CREATE TABLE document_grants (
  circle_id integer NOT NULL,
  document_id integer NOT NULL,
  user_id integer NOT NULL,
  PRIMARY KEY (document_id,user_id),
  FOREIGN KEY (circle_id,document_id) REFERENCES care_documents(circle_id,id) ON DELETE CASCADE,
  FOREIGN KEY (circle_id,user_id) REFERENCES circle_members(circle_id,user_id) ON DELETE CASCADE
);
CREATE INDEX care_documents_circle_uploaded ON care_documents(circle_id,uploaded_at DESC,id);

CREATE TABLE document_chunks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id integer NOT NULL REFERENCES care_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  page_number integer NOT NULL CHECK (page_number > 0),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 1800),
  embedding vector(1536) NOT NULL,
  embedding_model text NOT NULL CHECK (embedding_model = 'text-embedding-3-small'),
  UNIQUE (document_id,chunk_index)
);
-- Retrieval and any additional vector indexes are left to the RAG implementation.

-- Down Migration
DROP TABLE document_chunks;
DROP TABLE document_grants;
DROP TABLE care_documents;
