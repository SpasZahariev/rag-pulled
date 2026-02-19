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
import { getDocumentStructurerProvider, getEmbeddingProvider } from '../env';

/**
 * Runs the full structuring + embedding pipeline for one claimed ingestion job.
 */
export async function processIngestionJob(jobId: string): Promise<void> {
  try {
    const documents = await getDocumentsForJob(jobId);
    const structurer = createDocumentStructurer(getDocumentStructurerProvider());
    const embeddingGenerator = createEmbeddingGenerator(getEmbeddingProvider());
    console.log(
      `[worker] Processing job ${jobId} with structurer=${structurer.id} embedding=${embeddingGenerator.id}`
    );

    for (const document of documents) {
      await markDocumentStructuredStatus(document.id, 'processing');
      const absolutePath = resolveStoredPathToAbsolutePath(document.stored_path);

      const structured = await structurer.structure(absolutePath, document.mime_type);

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

      for (const chunk of insertedChunks) {
        const embedding = await embeddingGenerator.embed(chunk.text);
        await insertChunkEmbedding(chunk.id, embedding);
      }

      await markDocumentStructuredStatus(document.id, 'structured');
    }

    await setJobStatus(jobId, 'completed', null);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ingestion worker failure';
    await setJobFailedWithRetry(jobId, message);
  }
}
