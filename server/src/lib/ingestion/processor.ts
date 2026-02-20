import {
  getDocumentsForJob,
  insertChunkEmbedding,
  insertDocumentChunks,
  markDocumentStructuredStatus,
  setJobFailedWithRetry,
  setJobStatus,
} from './queue';
import { resolveStoredPathToAbsolutePath } from '../upload-storage';
import { createDocumentStructurer } from './adapters/document-structurer';
import { createEmbeddingGenerator } from './adapters/embedding-generator';
import { getDocumentStructurerProvider, getEmbeddingProvider, validateIngestionProviderEnv } from '../env';
import type { StructuredDocumentResult } from './types';

function asIsoTimestamp(value: number): string {
  return new Date(value).toISOString();
}

/**
 * Runs the full structuring + embedding pipeline for one claimed ingestion job.
 */
export async function processIngestionJob(jobId: string): Promise<void> {
  try {
    validateIngestionProviderEnv();
    const documents = await getDocumentsForJob(jobId);
    const structurer = createDocumentStructurer(getDocumentStructurerProvider());
    const embeddingGenerator = createEmbeddingGenerator(getEmbeddingProvider());
    console.log(
      `[worker] Processing job ${jobId} with structurer=${structurer.id} embedding=${embeddingGenerator.id}`
    );

    for (const document of documents) {
      await markDocumentStructuredStatus(document.id, 'processing');
      const absolutePath = resolveStoredPathToAbsolutePath(document.stored_path);
      const structuringStartedMs = Date.now();
      let structured: StructuredDocumentResult;
      try {
        structured = await structurer.structure(absolutePath, document.mime_type);
        const structuringEndedMs = Date.now();
        const durationMs = structuringEndedMs - structuringStartedMs;
        console.log(
          `[worker][timing] phase=structuring jobId=${jobId} documentId=${document.id} originalName="${document.original_name}" provider=${structurer.id} status=${structured.status} startedAt=${asIsoTimestamp(structuringStartedMs)} endedAt=${asIsoTimestamp(structuringEndedMs)} durationMs=${durationMs} durationSec=${(durationMs / 1000).toFixed(3)}`
        );
      } catch (error) {
        const structuringEndedMs = Date.now();
        const durationMs = structuringEndedMs - structuringStartedMs;
        const message = error instanceof Error ? error.message : 'Unknown structure failure';
        console.error(
          `[worker][timing] phase=structuring jobId=${jobId} documentId=${document.id} originalName="${document.original_name}" provider=${structurer.id} status=threw startedAt=${asIsoTimestamp(structuringStartedMs)} endedAt=${asIsoTimestamp(structuringEndedMs)} durationMs=${durationMs} durationSec=${(durationMs / 1000).toFixed(3)} error="${message}"`
        );
        throw error;
      }

      if (structured.status === 'unsupported') {
        await markDocumentStructuredStatus(document.id, 'unsupported', structured.error ?? null);
        continue;
      }

      if (structured.status === 'failed') {
        await markDocumentStructuredStatus(document.id, 'failed', structured.error ?? 'Structure step failed');
        continue;
      }

      const insertedChunks = await insertDocumentChunks(document.id, structured.chunks);
      // Job-level state moves forward from structure to embedding.
      await setJobStatus(jobId, 'processing_embeddings');
      const embeddingStartedMs = Date.now();

      try {
        for (const chunk of insertedChunks) {
          const embedding = await embeddingGenerator.embed(chunk.text);
          await insertChunkEmbedding(chunk.id, embedding);
        }
        const embeddingEndedMs = Date.now();
        const durationMs = embeddingEndedMs - embeddingStartedMs;
        console.log(
          `[worker][timing] phase=embeddings jobId=${jobId} documentId=${document.id} originalName="${document.original_name}" provider=${embeddingGenerator.id} chunks=${insertedChunks.length} startedAt=${asIsoTimestamp(embeddingStartedMs)} endedAt=${asIsoTimestamp(embeddingEndedMs)} durationMs=${durationMs} durationSec=${(durationMs / 1000).toFixed(3)}`
        );
      } catch (error) {
        const embeddingEndedMs = Date.now();
        const durationMs = embeddingEndedMs - embeddingStartedMs;
        const message = error instanceof Error ? error.message : 'Unknown embedding failure';
        console.error(
          `[worker][timing] phase=embeddings jobId=${jobId} documentId=${document.id} originalName="${document.original_name}" provider=${embeddingGenerator.id} chunks=${insertedChunks.length} status=threw startedAt=${asIsoTimestamp(embeddingStartedMs)} endedAt=${asIsoTimestamp(embeddingEndedMs)} durationMs=${durationMs} durationSec=${(durationMs / 1000).toFixed(3)} error="${message}"`
        );
        throw error;
      }

      await markDocumentStructuredStatus(document.id, 'structured');
    }

    await setJobStatus(jobId, 'completed', null);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ingestion worker failure';
    await setJobFailedWithRetry(jobId, message);
  }
}
