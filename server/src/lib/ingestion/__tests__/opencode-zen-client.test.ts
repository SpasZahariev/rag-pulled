import { afterEach, describe, expect, it, vi } from 'vitest';

describe('openCodeZenGenerateJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns first completion content for OpenAI-compatible payloads', async () => {
    vi.stubEnv('OPENCODE_ZEN_API_KEY', 'test-key');
    vi.stubEnv('OPENCODE_ZEN_BASE_URL', 'https://opencode.ai/zen/v1/chat/completions');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'application/json' },
        text: async () => '{"choices":[{"message":{"content":"{\\"chunks\\":[{\\"chunkIndex\\":0,\\"text\\":\\"hello\\"}]}"}}]}',
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
    vi.stubEnv('OPENCODE_ZEN_BASE_URL', 'https://opencode.ai/zen/v1/chat/completions');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: { get: () => 'application/json' },
        text: async () => '{"error":{"message":"invalid api key"}}',
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
    vi.stubEnv('OPENCODE_ZEN_BASE_URL', 'https://opencode.ai/zen/v1/chat/completions');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'application/json' },
        text: async () => '{"choices":[{"message":{"content":""}}]}',
        json: async () => ({ choices: [{ message: { content: '' } }] }),
      })
    );

    const { openCodeZenGenerateJson } = await import('../opencode-zen-client');

    await expect(openCodeZenGenerateJson('MiniMax M2.5 Free', 'system', 'prompt')).rejects.toThrow(
      'OpenCode Zen completion response was empty'
    );
  });

  it('normalizes website base URL to API host', async () => {
    vi.stubEnv('OPENCODE_ZEN_API_KEY', 'test-key');
    vi.stubEnv('OPENCODE_ZEN_BASE_URL', 'https://opencode.ai/zen');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      text: async () => '{"choices":[{"message":{"content":"{\\"chunks\\":[{\\"chunkIndex\\":0,\\"text\\":\\"hello\\"}]}"}}]}',
      json: async () => ({
        choices: [{ message: { content: '{"chunks":[{"chunkIndex":0,"text":"hello"}]}' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { openCodeZenGenerateJson } = await import('../opencode-zen-client');
    await openCodeZenGenerateJson('MiniMax M2.5 Free', 'system', 'prompt');

    const requestArg = fetchMock.mock.calls[0]?.[0] as Request | string | undefined;
    const requestedUrl =
      typeof requestArg === 'string'
        ? requestArg
        : requestArg && typeof requestArg === 'object' && 'url' in requestArg
          ? String((requestArg as Request).url)
          : '';
    expect(requestedUrl).toContain('opencode.ai/zen/v1/chat/completions');
  });

  it('normalizes legacy display model name to Zen model id', async () => {
    vi.stubEnv('OPENCODE_ZEN_API_KEY', 'test-key');
    vi.stubEnv('OPENCODE_ZEN_BASE_URL', 'https://opencode.ai/zen/v1/chat/completions');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      text: async () => '{"choices":[{"message":{"content":"{\\"chunks\\":[{\\"chunkIndex\\":0,\\"text\\":\\"hello\\"}]}"}}]}',
      json: async () => ({
        choices: [{ message: { content: '{"chunks":[{"chunkIndex":0,"text":"hello"}]}' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { openCodeZenGenerateJson } = await import('../opencode-zen-client');
    await openCodeZenGenerateJson('MiniMax M2.5 Free', 'system', 'prompt');

    const requestArg = fetchMock.mock.calls[0]?.[0] as Request;
    const body = JSON.parse(String(requestArg.text ? await requestArg.text() : '{}'));
    expect(body.model).toBe('minimax-m2.5-free');
  });
});
