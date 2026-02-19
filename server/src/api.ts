import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authMiddleware } from './middleware/auth';
import { getDatabase, testDatabaseConnection } from './lib/db';
import { setEnvContext, clearEnvContext, getDatabaseUrl } from './lib/env';
import * as schema from './schema/users';
import { getAllowedUploadExtensions, saveFilesToTempStorage } from './lib/upload-storage';

type Env = {
  RUNTIME?: string;
  [key: string]: any;
};

const app = new Hono<{ Bindings: Env }>();

// In Node.js environment, set environment context from process.env
if (typeof process !== 'undefined' && process.env) {
  setEnvContext(process.env);
}

// Environment context middleware - detect runtime using RUNTIME env var
app.use('*', async (c, next) => {
  if (c.env?.RUNTIME === 'cloudflare') {
    setEnvContext(c.env);
  }
  
  await next();
  // No need to clear context - env vars are the same for all requests
  // In fact, clearing the context would cause the env vars to potentially be unset for parallel requests
});

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check route - public
app.get('/', (c) => c.json({ status: 'ok', message: 'API is running' }));

// API routes
const api = new Hono();

// Public routes go here (if any)
api.get('/hello', (c) => {
  return c.json({
    message: 'Hello from Hono!',
  });
});

// Database test route - public for testing
api.get('/db-test', async (c) => {
  try {
    // Use external DB URL if available, otherwise use local PostgreSQL database server
    // Note: In development, the port is dynamically allocated by port-manager.js
    const defaultLocalConnection = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5502/postgres';
    const dbUrl = getDatabaseUrl() || defaultLocalConnection;
    
    const db = await getDatabase(dbUrl);
    const isHealthy = await testDatabaseConnection();
    
    if (!isHealthy) {
      return c.json({
        error: 'Database connection is not healthy',
        timestamp: new Date().toISOString(),
      }, 500);
    }
    
    const result = await db.select().from(schema.users).limit(5);
    
    return c.json({
      message: 'Database connection successful!',
      users: result,
      connectionHealthy: isHealthy,
      usingLocalDatabase: !getDatabaseUrl(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database test error:', error);
    return c.json({
      error: 'Database connection failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Protected routes - require authentication
const protectedRoutes = new Hono();

protectedRoutes.use('*', authMiddleware);

protectedRoutes.get('/me', (c) => {
  const user = c.get('user');
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      photo_url: user.photo_url,
      created_at: user.created_at,
      updated_at: user.updated_at,
    },
    message: 'You are authenticated!',
  });
});

protectedRoutes.post('/uploads', async (c) => {
  try {
    const user = c.get('user');
    const formData = await c.req.formData();
    const filesFieldEntries = formData.getAll('files');
    const singleFileEntry = formData.get('file');
    const candidateEntries = singleFileEntry
      ? [...filesFieldEntries, singleFileEntry]
      : filesFieldEntries;

    const files: File[] = [];
    for (const entry of candidateEntries) {
      if (typeof entry !== 'string') {
        files.push(entry);
      }
    }

    if (files.length === 0) {
      return c.json({
        error: 'No files were provided. Use "file" or "files" multipart fields.',
        allowedExtensions: getAllowedUploadExtensions(),
      }, 400);
    }

    const uploadResult = await saveFilesToTempStorage(user.id, files);

    if (uploadResult.uploadedFiles.length === 0) {
      return c.json({
        message: 'No valid files were uploaded. See rejectedFiles for details.',
        ...uploadResult,
      }, 200);
    }

    return c.json({
      message: 'Files uploaded to temporary storage',
      ...uploadResult,
    }, 201);
  } catch (error) {
    console.error('Upload route error:', error);
    return c.json({
      error: 'Failed to process uploaded files',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Mount the protected routes under /protected
api.route('/protected', protectedRoutes);

// Mount the API router
app.route('/api/v1', api);

export default app; 