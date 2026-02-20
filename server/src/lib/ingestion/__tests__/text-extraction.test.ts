import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractTextFromFile, isSupportedExtractionExtension } from '../text-extraction';

describe('text extraction helpers', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unmock('word-extractor');
  });

  it('recognizes supported extraction extensions', () => {
    expect(isSupportedExtractionExtension('/tmp/a.txt')).toBe(true);
    expect(isSupportedExtractionExtension('/tmp/a.pdf')).toBe(true);
    expect(isSupportedExtractionExtension('/tmp/a.doc')).toBe(true);
    expect(isSupportedExtractionExtension('/tmp/a.docx')).toBe(true);
    expect(isSupportedExtractionExtension('/tmp/a.csv')).toBe(true);
    expect(isSupportedExtractionExtension('/tmp/a.xyz')).toBe(false);
  });

  it('extracts raw text from txt files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ingestion-text-'));
    const filePath = join(dir, 'sample.txt');
    await writeFile(filePath, 'hello from txt');

    const result = await extractTextFromFile(filePath);
    expect(result).toBe('hello from txt');

    await rm(dir, { recursive: true, force: true });
  });

  it('falls back to utf8 text for plain-text .doc files', async () => {
    vi.doMock('word-extractor', () => ({
      default: class WordExtractorMock {
        extract() {
          throw new Error('Unable to read this type of file');
        }
      },
    }));

    const dir = await mkdtemp(join(tmpdir(), 'ingestion-doc-'));
    const filePath = join(dir, 'sample.doc');
    await writeFile(filePath, 'simple fixture text in a .doc file');

    const result = await extractTextFromFile(filePath);
    expect(result).toContain('simple fixture text');

    await rm(dir, { recursive: true, force: true });
  });
});
