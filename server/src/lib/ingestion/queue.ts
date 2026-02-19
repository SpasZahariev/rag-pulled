import { randomUUID } from 'node:crypto';
import { and, asc, eq, lt, lte, sql } from 'drizzle-orm';
import { getDatabase } from '../db';
import { ingestionJobs } from '../../schema/ingestion-jobs';
import { uploadedDocuments } from '../../schema/uploaded-documents';
import { documentChunks } from '../../schema/document-chunks';
import { chunkEmbeddings } from '../../schema/chunk-embeddings';
import type { UploadedFileMetadata } from '../upload-storage';
import type { EmbeddingResult, IngestionJobStatus, StructuredDocumentStatus } from './types';

const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Creates a queued ingestion job plus one uploaded_document row per accepted file.
 */
export async function enqueueIngestionJob(
  userId: string,
  uploadSessionId: string,
  uploadedFiles: UploadedFileMetadata[]
): Promise<{ jobId: string }> {
  const db = await getDatabase();
  const jobId = randomUUID();
  const now = new Date();

  await db.insert(ingestionJobs).values({
    id: jobId,
    user_id: userId,
    upload_session_id: uploadSessionId,
    status: 'queued',
    attempt_count: 0,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    next_run_at: now,
    created_at: now,
    updated_at: now,
  });

  if (uploadedFiles.length > 0) {
    await db.insert(uploadedDocuments).values(
      uploadedFiles.map((file) => ({
        id: randomUUID(),
        job_id: jobId,
        user_id: userId,
        original_name: file.originalName,
        stored_name: file.storedName,
        stored_path: file.storedPath,
        mime_type: file.mimeType,
        size_bytes: file.sizeBytes,
        structured_status: 'pending',
        created_at: now,
        updated_at: now,
      }))
    );
  }

  return { jobId };
}

export async function getIngestionJobWithDocuments(jobId: string, userId: string) {
  const db = await getDatabase();
  const [job] = await db
    .select()
    .from(ingestionJobs)
    .where(and(eq(ingestionJobs.id, jobId), eq(ingestionJobs.user_id, userId)))
    .limit(1);

  if (!job) {
    return null;
  }

  const documents = await db
    .select()
    .from(uploadedDocuments)
    .where(eq(uploadedDocuments.job_id, jobId))
    .orderBy(asc(uploadedDocuments.created_at));

  return { job, documents };
}

export async function claimNextQueuedJob() {
  const db = await getDatabase();
  const now = new Date();

  const [candidateJob] = await db
    .select()
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.status, 'queued'),
        lte(ingestionJobs.next_run_at, now),
        lt(ingestionJobs.attempt_count, ingestionJobs.max_attempts)
      )
    )
    .orderBy(asc(ingestionJobs.created_at))
    .limit(1);

  if (!candidateJob) {
    return null;
  }

  const [claimed] = await db
    .update(ingestionJobs)
    .set({
      status: 'processing_structure',
      attempt_count: sql`${ingestionJobs.attempt_count} + 1`,
      updated_at: new Date(),
    })
    .where(and(eq(ingestionJobs.id, candidateJob.id), eq(ingestionJobs.status, 'queued')))
    .returning();

  return claimed ?? null;
}

export async function getDocumentsForJob(jobId: string) {
  const db = await getDatabase();
  return db
    .select()
    .from(uploadedDocuments)
    .where(eq(uploadedDocuments.job_id, jobId))
    .orderBy(asc(uploadedDocuments.created_at));
}

export async function setJobStatus(jobId: string, status: IngestionJobStatus, error: string | null = null) {
  const db = await getDatabase();
  const updatePayload: {
    status: IngestionJobStatus;
    error?: string | null;
    updated_at: Date;
  } = {
    status,
    updated_at: new Date(),
  };

  if (error !== undefined) {
    updatePayload.error = error;
  }

  await db.update(ingestionJobs).set(updatePayload).where(eq(ingestionJobs.id, jobId));
}

export async function markDocumentStructuredStatus(
  documentId: string,
  status: StructuredDocumentStatus,
  error: string | null = null
) {
  const db = await getDatabase();
  await db
    .update(uploadedDocuments)
    .set({
      structured_status: status,
      error,
      updated_at: new Date(),
    })
    .where(eq(uploadedDocuments.id, documentId));
}

export async function insertDocumentChunks(
  documentId: string,
  chunks: Array<{ chunkIndex: number; text: string; metadata?: Record<string, unknown> }>
) {
  const db = await getDatabase();
  if (chunks.length === 0) {
    return [];
  }

  const rows = chunks.map((chunk) => ({
    id: randomUUID(),
    document_id: documentId,
    chunk_index: chunk.chunkIndex,
    text: chunk.text,
    metadata: chunk.metadata ?? null,
    created_at: new Date(),
  }));

  return db.insert(documentChunks).values(rows).returning();
}

export async function insertChunkEmbedding(
  chunkId: string,
  embedding: EmbeddingResult
): Promise<void> {
  const db = await getDatabase();
  await db.insert(chunkEmbeddings).values({
    id: randomUUID(),
    chunk_id: chunkId,
    embedding_model: embedding.model,
    embedding_dim: embedding.dimensions,
    embedding: embedding.vector,
    created_at: new Date(),
  });
}

export async function setJobFailedWithRetry(jobId: string, errorMessage: string): Promise<void> {
  const db = await getDatabase();

  const [job] = await db
    .select()
    .from(ingestionJobs)
    .where(eq(ingestionJobs.id, jobId))
    .limit(1);

  if (!job) {
    return;
  }

  const attemptsLeft = job.attempt_count < job.max_attempts;

  if (!attemptsLeft) {
    await db
      .update(ingestionJobs)
      .set({
        status: 'failed',
        error: errorMessage,
        updated_at: new Date(),
      })
      .where(eq(ingestionJobs.id, jobId));
    return;
  }

  // Backoff grows by attempt count and is bounded to avoid unbounded delays.
  const backoffMs = Math.min(60_000, Math.max(5_000, 2 ** job.attempt_count * 1_000));
  const nextRunAt = new Date(Date.now() + backoffMs);

  await db
    .update(ingestionJobs)
    .set({
      status: 'queued',
      error: errorMessage,
      next_run_at: nextRunAt,
      updated_at: new Date(),
    })
    .where(eq(ingestionJobs.id, jobId));
}
