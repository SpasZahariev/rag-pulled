# Upload Ingestion Pipeline

This project now processes uploaded files asynchronously after they are accepted by the `Upload Data` page.

## What happens after upload

1. The authenticated upload API stores valid files in temporary server storage (`tmp/uploads/...`).
2. The API creates an ingestion job in Postgres and links uploaded document records to that job.
3. A background worker polls for queued jobs and claims one job at a time.
4. For each document in the job:
   - The document structurer converts file content into structured chunks.
   - The embedding generator creates a vector for each chunk.
   - Chunks and embeddings are persisted in Postgres.
5. The job reaches a terminal status (`completed` or `failed`), and the UI reflects progress through polling.

## Current implementation scope

This is a pipeline-first implementation:

- Queue + orchestration are fully implemented with Postgres.
- Structuring + embedding providers are pluggable adapters.
- Default adapters are deterministic local placeholders for end-to-end flow validation.
- Supported structurer inputs today:
  - `.csv`
  - `.md` / `.markdown`
- `.pdf`, `.xls`, and `.xlsx` are accepted at upload time but currently marked as unsupported by the placeholder structurer.

## API endpoints

### `POST /api/v1/protected/uploads`

- Auth required (Firebase token).
- Accepts multipart fields: `files` (or `file`).
- Stores files to temporary storage and enqueues an ingestion job.
- Returns:
  - `uploadSessionId`
  - `jobId`
  - `status` (`queued`)
  - `uploadedFiles[]`
  - `rejectedFiles[]`

### `GET /api/v1/protected/uploads/:jobId/status`

- Auth required.
- Returns job-level and document-level progress:
  - job status (`queued`, `processing_structure`, `processing_embeddings`, `completed`, `failed`)
  - retry counters
  - per-document structure status (`pending`, `processing`, `structured`, `unsupported`, `failed`)
  - error details where available

## Database entities

The ingestion flow adds four tables under the `app` schema:

- `ingestion_jobs` - queue state, retries, scheduling, and error metadata.
- `uploaded_documents` - accepted files linked to a job.
- `document_chunks` - normalized chunked text + metadata.
- `chunk_embeddings` - embedding model metadata + vector payloads.

## Local development

`pnpm run dev` now starts the ingestion worker automatically in Node mode.

Worker command (manual):

```bash
cd server
pnpm run worker:dev
```

Apply schema changes after pulling these updates:

```bash
cd server
pnpm db:push
```

## Environment variables

Add these to your server environment file if you want to customize providers/worker polling:

- `DOCUMENT_STRUCTURER_PROVIDER` (default: `deterministic-v1`)
- `EMBEDDING_PROVIDER` (default: `deterministic-emb-v1`)
- `INGESTION_WORKER_POLL_MS` (default: `2000`)

If unset, defaults are used.
