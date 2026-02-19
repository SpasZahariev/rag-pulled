import { integer, text, timestamp } from 'drizzle-orm/pg-core';
import { appSchema, users } from './users';
import { ingestionJobs } from './ingestion-jobs';

export const uploadedDocuments = appSchema.table('uploaded_documents', {
  id: text('id').primaryKey(),
  job_id: text('job_id')
    .notNull()
    .references(() => ingestionJobs.id, { onDelete: 'cascade' }),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  original_name: text('original_name').notNull(),
  stored_name: text('stored_name').notNull(),
  stored_path: text('stored_path').notNull(),
  mime_type: text('mime_type').notNull(),
  size_bytes: integer('size_bytes').notNull(),
  structured_status: text('structured_status').notNull().default('pending'),
  error: text('error'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export type UploadedDocument = typeof uploadedDocuments.$inferSelect;
export type NewUploadedDocument = typeof uploadedDocuments.$inferInsert;
