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
  const buffer = await readFile(filePath);

  // pdf-parse v1 exports a callable default function. v2+ exports PDFParse class.
  const pdfParse = pdfParseModule.default ?? pdfParseModule;
  if (typeof pdfParse === 'function') {
    const result = await pdfParse(buffer);
    return typeof result?.text === 'string' ? result.text : '';
  }

  const PDFParseCtor = pdfParseModule.PDFParse;
  if (typeof PDFParseCtor === 'function') {
    const parser = new PDFParseCtor({ data: buffer });
    try {
      if (typeof parser.getText === 'function') {
        const result = await parser.getText();
        return typeof result?.text === 'string' ? result.text : '';
      }

      if (typeof parser.getRaw === 'function') {
        const result = await parser.getRaw();
        return typeof result?.text === 'string' ? result.text : '';
      }
    } finally {
      if (typeof parser.destroy === 'function') {
        await parser.destroy();
      }
    }
  }

  throw new Error('Unsupported pdf-parse module API');
}

async function extractDocxText(filePath: string): Promise<string> {
  const mammothModule: any = await import('mammoth');
  const mammoth = mammothModule.default ?? mammothModule;
  const result = await mammoth.extractRawText({ path: filePath });
  return typeof result?.value === 'string' ? result.value : '';
}

async function extractDocText(filePath: string): Promise<string> {
  try {
    const extractorModule: any = await import('word-extractor');
    const WordExtractor = extractorModule.default ?? extractorModule;
    const extractor = new WordExtractor();
    const extracted = await extractor.extract(filePath);
    const body = extracted?.getBody?.();
    if (typeof body === 'string' && body.trim().length > 0) {
      return body;
    }
  } catch {
    // Some .doc fixtures are plain text saved with a .doc suffix.
  }

  const rawBuffer = await readFile(filePath);
  if (looksLikePlainText(rawBuffer)) {
    return rawBuffer.toString('utf8');
  }

  throw new Error('Unable to read this type of file');
}

function looksLikePlainText(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return true;
  }

  // Null bytes usually indicate a binary document format.
  if (buffer.includes(0)) {
    return false;
  }

  let printable = 0;
  for (const byte of buffer) {
    const isLineBreak = byte === 10 || byte === 13 || byte === 9;
    const isAsciiPrintable = byte >= 32 && byte <= 126;
    if (isLineBreak || isAsciiPrintable) {
      printable += 1;
    }
  }

  return printable / buffer.length > 0.85;
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
