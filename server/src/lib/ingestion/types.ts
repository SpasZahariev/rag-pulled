export const INGESTION_JOB_STATUSES = [
  'queued',
  'processing_structure',
  'processing_embeddings',
  'completed',
  'failed',
] as const;

export type IngestionJobStatus = (typeof INGESTION_JOB_STATUSES)[number];

export const STRUCTURED_DOCUMENT_STATUSES = [
  'pending',
  'processing',
  'structured',
  'unsupported',
  'failed',
] as const;

export type StructuredDocumentStatus = (typeof STRUCTURED_DOCUMENT_STATUSES)[number];

export type StructuredChunk = {
  chunkIndex: number;
  text: string;
  metadata?: Record<string, unknown>;
};

export type StructuredDocumentResult = {
  status: StructuredDocumentStatus;
  chunks: StructuredChunk[];
  error?: string;
};

export type EmbeddingResult = {
  model: string;
  dimensions: number;
  vector: number[];
};
