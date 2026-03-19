CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE app.users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  photo_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE app.ingestion_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  upload_session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_run_at TIMESTAMP NOT NULL DEFAULT NOW(),
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE app.uploaded_documents (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES app.ingestion_jobs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  structured_status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE app.document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES app.uploaded_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE app.chunk_embeddings (
  id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL REFERENCES app.document_chunks(id) ON DELETE CASCADE,
  embedding_model TEXT NOT NULL,
  embedding_dim INTEGER NOT NULL,
  embedding JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX chunk_embeddings_chunk_model_idx
  ON app.chunk_embeddings (chunk_id, embedding_model);
