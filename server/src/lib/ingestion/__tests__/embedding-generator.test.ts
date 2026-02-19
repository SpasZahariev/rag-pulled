import { afterEach, describe, expect, it, vi } from 'vitest';

describe('createEmbeddingGenerator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps Ollama embedding responses to EmbeddingResult', async () => {
    vi.stubEnv('OLLAMA_EMBEDDING_MODEL', 'mxbai-embed-large');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ embedding: [0.1, 0.2, 0.3] }),
      })
    );

    const { createEmbeddingGenerator } = await import('../adapters/embedding-generator');
    const generator = createEmbeddingGenerator('ollama-emb-v1');
    const result = await generator.embed('hello world');

    expect(result.model).toBe('mxbai-embed-large');
    expect(result.dimensions).toBe(3);
    expect(result.vector).toEqual([0.1, 0.2, 0.3]);
  });

  it('throws descriptive errors when embedding request fails', async () => {
    vi.stubEnv('OLLAMA_EMBEDDING_MODEL', 'mxbai-embed-large');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'model failed to load' }),
      })
    );

    const { createEmbeddingGenerator } = await import('../adapters/embedding-generator');
    const generator = createEmbeddingGenerator('ollama-emb-v1');

    await expect(generator.embed('hello world')).rejects.toThrow(
      'Embedding generation failed for provider "ollama-emb-v1" and model "mxbai-embed-large"'
    );
  });
});
