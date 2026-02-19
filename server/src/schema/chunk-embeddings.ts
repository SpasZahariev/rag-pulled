import { integer, jsonb, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { appSchema } from './users';
import { documentChunks } from './document-chunks';

export const chunkEmbeddings = appSchema.table(
  'chunk_embeddings',
  {
    id: text('id').primaryKey(),
    chunk_id: text('chunk_id')
      .notNull()
      .references(() => documentChunks.id, { onDelete: 'cascade' }),
    embedding_model: text('embedding_model').notNull(),
    embedding_dim: integer('embedding_dim').notNull(),
    embedding: jsonb('embedding').$type<number[]>().notNull(),
    created_at: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    uniqueChunkModel: uniqueIndex('chunk_embeddings_chunk_model_idx').on(
      table.chunk_id,
      table.embedding_model
    ),
  })
);

export type ChunkEmbedding = typeof chunkEmbeddings.$inferSelect;
export type NewChunkEmbedding = typeof chunkEmbeddings.$inferInsert;
