import { extname } from 'node:path';
import { readFile } from 'fs-extra';
import { getOllamaStructurerModel } from '../../env';
import { ollamaGenerateJson } from '../ollama-client';
import { extractTextFromFile, isSupportedExtractionExtension } from '../text-extraction';
import type { StructuredChunk, StructuredDocumentResult } from '../types';

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

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function normalizeChunks(value: unknown): StructuredChunk[] {
  if (!Array.isArray(value)) {
    throw new Error('Structured payload missing "chunks" array');
  }

  const chunks: StructuredChunk[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const entry = value[i];
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const text = (entry as any).text;
    if (typeof text !== 'string' || text.trim().length === 0) {
      continue;
    }

    const metadata = (entry as any).metadata;
    chunks.push({
      chunkIndex: chunks.length,
      text: text.trim(),
      metadata:
        metadata && typeof metadata === 'object'
          ? (metadata as Record<string, unknown>)
          : undefined,
    });
  }

  if (chunks.length === 0) {
    throw new Error('Structured payload produced zero valid chunks');
  }

  return chunks;
}

function splitForStructuring(input: string, chunkSize = 12000): string[] {
  const normalized = input.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= chunkSize) {
    return [normalized];
  }

  const segments: string[] = [];
  for (let i = 0; i < normalized.length; i += chunkSize) {
    segments.push(normalized.slice(i, i + chunkSize));
  }
  return segments;
}

const STRUCTURER_SYSTEM_PROMPT = [
  'You are a document structuring engine.',
  'Return valid JSON only. Do not wrap output in markdown code fences.',
  'Use this schema exactly:',
  '{"chunks":[{"chunkIndex":0,"text":"string","metadata":{"key":"value"}}]}',
  'Rules:',
  '- Preserve facts from input without adding information.',
  '- Split into semantically coherent chunks for retrieval.',
  '- Each chunk text should be concise and useful for semantic search.',
  '- chunkIndex must be sequential from 0.',
].join('\n');

class OllamaDocumentStructurer implements DocumentStructurer {
  id = 'ollama-structurer-v1';
  private readonly model = getOllamaStructurerModel();

  async structure(filePath: string, mimeType: string): Promise<StructuredDocumentResult> {
    const extension = extname(filePath).toLowerCase();
    if (!isSupportedExtractionExtension(filePath)) {
      return {
        status: 'unsupported',
        chunks: [],
        error: `Unsupported file extension: ${extension || 'unknown'}`,
      };
    }

    try {
      const extractedText = await extractTextFromFile(filePath);
      const trimmedText = extractedText.trim();
      if (!trimmedText) {
        return {
          status: 'failed',
          chunks: [],
          error: `No extractable text found for ${extension || mimeType}`,
        };
      }

      const segments = splitForStructuring(trimmedText);
      const chunks: StructuredChunk[] = [];

      for (const [segmentIndex, segmentText] of segments.entries()) {
        const prompt = [
          `File extension: ${extension || 'unknown'}`,
          `Mime type: ${mimeType || 'unknown'}`,
          `Segment index: ${segmentIndex + 1} of ${segments.length}`,
          'Input text:',
          segmentText,
        ].join('\n');

        const raw = await ollamaGenerateJson(this.model, STRUCTURER_SYSTEM_PROMPT, prompt);
        const parsed = JSON.parse(extractJsonObject(raw));
        const normalized = normalizeChunks((parsed as any).chunks);

        for (const chunk of normalized) {
          chunks.push({
            chunkIndex: chunks.length,
            text: chunk.text,
            metadata: {
              ...(chunk.metadata ?? {}),
              sourceExtension: extension || 'unknown',
              segmentIndex,
            },
          });
        }
      }

      return {
        status: 'structured',
        chunks,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown structuring failure';
      console.error(
        `[ingestion][structurer] provider=${this.id} model=${this.model} extension=${extension || 'unknown'} failed: ${reason}`
      );
      return {
        status: 'failed',
        chunks: [],
        error: `Structured extraction failed for provider "${this.id}" and model "${this.model}": ${reason}`,
      };
    }
  }
}

export function createDocumentStructurer(providerId: string): DocumentStructurer {
  if (providerId === 'ollama-structurer-v1') {
    return new OllamaDocumentStructurer();
  }

  if (providerId === 'deterministic-v1') {
    return new DeterministicDocumentStructurer();
  }

  throw new Error(`Unknown document structurer provider "${providerId}"`);
}
