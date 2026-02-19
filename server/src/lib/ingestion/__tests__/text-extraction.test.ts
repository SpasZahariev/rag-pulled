import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { extractTextFromFile, isSupportedExtractionExtension } from '../text-extraction';

describe('text extraction helpers', () => {
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
});
