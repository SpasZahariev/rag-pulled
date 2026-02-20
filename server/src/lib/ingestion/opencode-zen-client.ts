import {
  getOpenCodeZenApiKey,
  getOpenCodeZenBaseUrl,
  getOpenCodeZenMaxTokens,
  getOpenCodeZenTemperature,
} from '../env';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type OpenCodeZenCompletionResponse = {
  choices?: Array<{
    finish_reason?: unknown;
    message?: {
      content?: unknown;
      refusal?: unknown;
      reasoning_content?: unknown;
    };
  }>;
};

type NormalizedOpenCodeBaseUrl = {
  baseUrl: string;
  chatCompletionsPath: string;
};

type OpenCodeErrorDetails = {
  message: string;
  code?: string;
  type?: string;
  rawPreview?: string;
};

type CreateOpencodeClient = (config?: Record<string, unknown>) => any;
let cachedCreateOpencodeClient: CreateOpencodeClient | null = null;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : 'Unknown OpenCode Zen error';
}

function normalizeCompletionContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  // OpenAI-compatible responses can include structured content parts.
  if (Array.isArray(content)) {
    const combined = content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part === 'object' && typeof (part as any).text === 'string') {
          return (part as any).text;
        }

        return '';
      })
      .join('')
      .trim();

    return combined;
  }

  return '';
}

function normalizeOpenCodeZenModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return 'minimax-m2.5-free';
  }

  const normalized = trimmed.toLowerCase();
  const aliases: Record<string, string> = {
    'minimax m2.5 free': 'minimax-m2.5-free',
    'minimax m2.5': 'minimax-m2.5',
    'minimax m2.1': 'minimax-m2.1',
  };

  return aliases[normalized] ?? trimmed;
}

