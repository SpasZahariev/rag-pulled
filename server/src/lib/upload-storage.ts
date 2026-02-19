import { randomUUID } from 'node:crypto';
import { extname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, writeFile } from 'fs-extra';

const ALLOWED_EXTENSIONS = new Set([
  '.csd',
  '.csv',
  '.pdf',
  '.md',
  '.markdown',
  '.xls',
  '.xlsx',
]);

const serverRootDir = fileURLToPath(new URL('../..', import.meta.url));

export interface UploadedFileMetadata {
  originalName: string;
  storedName: string;
  storedPath: string;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: string;
}

export interface RejectedFileMetadata {
  originalName: string;
  reason: string;
}

export interface UploadSessionResult {
  uploadSessionId: string;
  uploadedFiles: UploadedFileMetadata[];
  rejectedFiles: RejectedFileMetadata[];
}

function sanitizeFileName(filename: string): string {
  const withoutPath = basename(filename);
  const sanitized = withoutPath.replace(/[^a-zA-Z0-9._-]/g, '_');
  return sanitized || 'file';
}

function isExtensionAllowed(filename: string): boolean {
  const extension = extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension);
}

export function getAllowedUploadExtensions(): string[] {
  return Array.from(ALLOWED_EXTENSIONS.values());
}

export async function saveFilesToTempStorage(
  userId: string,
  files: File[]
): Promise<UploadSessionResult> {
  const uploadSessionId = randomUUID();
  const sessionDir = join(serverRootDir, 'tmp', 'uploads', userId, uploadSessionId);

  await ensureDir(sessionDir);

  const uploadedFiles: UploadedFileMetadata[] = [];
  const rejectedFiles: RejectedFileMetadata[] = [];

  for (const file of files) {
    const originalName = file.name?.trim() || 'unknown';

    if (!file.name || !file.name.trim()) {
      rejectedFiles.push({ originalName, reason: 'File name is required' });
      continue;
    }

    if (!isExtensionAllowed(file.name)) {
      rejectedFiles.push({ originalName, reason: 'Unsupported file type' });
      continue;
    }

    const arrayBuffer = await file.arrayBuffer();
    const sizeBytes = arrayBuffer.byteLength;

    if (sizeBytes === 0) {
      rejectedFiles.push({ originalName, reason: 'File is empty' });
      continue;
    }

    const uploadedAt = new Date().toISOString();
    const safeOriginalName = sanitizeFileName(file.name);
    const storedName = `${randomUUID()}-${safeOriginalName}`;
    const absoluteStoredPath = join(sessionDir, storedName);
    const storedPath = join('tmp', 'uploads', userId, uploadSessionId, storedName);

    await writeFile(absoluteStoredPath, Buffer.from(arrayBuffer));

    uploadedFiles.push({
      originalName: file.name,
      storedName,
      storedPath,
      sizeBytes,
      mimeType: file.type || 'application/octet-stream',
      uploadedAt,
    });
  }

  return {
    uploadSessionId,
    uploadedFiles,
    rejectedFiles,
  };
}
