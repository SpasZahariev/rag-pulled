import { afterEach, describe, expect, it, vi } from 'vitest';

describe('openCodeZenGenerateJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns first completion content for OpenAI-compatible payloads', async () => {
    vi.stubEnv('OPENCODE_ZEN_API_KEY', 'test-key');
    vi.stubEnv('OPENCODE_ZEN_BASE_URL', 'https://api.opencode.ai');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: '{"chunks":[{"chunkIndex":0,"text":"hello"}]}' } }],
        }),
      })
    );

    const { openCodeZenGenerateJson } = await import('../opencode-zen-client');
    const output = await openCodeZenGenerateJson('MiniMax M2.5 Free', 'system', 'prompt');

    expect(output).toContain('"chunks"');
  });

  it('throws descriptive error when API fails', async () => {
    vi.stubEnv('OPENCODE_ZEN_API_KEY', 'test-key');
    vi.stubEnv('OPENCODE_ZEN_BASE_URL', 'https://api.opencode.ai');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'invalid api key' } }),
      })
    );

    const { openCodeZenGenerateJson } = await import('../opencode-zen-client');

    await expect(openCodeZenGenerateJson('MiniMax M2.5 Free', 'system', 'prompt')).rejects.toThrow(
      'OpenCode Zen structurer request failed'
    );
  });

  it('throws when completion content is empty', async () => {
    vi.stubEnv('OPENCODE_ZEN_API_KEY', 'test-key');
    vi.stubEnv('OPENCODE_ZEN_BASE_URL', 'https://api.opencode.ai');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ choices: [{ message: { content: '' } }] }),
      })
    );

    const { openCodeZenGenerateJson } = await import('../opencode-zen-client');

    await expect(openCodeZenGenerateJson('MiniMax M2.5 Free', 'system', 'prompt')).rejects.toThrow(
      'OpenCode Zen completion response was empty'
    );
  });
});