function previewPayload(payload: unknown, maxLength = 400): string {
  try {
    const serialized = JSON.stringify(payload);
    if (!serialized) {
      return '<empty>';
    }
    return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}...` : serialized;
  } catch {
    return '<unserializable>';
  }
}

function normalizeOpenCodeBaseUrl(rawBaseUrl: string): NormalizedOpenCodeBaseUrl {
  const fallbackBaseUrl = 'https://opencode.ai';
  const fallbackPath = '/zen/v1/chat/completions';
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) {
    return { baseUrl: fallbackBaseUrl, chatCompletionsPath: fallbackPath };
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, '');
    const from = `${host}${path || '/'}`;

    // Docs specify the OpenAI-compatible endpoint for MiniMax:
    // https://opencode.ai/zen/v1/chat/completions
    if (host === 'api.opencode.ai') {
      console.warn(
        `[ingestion][opencode] normalized_base_url from="${from}" to="opencode.ai/zen/v1/chat/completions"`
      );
      return { baseUrl: fallbackBaseUrl, chatCompletionsPath: fallbackPath };
    }

    if (host === 'opencode.ai' || host === 'www.opencode.ai') {
      if (path === '/zen/v1/chat/completions') {
        return { baseUrl: 'https://opencode.ai', chatCompletionsPath: '/zen/v1/chat/completions' };
      }
      if (path === '/zen/v1') {
        return { baseUrl: 'https://opencode.ai', chatCompletionsPath: '/zen/v1/chat/completions' };
      }
      if (path === '/zen') {
        return { baseUrl: 'https://opencode.ai', chatCompletionsPath: '/zen/v1/chat/completions' };
      }
      if (path === '' || path === '/') {
        return { baseUrl: 'https://opencode.ai', chatCompletionsPath: '/zen/v1/chat/completions' };
      }
    }

    // If user provides full endpoint URL, split it into SDK-friendly base + path.
    return {
      baseUrl: parsed.origin,
      chatCompletionsPath: (parsed.pathname || fallbackPath).replace(/\/+$/, ''),
    };
  } catch {
    // Non-URL values should fail over to documented default.
    return { baseUrl: fallbackBaseUrl, chatCompletionsPath: fallbackPath };
  }
}

function hasCompletionChoices(payload: unknown): payload is OpenCodeZenCompletionResponse {
  return Boolean(payload && typeof payload === 'object' && Array.isArray((payload as any).choices));
}

function extractOpenCodeErrorDetails(error: unknown): OpenCodeErrorDetails {
  if (typeof error === 'string') {
    return { message: error, rawPreview: error };
  }

  if (error && typeof error === 'object') {
    const candidate = error as any;
    const directCode =
      typeof candidate.code === 'string' || typeof candidate.code === 'number'
        ? String(candidate.code)
        : undefined;
    const nestedError = candidate.error && typeof candidate.error === 'object' ? candidate.error : undefined;
    const nestedCode =
      nestedError &&
      (typeof nestedError.code === 'string' || typeof nestedError.code === 'number')
        ? String(nestedError.code)
        : undefined;
    const type =
      typeof candidate.type === 'string'
        ? candidate.type
        : nestedError && typeof nestedError.type === 'string'
          ? nestedError.type
          : undefined;
    const message =
      typeof candidate.message === 'string'
        ? candidate.message
        : nestedError && typeof nestedError.message === 'string'
          ? nestedError.message
          : 'Unknown OpenCode API error';

    return {
      message,
      code: directCode ?? nestedCode,
      type,
      rawPreview: previewPayload(error),
    };
  }

  return {
    message: 'Unknown OpenCode API error',
    rawPreview: previewPayload(error),
  };
}

async function getCreateOpencodeClient(): Promise<CreateOpencodeClient> {
  if (cachedCreateOpencodeClient) {
    return cachedCreateOpencodeClient;
  }

  const currentFileDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), 'node_modules', '@opencode-ai', 'sdk', 'dist', 'v2', 'client.js'),
    join(process.cwd(), 'node_modules', '@opencode-ai', 'sdk', 'dist', 'client.js'),
    join(currentFileDir, '../../../node_modules/@opencode-ai/sdk/dist/v2/client.js'),
    join(currentFileDir, '../../../node_modules/@opencode-ai/sdk/dist/client.js'),
  ];

  for (const candidate of candidates) {
    try {
      const mod = (await import(pathToFileURL(candidate).href)) as {
        createOpencodeClient?: CreateOpencodeClient;
      };

      if (typeof mod.createOpencodeClient === 'function') {
        cachedCreateOpencodeClient = mod.createOpencodeClient;
        return mod.createOpencodeClient;
      }
    } catch {
      // Try next candidate path.
    }
  }

  throw new Error(
    'OpenCode SDK loader failed: could not resolve createOpencodeClient from installed package files.'
  );
}

export async function openCodeZenGenerateJson(
  model: string,
  systemPrompt: string,
  prompt: string
): Promise<string> {
  const createOpencodeClient = await getCreateOpencodeClient();
  const apiKey = getOpenCodeZenApiKey();
  const temperature = getOpenCodeZenTemperature();
  const maxTokens = getOpenCodeZenMaxTokens();
  const resolvedModel = normalizeOpenCodeZenModel(model);
  const configuredBaseUrl = getOpenCodeZenBaseUrl();
  const normalizedConfig = normalizeOpenCodeBaseUrl(configuredBaseUrl);
  const baseUrl = normalizedConfig.baseUrl;
  const chatCompletionsPath = normalizedConfig.chatCompletionsPath;
  const opencodeClient = createOpencodeClient({
    baseUrl,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    responseStyle: 'fields',
    throwOnError: false,
    parseAs: 'auto',
  });
  const client = (opencodeClient as any).client ?? (opencodeClient as any)._client;
  if (!client || typeof client.post !== 'function') {
    throw new Error('OpenCode SDK client does not expose a POST transport');
  }

  try {
    const result = (await client.post({
      url: chatCompletionsPath,
      body: {
        model: resolvedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
      },
    })) as {
      data: OpenCodeZenCompletionResponse;
      error?: unknown;
      response: Response;
    };

    if (result.error) {
      const details = extractOpenCodeErrorDetails(result.error);
      const statusError = `HTTP ${result.response.status} ${result.response.statusText}`.trim();
      // Log upstream API status/error fields to make debugging provider failures easier.
      console.error(
        `[ingestion][opencode] request_failed status=${result.response.status} statusText="${result.response.statusText}" code="${details.code ?? 'unknown'}" type="${details.type ?? 'unknown'}" message="${details.message}" raw=${details.rawPreview ?? '<empty>'}`
      );
      throw new Error(details.message || statusError);
    }

    const payload = result.data;
    if (!hasCompletionChoices(payload)) {
      const contentType = result.response.headers.get('content-type') ?? 'unknown';
      const detail = [
        `status=${result.response.status}`,
        `statusText="${result.response.statusText}"`,
        `contentType="${contentType}"`,
        `endpoint="${baseUrl}${chatCompletionsPath}"`,
        `payloadPreview=${previewPayload(payload)}`,
      ].join(' ');
      throw new Error(
        `OpenCode Zen response is not a chat-completions payload (${detail}). Check OPENCODE_ZEN_BASE_URL (expected Zen endpoint, e.g. "https://opencode.ai/zen/v1/chat/completions").`
      );
    }

    const typedPayload = payload as OpenCodeZenCompletionResponse;
    const choice = typedPayload.choices?.[0];
    const rawContent = choice?.message?.content;
    const output = normalizeCompletionContent(rawContent);

    if (!output) {
      const contentType = result.response.headers.get('content-type') ?? 'unknown';
      const finishReason =
        typeof choice?.finish_reason === 'string' ? choice.finish_reason : String(choice?.finish_reason ?? 'unknown');
      const refusal =
        typeof choice?.message?.refusal === 'string'
          ? choice.message.refusal
          : choice?.message?.refusal
            ? JSON.stringify(choice.message.refusal)
            : '';
      const detail = [
        `status=${result.response.status}`,
        `statusText="${result.response.statusText}"`,
        `contentType="${contentType}"`,
        `finishReason="${finishReason}"`,
        refusal ? `refusal=${refusal}` : '',
        `endpoint="${baseUrl}${chatCompletionsPath}"`,
        `payloadPreview=${previewPayload(typedPayload)}`,
      ]
        .filter(Boolean)
        .join(' ');

      console.error(`[ingestion][opencode] empty_completion ${detail}`);
      throw new Error(`OpenCode Zen completion response was empty (${detail})`);
    }

    return output;
  } catch (error) {
    throw new Error(`OpenCode Zen structurer request failed: ${toErrorMessage(error)}`);
  }
}
