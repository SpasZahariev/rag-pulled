import { integer, text, timestamp } from 'drizzle-orm/pg-core';
import { appSchema, users } from './users';

export const ingestionJobs = appSchema.table('ingestion_jobs', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  upload_session_id: text('upload_session_id').notNull(),
  status: text('status').notNull().default('queued'),
  attempt_count: integer('attempt_count').notNull().default(0),
  max_attempts: integer('max_attempts').notNull().default(3),
  next_run_at: timestamp('next_run_at').notNull().defaultNow(),
  error: text('error'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type NewIngestionJob = typeof ingestionJobs.$inferInsert;
