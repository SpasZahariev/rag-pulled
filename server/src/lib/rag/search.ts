import { sql } from 'drizzle-orm';
import { getDatabase } from '../db';
import { logger } from '../logger';

export type SearchResult = {
  chunkId: string;
  text: string;
  metadata: Record<string, unknown> | null;
  documentName: string;
  similarity: number;
};

// Drizzle + postgres.js can double-serialize JSONB: the number[] ends up stored
// as a JSON string scalar ("[ ... ]") instead of a JSON array ([ ... ]).
// This expression unwraps the string case so jsonb_array_elements_text always
// receives an actual JSON array.
const EMBEDDING_ARRAY = sql.raw(
  `CASE WHEN jsonb_typeof(ce.embedding) = 'array' THEN ce.embedding ELSE (ce.embedding #>> '{}')::jsonb END`
);

export async function searchSimilarChunks(
  queryVector: number[],
  userId: string,
  topK: number = 5
): Promise<SearchResult[]> {
  const db = await getDatabase();

  const vectorLiteral = `{${queryVector.join(',')}}`;

  logger.debug(`[rag][search] userId=${userId} topK=${topK} vectorDim=${queryVector.length}`);

  const rows = await db.execute(
    sql`
      SELECT
        dc.id AS chunk_id,
        dc.text,
        dc.metadata,
        ud.original_name AS document_name,
        (
          SELECT SUM(q.val * (e.val)::float8)
          FROM unnest(${vectorLiteral}::float8[]) WITH ORDINALITY AS q(val, idx),
               jsonb_array_elements_text(${EMBEDDING_ARRAY}) WITH ORDINALITY AS e(val, idx)
          WHERE q.idx = e.idx
        ) / NULLIF(
          sqrt((SELECT SUM(q.val * q.val) FROM unnest(${vectorLiteral}::float8[]) AS q(val)))
          *
          sqrt((SELECT SUM((e.val)::float8 * (e.val)::float8) FROM jsonb_array_elements_text(${EMBEDDING_ARRAY}) AS e(val))),
          0
        ) AS similarity
      FROM app.chunk_embeddings ce
      JOIN app.document_chunks dc ON dc.id = ce.chunk_id
      JOIN app.uploaded_documents ud ON ud.id = dc.document_id
      WHERE ud.user_id = ${userId}
      ORDER BY similarity DESC
      LIMIT ${topK}
    `
  );

  const results: SearchResult[] = [];
  for (const row of rows as unknown as Array<Record<string, unknown>>) {
    results.push({
      chunkId: row.chunk_id as string,
      text: row.text as string,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      documentName: row.document_name as string,
      similarity: Number(row.similarity) || 0,
    });
  }

  logger.debug(
    `[rag][search] found ${results.length} chunks, top similarity=${results[0]?.similarity?.toFixed(4) ?? 'N/A'}`
  );

  return results;
}
