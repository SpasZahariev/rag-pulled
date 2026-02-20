import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ollama-client', () => ({
  ollamaGenerateJson: vi.fn(),
}));

vi.mock('../opencode-zen-client', () => ({
  openCodeZenGenerateJson: vi.fn(),
}));

vi.mock('../text-extraction', () => ({
  extractTextFromFile: vi.fn(),
  isSupportedExtractionExtension: vi.fn(),
}));

describe('createDocumentStructurer', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('structures extracted text into normalized chunks with Ollama JSON output', async () => {
    vi.stubEnv('OLLAMA_STRUCTURER_MODEL', 'qwen2.5:14b-instruct');
    const { ollamaGenerateJson } = await import('../ollama-client');
    const { extractTextFromFile, isSupportedExtractionExtension } = await import('../text-extraction');
    vi.mocked(isSupportedExtractionExtension).mockReturnValue(true);
    vi.mocked(extractTextFromFile).mockResolvedValue('Alpha section\n\nBeta section');
    vi.mocked(ollamaGenerateJson).mockResolvedValue(
      JSON.stringify({
        chunks: [
          { chunkIndex: 2, text: 'Alpha section', metadata: { topic: 'alpha' } },
          { chunkIndex: 10, text: 'Beta section' },
        ],
      })
    );

    const { createDocumentStructurer } = await import('../adapters/document-structurer');
    const structurer = createDocumentStructurer('ollama-structurer-v1');
    const result = await structurer.structure('/tmp/sample.txt', 'text/plain');

    expect(result.status).toBe('structured');
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].chunkIndex).toBe(0);
    expect(result.chunks[1].chunkIndex).toBe(1);
    expect(result.chunks[0].metadata).toMatchObject({
      topic: 'alpha',
      sourceExtension: '.txt',
    });
  });

  it('returns unsupported for non-supported extraction extensions', async () => {
    const { isSupportedExtractionExtension } = await import('../text-extraction');
    vi.mocked(isSupportedExtractionExtension).mockReturnValue(false);

    const { createDocumentStructurer } = await import('../adapters/document-structurer');
    const structurer = createDocumentStructurer('ollama-structurer-v1');
    const result = await structurer.structure('/tmp/sample.bin', 'application/octet-stream');

    expect(result.status).toBe('unsupported');
    expect(result.error).toContain('Unsupported file extension');
  });

  it('returns failed on malformed model JSON output', async () => {
    const { ollamaGenerateJson } = await import('../ollama-client');
    const { extractTextFromFile, isSupportedExtractionExtension } = await import('../text-extraction');
    vi.mocked(isSupportedExtractionExtension).mockReturnValue(true);
    vi.mocked(extractTextFromFile).mockResolvedValue('some text');
    vi.mocked(ollamaGenerateJson).mockResolvedValue('{not-json');

    const { createDocumentStructurer } = await import('../adapters/document-structurer');
    const structurer = createDocumentStructurer('ollama-structurer-v1');
    const result = await structurer.structure('/tmp/sample.txt', 'text/plain');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Structured extraction failed');
  });

  it('structures extracted text with OpenCode Zen provider output', async () => {
    vi.stubEnv('OPENCODE_ZEN_STRUCTURER_MODEL', 'MiniMax M2.5 Free');
    vi.stubEnv('OPENCODE_ZEN_API_KEY', 'test-key');
    const { openCodeZenGenerateJson } = await import('../opencode-zen-client');
    const { extractTextFromFile, isSupportedExtractionExtension } = await import('../text-extraction');
    vi.mocked(isSupportedExtractionExtension).mockReturnValue(true);
    vi.mocked(extractTextFromFile).mockResolvedValue('Alpha facts\n\nBeta facts');
    vi.mocked(openCodeZenGenerateJson).mockResolvedValue(
      JSON.stringify({
        chunks: [
          { chunkIndex: 4, text: 'Alpha facts', metadata: { section: 'a' } },
          { chunkIndex: 9, text: 'Beta facts' },
        ],
      })
    );

    const { createDocumentStructurer } = await import('../adapters/document-structurer');
    const structurer = createDocumentStructurer('opencode-zen-structurer-v1');
    const result = await structurer.structure('/tmp/sample.txt', 'text/plain');

    expect(result.status).toBe('structured');
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].chunkIndex).toBe(0);
    expect(result.chunks[1].chunkIndex).toBe(1);
    expect(result.chunks[0].metadata).toMatchObject({
      section: 'a',
      sourceExtension: '.txt',
    });
  });

  it('returns failed on malformed OpenCode Zen JSON output', async () => {
    vi.stubEnv('OPENCODE_ZEN_API_KEY', 'test-key');
    const { openCodeZenGenerateJson } = await import('../opencode-zen-client');
    const { extractTextFromFile, isSupportedExtractionExtension } = await import('../text-extraction');
    vi.mocked(isSupportedExtractionExtension).mockReturnValue(true);
    vi.mocked(extractTextFromFile).mockResolvedValue('some text');
    vi.mocked(openCodeZenGenerateJson).mockResolvedValue('{not-json');

    const { createDocumentStructurer } = await import('../adapters/document-structurer');
    const structurer = createDocumentStructurer('opencode-zen-structurer-v1');
    const result = await structurer.structure('/tmp/sample.txt', 'text/plain');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Structured extraction failed');
  });
});
