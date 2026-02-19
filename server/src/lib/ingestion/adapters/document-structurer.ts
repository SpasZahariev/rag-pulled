import { readFile } from 'fs-extra';
import type { StructuredDocumentResult } from '../types';

export interface DocumentStructurer {
  id: string;
  structure(filePath: string, mimeType: string): Promise<StructuredDocumentResult>;
}

class DeterministicDocumentStructurer implements DocumentStructurer {
  id = 'deterministic-v1';

  async structure(filePath: string, _mimeType: string): Promise<StructuredDocumentResult> {
    const loweredPath = filePath.toLowerCase();

    if (loweredPath.endsWith('.csv')) {
      const content = await readFile(filePath, 'utf8');
      const rows = content
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter(Boolean);

      const chunks = rows.map((row, index) => ({
        chunkIndex: index,
        text: row.split(',').map((value) => value.trim()).join(' | '),
        metadata: { source: 'csv-row', row: index + 1 },
      }));

      return {
        status: 'structured',
        chunks,
      };
    }

    if (loweredPath.endsWith('.md') || loweredPath.endsWith('.markdown')) {
      const content = await readFile(filePath, 'utf8');
      const blocks = content
        .split(/\n(?=#)/g)
        .map((block) => block.trim())
        .filter(Boolean);

      const chunks = blocks.map((block, index) => ({
        chunkIndex: index,
        text: block,
        metadata: { source: 'markdown-block', block: index + 1 },
      }));

      return {
        status: 'structured',
        chunks,
      };
    }

    return {
      status: 'unsupported',
      chunks: [],
      error: 'File format is not yet supported by the local structurer adapter',
    };
  }
}

export function createDocumentStructurer(providerId: string): DocumentStructurer {
  if (providerId === 'deterministic-v1') {
    return new DeterministicDocumentStructurer();
  }

  // Pipeline-first default: unknown providers fall back to deterministic adapter.
  return new DeterministicDocumentStructurer();
}
