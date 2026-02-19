import { integer, jsonb, text, timestamp } from 'drizzle-orm/pg-core';
import { appSchema } from './users';
import { uploadedDocuments } from './uploaded-documents';

export const documentChunks = appSchema.table('document_chunks', {
  id: text('id').primaryKey(),
  document_id: text('document_id')
    .notNull()
    .references(() => uploadedDocuments.id, { onDelete: 'cascade' }),
  chunk_index: integer('chunk_index').notNull(),
  text: text('text').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>().default(null),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
