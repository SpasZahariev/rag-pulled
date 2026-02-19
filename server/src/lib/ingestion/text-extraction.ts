import { extname } from 'node:path';
import { readFile } from 'fs-extra';

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.csv',
  '.md',
  '.markdown',
  '.json',
  '.xml',
  '.html',
  '.htm',
]);

export function isSupportedExtractionExtension(filePath: string): boolean {
  const extension = extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(extension) || extension === '.pdf' || extension === '.docx' || extension === '.doc';
}

async function extractPdfText(filePath: string): Promise<string> {
  const pdfParseModule: any = await import('pdf-parse');
  const pdfParse = pdfParseModule.default ?? pdfParseModule;
  const buffer = await readFile(filePath);
  const result = await pdfParse(buffer);
  return typeof result?.text === 'string' ? result.text : '';
}

async function extractDocxText(filePath: string): Promise<string> {
  const mammothModule: any = await import('mammoth');
  const mammoth = mammothModule.default ?? mammothModule;
  const result = await mammoth.extractRawText({ path: filePath });
  return typeof result?.value === 'string' ? result.value : '';
}

async function extractDocText(filePath: string): Promise<string> {
  const extractorModule: any = await import('word-extractor');
  const WordExtractor = extractorModule.default ?? extractorModule;
  const extractor = new WordExtractor();
  const extracted = await extractor.extract(filePath);
  const body = extracted?.getBody?.();
  return typeof body === 'string' ? body : '';
}

export async function extractTextFromFile(filePath: string): Promise<string> {
  const extension = extname(filePath).toLowerCase();

  if (TEXT_EXTENSIONS.has(extension)) {
    return readFile(filePath, 'utf8');
  }

  if (extension === '.pdf') {
    return extractPdfText(filePath);
  }

  if (extension === '.docx') {
    return extractDocxText(filePath);
  }

  if (extension === '.doc') {
    return extractDocText(filePath);
  }

  throw new Error(`Unsupported file extension for extraction: ${extension}`);
}
